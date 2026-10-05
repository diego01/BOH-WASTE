import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedBase } from "@/db/seed";
import { signEntryToken } from "@/lib/auth/entryToken";
import { ingestEntries } from "@/lib/entries/ingest";
import type { EntryPayload } from "@/lib/entries/payload";
import { loadScheduleConfig } from "@/lib/storeConfig";
import { pickMsg } from "@/lib/i18n";
import type { ScheduleConfig } from "@/lib/dayparts";

let db: ReturnType<typeof drizzle<typeof schema>>;
let config: ScheduleConfig;
let memberToken: string;
let leaderToken: string;
let productId: number;

// Mon 2026-10-05 15:00 UTC = 11:00 EDT → Lunch
const NOW = new Date("2026-10-05T15:00:00Z");
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function entry(over: Partial<EntryPayload> = {}): EntryPayload {
  return {
    id: id(),
    token: memberToken,
    productId,
    quantity: 2,
    reasonId: null,
    note: null,
    occurredAt: NOW.toISOString(),
    daypart: "LUNCH",
    daypartManual: false,
    businessDate: "2026-10-05",
    dateManual: false,
    ...over,
  };
}

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  await seedBase(db);
  config = await loadScheduleConfig(db);
  const [member] = await db.insert(schema.users).values({ name: "m", role: "TEAM_MEMBER", pinHash: "x" }).returning();
  const [leader] = await db.insert(schema.users).values({ name: "l", role: "TEAM_LEADER", pinHash: "x" }).returning();
  memberToken = await signEntryToken(member.id);
  leaderToken = await signEntryToken(leader.id);
  const [area] = await db.select().from(schema.areas);
  const [p] = await db
    .insert(schema.products)
    .values({ areaId: area.id, name: "Filet", unit: "LB", unitCost: 3.92, type: "DONATION", availableDayparts: ["LUNCH", "AFTERNOON", "DINNER"] })
    .returning();
  productId = p.id;
}, 60_000);

