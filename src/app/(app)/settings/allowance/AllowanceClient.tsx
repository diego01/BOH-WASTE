"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ProductType, Unit } from "@/db/schema";
import { IconClose } from "@/components/icons";
import { Badge, BottomSheet, Button, ConfirmDialog, cx, ErrorText, fieldClass, Label, MultiSelect, SearchBox, TextField } from "@/components/ui";
import { addMonths } from "@/lib/allowance";
import { labels, type Lang } from "@/lib/i18n";
import { useT } from "@/components/I18nProvider";
import { fmtMoney } from "@/lib/format";
import type { MonthAllowance } from "@/lib/allowanceData";
import { deleteAllowance, saveGroup, setIndividualAllowances, updateAllowanceAmount } from "./actions";

type P = { id: number; name: string; unit: Unit; unitCost: number; type: ProductType; areaId: number; active: boolean; category: string | null };

/** Server marks "product already in another allowance" errors with this prefix (any language). */
const CONFLICT = "[CONFLICT] ";

function monthLabel(m: string, locale: string) {
  return new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtQ(n: number) {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1);
}

/** "≈ 51.0 lb" for one product; a range for a same-unit group; null for mixed units. */
function equivalent(amount: number, products: P[], lang: Lang): string | null {
  const U = labels(lang).unitShort;
  if (!products.length || amount <= 0) return null;
  const unit = products[0].unit;
  if (!products.every((p) => p.unit === unit)) return null;
  const qs = products.filter((p) => p.unitCost > 0).map((p) => amount / p.unitCost);
  if (!qs.length) return null;
  const lo = Math.min(...qs);
  const hi = Math.max(...qs);
  return Math.abs(hi - lo) < 0.05 ? `≈ ${fmtQ(lo)} ${U[unit]}` : `≈ ${fmtQ(lo)}–${fmtQ(hi)} ${U[unit]}`;
}

function typeOf(products: P[]): "WASTE" | "DONATION" | "MIXED" {
  const t = new Set(products.map((p) => p.type));
  return t.size === 1 ? [...t][0] : "MIXED";
}

