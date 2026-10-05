import { describe, expect, it } from "vitest";
import { boardDaypart, type ScheduleConfig } from "@/lib/dayparts";
import { allocateRemoval, removableEntries, removableTotal, type LedgerRow } from "@/lib/entries/removal";

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  id: "x",
  userId: "me",
  productId: 1,
  businessDate: "2026-10-05",
  daypart: "LUNCH",
  type: "DONATION",
  unitCost: 0.32,
  quantity: 1,
  occurredAt: "2026-10-05T15:00:00Z",
  correctsEntryId: null,
  ...over,
});

const me = { id: "me", role: "TEAM_MEMBER" as const };
const leader = { id: "boss", role: "TEAM_LEADER" as const };

describe("removal allocation", () => {
  const rows = [
    row({ id: "a", quantity: 2, daypart: "BREAKFAST", occurredAt: "2026-10-05T13:00:00Z", unitCost: 0.3 }),
    row({ id: "b", quantity: 3, daypart: "LUNCH", occurredAt: "2026-10-05T15:00:00Z" }),
    row({ id: "other", userId: "someone", quantity: 5 }),
    row({ id: "c1", quantity: -1, correctsEntryId: "b" }),
    row({ id: "voided", quantity: 9, voidedAt: "2026-10-05T16:00:00Z" }),
  ];

  it("Team Members can only remove from their own entries, net of earlier removals", () => {
    const c = removableEntries(rows, me, 1, "2026-10-05");
    expect(c.map((x) => [x.id, x.remaining])).toEqual([
      ["b", 2],
      ["a", 2],
    ]);
    expect(removableTotal(c)).toBe(4);
  });

  it("leaders can remove from anyone's entries", () => {
    expect(removableTotal(removableEntries(rows, leader, 1, "2026-10-05"))).toBe(9);
  });

  it("takes newest first and copies each entry's daypart and cost", () => {
    const parts = allocateRemoval(removableEntries(rows, me, 1, "2026-10-05"), 3);
    expect(parts).toEqual([
      { entryId: "b", quantity: 2, daypart: "LUNCH", unitCost: 0.32, type: "DONATION" },
      { entryId: "a", quantity: 1, daypart: "BREAKFAST", unitCost: 0.3, type: "DONATION" },
    ]);
  });

  it("never removes more than was logged", () => {
    expect(allocateRemoval(removableEntries(rows, me, 1, "2026-10-05"), 4.5)).toBeNull();
    expect(allocateRemoval(removableEntries(rows, me, 1, "2026-10-05"), 0)).toBeNull();
  });

  it("handles pounds without float drift", () => {
    const lb = [row({ id: "p", quantity: 0.72, occurredAt: "2026-10-05T15:00:00Z" })];
    const parts = allocateRemoval(removableEntries(lb, me, 1, "2026-10-05"), 0.72);
    expect(parts?.[0].quantity).toBe(0.72);
    expect(removableTotal(removableEntries([...lb, row({ id: "q", quantity: -0.72, correctsEntryId: "p" })], me, 1, "2026-10-05"))).toBe(0);
  });
});

describe("whiteboard daypart (header total)", () => {
  const config: ScheduleConfig = {
    timezone: "America/New_York",
    dayparts: [
      { key: "BREAKFAST", label: "Breakfast", startTime: "06:30", endTime: "10:29" },
      { key: "LUNCH", label: "Lunch", startTime: "10:30", endTime: "14:19" },
      { key: "AFTERNOON", label: "Afternoon", startTime: "14:20", endTime: "16:59" },
      { key: "DINNER", label: "Dinner", startTime: "17:00", endTime: null },
    ],
    dinnerClose: {},
  };
  // EDT = UTC-4
  const at = (local: string) => boardDaypart(new Date(`2026-10-05T${local}:00-04:00`), config, 60);

  it("keeps showing the daypart that just ended for one hour", () => {
    expect(at("10:00")).toBe("BREAKFAST");
    expect(at("10:45")).toBe("BREAKFAST");
    expect(at("11:29")).toBe("BREAKFAST");
    expect(at("11:30")).toBe("LUNCH");
    expect(at("15:00")).toBe("LUNCH");
    expect(at("15:20")).toBe("AFTERNOON");
    expect(at("17:59")).toBe("AFTERNOON");
    expect(at("18:00")).toBe("DINNER");
    expect(at("23:45")).toBe("DINNER");
  });

  it("starts the day on Breakfast", () => {
    expect(at("06:00")).toBe("BREAKFAST");
    expect(at("07:00")).toBe("BREAKFAST");
  });
});
