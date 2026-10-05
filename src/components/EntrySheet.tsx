"use client";

import { useState } from "react";
import type { Daypart, ProductType, Unit } from "@/db/schema";
import { addDays } from "@/lib/dayparts";
import { DAYPARTS } from "@/lib/domain";
import { dayLabel } from "@/lib/i18n";
import { useT } from "./I18nProvider";
import { IconChevronDown, IconPlus } from "./icons";
import { BottomSheet, ConfirmDialog, cx, ErrorText } from "./ui";

export type EntryValues = {
  quantity: number;
  reasonId: number | null;
  note: string | null;
  daypart: Daypart;
  daypartManual: boolean;
  businessDate: string;
  dateManual: boolean;
};

export type RemoveValues = { quantity: number; businessDate: string; dateManual: boolean; note: string | null };

type Props = {
  product: { name: string; unit: Unit; type: ProductType; availableDayparts: Daypart[] };
  reasons: { id: number; name: string }[];
  /** Auto-assigned values for "now" (create) or the entry's original ones (edit). */
  autoDaypart: Daypart;
  today: string;
  maxBackdate: number;
  initial?: EntryValues;
  onSubmit: (v: EntryValues) => Promise<string | void>;
  onVoid?: () => Promise<string | void>;
  /** Enables the Add / Remove switch (logging screen only). */
  removal?: {
    /** Quantity this user may remove for a date; null = unknown offline, checked when saving. */
    available: (date: string) => number | null;
    ownOnly: boolean;
    maxBackDays: number;
    onRemove: (v: RemoveValues) => Promise<string | void>;
  };
  onClose: () => void;
};

