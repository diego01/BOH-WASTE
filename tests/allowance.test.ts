import { describe, expect, it } from "vitest";
import {
  allowanceByDay,
  allowanceForRange,
  dailyAllowance,
  difference,
  fmtSignedMoney,
  operatingDaysInMonth,
  simpleCalendar,
  type Calendar,
} from "@/lib/allowance";

const MON_SAT = [1, 2, 3, 4, 5, 6];
const cal = simpleCalendar(MON_SAT);
const filet = (month: string) => (month === "2026-10" ? 200 : 0);

describe("required test case: Filet, October 2026, $200", () => {
  it("October 2026 has 27 operating days (4 Sundays closed)", () => {
    expect(operatingDaysInMonth("2026-10", cal)).toBe(27);
  });

  it("daily allowance ≈ $7.4074", () => {
    expect(dailyAllowance(200, "2026-10", cal)).toBeCloseTo(7.4074, 4);
  });

  it("Oct 1–7 has 6 operating days → ≈ $44.44", () => {
    const days = allowanceByDay("2026-10-01", "2026-10-07", filet, cal);
    expect(days.filter((d) => d.operating)).toHaveLength(6);
    expect(days.find((d) => d.date === "2026-10-04")).toEqual({ date: "2026-10-04", operating: false, allowance: 0 });
    expect(allowanceForRange("2026-10-01", "2026-10-07", filet, cal)).toBeCloseTo(44.444, 3);
  });

  it("real $50.00 → difference ≈ −$5.56 (red: over)", () => {
    const d = difference(allowanceForRange("2026-10-01", "2026-10-07", filet, cal), 50);
    expect(d).toBeCloseTo(-5.556, 3);
    expect(d < 0).toBe(true);
    expect(fmtSignedMoney(d)).toBe("−$5.56");
  });

  it("real $40.00 → difference ≈ +$4.44 (green: within)", () => {
    const d = difference(allowanceForRange("2026-10-01", "2026-10-07", filet, cal), 40);
    expect(d).toBeCloseTo(4.444, 3);
    expect(fmtSignedMoney(d)).toBe("+$4.44");
  });

  it("the whole month adds back to exactly $200", () => {
    expect(allowanceForRange("2026-10-01", "2026-10-31", filet, cal)).toBeCloseTo(200, 9);
  });
});

describe("proration rules", () => {
  it("a single day is the daily allowance; a Sunday is zero", () => {
    expect(allowanceForRange("2026-10-05", "2026-10-05", filet, cal)).toBeCloseTo(200 / 27, 9);
    expect(allowanceForRange("2026-10-11", "2026-10-11", filet, cal)).toBe(0);
  });

  it("holidays reduce operating days and get no allowance", () => {
    const withHoliday = simpleCalendar(MON_SAT, ["2026-10-12"]);
    expect(operatingDaysInMonth("2026-10", withHoliday)).toBe(26);
    expect(allowanceForRange("2026-10-12", "2026-10-12", filet, withHoliday)).toBe(0);
    expect(allowanceForRange("2026-10-13", "2026-10-13", filet, withHoliday)).toBeCloseTo(200 / 26, 9);
  });

  it("a range across months uses each month's own allowance and days", () => {
    const monthly = (m: string) => (m === "2026-09" ? 260 : m === "2026-10" ? 270 : 0);
    // Sept 2026: 30 days, 4 Sundays → 26 operating → $10/day. Oct: 27 → $10/day.
    expect(operatingDaysInMonth("2026-09", cal)).toBe(26);
    // Sep 29 (Tue), Sep 30 (Wed), Oct 1 (Thu), Oct 2 (Fri) → 4 days × $10
    expect(allowanceForRange("2026-09-29", "2026-10-02", monthly, cal)).toBeCloseTo(40, 9);
  });

  it("frozen weekdays per month are respected", () => {
    const frozen: Calendar = {
      openWeekdays: (m) => new Set(m === "2026-09" ? [0, 1, 2, 3, 4, 5, 6] : MON_SAT),
      holidays: new Set(),
    };
    expect(operatingDaysInMonth("2026-09", frozen)).toBe(30);
    expect(operatingDaysInMonth("2026-10", frozen)).toBe(27);
  });

  it("no operating days → no division by zero", () => {
    expect(dailyAllowance(100, "2026-10", simpleCalendar([]))).toBe(0);
  });

  it("zero difference shows as positive", () => {
    expect(fmtSignedMoney(0)).toBe("+$0.00");
    expect(fmtSignedMoney(-0.001)).toBe("+$0.00");
  });
});
