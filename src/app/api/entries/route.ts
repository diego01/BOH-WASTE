import { NextResponse } from "next/server";
import { db } from "@/db";
import { ingestEntries } from "@/lib/entries/ingest";
import { loadScheduleConfig } from "@/lib/storeConfig";

/**
 * Sync endpoint for the device's entry queue. Authenticated per entry by a
 * signed entry token (see lib/auth/entryToken.ts), not by the session cookie,
 * so entries made before a shared-phone sign-out still sync to their author.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const items = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return NextResponse.json({ error: "Send 1–200 entries" }, { status: 400 });
  }
  const results = await ingestEntries(db, items, await loadScheduleConfig(db));
  return NextResponse.json({ results });
}
