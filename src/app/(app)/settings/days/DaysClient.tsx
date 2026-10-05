"use client";

import { useState, useTransition } from "react";
import { IconTrash } from "@/components/icons";
import { Button, cx, ErrorText, fieldClass, Label, TextField } from "@/components/ui";
import { addHoliday, deleteHoliday, saveOperatingWeekdays } from "../actions";
import { useT } from "@/components/I18nProvider";

function fmtDate(d: string, locale: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function fmtMonth(m: string, locale: string) {
  return new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function DaysClient({
  openWeekdays,
  holidays,
  months,
  today,
}: {
  openWeekdays: number[];
  holidays: { date: string; label: string }[];
  months: { month: string; days: number }[];
  today: string;
}) {
  const { t, L, locale } = useT();
  const [open, setOpen] = useState(openWeekdays);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const dirty = JSON.stringify([...open].sort()) !== JSON.stringify([...openWeekdays].sort());

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setError(undefined);
        after?.();
      } else setError(res.error);
    });

  return (
    <div className="pb-8">
      <p className="text-[15px] leading-snug text-ink/80">
        {t(
          "The monthly allowance is split across operating days only. Entries on a closed day still count as real, but get no allowance.",
          "El allowance mensual se reparte solo entre los días operativos. Los registros de un día cerrado cuentan como real, pero no reciben allowance.",
        )}
      </p>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{t("Open days", "Días abiertos")}</h2>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {L.weekdaysShort.map((name, w) => (
            <button
              key={w}
              aria-pressed={open.includes(w)}
              onClick={() => setOpen((o) => (o.includes(w) ? o.filter((x) => x !== w) : [...o, w]))}
              className={cx(
                "h-12 rounded-lg text-sm font-semibold",
                open.includes(w) ? "bg-brand-dark text-white" : "bg-gray-100 text-muted line-through",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t("Applies from the current month on. Past months keep the days they were calculated with.", "Aplica desde el mes actual. Los meses pasados conservan los días con que se calcularon.")}</p>
        <Button className="mt-3 w-full" disabled={!dirty || pending} onClick={() => run(() => saveOperatingWeekdays(open))}>
          {t("Save open days", "Guardar días abiertos")}
        </Button>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          {months.map((m) => (
            <div key={m.month} className="rounded-lg bg-gray-50 p-2">
              <div className="text-xs text-muted">{fmtMonth(m.month, locale)}</div>
              <div className="text-lg font-bold">{m.days}</div>
              <div className="text-xs text-muted">{t("operating days", "días operativos")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{t("Closed holidays", "Feriados cerrados")}</h2>
        <ul className="mt-2 divide-y divide-line">
          {holidays.map((h) => (
            <li key={h.date} className={cx("flex items-center justify-between py-2", h.date < today && "opacity-60")}>
              <span>
                <span className="block font-medium">{h.label}</span>
                <span className="text-sm text-muted">{fmtDate(h.date, locale)}</span>
              </span>
              <button
                onClick={() => run(() => deleteHoliday(h.date))}
                className="grid h-11 w-11 place-items-center rounded-lg text-bad active:bg-red-50"
                aria-label={`${t("Remove", "Quitar")} ${h.label}`}
              >
                <IconTrash width={20} height={20} />
              </button>
            </li>
          ))}
          {!holidays.length && <li className="py-2 text-muted">{t("No holidays yet.", "Aún no hay feriados.")}</li>}
        </ul>
        <Label>{t("Date", "Fecha")}</Label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        <Label>{t("Name", "Nombre")}</Label>
        <TextField value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("e.g. Thanksgiving", "p. ej. Thanksgiving")} />
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={!date || !label.trim() || pending}
          onClick={() =>
            run(
              () => addHoliday({ date, label }),
              () => {
                setDate("");
                setLabel("");
              },
            )
          }
        >
          {t("Add holiday", "Agregar feriado")}
        </Button>
      </section>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
