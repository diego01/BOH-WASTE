import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { addMonths, operatingDaysInMonth } from "@/lib/allowance";
import { currentMonth, loadCalendar } from "@/lib/allowanceData";
import { requirePageUser } from "@/lib/auth/session";
import { DaysClient } from "./DaysClient";

export default async function DaysPage() {
  await requirePageUser("settings:view");
  const [weekdays, holidays, calendar, month] = await Promise.all([
    db.select().from(schema.operatingWeekdays),
    db.select().from(schema.holidays).orderBy(asc(schema.holidays.date)),
    loadCalendar(db),
    currentMonth(db),
  ]);
  const months = [month, addMonths(month, 1), addMonths(month, 2)].map((m) => ({ month: m, days: operatingDaysInMonth(m, calendar) }));
  return (
    <DaysClient
      openWeekdays={weekdays.filter((w) => w.isOpen).map((w) => w.weekday)}
      holidays={holidays}
      months={months}
      today={`${month}-01`}
    />
  );
}