const STEP: Record<Unit, number> = { LB: 0.1, OZ: 0.1, EACH: 1, BAG_50OZ: 1 };
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function EntrySheet({ product, reasons, autoDaypart, today, maxBackdate, initial, onSubmit, onVoid, removal, onClose }: Props) {
  const isEdit = !!initial;
  const { t, L, lang } = useT();
  const dateLabel = (d: string, ref: string) => dayLabel(d, ref, lang);
  const unit = L.unitShort[product.unit];
  const [mode, setMode] = useState<"ADD" | "REMOVE">("ADD");
  const [qty, setQty] = useState(initial ? String(initial.quantity) : "0");
  const [reasonId, setReasonId] = useState<number | null>(initial?.reasonId ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [showNote, setShowNote] = useState(!!initial?.note);
  const [daypart, setDaypart] = useState<Daypart>(initial?.daypart ?? autoDaypart);
  const [date, setDate] = useState(initial?.businessDate ?? today);
  const [showWhen, setShowWhen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const isWaste = product.type === "WASTE";
  const step = STEP[product.unit];
  const n = Number(qty);
  const removing = mode === "REMOVE" && !!removal;
  const removable = removing ? removal.available(date) : null;
  const valid =
    Number.isFinite(n) &&
    n > 0 &&
    (product.unit !== "EACH" || Number.isInteger(n)) &&
    (!removing || removable === null || n <= removable + 1e-9);
  const daypartManual = daypart !== autoDaypart;
  const dateManual = initial ? date !== initial.businessDate || initial.dateManual : date !== today;
  const outOfDaypart = !product.availableDayparts.includes(daypart);
  const backDays = removing ? removal.maxBackDays : maxBackdate;
  const dates = Array.from({ length: backDays + 1 }, (_, i) => addDays(today, -i));
  if (initial && !dates.includes(initial.businessDate)) dates.push(initial.businessDate);

  function bump(dir: 1 | -1) {
    const base = Number.isFinite(n) ? n : 0;
    let next = Math.max(0, round3(base + dir * step));
    if (removing && removable !== null) next = Math.min(next, removable);
    setQty(String(next));
  }

  function switchMode(m: "ADD" | "REMOVE") {
    setMode(m);
    setQty("0");
    setDate(today);
    setError(undefined);
  }

  async function submit() {
    setBusy(true);
    setError(undefined);
    if (removing) {
      const err = await removal.onRemove({
        quantity: round3(n),
        businessDate: date,
        dateManual: date !== today,
        note: note.trim() || null,
      });
      setBusy(false);
      if (err) setError(err);
      return;
    }
    const err = await onSubmit({
      quantity: round3(n),
      reasonId,
      note: note.trim() || null,
      daypart,
      daypartManual,
      businessDate: date,
      dateManual,
    });
    setBusy(false);
    if (err) setError(err);
  }

  const tone = isWaste ? "text-waste" : "text-donation";
  const label = isEdit
    ? t("Save changes", "Guardar cambios")
    : removing
      ? `${t("Remove", "Quitar")} ${valid ? `${round3(n)} ${unit}` : ""}`.trim()
      : isWaste
        ? t("Add Waste", "Agregar Waste")
        : t("Add Donation", "Agregar Donación");

  return (
    <BottomSheet
      open
      title={L.type[product.type]}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <button
            disabled={!valid || busy}
            onClick={submit}
            className={cx(
              "h-14 w-full rounded-xl text-lg font-semibold text-white transition active:scale-[0.98] disabled:opacity-40",
              removing ? "bg-ink" : isWaste ? "bg-waste" : "bg-donation",
            )}
          >
            {busy ? t("Saving…", "Guardando…") : label}
          </button>
          {onVoid && (
            <button onClick={() => setConfirmVoid(true)} disabled={busy} className="mt-1 h-11 w-full font-semibold text-bad">
              {t("Void entry", "Anular registro")}
            </button>
          )}
        </div>
      }
    >
      {removal && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-gray-200/70 p-1" role="tablist">
          {(["ADD", "REMOVE"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={cx(
                "h-11 rounded-lg text-[16px] font-semibold",
                mode === m ? "bg-white shadow-sm" : "text-muted",
                mode === m && m === "ADD" && tone,
              )}
            >
              {m === "ADD" ? t("Add", "Agregar") : t("Remove", "Quitar")}
            </button>
          ))}
        </div>
      )}
      <p className={cx("text-center text-sm font-semibold uppercase tracking-wide", removing ? "text-ink" : tone)}>
        {product.unit === "LB" || product.unit === "OZ" ? t("Weight", "Peso") : t("Quantity", "Cantidad")}
      </p>
      <h3 className="mt-1 text-center text-xl font-bold">{product.name}</h3>

      <div className="mt-6 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={!(n > 0)}
          aria-label={t("Less", "Menos")}
          className="grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-3xl font-medium text-brand-dark active:scale-95 disabled:opacity-40"
        >
          −
        </button>
        <input
          inputMode={product.unit === "EACH" ? "numeric" : "decimal"}
          value={qty}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setQty(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
          aria-label={t(`Quantity in ${unit}`, `Cantidad en ${unit}`)}
          className="h-20 w-32 rounded-2xl border-2 border-line bg-white text-center text-4xl font-semibold outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => bump(1)}
          aria-label={t("More", "Más")}
          className="grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-3xl font-medium text-brand-dark active:scale-95"
        >
          +
        </button>
      </div>
      <p className="mt-1 text-center text-muted">{unit}</p>
      {product.unit === "EACH" && Number.isFinite(n) && !Number.isInteger(n) && (
        <p className="mt-1 text-center text-sm text-bad">{t("Whole units only", "Solo unidades enteras")}</p>
      )}

      {removing && (
        <div className="mt-5 rounded-xl bg-gray-100 p-3 text-center text-[15px]">
          {removable === null ? (
            <>{t("Amount available will be checked when saving.", "La cantidad disponible se revisará al guardar.")}</>
          ) : removable > 0 ? (
            <>
              {t("You can remove up to", "Puedes quitar hasta")}{" "}
              <b>
                {removable} {unit}
              </b>
              {removal.ownOnly ? t(" of what you logged", " de lo que registraste") : ""} {dateLabel(date, today).toLowerCase()}.
            </>
          ) : (
            <>
              {removal.ownOnly
                ? t("Nothing you logged to remove", "No hay nada tuyo para quitar")
                : t("Nothing logged to remove", "No hay nada registrado para quitar")}{" "}
              {dateLabel(date, today).toLowerCase()}.
            </>
          )}
          {dates.length > 1 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={date === d}
                  onClick={() => {
                    setDate(d);
                    setQty("0");
                  }}
                  className={cx(
                    "h-10 rounded-full border px-3 text-sm font-medium",
                    date === d ? "border-ink bg-ink text-white" : "border-line bg-white",
                  )}
                >
                  {dateLabel(d, today)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!removing && (
        <div className="-mx-5 mt-6 overflow-x-auto px-5 [scrollbar-width:none]">
          <div className="flex w-max gap-2">
            {reasons.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={reasonId === r.id}
                onClick={() => setReasonId(reasonId === r.id ? null : r.id)}
                className={cx(
                  "h-11 whitespace-nowrap rounded-full border px-4 text-[15px] font-medium",
                  reasonId === r.id ? "border-brand-dark bg-brand-dark text-white" : "border-line bg-white",
                )}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showNote ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t("Notes (optional)", "Notas (opcional)")}
          className="mt-4 w-full rounded-xl border border-line bg-field p-3 outline-none focus:border-brand"
        />
      ) : (
        <button onClick={() => setShowNote(true)} className="mt-3 flex h-11 items-center gap-2 text-[15px] font-medium text-brand-dark">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft">
            <IconPlus width={16} height={16} />
          </span>
          {t("Notes", "Notas")}
        </button>
      )}

      {/* Daypart & date: collapsed so it never slows the normal flow. */}
      {!removing && (
        <div className="mt-3 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setShowWhen((v) => !v)}
            aria-expanded={showWhen}
            className="flex h-12 w-full items-center justify-between px-4 text-left text-[15px]"
          >
            <span>
              <span className="text-muted">{t("Daypart", "Horario")}: </span>
              <b>{L.daypart[daypart]}</b>
              {!daypartManual && <span className="text-muted"> (auto)</span>}
              {date !== today && <b> · {dateLabel(date, today)}</b>}
            </span>
            <IconChevronDown className={cx("text-muted transition", showWhen && "rotate-180")} />
          </button>
          {showWhen && (
            <div className="border-t border-line px-4 pb-4 pt-3">
              <div className="grid grid-cols-2 gap-2">
                {DAYPARTS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={daypart === d}
                    onClick={() => setDaypart(d)}
                    className={cx(
                      "h-11 rounded-lg border text-[15px] font-medium",
                      daypart === d ? "border-brand-dark bg-brand-dark text-white" : "border-line bg-white",
                    )}
                  >
                    {L.daypart[d]}
                    {d === autoDaypart && <span className="ml-1 text-xs opacity-70">auto</span>}
                  </button>
                ))}
              </div>
              {dates.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {dates.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={date === d}
                      onClick={() => setDate(d)}
                      className={cx(
                        "h-10 rounded-full border px-3 text-sm font-medium",
                        date === d ? "border-brand-dark bg-brand-dark text-white" : "border-line bg-white",
                      )}
                    >
                      {dateLabel(d, today)}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted">
                {t(
                  "Use this only if the entry belongs to a different daypart or day. It will be marked as changed.",
                  "Úsalo solo si el registro corresponde a otro horario o día. Quedará marcado como cambiado.",
                )}
              </p>
            </div>
          )}
        </div>
      )}
      {!removing && outOfDaypart && (
        <p className="mt-2 text-sm text-amber-700">{t(`Not usually available at ${L.daypart[daypart]}. You can still log it.`, `No suele estar disponible en ${L.daypart[daypart]}. Igual puedes registrarlo.`)}</p>
      )}

      <ErrorText>{error}</ErrorText>

      {onVoid && (
        <ConfirmDialog
          open={confirmVoid}
          danger
          title={t("Void this entry?", "¿Anular este registro?")}
          message={t(
            "It stays in the history as voided and stops counting in totals and reports.",
            "Queda en el historial como anulado y deja de contar en totales y reportes.",
          )}
          confirmLabel={t("Void", "Anular")}
          onCancel={() => setConfirmVoid(false)}
          onConfirm={async () => {
            setConfirmVoid(false);
            setBusy(true);
            const err = await onVoid();
            setBusy(false);
            if (err) setError(err);
          }}
        />
      )}
    </BottomSheet>
  );
}
