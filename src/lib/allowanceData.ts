import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { Calendar } from "@/lib/allowance";
import { assignDaypart } from "@/lib/dayparts";
import { loadScheduleConfig } from "@/lib/storeConfig";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Conn = DB | Tx;

export async function currentMonth(db: Conn): Promise<string> {
  const config = await loadScheduleConfig(db as DB);
  return assignDaypart(new Date(), config).businessDate.slice(0, 7);
}

export async function currentOpenWeekdays(db: Conn): Promise<number[]> {
  const rows = await db.select().from(schema.operatingWeekdays);
  return rows.filter((r) => r.isOpen).map((r) => r.weekday);
}

/** Calendar for proration: each set-up month uses its frozen weekdays, others today's setting. */
export async function loadCalendar(db: Conn): Promise<Calendar> {
  const current = new Set(await currentOpenWeekdays(db));
  const frozen = new Map(
    (await db.select().from(schema.allowanceMonths)).map((m) => [m.month, new Set(m.openWeekdays as number[])] as const),
  );
  const holidays = new Set((await db.select({ date: schema.holidays.date }).from(schema.holidays)).map((h) => h.date));
  return { openWeekdays: (month) => frozen.get(month) ?? current, holidays };
}

/**
 * Makes sure `month` is set up. A month that isn't set up yet starts as a copy
 * of the latest earlier month's allowances (for the current or a future month),
 * so the admin only adjusts what changed.
 */
export async function ensureMonth(db: DB, month: string): Promise<{ created: boolean; copiedFrom: string | null }> {
  return db.transaction(async (tx) => {
    const [exists] = await tx.select().from(schema.allowanceMonths).where(eq(schema.allowanceMonths.month, month));
    if (exists) return { created: false, copiedFrom: null };

    await tx.insert(schema.allowanceMonths).values({ month, openWeekdays: await currentOpenWeekdays(tx) }).onConflictDoNothing();

    if (month < (await currentMonth(tx))) return { created: true, copiedFrom: null };
    const [prev] = await tx
      .select()
      .from(schema.allowanceMonths)
      .where(lt(schema.allowanceMonths.month, month))
      .orderBy(desc(schema.allowanceMonths.month))
      .limit(1);
    if (!prev) return { created: true, copiedFrom: null };

    const source = await tx
      .select()
      .from(schema.allowances)
      .where(and(eq(schema.allowances.month, prev.month), isNull(schema.allowances.archivedAt)));
    const links = source.length
      ? await tx.select().from(schema.allowanceProducts).where(inArray(schema.allowanceProducts.allowanceId, source.map((s) => s.id)))
      : [];
    for (const a of source) {
      const [copy] = await tx
        .insert(schema.allowances)
        .values({ month, kind: a.kind, name: a.name, monthlyAmount: Number(a.monthlyAmount) })
        .returning({ id: schema.allowances.id });
      const productIds = links.filter((l) => l.allowanceId === a.id).map((l) => l.productId);
      if (productIds.length) {
        await tx.insert(schema.allowanceProducts).values(productIds.map((productId) => ({ allowanceId: copy.id, productId, month })));
      }
    }
    return { created: true, copiedFrom: prev.month };
  });
}

/** Operating weekdays changed: re-freeze the current and future set-up months only. */
export async function refreezeFromCurrentMonth(db: Conn) {
  const open = await currentOpenWeekdays(db);
  await db
    .update(schema.allowanceMonths)
    .set({ openWeekdays: open })
    .where(gte(schema.allowanceMonths.month, await currentMonth(db)));
}

export async function loadAllowanceMonth(db: DB, month: string) {
  const [isSetUp] = await db.select().from(schema.allowanceMonths).where(eq(schema.allowanceMonths.month, month));
  const allowances = await db
    .select()
    .from(schema.allowances)
    .where(and(eq(schema.allowances.month, month), isNull(schema.allowances.archivedAt)))
    .orderBy(asc(schema.allowances.name));
  const links = allowances.length
    ? await db.select().from(schema.allowanceProducts).where(inArray(schema.allowanceProducts.allowanceId, allowances.map((a) => a.id)))
    : [];
  return {
    isSetUp: !!isSetUp,
    allowances: allowances.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      monthlyAmount: Number(a.monthlyAmount),
      productIds: links.filter((l) => l.allowanceId === a.id).map((l) => l.productId),
    })),
  };
}

export type MonthAllowance = Awaited<ReturnType<typeof loadAllowanceMonth>>["allowances"][number];
