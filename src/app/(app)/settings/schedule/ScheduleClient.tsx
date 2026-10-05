"use client";

import { useState, useTransition } from "react";
import { Button, cx, ErrorText, fieldClass, Label, SelectField } from "@/components/ui";
import { formatTime, type ScheduleConfig } from "@/lib/dayparts";
import { useT } from "@/components/I18nProvider";
import { saveSchedule } from "../actions";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Lima",
];

const timeClass = cx(fieldClass, "h-12 px-3");

export function ScheduleClient({
  config,
  openWeekdays,
  boardGraceMinutes,
  autoLogoutMinutes,
}: {
  config: ScheduleConfig;
  openWeekdays: number[];
  boardGraceMinutes: number;
  autoLogoutMinutes: number;
}) {
  const initial = {
    timezone: config.timezone,
    dayparts: config.dayparts.map((d) => ({ key: d.key, startTime: d.startTime, endTime: d.endTime })),
    dinnerClose: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((w) => [String(w), config.dinnerClose[w] ?? "22:00"])),
    boardGraceMinutes,
    autoLogoutMinutes,
  };
  const { t: tr, L } = useT();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  const setDp = (i: number, field: "startTime" | "endTime", v: string) =>
    setS((x) => ({ ...x, dayparts: x.dayparts.map((d, k) => (k === i ? { ...d, [field]: v } : d)) }));

  function save() {
    setError(undefined);
    setSaved(false);
    start(async () => {
      const res = await saveSchedule(s);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  return (
    <div className="pb-8">
      <p className="text-[15px] leading-snug text-ink/80">
        {tr(
          "Entries get their daypart automatically from the time they are logged. Changes apply to new entries only; past entries keep their daypart.",
          "Cada registro toma su horario automáticamente según la hora en que se hace. Los cambios aplican solo a registros nuevos; los anteriores conservan su horario.",
        )}
      </p>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{tr("Dayparts", "Horarios")}</h2>
        {s.dayparts.map((d, i) => (
          <div key={d.key} className="mt-3">
            <div className="mb-1 font-medium">{L.daypart[d.key]}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-muted">
                {tr("Starts", "Inicia")}
                <input type="time" value={d.startTime} onChange={(e) => setDp(i, "startTime", e.target.value)} className={timeClass} />
              </label>
              {d.key === "DINNER" ? (
                <div className="text-sm text-muted">
                  {tr("Ends", "Termina")}
                  <div className="flex h-12 items-center">{tr("At closing (below)", "Al cierre (abajo)")}</div>
                </div>
              ) : (
                <label className="text-sm text-muted">
                  {tr("Ends", "Termina")}
                  <input type="time" value={d.endTime ?? ""} onChange={(e) => setDp(i, "endTime", e.target.value)} className={timeClass} />
                </label>
              )}
            </div>
          </div>
        ))}
        <p className="mt-3 text-xs text-muted">{tr("Before opening counts as Breakfast; after closing counts as Dinner.", "Antes de abrir cuenta como Breakfast; después de cerrar, como Dinner.")}</p>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{tr("Dinner closes at", "Dinner cierra a las")}</h2>
        <div className="mt-2 divide-y divide-line">
          {L.weekdays.map((name, w) => (
            <label key={w} className="flex items-center justify-between gap-3 py-2">
              <span className={cx("text-[15px]", !openWeekdays.includes(w) && "text-muted")}>
                {name}
                {!openWeekdays.includes(w) && <span className="ml-1 text-xs">({tr("closed", "cerrado")})</span>}
              </span>
              <input
                type="time"
                value={s.dinnerClose[String(w)]}
                onChange={(e) => setS((x) => ({ ...x, dinnerClose: { ...x.dinnerClose, [String(w)]: e.target.value } }))}
                className="h-11 w-36 rounded-lg border border-line bg-field px-3 outline-none focus:border-brand"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{tr("Store", "Tienda")}</h2>
        <Label>{tr("Timezone", "Zona horaria")}</Label>
        <SelectField
          value={s.timezone}
          onChange={(v) => setS((x) => ({ ...x, timezone: v }))}
          options={[...new Set([s.timezone, ...TIMEZONES])].map((t) => ({ value: t, label: t.replace("_", " ") }))}
        />
        <Label>{tr("Header total keeps the ended daypart for (minutes)", "El total de arriba mantiene el horario terminado por (minutos)")}</Label>
        <input
          inputMode="numeric"
          value={s.boardGraceMinutes}
          onChange={(e) => setS((x) => ({ ...x, boardGraceMinutes: Number(e.target.value.replace(/\D/g, "") || 0) }))}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-muted">
          {tr(
            `e.g. Breakfast ends ${formatTime(s.dayparts[0].endTime ?? "10:29")}; the header shows Breakfast for ${s.boardGraceMinutes} more minutes.`,
            `p. ej. Breakfast termina ${formatTime(s.dayparts[0].endTime ?? "10:29")}; el total de arriba muestra Breakfast ${s.boardGraceMinutes} minutos más.`,
          )}
        </p>
        <Label>{tr("Auto sign-out after inactivity (minutes, 0 = off)", "Cerrar sesión por inactividad (minutos, 0 = nunca)")}</Label>
        <input
          inputMode="numeric"
          value={s.autoLogoutMinutes}
          onChange={(e) => setS((x) => ({ ...x, autoLogoutMinutes: Number(e.target.value.replace(/\D/g, "") || 0) }))}
          className={fieldClass}
        />
      </section>

      <ErrorText>{error}</ErrorText>
      {saved && !dirty && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[15px] text-good">{tr("Saved.", "Guardado.")}</p>}
      <div className="sticky bottom-20 mt-4">
        <Button className="w-full shadow-lg" disabled={!dirty || pending} onClick={save}>
          {pending ? tr("Saving…", "Guardando…") : tr("Save schedule", "Guardar horarios")}
        </Button>
      </div>
    </div>
  );
}
