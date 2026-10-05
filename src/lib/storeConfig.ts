import { asc } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { ScheduleConfig } from "@/lib/dayparts";

export async function loadScheduleConfig(db: DB): Promise<ScheduleConfig> {
  const [store] = await db.select({ timezone: schema.store.timezone }).from(schema.store).limit(1);
  const dayparts = await db.select().from(schema.dayparts).orderBy(asc(schema.dayparts.sortOrder));
  const close = await db.select().from(schema.dinnerClose);
  return {
    timezone: store?.timezone ?? "America/New_York",
    dayparts: dayparts.map((d) => ({ key: d.key, label: d.label, startTime: d.startTime, endTime: d.endTime })),
    dinnerClose: Object.fromEntries(close.map((c) => [c.weekday, c.closeTime])),
  };
}

export async function loadAutoLogoutMinutes(db: DB): Promise<number> {
  const [store] = await db.select({ m: schema.store.autoLogoutMinutes }).from(schema.store).limit(1);
  return store?.m ?? 2;
}
