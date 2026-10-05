"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PinPad } from "@/components/PinPad";
import { useT } from "@/components/I18nProvider";
import { ErrorText } from "@/components/ui";
import { changePin } from "../login/actions";

export function ChangePinForm({ rule, canCancel }: { rule: { min: number; max: number }; canCancel: boolean }) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const { t } = useT();

  function next() {
    setError(undefined);
    if (first === null) {
      setFirst(pin);
      setPin("");
      return;
    }
    start(async () => {
      const res = await changePin(first, pin);
      if (res?.error) {
        setError(res.error);
        setFirst(null);
        setPin("");
      }
    });
  }

  return (
    <section className="mt-6">
      <p className="mb-5 text-center text-lg font-medium">{first === null ? t("New PIN", "Nuevo PIN") : t("Repeat new PIN", "Repite el nuevo PIN")}</p>
      <PinPad value={pin} onChange={setPin} maxLength={rule.max} disabled={pending} />
      <div className="mx-auto mt-4 max-w-xs">
        <button
          onClick={next}
          disabled={pin.length < rule.min || pending}
          className="h-14 w-full rounded-2xl bg-brand-dark text-lg font-semibold text-white disabled:bg-brand-soft"
        >
          {first === null ? t("Next", "Siguiente") : t("Save PIN", "Guardar PIN")}
        </button>
        <ErrorText>{error}</ErrorText>
        {canCancel && (
          <Link href="/account" className="mt-4 block text-center font-medium text-brand-dark">
            {t("Cancel", "Cancelar")}
          </Link>
        )}
      </div>
    </section>
  );
}
