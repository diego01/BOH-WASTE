import { describe, expect, it } from "vitest";
import { addDays, assignDaypart, daypartAt, daysBetween, localParts, toMinutes, type ScheduleConfig } from "@/lib/dayparts";
import { canModifyEntry, maxBackdateDays } from "@/lib/entries/rules";

const config: ScheduleConfig = {
  timezone: "America/New_York",
  dayparts: [
    { key: "BREAKFAST", label: "Breakfast", startTime: "06:30", endTime: "10:29" },
    { key: "LUNCH", label: "Lunch", startTime: "10:30", endTime: "14:19" },
    { key: "AFTERNOON", label: "Afternoon", startTime: "14:20", endTime: "16:59" },
    { key: "DINNER", label: "Dinner", startTime: "17:00", endTime: null },
  ],
  dinnerClose: { 0: "22:00", 1: "22:00", 2: "22:00", 3: "22:00", 4: "23:30", 5: "23:30", 6: "23:30" },
};

const at = (hhmm: string) => daypartAt(toMinutes(hhmm), config.dayparts);

describe("daypart boundaries", () => {
  it("assigns by start time, inclusive", () => {
    expect(at("06:30")).toBe("BREAKFAST");
    expect(at("10:29")).toBe("BREAKFAST");
    expect(at("10:30")).toBe("LUNCH");
    expect(at("14:19")).toBe("LUNCH");
    expect(at("14:20")).toBe("AFTERNOON");
    expect(at("16:59")).toBe("AFTERNOON");
    expect(at("17:00")).toBe("DINNER");
  });

  it("before opening → Breakfast, after closing → Dinner", () => {
    expect(at("05:00")).toBe("BREAKFAST");
    expect(at("00:15")).toBe("BREAKFAST");
    expect(at("23:45")).toBe("DINNER");
  });
});

describe("store timezone", () => {
  it("uses New York wall time, not UTC", () => {
    // 2026-10-05 14:00 UTC = 10:00 EDT → Breakfast, Monday
    const r = assignDaypart(new Date("2026-10-05T14:00:00Z"), config);
    expect(r).toEqual({ businessDate: "2026-10-05", daypart: "BREAKFAST" });
    expect(localParts(new Date("2026-10-05T14:00:00Z"), config.timezone).weekday).toBe(1);
  });

  it("late-night entry stays on the local date", () => {
    // 2026-10-09 03:15 UTC = Thu 2026-10-08 23:15 EDT → Dinner of the 8th
    expect(assignDaypart(new Date("2026-10-09T03:15:00Z"), config)).toEqual({ businessDate: "2026-10-08", daypart: "DINNER" });
  });

  it("handles the DST change (EST in November)", () => {
    // 2026-11-02 15:30 UTC = 10:30 EST → Lunch
    expect(assignDaypart(new Date("2026-11-02T15:30:00Z"), config).daypart).toBe("LUNCH");
  });
});

describe("date helpers", () => {
  it("adds days across months", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6);
  });
});

describe("entry rules", () => {
  const created = new Date("2026-10-05T14:00:00Z");
  const entry = { userId: "u1", createdAt: created };

  it("backdate window by role", () => {
    expect(maxBackdateDays("TEAM_MEMBER")).toBe(1);
    expect(maxBackdateDays("TEAM_LEADER")).toBe(7);
    expect(maxBackdateDays("ADMIN")).toBe(7);
  });

  it("author can modify for 15 minutes, leaders always", () => {
    const member = { id: "u1", role: "TEAM_MEMBER" as const };
    expect(canModifyEntry(member, entry, new Date(created.getTime() + 14 * 60_000))).toBe(true);
    expect(canModifyEntry(member, entry, new Date(created.getTime() + 16 * 60_000))).toBe(false);
    expect(canModifyEntry({ id: "u2", role: "TEAM_MEMBER" }, entry, created)).toBe(false);
    expect(canModifyEntry({ id: "u9", role: "TEAM_LEADER" }, entry, new Date("2026-12-01"))).toBe(true);
    expect(canModifyEntry({ id: "u9", role: "ADMIN" }, { ...entry, voidedAt: created }, created)).toBe(false);
  });
});
