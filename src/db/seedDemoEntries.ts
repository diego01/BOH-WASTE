import { randomUUID } from "node:crypto";
import { inArray, lt } from "drizzle-orm";
import type { DB } from "./index";
import * as schema from "./schema";
import { DEMO_USERS } from "./seed";

/**
 * Demo history so reports can be tried without logging by hand:
 * Sep 1 – Oct 4, 2026 (Mon–Sat), deterministic. Includes the required test
 * case: Chicken, Filets real = $50.00 in Oct 1–7 (allowance $200 → −$5.56).
 * Only runs on a database with no entries before October 2026.
 */

// Small deterministic PRNG so every run produces the same demo data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plan = { code: string; min: number; max: number; p: number; each?: boolean };

const PLANS: Plan[] = [
  { code: "72", min: 0.3, max: 1.2, p: 0.8 }, // Breakfast filets
  { code: "6121", min: 0.2, max: 0.8, p: 0.6 },
  { code: "204", min: 1, max: 4, p: 0.7, each: true }, // Biscuit
  { code: "9641", min: 1, max: 3, p: 0.5, each: true }, // English muffin
  { code: "1261", min: 0.5, max: 2, p: 0.7 }, // Hashrounds
  { code: "3581", min: 0.3, max: 1.2, p: 0.8 }, // Spicy filet
  { code: "70", min: 0.6, max: 2.2, p: 0.9 }, // Nuggets
  { code: "10681", min: 0.2, max: 0.9, p: 0.6 },
  { code: "3201", min: 0.4, max: 1.4, p: 0.8 }, // Tenders
  { code: "1241", min: 1, max: 3, p: 0.9 }, // Waffle fries
  { code: "13701", min: 0.3, max: 1, p: 0.6 }, // Mac & cheese
  { code: "13702", min: 1, max: 3, p: 0.4, each: true }, // Brownie
  { code: "28", min: 0.5, max: 2, p: 0.7 }, // Coater (waste)
  { code: "8261", min: 1, max: 3, p: 0.5, each: true }, // Cheese sauce (waste)
];

const WINDOWS: Record<schema.Daypart, [number, number]> = {
  BREAKFAST: [6 * 60 + 30, 10 * 60 + 29],
  LUNCH: [10 * 60 + 30, 14 * 60 + 19],
  AFTERNOON: [14 * 60 + 20, 16 * 60 + 59],
  DINNER: [17 * 60, 21 * 60 + 45],
};

function at(date: string, minutes: number) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:00-04:00`); // EDT for Sep–Oct 2026
}

export async function seedDemoEntries(db: DB): Promise<number> {
  const [existing] = await db.select({ id: schema.wasteEntries.id }).from(schema.wasteEntries).where(lt(schema.wasteEntries.businessDate, "2026-10-01")).limit(1);
  if (existing) return 0;

  const users = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.name, DEMO_USERS.map((u) => u.name)));
  const reasons = await db.select().from(schema.reasons);
  const products = await db.select().from(schema.products);
  const byCode = new Map(products.map((p) => [p.code, p]));
  if (!users.length || !products.length) return 0;

  const rand = mulberry32(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const round = (n: number, each?: boolean) => (each ? Math.max(1, Math.round(n)) : Math.round(n * 100) / 100);
  const rows: (typeof schema.wasteEntries.$inferInsert)[] = [];

  const add = (p: (typeof products)[number], date: string, quantity: number, daypart?: schema.Daypart) => {
    const dp = daypart ?? pick(p.availableDayparts as schema.Daypart[]);
    const [a, b] = WINDOWS[dp];
    const unitCost = Number(p.unitCost);
    rows.push({
      id: randomUUID(),
      productId: p.id,
      areaId: p.areaId,
      userId: pick(users).id,
      type: p.type,
      unit: p.unit,
      unitCost,
      quantity,
      totalCost: quantity * unitCost,
      reasonId: rand() < 0.85 ? pick(reasons).id : null,
      note: null,
      daypart: dp,
      daypartManual: false,
      businessDate: date,
      dateManual: false,
      occurredAt: at(date, a + Math.floor(rand() * (b - a))),
    });
  };

  for (let d = new Date(Date.UTC(2026, 8, 1)); d <= new Date(Date.UTC(2026, 9, 4)); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) continue; // closed Sundays
    const date = d.toISOString().slice(0, 10);
    const october = date >= "2026-10-01";
    for (const plan of PLANS) {
      const p = byCode.get(plan.code);
      if (!p || rand() > plan.p) continue;
      // Nuggets & Strips run heavier in October so the report shows an overage.
      const boost = october && ["70", "10681", "3201"].includes(plan.code) ? 1.6 : 1;
      add(p, date, round((plan.min + rand() * (plan.max - plan.min)) * boost, plan.each));
    }
    const filet = byCode.get("1");
    if (filet && !october) add(filet, date, round(0.8 + rand()));
  }

  // Required test case: Filet real $50.00 within Oct 1–7 (12.755 lb × $3.92 = $49.9996 → $50.00).
  const filet = byCode.get("1");
  if (filet) {
    add(filet, "2026-10-01", 4.5, "LUNCH");
    add(filet, "2026-10-02", 4.2, "DINNER");
    add(filet, "2026-10-03", 4.055, "AFTERNOON");
  }

  for (let i = 0; i < rows.length; i += 200) await db.insert(schema.wasteEntries).values(rows.slice(i, i + 200));
  return rows.length;
}
