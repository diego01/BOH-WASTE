import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { addMonths, operatingDaysInMonth } from "@/lib/allowance";
import { currentMonth, ensureMonth, loadAllowanceMonth, loadCalendar } from "@/lib/allowanceData";
import { requirePageUser } from "@/lib/auth/session";
import { AllowanceClient } from "./AllowanceClient";

export default async function AllowancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePageUser("settings:view");
  const now = await currentMonth(db);
  const requested = (await searchParams).month;
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : now;

  // Opening the current or next month sets it up (copying the previous month's allowances).
  let copiedFrom: string | null = null;
  if (month >= now && month <= addMonths(now, 1)) copiedFrom = (await ensureMonth(db, month)).copiedFrom;

  const [data, calendar, products, areas, categories, links] = await Promise.all([
    loadAllowanceMonth(db, month),
    loadCalendar(db),
    db.select().from(schema.products).orderBy(asc(schema.products.name)),
    db.select({ id: schema.areas.id, name: schema.areas.name }).from(schema.areas),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    db.select().from(schema.productCategories),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const catOrder = new Map(categories.map((c, i) => [c.id, i]));

  return (
    <AllowanceClient
      month={month}
      currentMonth={now}
      copiedFrom={copiedFrom}
      operatingDays={operatingDaysInMonth(month, calendar)}
      allowances={data.allowances}
      areas={areas}
      products={products
        .filter((p) => !p.archivedAt || data.allowances.some((a) => a.productIds.includes(p.id)))
        .map((p) => {
          const cats = links
            .filter((l) => l.productId === p.id)
            .sort((a, b) => (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0))
            .map((l) => catName.get(l.categoryId)!);
          return {
            id: p.id,
            name: p.name,
            unit: p.unit,
            unitCost: Number(p.unitCost),
            type: p.type,
            areaId: p.areaId,
            active: p.active,
            category: cats[0] ?? null,
          };
        })}
    />
  );
}
