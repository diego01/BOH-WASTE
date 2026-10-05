"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { useT } from "@/components/I18nProvider";
import { IconChevronDown } from "@/components/icons";
import { Badge, BottomSheet, Button, cx, fieldClass, Label } from "@/components/ui";
import { addDays } from "@/lib/dayparts";
import { DAYPARTS } from "@/lib/domain";
import { fmtMoney, fmtQty } from "@/lib/format";
import { locale, makeT, shortDate, type Lang } from "@/lib/i18n";
import type { ReportParams } from "@/lib/reportData";
import type { Report } from "@/lib/reports";
import { DailyChart, Diff, HBarList, MtdBar } from "./Charts";

const pctFmt = (p: number | null) => (p === null ? "—" : `${Math.round(p)}%`);
const weekday = (d: string, lang: Lang) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(lang), { weekday: "short", timeZone: "UTC" });

function shortcuts(today: string, lang: Lang) {
  const t = makeT(lang);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  return [
    { label: t("Today", "Hoy"), from: today, to: today },
    { label: t("Yesterday", "Ayer"), from: addDays(today, -1), to: addDays(today, -1) },
    { label: t("Last 7 days", "Últimos 7 días"), from: addDays(today, -6), to: today },
    { label: t("This week", "Esta semana"), from: monday, to: today },
    { label: t("This month", "Este mes"), from: `${today.slice(0, 7)}-01`, to: today },
  ];
}

function periodLabel(p: ReportParams, lang: Lang) {
  const hit = shortcuts(p.today, lang).find((s) => s.from === p.from && s.to === p.to);
  if (hit) return hit.label;
  return p.from === p.to ? shortDate(p.from, lang) : `${shortDate(p.from, lang)} – ${shortDate(p.to, lang)}`;
}

