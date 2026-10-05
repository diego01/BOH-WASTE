import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { seedBase } from "@/db/seed";
import { operatingDaysInMonth } from "@/lib/allowance";
import { ensureMonth, loadAllowanceMonth, loadCalendar, refreezeFromCurrentMonth } from "@/lib/allowanceData";

let db: ReturnType<typeof drizzle<typeof schema>>;
let filetId: number;

beforeAll(async () => {
  // Store "today" = 2026-10-05 (New York).
  vi.useFakeTimers({ now: new Date("2026-10-05T15:00:00Z"), toFake: ["Date"] });
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  await seedBase(db);
  const [area] = await db.select().from(schema.areas);
  const [f] = await db
    .insert(schema.products)
    .values([
      { areaId: area.id, name: "Filet", unit: "LB", unitCost: 3.92, type: "DONATION", availableDayparts: ["LUNCH"] },
      { areaId: area.id, name: "Nugget", unit: "LB", unitCost: 4, type: "DONATION", availableDayparts: ["LUNCH"] },
    ])
    .returning();
  filetId = f.id;
}, 60_000);

describe("allowance months", () => {
  it("a product can only be in one allowance per month (DB constraint)", async () => {
    await ensureMonth(db, "2026-10");
    const [a] = await db
      .insert(schema.allowances)
      .values({ month: "2026-10", kind: "INDIVIDUAL", name: "Filet", monthlyAmount: 200 })
      .returning();
    await db.insert(schema.allowanceProducts).values({ allowanceId: a.id, productId: filetId, month: "2026-10" });
    const [g] = await db.insert(schema.allowances).values({ month: "2026-10", kind: "GROUP", name: "G", monthlyAmount: 1 }).returning();
    await expect(db.insert(schema.allowanceProducts).values({ allowanceId: g.id, productId: filetId, month: "2026-10" })).rejects.toThrow();
    await db.delete(schema.allowances).where(eq(schema.allowances.id, g.id));
  });

  it("a new month starts as a copy of the previous one", async () => {
    const r = await ensureMonth(db, "2026-11");
    expect(r).toEqual({ created: true, copiedFrom: "2026-10" });
    const nov = await loadAllowanceMonth(db, "2026-11");
    expect(nov.allowances).toMatchObject([{ kind: "INDIVIDUAL", name: "Filet", monthlyAmount: 200, productIds: [filetId] }]);
    expect((await ensureMonth(db, "2026-11")).created).toBe(false);
  });

  it("changing November does not touch October", async () => {
    const nov = await loadAllowanceMonth(db, "2026-11");
    await db.update(schema.allowances).set({ monthlyAmount: 250 }).where(eq(schema.allowances.id, nov.allowances[0].id));
    expect((await loadAllowanceMonth(db, "2026-10")).allowances[0].monthlyAmount).toBe(200);
    expect((await loadAllowanceMonth(db, "2026-11")).allowances[0].monthlyAmount).toBe(250);
  });

  it("past months are not filled by copying", async () => {
    expect(await ensureMonth(db, "2026-08")).toEqual({ created: true, copiedFrom: null });
    expect((await loadAllowanceMonth(db, "2026-08")).allowances).toEqual([]);
  });

  it("changing open weekdays re-freezes current and future months only", async () => {
    await ensureMonth(db, "2026-09"); // past month, frozen with Mon–Sat
    await db.update(schema.operatingWeekdays).set({ isOpen: true }).where(eq(schema.operatingWeekdays.weekday, 0)); // open Sundays
    await refreezeFromCurrentMonth(db);
    const cal = await loadCalendar(db);
    expect(operatingDaysInMonth("2026-09", cal)).toBe(26); // unchanged
    expect(operatingDaysInMonth("2026-10", cal)).toBe(31); // now every day
  });
});
