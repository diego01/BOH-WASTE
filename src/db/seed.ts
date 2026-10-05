import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import type { DB } from "./index";
import * as schema from "./schema";
import { DEFAULT_CATEGORIES } from "@/lib/import/categorySuggest";
import { IMPORT_AREA_NAME } from "@/lib/import/apply";

/** Idempotent base configuration: safe to run on every deploy. */
export async function seedBase(db: DB) {
  const [{ n: storeCount }] = await db.select({ n: count() }).from(schema.store);
  if (storeCount === 0) {
    await db.insert(schema.store).values({ name: "My Store", timezone: "America/New_York" });
  }

  const [boh] = await db.select().from(schema.areas).where(eq(schema.areas.name, IMPORT_AREA_NAME));
  if (!boh) await db.insert(schema.areas).values({ name: IMPORT_AREA_NAME, color: "#2196F3", sortOrder: 0 });

  await db
    .insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((name, i) => ({ name, sortOrder: i })))
    .onConflictDoNothing();

  await db
    .insert(schema.reasons)
    .values(
      ["Expired", "Contaminated", "Floor", "Order Accuracy", "Overcooked", "Quality"].map((name, i) => ({
        name,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(schema.dayparts)
    .values([
      { key: "BREAKFAST", label: "Breakfast", startTime: "06:30", endTime: "10:29", sortOrder: 0 },
      { key: "LUNCH", label: "Lunch", startTime: "10:30", endTime: "14:19", sortOrder: 1 },
      { key: "AFTERNOON", label: "Afternoon", startTime: "14:20", endTime: "16:59", sortOrder: 2 },
      { key: "DINNER", label: "Dinner", startTime: "17:00", endTime: null, sortOrder: 3 },
    ])
    .onConflictDoNothing();

  // Close: 10:00 pm Mon–Wed, 11:30 pm Thu–Sat (Sunday is closed). Editable in Settings → Schedule.
  await db
    .insert(schema.dinnerClose)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closeTime: weekday >= 4 ? "23:30" : "22:00" })))
    .onConflictDoNothing();

  // Mon–Sat open, Sunday closed.
  await db
    .insert(schema.operatingWeekdays)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, isOpen: weekday !== 0 })))
    .onConflictDoNothing();
}

/**
 * First admin so someone can sign in and run the Excel import.
 * Only created when there is no admin at all.
 */
export async function seedBootstrapAdmin(db: DB, name: string, pin: string) {
  const [{ n }] = await db.select({ n: count() }).from(schema.users).where(eq(schema.users.role, "ADMIN"));
  if (n > 0) return false;
  await db.insert(schema.users).values({
    name,
    role: "ADMIN",
    pinHash: await bcrypt.hash(pin, 10),
    mustChangePin: true,
  });
  return true;
}

/** Demo users, one per profile. PINs are test values documented in .env.example. */
export const DEMO_USERS: { name: string; role: schema.Role; pin: string }[] = [
  { name: "Demo Admin", role: "ADMIN", pin: "111111" },
  { name: "Demo Leader", role: "TEAM_LEADER", pin: "2222" },
  { name: "Demo Member", role: "TEAM_MEMBER", pin: "3333" },
];

export async function seedDemoUsers(db: DB) {
  for (const u of DEMO_USERS) {
    await db
      .insert(schema.users)
      .values({ name: u.name, role: u.role, pinHash: await bcrypt.hash(u.pin, 10), mustChangePin: false })
      .onConflictDoNothing();
  }
}

/**
 * Demo allowances for September and October 2026, including the required test
 * case (Chicken, Filets = $200 in October) and a shared group.
 */
export async function seedDemoAllowances(db: DB) {
  // September is a lighter month so cross-month ranges show both.
  await seedDemoMonth(db, "2026-09", 180, 280);
  await seedDemoMonth(db, "2026-10", 200, 300);
}

async function seedDemoMonth(db: DB, month: string, filetAmount: number, groupAmount: number) {
  const open = (await db.select().from(schema.operatingWeekdays)).filter((w) => w.isOpen).map((w) => w.weekday);
  await db.insert(schema.allowanceMonths).values({ month, openWeekdays: open }).onConflictDoNothing();
  const existing = await db.select().from(schema.allowances).where(eq(schema.allowances.month, month));
  if (existing.length) return;

  const byCode = async (code: string) => (await db.select().from(schema.products).where(eq(schema.products.code, code)))[0];
  const filet = await byCode("1");
  if (filet) {
    const [a] = await db.insert(schema.allowances).values({ month, kind: "INDIVIDUAL", name: filet.name, monthlyAmount: filetAmount }).returning();
    await db.insert(schema.allowanceProducts).values({ allowanceId: a.id, productId: filet.id, month });
  }
  const group = (await Promise.all(["70", "10681", "3201"].map(byCode))).filter((p) => !!p);
  if (group.length) {
    const [g] = await db.insert(schema.allowances).values({ month, kind: "GROUP", name: "Nuggets & Strips", monthlyAmount: groupAmount }).returning();
    await db.insert(schema.allowanceProducts).values(group.map((p) => ({ allowanceId: g.id, productId: p.id, month })));
  }
}
