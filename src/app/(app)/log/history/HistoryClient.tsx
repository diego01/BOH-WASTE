"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Daypart, ProductType, Role, Unit } from "@/db/schema";
import { EntrySheet } from "@/components/EntrySheet";
import { IconChevronLeft } from "@/components/icons";
import { Badge, ConfirmDialog, cx, ErrorText } from "@/components/ui";
import { addDays } from "@/lib/dayparts";
import { DAYPARTS } from "@/lib/domain";
import { dayLabel as dayLabelOf } from "@/lib/i18n";
import { useT } from "@/components/I18nProvider";
import { canModifyEntry } from "@/lib/entries/rules";
import { fmtMoney, fmtQty } from "@/lib/format";
import { editEntry, voidEntry } from "../actions";

type Entry = {
  id: string;
  productName: string;
  availableDayparts: Daypart[];
  type: ProductType;
  unit: Unit;
  quantity: number;
  totalCost: number;
  reasonId: number | null;
  reason: string | null;
  note: string | null;
  daypart: Daypart;
  autoDaypart: Daypart;
  daypartManual: boolean;
  businessDate: string;
  dateManual: boolean;
  occurredAt: string;
  createdAt: string;
  editedAt: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  userId: string;
  userName: string;
  correctsEntryId: string | null;
};

