import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Daypart, ProductType, Unit } from "@/db/schema";
import { assignDaypart } from "@/lib/dayparts";
import { loadScheduleConfig } from "@/lib/storeConfig";

/** Everything the logging screen needs, in one round trip. */
export async function loadLogData() {
  const config = await loadScheduleConfig(db);
  const [store] = await db.select({ grace: schema.store.boardGraceMinutes }).from(schema.store).limit(1);
  const today = assignDaypart(new Date(), config).businessDate;

  const [areas, categories, products, links, reasons, entries] = await Promise.all([
    db
      .select({ id: schema.areas.id, name: schema.areas.name, color: schema.areas.color })
      .from(schema.areas)
      .where(eq(schema.areas.active, true))
      .orderBy(asc(schema.areas.sortOrder), asc(schema.areas.id)),
    db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.active, true))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.id)),
    db
      .select({
        id: schema.products.id,
        areaId: schema.products.areaId,
        name: schema.products.name,
        unit: schema.products.unit,
        unitCost: schema.products.unitCost,
        type: schema.products.type,
        availableDayparts: schema.products.availableDayparts,
      })
      .from(schema.products)
      .where(and(eq(schema.products.active, true), isNull(schema.products.archivedAt)))
      .orderBy(asc(schema.products.name)),
    db.select().from(schema.productCategories),
    db
      .select({ id: schema.reasons.id, name: schema.reasons.name })
      .from(schema.reasons)
      .where(eq(schema.reasons.active, true))
      .orderBy(asc(schema.reasons.sortOrder)),
    db
      .select({
        id: schema.wasteEntries.id,
        userId: schema.wasteEntries.userId,
        productId: schema.wasteEntries.productId,
        areaId: schema.wasteEntries.areaId,
        businessDate: schema.wasteEntries.businessDate,
        daypart: schema.wasteEntries.daypart,
        type: schema.wasteEntries.type,
        unitCost: schema.wasteEntries.unitCost,
        quantity: schema.wasteEntries.quantity,
        totalCost: schema.wasteEntries.totalCost,
        occurredAt: schema.wasteEntries.occurredAt,
        correctsEntryId: schema.wasteEntries.correctsEntryId,
      })
      .from(schema.wasteEntries)
      .where(and(eq(schema.wasteEntries.businessDate, today), isNull(schema.wasteEntries.voidedAt))),
  ]);

  const cats = new Map<number, number[]>();
  for (const l of links) cats.set(l.productId, [...(cats.get(l.productId) ?? []), l.categoryId]);

  return {
    config,
    today,
    boardGraceMinutes: store?.grace ?? 60,
    areas,
    categories,
    reasons,
    products: products.map((p) => ({
      ...p,
      unitCost: Number(p.unitCost),
      unit: p.unit as Unit,
      type: p.type as ProductType,
      availableDayparts: p.availableDayparts as Daypart[],
      categoryIds: cats.get(p.id) ?? [],
    })),
    entries: entries.map((e) => ({
      ...e,
      quantity: Number(e.quantity),
      totalCost: Number(e.totalCost),
      unitCost: Number(e.unitCost),
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}

export type LogData = Awaited<ReturnType<typeof loadLogData>>;
export type LogProduct = LogData["products"][number];