export function AllowanceClient({
  month,
  currentMonth,
  copiedFrom,
  operatingDays,
  allowances,
  products,
  areas,
}: {
  month: string;
  currentMonth: string;
  copiedFrom: string | null;
  operatingDays: number;
  allowances: MonthAllowance[];
  products: P[];
  areas: { id: number; name: string }[];
}) {
  const router = useRouter();
  const { t: tr, L, lang, locale } = useT();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [sheet, setSheet] = useState<null | { kind: "amount" } | { kind: "group"; group?: MonthAllowance }>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const assigned = new Map<number, MonthAllowance>();
  for (const a of allowances) for (const pid of a.productIds) assigned.set(pid, a);

  const term = q.trim().toLowerCase();
  const matches = (name: string) => !term || name.toLowerCase().includes(term);
  const withAllowance = allowances.filter(
    (a) => matches(a.name) || a.productIds.some((id) => matches(byId.get(id)?.name ?? "")),
  );
  const without = products.filter((p) => p.active && !assigned.has(p.id) && matches(p.name));

  const total = allowances.reduce((s, a) => s + a.monthlyAmount, 0);
  const daily = (amt: number) => (operatingDays > 0 ? amt / operatingDays : 0);

  const breakdown = (key: (p: P) => string) => {
    const out = new Map<string, number>();
    for (const a of allowances) {
      const keys = new Set(a.productIds.map((id) => byId.get(id)).filter((p): p is P => !!p).map(key));
      const k = keys.size === 1 ? [...keys][0] : tr("Mixed", "Mixto");
      out.set(k, (out.get(k) ?? 0) + a.monthlyAmount);
    }
    return [...out.entries()].sort((x, y) => y[1] - x[1]);
  };
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const byArea = breakdown((p) => areaName.get(p.areaId) ?? "—");
  const byCategory = breakdown((p) => p.category ?? tr("No category", "Sin categoría"));

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const isPast = month < currentMonth;
  const selectedIndividuals = selected.map((id) => assigned.get(id)).filter((a): a is MonthAllowance => a?.kind === "INDIVIDUAL");
  const canRemove = selected.length > 0 && selectedIndividuals.length === selected.length;

  function removeSelected() {
    start(async () => {
      for (const a of selectedIndividuals) {
        const res = await deleteAllowance(a.id);
        if (!res.ok) return setError(res.error);
      }
      setSelected([]);
    });
  }

  function saveAmount(a: MonthAllowance, value: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === a.monthlyAmount) return;
    start(async () => {
      const res = await updateAllowanceAmount(a.id, n);
      setError(res.ok ? undefined : res.error);
    });
  }

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm">
        <button onClick={() => router.push(`/settings/allowance?month=${addMonths(month, -1)}`)} className="h-11 w-11 text-2xl" aria-label={tr("Previous month", "Mes anterior")}>
          ‹
        </button>
        <span className="text-[17px] font-semibold capitalize">{monthLabel(month, locale)}</span>
        <button onClick={() => router.push(`/settings/allowance?month=${addMonths(month, 1)}`)} className="h-11 w-11 text-2xl" aria-label={tr("Next month", "Mes siguiente")}>
          ›
        </button>
      </div>

      {isPast && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{tr("Past month: changes here change that month's reports.", "Mes pasado: los cambios aquí modifican los reportes de ese mes.")}</p>
      )}
      {copiedFrom && (
        <p className="mt-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">
          {tr(
            `Started from ${monthLabel(copiedFrom, locale)}'s allowances. Adjust only what changed.`,
            `Se copió el allowance de ${monthLabel(copiedFrom, locale)}. Ajusta solo lo que cambió.`,
          )}
        </p>
      )}

      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">{tr("Month total", "Total del mes")}</span>
          <span className="text-2xl font-bold">{fmtMoney(total)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm text-muted">
          <span>{tr(`${operatingDays} operating days`, `${operatingDays} días operativos`)}</span>
          <span>{fmtMoney(daily(total))} / {tr("day", "día")}</span>
        </div>
        {allowances.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-brand-dark">{tr("By area and category", "Por área y categoría")}</summary>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              {[
                [tr("Area", "Área"), byArea],
                [tr("Category", "Categoría"), byCategory],
              ].map(([title, rows]) => (
                <div key={title as string}>
                  <div className="mb-1 font-semibold">{title as string}</div>
                  {(rows as [string, number][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="truncate">{k}</span>
                      <span>{fmtMoney(v)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <div className="mt-3">
        <SearchBox value={q} onChange={setQ} placeholder={tr("Search products or groups", "Buscar productos o grupos")} />
      </div>
      <ErrorText>{error}</ErrorText>

      <h2 className="mb-1 mt-5 px-1 text-sm font-semibold text-muted">{tr("With allowance", "Con allowance")} ({allowances.length})</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
        {withAllowance.map((a) => {
          const ps = a.productIds.map((id) => byId.get(id)).filter((p): p is P => !!p);
          const t = typeOf(ps);
          const eq = equivalent(a.monthlyAmount, ps, lang);
          const isGroup = a.kind === "GROUP";
          return (
            <li key={a.id} className="px-3 py-3">
              <div className="flex items-start gap-3">
                {!isGroup && ps[0] && (
                  <input
                    type="checkbox"
                    checked={selected.includes(ps[0].id)}
                    onChange={() => toggle(ps[0].id)}
                    className="mt-1 h-5 w-5 shrink-0"
                    aria-label={`${tr("Select", "Seleccionar")} ${a.name}`}
                  />
                )}
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => isGroup && setSheet({ kind: "group", group: a })}
                  disabled={!isGroup}
                >
                  <span className="block font-medium leading-tight">{a.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {isGroup && <Badge tone="brand">{tr("Group", "Grupo")} · {ps.length}</Badge>}
                    <Badge tone={t === "WASTE" ? "waste" : t === "DONATION" ? "donation" : "gray"}>
                      {t === "MIXED" ? tr("Mixed", "Mixto") : L.type[t]}
                    </Badge>
                    {!isGroup && ps[0] && <span className="text-xs text-muted">{L.unitShort[ps[0].unit]}</span>}
                  </span>
                  {isGroup && <span className="mt-1 block truncate text-xs text-muted">{ps.map((p) => p.name).join(", ")}</span>}
                </button>
                <div className="w-28 shrink-0">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">$</span>
                    <input
                      key={`${a.id}-${a.monthlyAmount}`}
                      defaultValue={a.monthlyAmount.toFixed(2)}
                      inputMode="decimal"
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => saveAmount(a, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      aria-label={`${tr("Monthly allowance for", "Allowance mensual de")} ${a.name}`}
                      className="h-11 w-full rounded-lg border border-line bg-field pl-6 pr-2 text-right font-semibold outline-none focus:border-brand"
                    />
                  </div>
                  <div className="mt-1 text-right text-xs text-muted">
                    {fmtMoney(daily(a.monthlyAmount))}/{tr("day", "día")}
                    {eq && <div>{eq}</div>}
                    {!eq && isGroup && <div>{tr("mixed units", "unidades mixtas")}</div>}
                  </div>
                </div>
              </div>
              {isGroup && !eq && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-xs text-muted">
                  {ps.map((p) => (
                    <span key={p.id}>
                      {p.name}: ≈ {fmtQ(a.monthlyAmount / (p.unitCost || 1))} {L.unitShort[p.unit]}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {!withAllowance.length && <li className="px-4 py-4 text-muted">{tr("No allowances this month yet.", "Aún no hay allowances este mes.")}</li>}
      </ul>

      <h2 className="mb-1 mt-5 px-1 text-sm font-semibold text-muted">{tr("No allowance", "Sin allowance")} ({without.length}) · {tr("shown as real only in reports", "en reportes solo se ve el real")}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
        {without.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-14 items-center gap-3 px-3 py-2">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="h-5 w-5" />
              <span className="flex-1">
                <span className="block text-[15px] leading-tight">{p.name}</span>
                <span className="text-xs text-muted">
                  {L.type[p.type]} · ${p.unitCost.toFixed(2)}/{L.unitShort[p.unit]}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-lg px-4">
          <div className="flex items-center gap-2 rounded-2xl bg-ink p-2 pl-4 text-white shadow-xl">
            <span className="flex-1 text-sm">{tr(`${selected.length} selected`, `${selected.length} seleccionados`)}</span>
            <button onClick={() => setSelected([])} className="grid h-10 w-10 place-items-center rounded-lg" aria-label={tr("Clear selection", "Quitar selección")}>
              <IconClose width={18} height={18} />
            </button>
            {canRemove && (
              <button onClick={removeSelected} className="h-10 rounded-lg bg-white/15 px-3 text-sm font-semibold text-red-200">
                {tr("Remove", "Quitar")}
              </button>
            )}
            <button onClick={() => setSheet({ kind: "amount" })} className="h-10 rounded-lg bg-white/15 px-3 text-sm font-semibold">
              {tr("Set amount", "Asignar monto")}
            </button>
            <button
              onClick={() => setSheet({ kind: "group" })}
              disabled={selected.length < 2}
              className="h-10 rounded-lg bg-white px-3 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {tr("Group", "Agrupar")}
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "amount" && (
        <AmountSheet
          month={month}
          products={selected.map((id) => byId.get(id)!).filter(Boolean)}
          operatingDays={operatingDays}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            setSelected([]);
          }}
        />
      )}
      {sheet?.kind === "group" && (
        <GroupSheet
          month={month}
          group={sheet.group}
          initialProductIds={sheet.group ? sheet.group.productIds : selected}
          products={products}
          assigned={assigned}
          operatingDays={operatingDays}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}

/** Runs a save; if products already belong to another allowance, asks before moving them. */
function useConflictSave() {
  const { t } = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  function run(save: (move: boolean) => Promise<{ ok: boolean; error?: string }>, onDone: () => void) {
    setError(undefined);
    start(async () => {
      const res = await save(false);
      if (res.ok) return onDone();
      if (res.error?.startsWith(CONFLICT)) {
        setConflict(res.error.slice(CONFLICT.length));
        setRetry(() => () =>
          start(async () => {
            const again = await save(true);
            if (again.ok) onDone();
            else setError(again.error);
          }),
        );
      } else setError(res.error);
    });
  }

  const dialog = (
    <ConfirmDialog
      open={!!conflict}
      title={t("Move products?", "¿Mover productos?")}
      message={
        <>
          {conflict}{" "}
          {t(
            "Move them here? They will be taken out of their current allowance for this month.",
            "¿Moverlos aquí? Saldrán de su allowance actual para este mes.",
          )}
        </>
      }
      confirmLabel={t("Move", "Mover")}
      onCancel={() => setConflict(null)}
      onConfirm={() => {
        setConflict(null);
        retry?.();
      }}
    />
  );
  return { pending, error, run, dialog };
}

function AmountField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px]">$</span>
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
        className={cx(fieldClass, "pl-8")}
        placeholder="0.00"
      />
    </div>
  );
}

function AmountSheet({
  month,
  products,
  operatingDays,
  onClose,
  onDone,
}: {
  month: string;
  products: P[];
  operatingDays: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang, locale } = useT();
  const [value, setValue] = useState("");
  const { pending, error, run, dialog } = useConflictSave();
  const n = Number(value);
  const valid = value !== "" && Number.isFinite(n) && n >= 0;

  return (
    <BottomSheet
      open
      title={t("Monthly allowance", "Allowance mensual")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button
            className="w-full"
            disabled={!valid || pending}
            onClick={() => run((move) => setIndividualAllowances({ month, productIds: products.map((p) => p.id), amount: n, moveConflicts: move }), onDone)}
          >
            {t(`Save for ${products.length} product${products.length === 1 ? "" : "s"}`, `Guardar para ${products.length} producto${products.length === 1 ? "" : "s"}`)}
          </Button>
        </div>
      }
    >
      <p className="text-[15px] text-muted">
        {t(
          `Each product gets its own allowance of this amount for ${monthLabel(month, locale)}.`,
          `Cada producto recibe su propio allowance por este monto para ${monthLabel(month, locale)}.`,
        )}
      </p>
      <Label>{t("Amount per product ($ / month)", "Monto por producto ($ / mes)")}</Label>
      <AmountField value={value} onChange={setValue} />
      {valid && operatingDays > 0 && (
        <p className="mt-2 text-sm text-muted">
          {fmtMoney(n / operatingDays)} {t("per operating day", "por día operativo")}
        </p>
      )}
      <ul className="mt-4 space-y-1 text-[15px]">
        {products.map((p) => (
          <li key={p.id} className="flex justify-between gap-2">
            <span>{p.name}</span>
            {valid && n > 0 && <span className="text-muted">{equivalent(n, [p], lang)}</span>}
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
      {dialog}
    </BottomSheet>
  );
}

function GroupSheet({
  month,
  group,
  initialProductIds,
  products,
  assigned,
  operatingDays,
  onClose,
  onDone,
}: {
  month: string;
  group?: MonthAllowance;
  initialProductIds: number[];
  products: P[];
  assigned: Map<number, MonthAllowance>;
  operatingDays: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang, locale } = useT();
  const [name, setName] = useState(group?.name ?? "");
  const [value, setValue] = useState(group ? group.monthlyAmount.toFixed(2) : "");
  const [ids, setIds] = useState<string[]>(initialProductIds.map(String));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { pending, error, run, dialog } = useConflictSave();
  const [deleting, startDelete] = useTransition();
  const n = Number(value);
  const valid = name.trim() && ids.length >= 2 && value !== "" && Number.isFinite(n) && n >= 0;
  const chosen = products.filter((p) => ids.includes(String(p.id)));
  const eq = valid ? equivalent(n, chosen, lang) : null;

  return (
    <BottomSheet
      open
      title={group ? t("Edit group", "Editar grupo") : t("New group", "Nuevo grupo")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button
            className="w-full"
            disabled={!valid || pending}
            onClick={() =>
              run(
                (move) => saveGroup({ id: group?.id, month, name, productIds: ids.map(Number), amount: n, moveConflicts: move }),
                onDone,
              )
            }
          >
            {t("Save group", "Guardar grupo")}
          </Button>
          {group && (
            <button onClick={() => setConfirmDelete(true)} disabled={deleting} className="mt-1 h-11 w-full font-semibold text-bad">
              {t("Delete group", "Eliminar grupo")}
            </button>
          )}
        </div>
      }
    >
      <Label>{t("Group name", "Nombre del grupo")}</Label>
      <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Nuggets & Strips", "p. ej. Nuggets & Strips")} />
      <Label>{t("Shared amount ($ / month)", "Monto compartido ($ / mes)")}</Label>
      <AmountField value={value} onChange={setValue} />
      {valid && (
        <p className="mt-2 text-sm text-muted">
          {operatingDays > 0 && `${fmtMoney(n / operatingDays)} ${t("per operating day", "por día operativo")}`}
          {eq ? ` · ${eq}` : ` · ${t("mixed units", "unidades mixtas")}`}
        </p>
      )}
      <Label strong>{t("Products", "Productos")}</Label>
      <MultiSelect
        placeholder={t("Select products", "Elegir productos")}
        selected={ids}
        onChange={setIds}
        options={products
          .filter((p) => p.active || ids.includes(String(p.id)))
          .map((p) => {
            const other = assigned.get(p.id);
            const note = other && other.id !== group?.id ? ` · ${t("in", "en")} ${other.name}` : "";
            return { value: String(p.id), label: `${p.name}${note}` };
          })}
      />
      <p className="mt-2 text-sm text-muted">{t("The group's real is the sum of its products (waste and donation). A product can belong to only one allowance per month.", "El real del grupo es la suma de sus productos (waste y donación). Un producto solo puede estar en un allowance por mes.")}</p>
      <ErrorText>{error}</ErrorText>
      {dialog}
      {group && (
        <ConfirmDialog
          open={confirmDelete}
          danger
          title={t("Delete group?", "¿Eliminar grupo?")}
          message={t(
            `Removes it from ${monthLabel(month, locale)} only. Other months keep their allowance.`,
            `Se quita solo de ${monthLabel(month, locale)}. Los demás meses conservan su allowance.`,
          )}
          confirmLabel={t("Delete", "Eliminar")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            startDelete(async () => {
              const res = await deleteAllowance(group.id);
              if (res.ok) onDone();
            });
          }}
        />
      )}
    </BottomSheet>
  );
}