describe("ingestEntries", () => {
  it("saves with cost/type snapshots and the daypart from the device time", async () => {
    // Made at 9:00 EDT (Breakfast) but synced at 11:00: must stay Breakfast.
    const e = entry({ occurredAt: "2026-10-05T13:00:00Z", daypart: "BREAKFAST" });
    const [r] = await ingestEntries(db, [e], config, NOW);
    expect(r.status).toBe("saved");
    const [row] = await db.select().from(schema.wasteEntries).where(eq(schema.wasteEntries.id, e.id));
    expect(row.daypart).toBe("BREAKFAST");
    expect(row.daypartManual).toBe(false);
    expect(row.type).toBe("DONATION");
    expect(Number(row.unitCost)).toBe(3.92);
    expect(Number(row.totalCost)).toBeCloseTo(7.84, 4);
    expect(row.businessDate).toBe("2026-10-05");
  });

  it("is idempotent by id", async () => {
    const e = entry();
    expect((await ingestEntries(db, [e], config, NOW))[0].status).toBe("saved");
    expect((await ingestEntries(db, [e], config, NOW))[0].status).toBe("duplicate");
  });

  it("keeps history when the product's cost or type changes later", async () => {
    const e = entry();
    await ingestEntries(db, [e], config, NOW);
    await db.update(schema.products).set({ unitCost: 9.99, type: "WASTE" }).where(eq(schema.products.id, productId));
    const [row] = await db.select().from(schema.wasteEntries).where(eq(schema.wasteEntries.id, e.id));
    expect(Number(row.unitCost)).toBe(3.92);
    expect(row.type).toBe("DONATION");
    await db.update(schema.products).set({ unitCost: 3.92, type: "DONATION" }).where(eq(schema.products.id, productId));
  });

  it("flags a manual daypart only when it differs from auto", async () => {
    const manual = entry({ daypart: "DINNER", daypartManual: true });
    const same = entry({ daypart: "LUNCH", daypartManual: true });
    await ingestEntries(db, [manual, same], config, NOW);
    const rows = await db.select().from(schema.wasteEntries);
    expect(rows.find((r) => r.id === manual.id)?.daypartManual).toBe(true);
    expect(rows.find((r) => r.id === same.id)?.daypartManual).toBe(false);
  });

  it("enforces the backdate window per role", async () => {
    const yesterday = entry({ businessDate: "2026-10-04", dateManual: true });
    const fiveBackMember = entry({ businessDate: "2026-09-30", dateManual: true });
    const fiveBackLeader = entry({ businessDate: "2026-09-30", dateManual: true, token: leaderToken });
    const future = entry({ businessDate: "2026-10-06", dateManual: true, token: leaderToken });
    const r = await ingestEntries(db, [yesterday, fiveBackMember, fiveBackLeader, future], config, NOW);
    expect(r.map((x) => x.status)).toEqual(["saved", "rejected", "saved", "rejected"]);
    const [row] = await db.select().from(schema.wasteEntries).where(eq(schema.wasteEntries.id, yesterday.id));
    expect(row.dateManual).toBe(true);
  });

  it("rejects bad tokens, unknown products, future clocks and bad quantities", async () => {
    const r = await ingestEntries(
      db,
      [
        entry({ token: "not-a-valid-token-at-all" }),
        entry({ productId: 99999 }),
        entry({ occurredAt: "2026-10-05T16:00:00Z" }),
        entry({ quantity: 0 }),
        { nonsense: true },
      ],
      config,
      NOW,
    );
    expect(r.every((x) => x.status === "rejected")).toBe(true);
  });

  describe("REMOVE", () => {
    let p2: number;
    beforeAll(async () => {
      const [area] = await db.select().from(schema.areas);
      const [p] = await db
        .insert(schema.products)
        .values({ areaId: area.id, name: "Biscuit", unit: "EACH", unitCost: 0.32, type: "DONATION", availableDayparts: ["BREAKFAST"] })
        .returning();
      p2 = p.id;
    });

    it("writes negative rows that copy the original daypart and cost", async () => {
      const add = entry({ productId: p2, quantity: 3, occurredAt: "2026-10-05T13:00:00Z", daypart: "BREAKFAST" });
      await ingestEntries(db, [add], config, NOW);
      // Cost changes later; the removal must use the original entry's cost.
      await db.update(schema.products).set({ unitCost: 1 }).where(eq(schema.products.id, p2));

      const rm = entry({ kind: "REMOVE", productId: p2, quantity: 1 });
      expect((await ingestEntries(db, [rm], config, NOW))[0].status).toBe("saved");
      const rows = await db.select().from(schema.wasteEntries).where(eq(schema.wasteEntries.correctionGroup, rm.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ correctsEntryId: add.id, daypart: "BREAKFAST", type: "DONATION" });
      expect(Number(rows[0].quantity)).toBe(-1);
      expect(Number(rows[0].totalCost)).toBeCloseTo(-0.32, 4);
    });

    it("is idempotent and can't remove more than what's left", async () => {
      const rm = entry({ kind: "REMOVE", productId: p2, quantity: 2 });
      expect((await ingestEntries(db, [rm], config, NOW))[0].status).toBe("saved");
      expect((await ingestEntries(db, [rm], config, NOW))[0].status).toBe("duplicate");
      const [again] = await ingestEntries(db, [entry({ kind: "REMOVE", productId: p2, quantity: 1 })], config, NOW);
      expect(again).toMatchObject({ status: "rejected" });
    });

    it("Team Members can't remove others' entries or past days; leaders can", async () => {
      const leaderAdd = entry({ productId: p2, quantity: 2, token: leaderToken });
      await ingestEntries(db, [leaderAdd], config, NOW);
      const [byMember] = await ingestEntries(db, [entry({ kind: "REMOVE", productId: p2, quantity: 1 })], config, NOW);
      expect(byMember.status).toBe("rejected");

      const [yesterdayMember] = await ingestEntries(
        db,
        [entry({ kind: "REMOVE", productId: p2, quantity: 1, businessDate: "2026-10-04", dateManual: true })],
        config,
        NOW,
      );
      expect(yesterdayMember.status).toBe("rejected");
      // Messages travel in both languages; each reader sees their half.
      const error = (yesterdayMember as { error: string }).error;
      expect(pickMsg(error, "en")).toBe("You can only remove from today's entries");
      expect(pickMsg(error, "es")).toBe("Solo puedes quitar de los registros de hoy");

      const [byLeader] = await ingestEntries(db, [entry({ kind: "REMOVE", productId: p2, quantity: 2, token: leaderToken })], config, NOW);
      expect(byLeader.status).toBe("saved");
    });
  });

  it("rejects entries from users deactivated since", async () => {
    const [u] = await db.insert(schema.users).values({ name: "gone", role: "TEAM_MEMBER", pinHash: "x", active: false }).returning();
    const [r] = await ingestEntries(db, [entry({ token: await signEntryToken(u.id) })], config, NOW);
    expect(r.status).toBe("rejected");
  });
});
