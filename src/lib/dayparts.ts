import type { Daypart } from "@/db/schema";

/**
 * Pure daypart/business-date logic, shared by the device (to show and queue
 * entries offline) and the server (which recomputes it from occurredAt).
 * No DB, no Node APIs: only Intl for the store timezone.
 */

export type DaypartWindow = { key: Daypart; label: string; startTime: string; endTime: string | null };

export type ScheduleConfig = {
  timezone: string;
  /** Sorted by start time. */
  dayparts: DaypartWindow[];
  /** weekday (0 = Sunday) → "HH:MM" */
  dinnerClose: Record<number, string>;
};

export type LocalParts = { date: string; minutes: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock date/time of an instant in the store timezone. */
export function localParts(instant: Date, timezone: string): LocalParts {
  const p = Object.fromEntries(formatter(timezone).formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: WEEKDAYS[p.weekday],
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Daypart for a local time: the last daypart whose start is <= time.
 * Before the first start (before opening, incl. after midnight) → first daypart (Breakfast).
 * After close → last daypart (Dinner), because Dinner has no end.
 */
export function daypartAt(minutes: number, dayparts: DaypartWindow[]): Daypart {
  const sorted = [...dayparts].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  let current = sorted[0].key;
  for (const d of sorted) if (toMinutes(d.startTime) <= minutes) current = d.key;
  return current;
}

/** Auto assignment for an entry made at `instant`. The business date is the store-local calendar date. */
export function assignDaypart(instant: Date, config: ScheduleConfig): { businessDate: string; daypart: Daypart } {
  const lp = localParts(instant, config.timezone);
  return { businessDate: lp.date, daypart: daypartAt(lp.minutes, config.dayparts) };
}

/**
 * Daypart shown in the header total ("whiteboard"). The team copies each
 * daypart's total after it ends, so the header keeps showing the daypart that
 * just finished for `graceMinutes`, then moves on. Display only: entries are
 * still assigned by real time (assignDaypart).
 */
export function boardDaypart(instant: Date, config: ScheduleConfig, graceMinutes: number): Daypart {
  const lp = localParts(instant, config.timezone);
  return daypartAt(lp.minutes - graceMinutes, config.dayparts);
}

/** "YYYY-MM-DD" ± n days (calendar arithmetic, timezone-free). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** "06:30" → "6:30 am" */
export function formatTime(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** Human window, e.g. "10:30 am – 2:19 pm"; Dinner uses that weekday's close. */
export function windowLabel(d: DaypartWindow, config: ScheduleConfig, weekday: number): string {
  const end = d.endTime ?? config.dinnerClose[weekday];
  return end ? `${formatTime(d.startTime)} – ${formatTime(end)}` : `${formatTime(d.startTime)} – close`;
}
