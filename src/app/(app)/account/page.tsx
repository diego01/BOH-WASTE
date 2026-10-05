import Link from "next/link";
import { LangToggle } from "@/components/LangToggle";
import { requirePageUser } from "@/lib/auth/session";
import { labels } from "@/lib/i18n";
import { getT } from "@/lib/i18nServer";
import { logout } from "../../login/actions";

export default async function AccountPage() {
  const user = await requirePageUser();
  const { t, lang } = await getT();
  return (
    <main className="px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <h1 className="text-center text-lg font-semibold">{t("Account", "Cuenta")}</h1>
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="text-2xl font-bold capitalize">{user.name}</div>
        <div className="text-muted">{labels(lang).role[user.role]}</div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm">
        <span className="text-[17px] font-medium">{t("Language", "Idioma")}</span>
        <LangToggle />
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
        <Link href="/change-pin" className="flex h-14 items-center px-5 text-[17px] font-medium active:bg-gray-50">
          {t("Change PIN", "Cambiar PIN")}
        </Link>
      </div>
      <form action={logout} className="mt-6">
        <button className="h-14 w-full rounded-2xl bg-white text-[17px] font-semibold text-bad shadow-sm active:bg-red-50">
          {t("Sign out", "Cerrar sesión")}
        </button>
      </form>
    </main>
  );
}
