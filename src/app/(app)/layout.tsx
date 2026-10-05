import { db } from "@/db";
import { BottomNav } from "@/components/BottomNav";
import { IdleLogout } from "@/components/IdleLogout";
import { navFor } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { loadAutoLogoutMinutes } from "@/lib/storeConfig";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  const idleMinutes = await loadAutoLogoutMinutes(db);
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      {children}
      <IdleLogout minutes={idleMinutes} />
      <BottomNav items={navFor(user.role)} />
    </div>
  );
}
