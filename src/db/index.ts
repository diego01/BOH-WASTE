import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

/**
 * DATABASE_URL set   → real Postgres (production, e.g. Supabase/Neon).
 * DATABASE_URL unset → embedded PGlite on disk (local dev, zero install).
 *
 * The connection opens lazily on first use so that importing this module
 * (e.g. during `next build`) never opens the PGlite data directory.
 */
const globalForDb = globalThis as unknown as { __db?: DB; __pglite?: PGlite };

/**
 * Hosted Postgres (Supabase) requires TLS. Its certificate is issued by the
 * provider's own CA: set DATABASE_CA_CERT (PEM) to verify it; without it the
 * connection is still encrypted but the server certificate isn't verified.
 */
function pgConnection(url: string) {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  u.searchParams.delete("sslmode"); // our ssl option below must win over the URL's
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return {
    connectionString: u.toString(),
    ssl: local ? undefined : ca ? { ca } : { rejectUnauthorized: false },
  };
}

function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ ...pgConnection(url), max: 5 });
    // Same query API as the PGlite driver; the cast keeps one DB type across drivers.
    return drizzlePg(pool, { schema }) as unknown as DB;
  }
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  globalForDb.__pglite = client;
  return drizzlePglite(client, { schema });
}

export function getDb(): DB {
  globalForDb.__db ??= createDb();
  return globalForDb.__db;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeDb() {
  await globalForDb.__pglite?.close();
  globalForDb.__db = undefined;
  globalForDb.__pglite = undefined;
}

export { schema };
