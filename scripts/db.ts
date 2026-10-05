/**
 * Database CLI.
 *   npm run db:migrate          apply migrations
 *   npm run db:seed             migrations + base config + bootstrap admin
 *   npm run db:seed -- --demo   …plus demo users and the catalog from referencias/inventory.xlsx
 *   npm run db:seed -- --import base config + products and users from referencias/inventory.xlsx (no demo data)
 *   npm run db:reset            delete the local PGlite data dir (dev only)
 *   npm run supabase:setup      migrations + base config + products/users from inventory.xlsx on Supabase (.env.supabase)
 *   npm run supabase:migrate    apply new migrations on Supabase
 *
 * With local PGlite, stop `npm run dev` first: the data dir is single-process.
 */
import { config } from "dotenv";
// --supabase: use the hosted database from .env.supabase (git-ignored) instead of the local one.
if (process.argv.includes("--supabase")) config({ path: ".env.supabase", override: true, quiet: true });
config({ path: [".env.local", ".env"], quiet: true });
if (process.argv.includes("--supabase") && !process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in waste-app/.env.supabase");
  process.exit(1);
}
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db";
import { seedBase, seedBootstrapAdmin, seedDemoAllowances, seedDemoUsers } from "../src/db/seed";
import { seedDemoEntries } from "../src/db/seedDemoEntries";
import { parseInventory } from "../src/lib/import/inventory";
import { applyImport } from "../src/lib/import/apply";

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function migrate() {
  const db = getDb();
  if (process.env.DATABASE_URL) await migratePg(db as never, { migrationsFolder });
  else await migratePglite(db, { migrationsFolder });
  console.log("✓ migrations applied");
}

async function main() {
  const [cmd, ...flags] = process.argv.slice(2);

  if (cmd === "reset") {
    if (process.env.DATABASE_URL) throw new Error("db:reset only works with local PGlite");
    const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
    rmSync(dir, { recursive: true, force: true });
    console.log(`✓ removed ${dir}`);
    return;
  }

  await migrate();
  if (cmd === "migrate") return;

  if (cmd === "seed") {
    const db = getDb();
    await seedBase(db);
    console.log("✓ base config (store, BOH area, categories, reasons, dayparts, operating days)");

    if (flags.includes("--demo")) {
      await seedDemoUsers(db);
      console.log("✓ demo users (see .env.example for PINs)");
      const file = path.join(process.cwd(), "..", "referencias", "inventory.xlsx");
      if (existsSync(file)) {
        const parsed = await parseInventory(readFileSync(file));
        const r = await applyImport(db, parsed, { categories: {}, types: {}, importUsers: false }, null);
        console.log(`✓ catalog from inventory.xlsx: ${r.productsCreated} new, ${r.productsUpdated} updated`);
        await seedDemoAllowances(db);
        console.log("✓ demo allowances for 2026-09 and 2026-10 (Chicken, Filets $200 in Oct; Nuggets & Strips)");
        const n = await seedDemoEntries(db);
        console.log(n ? `✓ ${n} demo entries (Sep 1 – Oct 4, 2026)` : "· demo entries skipped (history already present)");
      } else {
        console.warn(`! ${file} not found, catalog skipped`);
      }
    }

    if (flags.includes("--import")) {
      // Real start: catalog + users from referencias/inventory.xlsx, no demo data.
      const file = path.join(process.cwd(), "..", "referencias", "inventory.xlsx");
      const parsed = await parseInventory(readFileSync(file));
      const r = await applyImport(db, parsed, { categories: {}, types: {}, importUsers: true }, null);
      console.log(`✓ inventory.xlsx: ${r.productsCreated} products, ${r.usersCreated} users (temporary PINs)`);
    }

    const name = process.env.BOOTSTRAP_ADMIN_NAME;
    const pin = process.env.BOOTSTRAP_ADMIN_PIN;
    if (name && pin) {
      if (await seedBootstrapAdmin(db, name, pin)) console.log(`✓ bootstrap admin "${name}" (must change PIN)`);
    }
    return;
  }

  throw new Error(`Unknown command "${cmd}"`);
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