export function HistoryClient({
  user,
  date,
  today,
  minDate,
  timezone,
  maxBackdate,
  reasons,
  entries,
}: {
  user: { id: string; role: Role };
  date: string;
  today: string;
  minDate: string;
  timezone: string;
  maxBackdate: number;
  reasons: { id: number; name: string }[];
  entries: Entry[];
}) {
  const router = useRouter();
  const { t: tr, L, lang, locale } = useT();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [undoing, setUndoing] = useState<Entry | null>(null);
  const [undoError, setUndoError] = useState<string>();
  const live = entries.filter((e) => !e.voidedAt);
  const total = (t?: ProductType) => live.filter((e) => !t || e.type === t).reduce((s, e) => s + e.totalCost, 0);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone });
  const dayLabel = dayLabelOf(date, today, lang);

  const go = (d: string) => router.push(`/log/history?date=${d}`);

  return (
    <main className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="relative flex h-10 items-center justify-center">
        <Link href="/log" className="absolute left-0 flex h-10 items-center pr-2 text-brand-dark" aria-label={tr("Back to logging", "Volver a registrar")}>
          <IconChevronLeft />
        </Link>
        <h1 className="text-lg font-semibold">{tr("History", "Historial")}</h1>
      </div>

      <div className="mt-2 flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm">
        <button
          onClick={() => go(addDays(date, -1))}
          disabled={date <= minDate}
          className="h-11 w-11 rounded-xl text-2xl disabled:opacity-30"
          aria-label={tr("Previous day", "Día anterior")}
        >
          ‹
        </button>
        <span className="text-[17px] font-semibold">{dayLabel}</span>
        <button onClick={() => go(addDays(date, 1))} disabled={date >= today} className="h-11 w-11 rounded-xl text-2xl disabled:opacity-30" aria-label={tr("Next day", "Día siguiente")}>
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <div className="text-xs text-muted">Total</div>
          <div className="font-bold">{fmtMoney(total())}</div>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <div className="text-xs text-waste">{L.type.WASTE}</div>
          <div className="font-bold">{fmtMoney(total("WASTE"))}</div>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <div className="text-xs text-donation">{L.type.DONATION}</div>
          <div className="font-bold">{fmtMoney(total("DONATION"))}</div>
        </div>
      </div>

      {DAYPARTS.map((dp) => {
        const list = entries.filter((e) => e.daypart === dp);
        if (!list.length) return null;
        return (
          <section key={dp} className="mt-4">
            <h2 className="mb-1 flex justify-between px-1 text-sm font-semibold text-muted">
              <span>{L.daypart[dp]}</span>
              <span>{fmtMoney(list.filter((e) => !e.voidedAt).reduce((s, e) => s + e.totalCost, 0))}</span>
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
              {list.map((e) => {
                const editable = canModifyEntry(user, e);
                return (
                  <li key={e.id}>
                    <button
                      disabled={!editable}
                      onClick={() => (e.correctsEntryId ? setUndoing(e) : setEditing(e))}
                      className={cx("flex w-full items-start justify-between gap-2 px-4 py-3 text-left", editable && "active:bg-gray-50")}
                    >
                      <span className={cx(e.voidedAt && "opacity-50")}>
                        <span className={cx("block text-[15px] font-medium", e.voidedAt && "line-through")}>{e.productName}</span>
                        <span className="block text-xs text-muted">
                          {time(e.occurredAt)} · <span className="capitalize">{e.userName}</span>
                          {e.reason && ` · ${e.reason}`}
                        </span>
                        {e.note && <span className="block text-xs italic text-muted">“{e.note}”</span>}
                        <span className="mt-1 flex flex-wrap gap-1">
                          {e.correctsEntryId ? (
                            <Badge>{tr("Removed", "Quitado")}</Badge>
                          ) : (
                            <Badge tone={e.type === "WASTE" ? "waste" : "donation"}>{L.type[e.type]}</Badge>
                          )}
                          {e.daypartManual && <Badge tone="warn">{tr("Daypart changed", "Horario cambiado")}</Badge>}
                          {e.dateManual && <Badge tone="warn">{tr("Date changed", "Fecha cambiada")}</Badge>}
                          {e.editedAt && <Badge>{tr("Edited", "Editado")}</Badge>}
                          {e.voidedAt && <Badge>{tr("Voided", "Anulado")}{e.voidedBy ? ` ${tr("by", "por")} ${e.voidedBy}` : ""}</Badge>}
                        </span>
                      </span>
                      <span className={cx("shrink-0 text-right", e.voidedAt && "opacity-50")}>
                        <span className="block font-semibold">{fmtMoney(e.totalCost)}</span>
                        <span className="block text-xs text-muted">{fmtQty(e.quantity, e.unit, lang)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!entries.length && <p className="mt-8 text-center text-muted">{tr("Nothing logged.", "No hay registros.")}</p>}

      <ErrorText>{undoError}</ErrorText>
      <ConfirmDialog
        open={!!undoing}
        title={tr("Undo this removal?", "¿Deshacer lo quitado?")}
        message={
          undoing
            ? tr(
                `${fmtQty(-undoing.quantity, undoing.unit, lang)} of ${undoing.productName} will count again.`,
                `${fmtQty(-undoing.quantity, undoing.unit, lang)} de ${undoing.productName} volverá a contar.`,
              )
            : ""
        }
        confirmLabel={tr("Undo removal", "Deshacer")}
        onCancel={() => setUndoing(null)}
        onConfirm={async () => {
          const target = undoing!;
          setUndoing(null);
          const res = await voidEntry(target.id);
          setUndoError(res.ok ? undefined : res.error);
        }}
      />

      {editing && (
        <EntrySheet
          key={editing.id}
          product={{ name: editing.productName, unit: editing.unit, type: editing.type, availableDayparts: editing.availableDayparts }}
          reasons={reasons}
          autoDaypart={editing.autoDaypart}
          today={today}
          maxBackdate={maxBackdate}
          initial={{
            quantity: editing.quantity,
            reasonId: editing.reasonId,
            note: editing.note,
            daypart: editing.daypart,
            daypartManual: editing.daypartManual,
            businessDate: editing.businessDate,
            dateManual: editing.dateManual,
          }}
          onSubmit={async (v) => {
            const res = await editEntry(editing.id, v);
            if (!res.ok) return res.error;
            setEditing(null);
          }}
          onVoid={async () => {
            const res = await voidEntry(editing.id);
            if (!res.ok) return res.error;
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
