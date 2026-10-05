"use client";

import { useEffect, useState, useTransition } from "react";
import type { Role } from "@/db/schema";
import { IconChevronLeft, IconSearch } from "@/components/icons";
import { PinPad } from "@/components/PinPad";
import { clearCachedPages } from "@/components/ServiceWorker";
import { useT } from "@/components/I18nProvider";
import { ErrorText } from "@/components/ui";
import { pinRule } from "@/lib/domain";
import { login } from "./actions";

type U = { id: string; name: string; role: Role };

export function LoginForm({ users }: { users: U[] }) {
  const [selected, setSelected] = useState<U | null>(null);
  const [pin, setPin] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const { t, L } = useT();

  const rule = selected ? pinRule(selected.role) : { min: 4, max: 6 };

  // Whoever was signed in before is gone: drop their cached offline screens.
  useEffect(() => clearCachedPages(), []);

  // Auto-submit at max length; shorter PINs use the Enter button.
  useEffect(() => {
    if (selected && pin.length === rule.max) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function submit() {
    if (!selected || pin.length < rule.min) return;
    setError(undefined);
    start(async () => {
      const res = await login(selected.id, pin);
      if (res?.error) {
        setError(res.error);
        setPin("");
      }
    });
  }

  if (!selected) {
    const list = users.filter((u) => u.name.toLowerCase().includes(q.trim().toLowerCase()));
    return (
      <section className="mt-6">
        <p className="mb-3 text-center text-muted">{t("Who's logging?", "¿Quién registra?")}</p>
        {users.length > 8 && (
          <div className="relative mb-3">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Find your name", "Busca tu nombre")}
              className="h-14 w-full rounded-xl border border-line bg-white pl-12 pr-4 outline-none focus:border-brand"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {list.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setSelected(u);
                setPin("");
                setError(undefined);
              }}
              className="flex min-h-20 flex-col items-start justify-center rounded-2xl bg-white px-4 py-3 text-left shadow-sm active:bg-brand-soft"
            >
              <span className="text-lg font-semibold capitalize">{u.name}</span>
              <span className="text-sm text-muted">{L.role[u.role]}</span>
            </button>
          ))}
        </div>
        {!users.length && (
          <p className="mt-6 rounded-xl bg-white p-4 text-center text-muted">
            {t("No users yet. Run npm run db:seed with a bootstrap admin (see README).", "Aún no hay usuarios. Ejecuta npm run db:seed con un admin inicial (ver README).")}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="mt-4">
      <button onClick={() => setSelected(null)} className="-ml-2 flex h-11 items-center gap-1 px-2 font-medium text-brand-dark">
        <IconChevronLeft /> {t("Change user", "Cambiar usuario")}
      </button>
      <p className="mb-6 mt-2 text-center text-xl">
        {t("Hi", "Hola")}, <span className="font-bold capitalize">{selected.name}</span>
        <br />
        <span className="text-[15px] text-muted">{t("Enter your PIN", "Ingresa tu PIN")}</span>
      </p>
      <PinPad value={pin} onChange={setPin} maxLength={rule.max} disabled={pending} />
      <div className="mx-auto mt-4 max-w-xs">
        {pin.length >= rule.min && pin.length < rule.max && (
          <button
            onClick={submit}
            disabled={pending}
            className="h-14 w-full rounded-2xl bg-brand-dark text-lg font-semibold text-white disabled:opacity-60"
          >
            {t("Enter", "Entrar")}
          </button>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </section>
  );
}
