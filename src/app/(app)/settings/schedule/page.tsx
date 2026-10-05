import { db, schema } from "@/db";
import { requirePageUser } from "@/lib/auth/session";
import { loadScheduleConfig } from "@/lib/storeConfig";
import { ScheduleClient } from "./ScheduleClient";

export default async function SchedulePage() {
  await requirePageUser("settings:view");
  const config = await loadScheduleConfig(db);
  const [store] = await db.select().from(schema.store).limit(1);
  const open = (await db.select().from(schema.operatingWeekdays)).filter((w) => w.isOpen).map((w) => w.weekday);
  return (
    <ScheduleClient
      config={config}
      openWeekdays={open}
      boardGraceMinutes={store?.boardGraceMinutes ?? 60}
      autoLogoutMinutes={store?.autoLogoutMinutes ?? 2}
    />
  );
}
