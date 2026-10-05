import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { DB } from "@/db";
import { schema } from "@/db";
import { daypartEnum, productTypeEnum } from "@/db/schema";
import { monthOf } from "./allowance";
import { currentMonth, ensureMonth, loadAllowanceMonth, loadCalendar } from "./allowanceData";
import { addDays, assignDaypart } from "./dayparts";
import { buildReport, dateRange, type AggRow, type MonthAllowanceDef, type ReportFilters } from "./reports";
import { loadScheduleConfig } from "./storeConfig";

export const MAX_RANGE_DAYS = 400;

const paramsSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  type: z.enum(["ALL", ...productTypeEnum.enumValues]).catch("ALL").default("ALL"),
  daypart: z.enum(["ALL", ...daypartEnum.enumValues]).catch("ALL").default("ALL"),
  area: z.coerce.number().int().positive().optional().catch(undefined),
});

export type ReportParams = { from: string; to: string; filters: ReportFilters; today: string };

/** Reads URL params; defaults to this month to date. */
export async function parseReportParams(db: DB, raw: Record<string, string | string[] | undefined>): Promise<ReportParams> {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const p = paramsSchema.parse(flat);
  const today = assignDaypart(new Date(), await loadScheduleConfig(db)).businessDate;
  let from = p.from ?? `${monthOf(today)}-01`;
  let to = p.to ?? today;
  if (from > to) [from, to] = [to, from];
  if (dateRange(from, to).length > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  return { from, to, today, filters: { type: p.type, daypart: p.daypart, areaId: p.area ?? null } };
}

export async function loadReport(db: DB, params: ReportParams) {
  const { from, to } = params;
  // Make sure the running month has its allowance (copied from last month if nobody opened it yet).
  await ensureMonth(db, await currentMonth(db));

  const orig = alias(schema.wasteEntries, "orig");
  const [aggregated, products, categories, links, areas, reasons, calendar] = await Promise.all([
    db
      .select({
        date: schema.wasteEntries.businessDate,
        productId: schema.wasteEntries.productId,
        daypart: schema.wasteEntries.daypart,
        type: schema.wasteEntries.type,
        // A Remove correction counts against the reason of the entry it reduces.
        reasonId: sql<number | null>`coalesce(${orig.reasonId}, ${schema.wasteEntries.reasonId})`,
        quantity: sql<string>`sum(${schema.wasteEntries.quantity})`,
        cost: sql<string>`sum(${schema.wasteEntries.totalCost})`,
      })
      .from(schema.wasteEntries)
      .leftJoin(orig, eq(orig.id, schema.wasteEntries.correctsEntryId))
      .where(and(gte(schema.wasteEntries.businessDate, from), lte(schema.wasteEntries.businessDate, to), isNull(schema.wasteEntries.voidedAt)))
      .groupBy(
        schema.wasteEntries.businessDate,
        schema.wasteEntries.productId,
        schema.wasteEntries.daypart,
        schema.wasteEntries.type,
        sql`coalesce(${orig.reasonId}, ${schema.wasteEntries.reasonId})`,
      ),
    db.select().from(schema.products),
    db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    db.select().from(schema.productCategories),
    db.select().from(schema.areas).orderBy(asc(schema.areas.sortOrder)),
    db.select({ id: schema.reasons.id, name: schema.reasons.name }).from(schema.reasons),
    loadCalendar(db),
  ]);

  const months = [...new Set(dateRange(from, to).map(monthOf))];
  const allowances = new Map<string, MonthAllowanceDef[]>();
  for (const m of months) {
    const data = await loadAllowanceMonth(db, m);
    allowances.set(
      m,
      data.allowances.map((a) => ({ kind: a.kind, name: a.name, amount: a.monthlyAmount, productIds: a.productIds })),
    );
  }

  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  const rows: AggRow[] = aggregated.map((r) => ({
    date: r.date,
    productId: r.productId,
    daypart: r.daypart,
    type: r.type,
    reasonId: r.reasonId === null ? null : Number(r.reasonId),
    quantity: Number(r.quantity),
    cost: Number(r.cost),
  }));

  const report = buildReport({
    from,
    to,
    rows,
    products: products.map((p) => {
      const first = links
        .filter((l) => l.productId === p.id)
        .sort((a, b) => (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0))[0];
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        areaId: p.areaId,
        areaName: areaName.get(p.areaId) ?? "—",
        category: first ? (catName.get(first.categoryId) ?? null) : null,
      };
    }),
    reasons,
    allowances,
    calendar,
    today: params.today,
    filters: params.filters,
  });

  return { report, areas: areas.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })) };
}

/** Raw entries for the export's detail sheet. */
export async function loadEntriesForExport(db: DB, params: ReportParams) {
  const { from, to, filters } = params;
  const orig = alias(schema.wasteEntries, "orig");
  const rows = await db
    .select({
      date: schema.wasteEntries.businessDate,
      occurredAt: schema.wasteEntries.occurredAt,
      daypart: schema.wasteEntries.daypart,
      daypartManual: schema.wasteEntries.daypartManual,
      dateManual: schema.wasteEntries.dateManual,
      product: schema.products.name,
      code: schema.products.code,
      area: schema.areas.name,
      areaId: schema.wasteEntries.areaId,
      type: schema.wasteEntries.type,
      unit: schema.wasteEntries.unit,
      quantity: schema.wasteEntries.quantity,
      unitCost: schema.wasteEntries.unitCost,
      totalCost: schema.wasteEntries.totalCost,
      reason: schema.reasons.name,
      note: schema.wasteEntries.note,
      user: schema.users.name,
      correction: sql<boolean>`${schema.wasteEntries.correctsEntryId} is not null`,
      origOccurredAt: orig.occurredAt,
    })
    .from(schema.wasteEntries)
    .innerJoin(schema.products, eq(schema.products.id, schema.wasteEntries.productId))
    .innerJoin(schema.areas, eq(schema.areas.id, schema.wasteEntries.areaId))
    .innerJoin(schema.users, eq(schema.users.id, schema.wasteEntries.userId))
    .leftJoin(orig, eq(orig.id, schema.wasteEntries.correctsEntryId))
    .leftJoin(schema.reasons, eq(schema.reasons.id, sql`coalesce(${orig.reasonId}, ${schema.wasteEntries.reasonId})`))
    .where(and(gte(schema.wasteEntries.businessDate, from), lte(schema.wasteEntries.businessDate, to), isNull(schema.wasteEntries.voidedAt)))
    .orderBy(asc(schema.wasteEntries.businessDate), desc(schema.wasteEntries.occurredAt));
  return rows.filter(
    (r) =>
      (filters.type === "ALL" || r.type === filters.type) &&
      (filters.daypart === "ALL" || r.daypart === filters.daypart) &&
      (filters.areaId === null || r.areaId === filters.areaId),
  );
}
