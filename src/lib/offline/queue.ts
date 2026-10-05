"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { EntryPayload } from "@/lib/entries/payload";
import type { OptimisticRow } from "@/lib/entries/removal";

/**
 * Device-side outbox for entries. Everything is saved here first and then
 * synced, so a dropped connection never loses an entry. Falls back to memory
 * if IndexedDB is unavailable (private mode), in which case entries survive
 * only while the page is open.
 */
export type QueuedEntry = {
  payload: EntryPayload;
  /**
   * What this entry will look like once saved (one row for ADD, one negative
   * row per affected entry for REMOVE), so totals and further removals are
   * right while unsynced.
   */
  rows: OptimisticRow[];
  queuedAt: number;
};

const DB_NAME = "boh-waste";
const STORE = "outbox";

let dbPromise: Promise<IDBPDatabase> | null = null;
const memory = new Map<string, QueuedEntry>();

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  }).catch((e) => {
    console.warn("IndexedDB unavailable, using memory queue", e);
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function withDb<T>(fn: (db: IDBPDatabase) => Promise<T>, fallback: () => T): Promise<T> {
  const p = getDb();
  if (!p) return fallback();
  try {
    return await fn(await p);
  } catch {
    return fallback();
  }
}

export function putEntry(e: QueuedEntry) {
  memory.set(e.payload.id, e);
  return withDb(
    (db) => db.put(STORE, e, e.payload.id).then(() => undefined),
    () => undefined,
  );
}

export function allEntries(): Promise<QueuedEntry[]> {
  return withDb(
    async (db) => {
      const rows = (await db.getAll(STORE)) as QueuedEntry[];
      // Anything that only reached memory (IDB hiccup) is still included.
      const ids = new Set(rows.map((r) => r.payload.id));
      return [...rows, ...[...memory.values()].filter((m) => !ids.has(m.payload.id))].sort((a, b) => a.queuedAt - b.queuedAt);
    },
    () => [...memory.values()].sort((a, b) => a.queuedAt - b.queuedAt),
  );
}

export function removeEntries(ids: string[]) {
  for (const id of ids) memory.delete(id);
  return withDb(
    async (db) => {
      const tx = db.transaction(STORE, "readwrite");
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
    },
    () => undefined,
  );
}
