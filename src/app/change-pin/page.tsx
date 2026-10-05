import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { pinRule } from "@/lib/domain";
import { getT } from "@/lib/i18nServer";
import { ChangePinForm } from "./ChangePinForm";

export default async function ChangePinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const rule = pinRule(user.role);
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <h1 className="text-center text-2xl font-bold">{t("Set your PIN", "Crea tu PIN")}</h1>
      <p className="mt-2 text-center text-muted">
        {user.mustChangePin ? t("First sign-in: choose a personal PIN. ", "Primer ingreso: elige un PIN personal. ") : ""}
        {t(`${rule.min}–${rule.max} digits.`, `${rule.min}–${rule.max} dígitos.`)}
      </p>
      <ChangePinForm rule={rule} canCancel={!user.mustChangePin} />
    </main>
  );
}
