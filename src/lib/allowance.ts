import { addDays } from "./dayparts";

/**
 * Allowance proration. Pure: full precision everywhere, round only for display.
 *
 *   daily allowance  = monthly allowance ÷ operating days of that month
 *   period allowance = Σ daily allowance over the operating days in the period
 *
 * A range that crosses months uses each month's own allowance and operating days.
 * Non-operating days get no allowance (their entries still count as real).
 */

export type Calendar = {
  /** Open weekdays (0 = Sunday) for a month "YYYY-MM"; months may be frozen differently. */
  openWeekdays: (month: string) => ReadonlySet<number>;
  /** Closed dates "YYYY-MM-DD". */
  holidays: ReadonlySet<string>;
};

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function isOperatingDay(date: string, cal: Calendar): boolean {
  return cal.openWeekdays(monthOf(date)).has(weekdayOf(date)) && !cal.holidays.has(date);
}

export function operatingDaysInMonth(month: string, cal: Calendar): number {
  return monthDates(month).filter((d) => isOperatingDay(d, cal)).length;
}

export function dailyAllowance(monthly: number, month: string, cal: Calendar): number {
  const days = operatingDaysInMonth(month, cal);
  return days > 0 ? monthly / days : 0;
}

export type DayAllowance = { date: string; operating: boolean; allowance: number };

/** Inclusive date range; `monthly(month)` returns that month's allowance (0 when none). */
export function allowanceByDay(from: string, to: string, monthly: (month: string) => number, cal: Calendar): DayAllowance[] {
  const out: DayAllowance[] = [];
  const dailyCache = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const month = monthOf(d);
    if (!dailyCache.has(month)) dailyCache.set(month, dailyAllowance(monthly(month), month, cal));
    const operating = isOperatingDay(d, cal);
    out.push({ date: d, operating, allowance: operating ? dailyCache.get(month)! : 0 });
  }
  return out;
}

export function allowanceForRange(from: string, to: string, monthly: (month: string) => number, cal: Calendar): number {
  return allowanceByDay(from, to, monthly, cal).reduce((s, d) => s + d.allowance, 0);
}

/** Positive or zero = within allowance (green); negative = over (red). */
export function difference(allowance: number, real: number): number {
  return allowance - real;
}

/** "+$4.44" / "−$5.56" — always signed; −0 shows as +$0.00. */
export function fmtSignedMoney(n: number): string {
  const r = Math.round(n * 100) / 100;
  const abs = Math.abs(r).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return r < 0 ? `−${abs}` : `+${abs}`;
}

export function simpleCalendar(openWeekdays: Iterable<number>, holidays: Iterable<string> = []): Calendar {
  const open = new Set(openWeekdays);
  return { openWeekdays: () => open, holidays: new Set(holidays) };
}
