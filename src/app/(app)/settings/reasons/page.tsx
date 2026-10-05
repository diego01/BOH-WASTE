import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePageUser } from "@/lib/auth/session";
import { ReasonsClient } from "./ReasonsClient";

export default async function ReasonsPage() {
  await requirePageUser("settings:view");
  const reasons = await db
    .select({ id: schema.reasons.id, name: schema.reasons.name, active: schema.reasons.active, uses: count(schema.wasteEntries.id) })
    .from(schema.reasons)
    .leftJoin(schema.wasteEntries, eq(schema.wasteEntries.reasonId, schema.reasons.id))
    .groupBy(schema.reasons.id)
    .orderBy(asc(schema.reasons.sortOrder), asc(schema.reasons.id));
  return <ReasonsClient reasons={reasons} />;
}