export function ReportsClient({ report, params, areas }: { report: Report; params: ReportParams; areas: { id: number; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, L, lang } = useT();
  const [pending, start] = useTransition();
  const [dateSheet, setDateSheet] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rollup, setRollup] = useState<"none" | "area" | "category">("none");
  const [splitDayparts, setSplitDayparts] = useState(false);

  const query = (over: Partial<Record<string, string>>) => {
    const q = new URLSearchParams({
      from: params.from,
      to: params.to,
      type: params.filters.type,
      daypart: params.filters.daypart,
      ...(params.filters.areaId ? { area: String(params.filters.areaId) } : {}),
    });
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined || v === "") q.delete(k);
      else q.set(k, v);
    }
    return q;
  };
  const go = (over: Partial<Record<string, string>>) => start(() => router.push(`${pathname}?${query(over)}`));

  const filtered = params.filters.type !== "ALL" || params.filters.daypart !== "ALL";
  const exportUrl = (extra: Record<string, string>) => `/api/reports/export?${query({ ...extra, lang })}`;
  const nothing = t("Nothing logged.", "No hay registros.");

  return (
    <main className="px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="text-center text-lg font-semibold">{t("Waste Reporting", "Reportes de Waste")}</h1>

      {/* Filters: one row, above everything */}
      <div className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          <button
            onClick={() => setDateSheet(true)}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-[15px] font-semibold shadow-sm"
          >
            📅 {periodLabel(params, lang)}
          </button>
          <FilterSelect
            value={params.filters.type}
            onChange={(v) => go({ type: v })}
            options={[
              ["ALL", t("All types", "Todos los tipos")],
              ["WASTE", L.type.WASTE],
              ["DONATION", L.type.DONATION],
            ]}
          />
          <FilterSelect
            value={params.filters.daypart}
            onChange={(v) => go({ daypart: v })}
            options={[["ALL", t("All dayparts", "Todos los horarios")], ...DAYPARTS.map((d) => [d, L.daypart[d]] as [string, string])]}
          />
          {areas.length > 1 && (
            <FilterSelect
              value={params.filters.areaId ? String(params.filters.areaId) : ""}
              onChange={(v) => go({ area: v })}
              options={[["", t("All areas", "Todas las áreas")], ...areas.map((a) => [String(a.id), a.name] as [string, string])]}
            />
          )}
        </div>
      </div>
      <p className="mt-1.5 px-1 text-xs text-muted">
        {params.from === params.to ? shortDate(params.from, lang) : `${shortDate(params.from, lang)} – ${shortDate(params.to, lang)}`} ·{" "}
        {t(`${report.days} day${report.days === 1 ? "" : "s"}`, `${report.days} día${report.days === 1 ? "" : "s"}`)}
        {pending && t(" · loading…", " · cargando…")}
      </p>

      <div className={cx("transition-opacity", pending && "opacity-50")}>
        {/* Headline numbers */}
        <section className="mt-3 grid grid-cols-3 gap-2">
          <Tile label={t("Total real", "Total real")} value={fmtMoney(report.total)} />
          <Tile label={L.type.WASTE} value={fmtMoney(report.byType.WASTE)} tone="waste" dim={params.filters.type === "DONATION"} />
          <Tile label={L.type.DONATION} value={fmtMoney(report.byType.DONATION)} tone="donation" dim={params.filters.type === "WASTE"} />
        </section>

        {report.mtd && <MtdCard mtd={report.mtd} />}

        {/* Real vs allowance */}
        <Card title={t("Real vs allowance", "Real vs. allowance")}>
          {filtered && (
            <p className="mb-2 text-xs text-muted">
              {t(
                "Compared on all types and dayparts (allowance isn't split by them).",
                "Se compara con todos los tipos y horarios (el allowance no se divide por ellos).",
              )}
            </p>
          )}
          {report.comparison.length === 0 ? (
            <p className="text-sm text-muted">
              {t("No allowances in this period. Set them in Settings → Allowance.", "No hay allowances en este periodo. Defínelos en Ajustes → Allowance.")}
            </p>
          ) : (
            <>
              <div className="mb-2 flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
                {(
                  [
                    ["none", t("Products & groups", "Productos y grupos")],
                    ["area", t("By area", "Por área")],
                    ["category", t("By category", "Por categoría")],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setRollup(k)}
                    className={cx("h-9 flex-1 rounded-md font-medium", rollup === k ? "bg-white shadow-sm" : "text-muted")}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1.5 pr-2 font-medium">
                        {rollup === "none" ? t("Product / Group", "Producto / Grupo") : rollup === "area" ? t("Area", "Área") : t("Category", "Categoría")}
                      </th>
                      <th className="py-1.5 pr-2 text-right font-medium">Real</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Allow.</th>
                      <th className="py-1.5 text-right font-medium">{t("Diff. · used", "Dif. · usado")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rollup === "none"
                      ? report.comparison.map((c) => (
                          <Fragment key={c.key}>
                            <tr
                              onClick={() => setOpen(open === c.key ? null : c.key)}
                              className="cursor-pointer align-top active:bg-gray-50"
                            >
                              <td className="py-2.5 pr-2">
                                <span className="flex items-start gap-1">
                                  <IconChevronDown
                                    width={16}
                                    height={16}
                                    className={cx("mt-0.5 shrink-0 text-muted transition", open === c.key && "rotate-180")}
                                  />
                                  <span>
                                    <span className="font-medium leading-tight">{c.name}</span>
                                    {c.kind === "GROUP" && <span className="block text-xs text-muted">{c.productNames.join(", ")}</span>}
                                    {c.projection && c.projection.diff < 0 && (
                                      <span className="mt-0.5 block text-xs font-medium text-bad">
                                        ⚠ {t("Projected over by", "Proyectado a pasarse por")} {fmtMoney(-c.projection.diff)}
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </td>
                              <td className="py-2.5 pr-2 text-right tabular-nums">{fmtMoney(c.real)}</td>
                              <td className="py-2.5 pr-2 text-right tabular-nums">{fmtMoney(c.allowance)}</td>
                              <td className="py-2.5 text-right">
                                <Diff value={c.diff} />
                                <span className="block text-xs text-muted">{pctFmt(c.pctUsed)}</span>
                              </td>
                            </tr>
                            {open === c.key && (
                              <tr>
                                <td colSpan={4} className="bg-gray-50 px-2 pb-3 pt-1">
                                  <DayTable days={c.days} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))
                      : (rollup === "area" ? report.comparisonByArea : report.comparisonByCategory).map((r) => (
                          <tr key={r.name}>
                            <td className="py-2.5 pr-2 font-medium">{r.name === "Mixed" ? t("Mixed", "Mixto") : r.name}</td>
                            <td className="py-2.5 pr-2 text-right tabular-nums">{fmtMoney(r.real)}</td>
                            <td className="py-2.5 pr-2 text-right tabular-nums">{fmtMoney(r.allowance)}</td>
                            <td className="py-2.5 text-right">
                              <Diff value={r.diff} />
                              <span className="block text-xs text-muted">{pctFmt(r.pctUsed)}</span>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink/20 font-bold">
                      <td className="py-2.5 pr-2">Total</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{fmtMoney(report.comparisonTotals.real)}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{fmtMoney(report.comparisonTotals.allowance)}</td>
                      <td className="py-2.5 text-right">
                        <Diff value={report.comparisonTotals.diff} />
                        <span className="block text-xs font-normal text-muted">{pctFmt(report.comparisonTotals.pctUsed)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">
                {t("Difference = allowance − real.", "Diferencia = allowance − real.")}{" "}
                <span className="font-semibold text-good">{t("+ green", "+ verde")}</span>: {t("within allowance.", "dentro del allowance.")}{" "}
                <span className="font-semibold text-bad">{t("− red", "− rojo")}</span>: {t("over. Tap a row for day by day.", "te pasaste. Toca una fila para ver día por día.")}
              </p>
            </>
          )}
        </Card>

        {report.days > 1 && (
          <Card title={t("Daily real", "Real por día")}>
            <DailyChart days={report.daily.filter((d) => d.operating || d.real !== 0)} />
          </Card>
        )}

        <Card title={t("By daypart", "Por horario")}>
          <HBarList rows={DAYPARTS.map((d) => ({ name: L.daypart[d], value: report.byDaypart[d] }))} />
        </Card>

        <Card
          title={t("By product", "Por producto")}
          action={
            <button onClick={() => setSplitDayparts((v) => !v)} className="text-sm font-medium text-brand-dark">
              {splitDayparts ? t("Hide dayparts", "Ocultar horarios") : t("Split by daypart", "Separar por horario")}
            </button>
          }
        >
          {report.byProduct.length === 0 ? (
            <p className="text-sm text-muted">{nothing}</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className={cx("w-full text-sm", splitDayparts && "min-w-[560px]")}>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 pr-2 font-medium">{t("Product", "Producto")}</th>
                    <th className="py-1.5 pr-2 text-right font-medium">{t("Qty", "Cant.")}</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Real</th>
                    {splitDayparts &&
                      DAYPARTS.map((d) => (
                        <th key={d} className="py-1.5 pr-2 text-right font-medium">
                          {L.daypart[d].slice(0, 5)}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.byProduct.map((p) => (
                    <tr key={p.productId}>
                      <td className="py-2 pr-2">
                        <span className="leading-tight">{p.name}</span>{" "}
                        <Badge tone={p.type === "WASTE" ? "waste" : p.type === "DONATION" ? "donation" : "gray"}>
                          {p.type === "WASTE" ? "W" : p.type === "DONATION" ? "D" : t("Mix", "Mixto")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-muted">{fmtQty(Math.round(p.qty * 100) / 100, p.unit, lang)}</td>
                      <td className="py-2 pr-2 text-right font-medium tabular-nums">{fmtMoney(p.cost)}</td>
                      {splitDayparts &&
                        DAYPARTS.map((d) => (
                          <td key={d} className="py-2 pr-2 text-right tabular-nums text-muted">
                            {p.byDaypart[d].cost ? fmtMoney(p.byDaypart[d].cost) : "—"}
                            {p.byDaypart[d].qty ? (
                              <span className="block text-[11px]">{fmtQty(Math.round(p.byDaypart[d].qty * 100) / 100, p.unit, lang)}</span>
                            ) : null}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("By category", "Por categoría")}>
          <HBarList rows={report.byCategory.map((c) => ({ name: c.name === "No category" ? t("No category", "Sin categoría") : c.name, value: c.cost }))} emptyText={nothing} />
        </Card>

        {report.byArea.length > 1 && (
          <Card title={t("By area", "Por área")}>
            <HBarList rows={report.byArea.map((c) => ({ name: c.name, value: c.cost }))} />
          </Card>
        )}

        <Card title={t("By reason", "Por motivo")}>
          <HBarList rows={report.byReason.map((c) => ({ name: c.name === "No reason" ? t("No reason", "Sin motivo") : c.name, value: c.cost }))} emptyText={nothing} />
        </Card>

        <Card title={t("Export", "Exportar")}>
          <div className="grid gap-2">
            <a
              href={exportUrl({ format: "xlsx" })}
              className="flex h-12 items-center justify-center rounded-xl bg-brand-dark font-semibold text-white"
            >
              {t("Excel (all sheets)", "Excel (todas las hojas)")}
            </a>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={exportUrl({ format: "csv", table: "allowance" })}
                className="flex h-12 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold"
              >
                {t("CSV · vs allowance", "CSV · vs. allowance")}
              </a>
              <a
                href={exportUrl({ format: "csv", table: "entries" })}
                className="flex h-12 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold"
              >
                {t("CSV · entries", "CSV · registros")}
              </a>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("Uses the filters above. Includes Type and the signed Difference.", "Usa los filtros de arriba. Incluye el Tipo y la Diferencia con signo.")}
          </p>
        </Card>
      </div>

      {dateSheet && (
        <DateSheet params={params} onClose={() => setDateSheet(false)} onApply={(from, to) => (setDateSheet(false), go({ from, to }))} />
      )}
    </main>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const { t } = useT();
  return (
    <label className="relative flex h-11 items-center gap-1 rounded-xl bg-white px-3 text-[15px] font-semibold shadow-sm">
      {options.find(([v]) => v === value)?.[1]}
      <IconChevronDown width={16} height={16} className="text-muted" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0" aria-label={t("Filter", "Filtro")}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tile({ label, value, tone, dim }: { label: string; value: string; tone?: "waste" | "donation"; dim?: boolean }) {
  return (
    <div className={cx("rounded-2xl bg-white p-3 shadow-sm", dim && "opacity-50")}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {tone && <span className={cx("h-2 w-2 rounded-full", tone === "waste" ? "bg-waste" : "bg-donation")} />}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MtdCard({ mtd }: { mtd: NonNullable<Report["mtd"]> }) {
  const { t } = useT();
  const over = mtd.projectedDiff < 0;
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-[17px] font-bold">{t("Month to date", "Mes a la fecha")}</h2>
      {mtd.monthAllowance <= 0 ? (
        <p className="mt-1 text-sm text-muted">{t("No allowance set for this month.", "No hay allowance definido para este mes.")}</p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm text-muted">
              {t("Used of", "Usado de")} {fmtMoney(mtd.monthAllowance)}
            </span>
            <span className="text-xl font-bold tabular-nums">{fmtMoney(mtd.used)}</span>
          </div>
          <div className="mt-2">
            <MtdBar used={mtd.used} pace={mtd.paceAllowance} month={mtd.monthAllowance} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {t(
              `Black mark = allowance prorated to today (${mtd.opDaysElapsed} of ${mtd.opDaysTotal} operating days).`,
              `Marca negra = allowance prorrateado a hoy (${mtd.opDaysElapsed} de ${mtd.opDaysTotal} días operativos).`,
            )}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">{t("Remaining", "Restante")}</dt>
            <dd className="text-right">
              <Diff value={mtd.remaining} />
            </dd>
            <dt className="text-muted">{t("Pace (vs. allowance to today)", "Ritmo (vs. allowance a hoy)")}</dt>
            <dd className="text-right">
              <Diff value={mtd.paceDiff} />
            </dd>
            <dt className="text-muted">{t("Projected month end", "Proyección a fin de mes")}</dt>
            <dd className="text-right font-semibold tabular-nums">{fmtMoney(mtd.projection)}</dd>
          </dl>
          <p className={cx("mt-3 rounded-xl px-3 py-2 text-sm font-medium", over ? "bg-red-50 text-bad" : "bg-green-50 text-good")}>
            {over
              ? t(`⚠ At this pace you'll go over by ${fmtMoney(-mtd.projectedDiff)}.`, `⚠ A este ritmo te pasarás por ${fmtMoney(-mtd.projectedDiff)}.`)
              : t(
                  `✓ On track: ${fmtMoney(mtd.projectedDiff)} left at month end at this pace.`,
                  `✓ Vas bien: a este ritmo te sobrarán ${fmtMoney(mtd.projectedDiff)} a fin de mes.`,
                )}
          </p>
        </>
      )}
    </section>
  );
}

function DayTable({ days }: { days: Report["comparison"][number]["days"] }) {
  const { t, lang } = useT();
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted">
          <th className="py-1 font-medium">{t("Day", "Día")}</th>
          <th className="py-1 text-right font-medium">Real</th>
          <th className="py-1 text-right font-medium">Allow.</th>
          <th className="py-1 text-right font-medium">{t("Diff.", "Dif.")}</th>
          <th className="py-1 text-right font-medium">{t("Cumul.", "Acum.")}</th>
        </tr>
      </thead>
      <tbody>
        {days
          .filter((d) => d.operating || d.real !== 0)
          .map((d) => (
            <tr key={d.date} className={cx(!d.operating && "text-muted")}>
              <td className="py-1">
                {weekday(d.date, lang)} {shortDate(d.date, lang)}
                {!d.operating && t(" · closed", " · cerrado")}
              </td>
              <td className="py-1 text-right tabular-nums">{fmtMoney(d.real)}</td>
              <td className="py-1 text-right tabular-nums">{fmtMoney(d.allowance)}</td>
              <td className="py-1 text-right">
                <Diff value={d.diff} />
              </td>
              <td className="py-1 text-right">
                <Diff value={d.cumulative} />
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function DateSheet({
  params,
  onClose,
  onApply,
}: {
  params: ReportParams;
  onClose: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const { t, lang } = useT();
  const [from, setFrom] = useState(params.from);
  const [to, setTo] = useState(params.to);
  return (
    <BottomSheet
      open
      title={t("Select dates", "Elegir fechas")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button className="w-full" disabled={!from || !to || from > to} onClick={() => onApply(from, to)}>
            {t("Apply date range", "Aplicar rango")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        {shortcuts(params.today, lang).map((s) => (
          <button
            key={s.label}
            onClick={() => onApply(s.from, s.to)}
            className={cx(
              "h-11 rounded-full border px-4 text-[15px] font-medium",
              s.from === params.from && s.to === params.to ? "border-brand-dark bg-brand-dark text-white" : "border-line bg-white",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <Label>{t("From (or single day)", "Desde (o un solo día)")}</Label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value > to) setTo(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <Label>{t("To", "Hasta")}</Label>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
        </div>
      </div>
      <button onClick={() => setTo(from)} className="mt-3 h-10 text-sm font-medium text-brand-dark">
        {t("Single day", "Un solo día")} ({shortDate(from, lang)})
      </button>
    </BottomSheet>
  );
}
