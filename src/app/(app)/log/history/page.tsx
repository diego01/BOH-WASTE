import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { addDays, assignDaypart } from "@/lib/dayparts";
import { maxBackdateDays } from "@/lib/entries/rules";
import { loadScheduleConfig } from "@/lib/storeConfig";
import { HistoryClient } from "./HistoryClient";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePageUser("entries:create");
  const config = await loadScheduleConfig(db);
  const today = assignDaypart(new Date(), config).businessDate;

  // Team Members see today and yesterday; leaders can browse any day.
  const leader = can(user.role, "reports:view");
  const requested = (await searchParams).date;
  const minDate = leader ? "2000-01-01" : addDays(today, -1);
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= minDate && requested <= today ? requested : today;

  const voider = alias(schema.users, "voider");
  const rows = await db
    .select({
      id: schema.wasteEntries.id,
      productName: schema.products.name,
      productId: schema.products.id,
      availableDayparts: schema.products.availableDayparts,
      type: schema.wasteEntries.type,
      unit: schema.wasteEntries.unit,
      quantity: schema.wasteEntries.quantity,
      totalCost: schema.wasteEntries.totalCost,
      reasonId: schema.wasteEntries.reasonId,
      reason: schema.reasons.name,
      note: schema.wasteEntries.note,
      daypart: schema.wasteEntries.daypart,
      daypartManual: schema.wasteEntries.daypartManual,
      businessDate: schema.wasteEntries.businessDate,
      dateManual: schema.wasteEntries.dateManual,
      occurredAt: schema.wasteEntries.occurredAt,
      createdAt: schema.wasteEntries.createdAt,
      editedAt: schema.wasteEntries.editedAt,
      voidedAt: schema.wasteEntries.voidedAt,
      voidedBy: voider.name,
      userId: schema.wasteEntries.userId,
      userName: schema.users.name,
      correctsEntryId: schema.wasteEntries.correctsEntryId,
    })
    .from(schema.wasteEntries)
    .innerJoin(schema.products, eq(schema.products.id, schema.wasteEntries.productId))
    .innerJoin(schema.users, eq(schema.users.id, schema.wasteEntries.userId))
    .leftJoin(voider, eq(voider.id, schema.wasteEntries.voidedBy))
    .leftJoin(schema.reasons, eq(schema.reasons.id, schema.wasteEntries.reasonId))
    .where(and(eq(schema.wasteEntries.businessDate, date)))
    .orderBy(desc(schema.wasteEntries.occurredAt));

  const reasons = await db
    .select({ id: schema.reasons.id, name: schema.reasons.name })
    .from(schema.reasons)
    .where(eq(schema.reasons.active, true));

  return (
    <HistoryClient
      user={{ id: user.id, role: user.role }}
      date={date}
      today={today}
      minDate={minDate}
      timezone={config.timezone}
      maxBackdate={maxBackdateDays(user.role)}
      reasons={reasons}
      entries={rows.map((r) => ({
        ...r,
        quantity: Number(r.quantity),
        totalCost: Number(r.totalCost),
        occurredAt: r.occurredAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        editedAt: r.editedAt?.toISOString() ?? null,
        voidedAt: r.voidedAt?.toISOString() ?? null,
        autoDaypart: assignDaypart(r.occurredAt, config).daypart,
      }))}
    />
  );
}
