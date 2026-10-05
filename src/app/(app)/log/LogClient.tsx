"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ProductType, Role } from "@/db/schema";
import { EntrySheet, type EntryValues, type RemoveValues } from "@/components/EntrySheet";
import { IconChevronDown, IconDonate, IconSearch, IconTrash } from "@/components/icons";
import { useSync } from "@/components/SyncProvider";
import { useT } from "@/components/I18nProvider";
import { cx, Toggle } from "@/components/ui";
import { assignDaypart, boardDaypart, localParts, windowLabel } from "@/lib/dayparts";
import { allocateRemoval, removableEntries, removableTotal, type OptimisticRow } from "@/lib/entries/removal";
import { fmtMoney, fmtQty, uuid } from "@/lib/format";
import type { LogData, LogProduct } from "@/lib/logData";
import { logout } from "../../login/actions";

type TypeFilter = "ALL" | ProductType;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function LogClient({
  data,
  token,
  me,
  maxBackdate,
  maxRemoveBack,
}: {
  data: LogData;
  token: string;
  me: { id: string; role: Role };
  maxBackdate: number;
  maxRemoveBack: number;
}) {
  const router = useRouter();
  const { pending, recent, rejected, online, add, dismissRejected } = useSync();
  // `tr` (not `t`): this file already uses `t` for loop variables.
  const { t: tr, L, lang, msg } = useT();
  const now = useNow();
  const { businessDate: today, daypart: currentDaypart } = assignDaypart(now, data.config);
  // Header/cards follow the "whiteboard" daypart: the one that just ended stays up for the grace period.
  const board = boardDaypart(now, data.config, data.boardGraceMinutes);

  // Midnight rollover: reload the day's totals.
  useEffect(() => {
    if (today !== data.today) router.refresh();
  }, [today, data.today, router]);

  const [areaId, setAreaId] = useState(data.areas[0]?.id);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<LogProduct | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const area = data.areas.find((a) => a.id === areaId) ?? data.areas[0];

  // Today's ledger: server rows + what's still on the device (or just synced, until the refresh lands).
  const ledger = useMemo<OptimisticRow[]>(() => {
    const serverIds = new Set(data.entries.map((e) => e.id));
    const local = [...pending, ...recent].filter((q) => !serverIds.has(q.payload.id)).flatMap((q) => q.rows ?? []);
    const seen = new Set<string>();
    return [...data.entries, ...local].filter((r) => {
      if (r.businessDate !== data.today || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [data.entries, data.today, pending, recent]);

  const totals = useMemo(() => {
    const byProduct = new Map<number, { qty: number; cost: number }>();
    const byArea = new Map<string, number>();
    for (const r of ledger) {
      byArea.set(`${r.areaId}:${r.daypart}`, (byArea.get(`${r.areaId}:${r.daypart}`) ?? 0) + r.totalCost);
      if (r.daypart !== board) continue;
      const p = byProduct.get(r.productId) ?? { qty: 0, cost: 0 };
      byProduct.set(r.productId, { qty: p.qty + r.quantity, cost: p.cost + r.totalCost });
    }
    return { byProduct, areaDaypart: (areaId: number, d: string) => byArea.get(`${areaId}:${d}`) ?? 0 };
  }, [ledger, board]);

  const inArea = data.products.filter((p) => p.areaId === area?.id);
  const term = q.trim().toLowerCase();
  const matchesBase = (p: LogProduct) =>
    (!term || p.name.toLowerCase().includes(term)) &&
    (categoryId === null || p.categoryIds.includes(categoryId)) &&
    (typeFilter === "ALL" || p.type === typeFilter);
  const visible = inArea.filter((p) => matchesBase(p) && (showAll || p.availableDayparts.includes(currentDaypart)));
  const hiddenByDaypart = showAll ? 0 : inArea.filter((p) => matchesBase(p) && !p.availableDayparts.includes(currentDaypart)).length;

  const usedCategories = data.categories.filter((c) => inArea.some((p) => p.categoryIds.includes(c.id)));
  const weekday = localParts(now, data.config.timezone).weekday;
  const dpWindow = data.config.dayparts.find((d) => d.key === currentDaypart);
  const myPending = pending.length;

  async function submit(product: LogProduct, v: EntryValues) {
    const occurredAt = new Date();
    const id = uuid();
    await add({
      payload: {
        id,
        kind: "ADD",
        token,
        productId: product.id,
        quantity: v.quantity,
        reasonId: v.reasonId,
        note: v.note,
        occurredAt: occurredAt.toISOString(),
        daypart: v.daypart,
        daypartManual: v.daypartManual,
        businessDate: v.businessDate,
        dateManual: v.dateManual,
      },
      rows: [
        {
          id,
          userId: me.id,
          productId: product.id,
          areaId: product.areaId,
          businessDate: v.businessDate,
          daypart: v.daypart,
          type: product.type,
          unitCost: product.unitCost,
          quantity: v.quantity,
          totalCost: v.quantity * product.unitCost,
          occurredAt: occurredAt.toISOString(),
          correctsEntryId: null,
        },
      ],
      queuedAt: occurredAt.getTime(),
    });
    setSheet(null);
    setToast(tr(`${fmtQty(v.quantity, product.unit, lang)} ${product.name} · ${product.type === "WASTE" ? "waste" : "donation"} added`, `${fmtQty(v.quantity, product.unit, lang)} ${product.name} · ${product.type === "WASTE" ? "waste" : "donación"} agregado`));
  }

  const candidatesFor = (product: LogProduct) => removableEntries(ledger, me, product.id, data.today);

  async function remove(product: LogProduct, v: RemoveValues): Promise<string | void> {
    const occurredAt = new Date();
    const id = uuid();
    // Preview the split on the device so totals update now; the server redoes it authoritatively.
    let rows: OptimisticRow[] = [];
    if (v.businessDate === data.today) {
      const parts = allocateRemoval(candidatesFor(product), v.quantity);
      if (!parts) return tr("Not enough logged to remove that much", "No hay suficiente registrado para quitar esa cantidad");
      rows = parts.map((p, i) => ({
        id: i === 0 ? id : uuid(),
        userId: me.id,
        productId: product.id,
        areaId: product.areaId,
        businessDate: v.businessDate,
        daypart: p.daypart,
        type: p.type,
        unitCost: p.unitCost,
        quantity: -p.quantity,
        totalCost: -p.quantity * p.unitCost,
        occurredAt: occurredAt.toISOString(),
        correctsEntryId: p.entryId,
      }));
    }
    await add({
      payload: {
        id,
        kind: "REMOVE",
        token,
        productId: product.id,
        quantity: v.quantity,
        reasonId: null,
        note: v.note,
        occurredAt: occurredAt.toISOString(),
        daypart: currentDaypart,
        daypartManual: false,
        businessDate: v.businessDate,
        dateManual: v.dateManual,
      },
      rows,
      queuedAt: occurredAt.getTime(),
    });
    setSheet(null);
    setToast(tr(`Removed ${fmtQty(v.quantity, product.unit, lang)} ${product.name}`, `Se quitó ${fmtQty(v.quantity, product.unit, lang)} ${product.name}`));
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!area) {
    return <p className="m-4 rounded-2xl bg-white p-5 text-center text-muted">{tr("No active areas. An Admin can add one in Settings.", "No hay áreas activas. Un Admin puede crear una en Ajustes.")}</p>;
  }

  return (
    <main className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="relative flex h-10 items-center justify-center">
        <h1 className="text-lg font-semibold">Waste</h1>
      </div>

      {/* Area bar with the day's total. Dropdown appears only when there are several areas. */}
      <div style={{ background: area.color }} className="relative mt-2 flex h-14 items-center justify-between rounded-2xl px-4 text-white">
        {data.areas.length > 1 ? (
          <label className="relative flex items-center gap-1 text-xl font-bold">
            {area.name}
            <IconChevronDown width={20} height={20} />
            <select
              value={area.id}
              onChange={(e) => {
                setAreaId(Number(e.target.value));
                setCategoryId(null);
              }}
              className="absolute inset-0 opacity-0"
              aria-label={tr("Area", "Área")}
            >
              {data.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-xl font-bold">{area.name}</span>
        )}
        <span className="text-right leading-tight">
          <span className="block text-xs font-medium opacity-90">{L.daypart[board]}</span>
          <span className="font-semibold">Total: {fmtMoney(totals.areaDaypart(area.id, board))}</span>
        </span>
      </div>
      {board !== currentDaypart && (
        <p className="mt-1 px-1 text-sm text-muted">
          {tr("Now logging", "Registrando ahora")}: <b>{L.daypart[currentDaypart]}</b> · {fmtMoney(totals.areaDaypart(area.id, currentDaypart))}
        </p>
      )}

      {/* Sync status */}
      {(myPending > 0 || !online) && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className={cx("h-2 w-2 rounded-full", online ? "bg-amber-500" : "bg-gray-400")} />
          {online
            ? tr(`Syncing ${myPending} entr${myPending === 1 ? "y" : "ies"}…`, `Sincronizando ${myPending} registro${myPending === 1 ? "" : "s"}…`)
            : tr(
                `Offline · ${myPending} saved on this phone, will sync automatically`,
                `Sin conexión · ${myPending} guardado${myPending === 1 ? "" : "s"} en este teléfono, se sincroniza${myPending === 1 ? "" : "n"} solo${myPending === 1 ? "" : "s"}`,
              )}
        </div>
      )}
      {rejected.length > 0 && (
        <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-bad">
          {tr(
            `${rejected.length} entr${rejected.length === 1 ? "y was" : "ies were"} not saved`,
            `${rejected.length} registro${rejected.length === 1 ? " no se guardó" : "s no se guardaron"}`,
          )}
          : {msg(rejected[0].error)}.{" "}
          <button onClick={dismissRejected} className="font-semibold underline">
            OK
          </button>
        </div>
      )}

      {/* Current daypart + show all */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
        <div className="leading-tight">
          <div className="text-[15px]">
            {tr("Now", "Ahora")}: <b>{L.daypart[currentDaypart]}</b>
          </div>
          {dpWindow && <div className="text-xs text-muted">{windowLabel(dpWindow, data.config, weekday)}</div>}
        </div>
        <label className="flex items-center gap-2 text-[15px] font-medium">
          {tr("Show all", "Ver todos")}
          <Toggle checked={showAll} onChange={setShowAll} label={tr("Show products from all dayparts", "Ver productos de todos los horarios")} />
        </label>
      </div>

      {/* Search + filters */}
      <div className="relative mt-3">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={20} height={20} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("Search products", "Buscar productos")}
          className="h-12 w-full rounded-xl border border-line bg-white pl-10 pr-3 outline-none focus:border-brand"
        />
      </div>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {[{ id: null as number | null, name: `${tr("All", "Todos")} (${inArea.length})` }, ...usedCategories].map((c) => (
            <button
              key={c.id ?? "all"}
              onClick={() => setCategoryId(c.id)}
              aria-pressed={categoryId === c.id}
              className={cx(
                "h-10 whitespace-nowrap rounded-full px-4 text-[15px] font-medium",
                categoryId === c.id ? "bg-ink text-white" : "bg-white text-ink shadow-sm",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-gray-200/70 p-1">
        {(["ALL", "WASTE", "DONATION"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            aria-pressed={typeFilter === t}
            className={cx(
              "h-9 rounded-lg text-sm font-semibold",
              typeFilter === t ? "bg-white shadow-sm" : "text-muted",
              typeFilter === t && t === "WASTE" && "text-waste",
              typeFilter === t && t === "DONATION" && "text-donation",
            )}
          >
            {t === "ALL" ? tr("All", "Todos") : L.type[t]}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {visible.map((p) => {
          const t = totals.byProduct.get(p.id);
          const isWaste = p.type === "WASTE";
          const Icon = isWaste ? IconTrash : IconDonate;
          return (
            <div key={p.id} className="flex flex-col rounded-2xl bg-white p-3 shadow-sm">
              <div className="line-clamp-2 min-h-[2.6rem] text-center text-[15px] font-semibold leading-tight">{p.name}</div>
              <button
                onClick={() => setSheet(p)}
                aria-label={`${isWaste ? tr("Add waste", "Agregar waste") : tr("Add donation", "Agregar donación")}: ${p.name}`}
                className={cx(
                  "mt-2 flex h-14 items-center justify-center gap-2 rounded-xl text-lg font-semibold active:scale-95",
                  isWaste ? "bg-waste-soft text-waste" : "bg-donation-soft text-donation",
                )}
              >
                +1 <Icon width={22} height={22} />
              </button>
              <div className="mt-1.5 text-center text-xs text-muted">{tr(`${t ? fmtQty(t.qty, p.unit, lang) : 0} tracked`, `${t ? fmtQty(t.qty, p.unit, lang) : 0} registrado`)}</div>
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm">
                <span className="text-muted">Total:</span>
                <span className="font-medium">{fmtMoney(t?.cost ?? 0)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {!visible.length && <p className="mt-6 text-center text-muted">{tr("No products match.", "Ningún producto coincide.")}</p>}
      {hiddenByDaypart > 0 && (
        <button onClick={() => setShowAll(true)} className="mt-4 h-12 w-full rounded-xl bg-white text-[15px] font-medium text-brand-dark shadow-sm">
          {tr(`${hiddenByDaypart} more from other dayparts · Show all`, `${hiddenByDaypart} más de otros horarios · Ver todos`)}
        </button>
      )}

      {sheet && (
        <EntrySheet
          key={sheet.id}
          product={sheet}
          reasons={data.reasons}
          autoDaypart={currentDaypart}
          today={today}
          maxBackdate={maxBackdate}
          onSubmit={(v) => submit(sheet, v)}
          removal={{
            available: (date) => (date === data.today ? removableTotal(candidatesFor(sheet)) : null),
            ownOnly: me.role === "TEAM_MEMBER",
            maxBackDays: maxRemoveBack,
            onRemove: (v) => remove(sheet, v),
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl animate-fade-in">
          <span className="text-[15px]">{toast}</span>
          <form action={logout}>
            <button className="whitespace-nowrap rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold">{tr("Sign out", "Cerrar sesión")}</button>
          </form>
        </div>
      )}
    </main>
  );
}
