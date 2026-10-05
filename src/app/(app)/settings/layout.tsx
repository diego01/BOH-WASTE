import { requirePageUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18nServer";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Server-side guard in addition to the proxy: Admin only, even by direct URL.
  await requirePageUser("settings:view");
  const { t } = await getT();
  return (
    <main className="pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-center text-lg font-semibold">{t("Waste Settings", "Ajustes de Waste")}</h1>
      <SettingsTabs />
      <div className="px-4">{children}</div>
    </main>
  );
}
