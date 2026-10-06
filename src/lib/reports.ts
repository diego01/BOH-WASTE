import type { Daypart, ProductType, Unit } from "@/db/schema";
import { allowanceByDay, isOperatingDay, monthDates, monthOf, operatingDaysInMonth, type Calendar } from "./allowance";
import { addDays } from "./dayparts";
import { DAYPARTS } from "./domain";

/**
 * Report engine. Pure: the server feeds it aggregated rows and allowances, the
 * UI and the exports render its output. Full precision; round only on display.
 */

/** Sum of non-voided entries (incl. Remove corrections) grouped by day/product/daypart/type/reason. */
export type AggRow = {
  date: string;
  productId: number;
  daypart: Daypart;
  type: ProductType;
  reasonId: number | null;
  quantity: number;
  cost: number;
};

export type ProductMeta = { id: number; name: string; unit: Unit; areaId: number; areaName: string; category: string | null };

export type MonthAllowanceDef = { kind: "INDIVIDUAL" | "GROUP"; name: string; amount: number; productIds: number[] };

export type ReportFilters = {
  type: "ALL" | ProductType;
  daypart: "ALL" | Daypart;
  areaId: number | null;
};

export type ReportInput = {
  from: string;
  to: string;
  rows: AggRow[];
  products: ProductMeta[];
  reasons: { id: number; name: string }[];
  /** month "YYYY-MM" → that month's allowances */
  allowances: Map<string, MonthAllowanceDef[]>;
  calendar: Calendar;
  /** Store-local today, for month-to-date. */
  today: string;
  filters: ReportFilters;
};

export type DayLine = { date: string; operating: boolean; real: number; allowance: number; diff: number; cumulative: number };

export type ComparisonRow = {
  key: string;
  kind: "INDIVIDUAL" | "GROUP";
  name: string;
  productNames: string[];
  area: string;
  category: string;
  real: number;
  allowance: number;
  diff: number;
  /** null when there is no allowance for the period (e.g. all closed days) */
  pctUsed: number | null;
  days: DayLine[];
  /** Month-to-date mode only: projected month-end real and difference. */
  projection?: { real: number; monthAllowance: number; diff: number };
};

/**
 * Totals that never let one product's savings hide another's overage:
 * excess = sum of the negative differences only, available = sum of the
 * positive ones. net is kept as secondary information.
 */
export type Summary = {
  real: number;
  allowance: number;
  net: number;
  excess: number;
  available: number;
  overCount: number;
  count: number;
  pctUsed: number | null;
};

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (real: number, allowance: number) => (allowance > 0 ? (real / allowance) * 100 : null);
function summarize(rows: { real: number; allowance: number; diff: number }[]): Summary {
  const real = sum(rows.map((r) => r.real));
  const allowance = sum(rows.map((r) => r.allowance));
  return {
    real,
    allowance,
    net: allowance - real,
    excess: sum(rows.map((r) => Math.min(r.diff, 0))),
    available: sum(rows.map((r) => Math.max(r.diff, 0))),
    overCount: rows.filter((r) => r.diff < -0.005).length,
    count: rows.length,
    pctUsed: pct(real, allowance),
  };
}

function allowanceKey(a: MonthAllowanceDef): string {
  return a.kind === "INDIVIDUAL" ? `P${a.productIds[0]}` : `G${a.name.trim().toLowerCase()}`;
}

/** "Mixed" when the products disagree (so nothing is counted twice). */
function common(values: (string | null)[], fallback: string): string {
  const s = new Set(values.map((v) => v ?? fallback));
  return s.size === 1 ? [...s][0] : "Mixed";
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function buildReport(input: ReportInput) {
  const { from, to, filters, calendar } = input;
  const meta = new Map(input.products.map((p) => [p.id, p]));
  const inArea = (productId: number) => filters.areaId === null || meta.get(productId)?.areaId === filters.areaId;
  const dates = dateRange(from, to);

  // ---------- Real (respects type, daypart and area filters) ----------
  const scoped = input.rows.filter((r) => r.date >= from && r.date <= to && inArea(r.productId));
  const real = scoped.filter((r) => (filters.type === "ALL" || r.type === filters.type) && (filters.daypart === "ALL" || r.daypart === filters.daypart));

  const byType = { WASTE: 0, DONATION: 0 } as Record<ProductType, number>;
  for (const r of scoped.filter((r) => filters.daypart === "ALL" || r.daypart === filters.daypart)) byType[r.type] += r.cost;

  const byDaypart = Object.fromEntries(DAYPARTS.map((d) => [d, 0])) as Record<Daypart, number>;
  for (const r of scoped.filter((r) => filters.type === "ALL" || r.type === filters.type)) byDaypart[r.daypart] += r.cost;

  const productMap = new Map<number, { qty: number; cost: number; types: Set<ProductType>; byDaypart: Record<Daypart, { qty: number; cost: number }> }>();
  for (const r of real) {
    let p = productMap.get(r.productId);
    if (!p) {
      p = {
        qty: 0,
        cost: 0,
        types: new Set(),
        byDaypart: Object.fromEntries(DAYPARTS.map((d) => [d, { qty: 0, cost: 0 }])) as Record<Daypart, { qty: number; cost: number }>,
      };
      productMap.set(r.productId, p);
    }
    p.qty += r.quantity;
    p.cost += r.cost;
    p.types.add(r.type);
    p.byDaypart[r.daypart].qty += r.quantity;
    p.byDaypart[r.daypart].cost += r.cost;
  }
  const byProduct = [...productMap.entries()]
    .map(([id, p]) => {
      const m = meta.get(id);
      return {
        productId: id,
        name: m?.name ?? `#${id}`,
        unit: m?.unit ?? ("EACH" as Unit),
        area: m?.areaName ?? "—",
        category: m?.category ?? "No category",
        type: (p.types.size === 1 ? [...p.types][0] : "MIXED") as ProductType | "MIXED",
        qty: p.qty,
        cost: p.cost,
        byDaypart: p.byDaypart,
      };
    })
    .filter((p) => Math.abs(p.cost) > 1e-9 || Math.abs(p.qty) > 1e-9)
    .sort((a, b) => b.cost - a.cost);

  const groupBy = (key: (p: (typeof byProduct)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of byProduct) m.set(key(p), (m.get(key(p)) ?? 0) + p.cost);
    return [...m.entries()].map(([name, cost]) => ({ name, cost })).sort((a, b) => b.cost - a.cost);
  };

  const reasonName = new Map(input.reasons.map((r) => [r.id, r.name]));
  const reasonMap = new Map<string, number>();
  for (const r of real) {
    // Remove corrections arrive with their original entry's reason, so each reason nets out.
    const name = r.reasonId === null ? "No reason" : (reasonName.get(r.reasonId) ?? "Other");
    reasonMap.set(name, (reasonMap.get(name) ?? 0) + r.cost);
  }
  const byReason = [...reasonMap.entries()].map(([name, cost]) => ({ name, cost })).sort((a, b) => b.cost - a.cost);

  const realByDate = new Map<string, number>();
  for (const r of real) realByDate.set(r.date, (realByDate.get(r.date) ?? 0) + r.cost);

  // ---------- Real vs allowance (all types, all dayparts: allowance isn't split) ----------
  const allRealByDayProduct = new Map<string, number>();
  for (const r of scoped) {
    const k = `${r.date}|${r.productId}`;
    allRealByDayProduct.set(k, (allRealByDayProduct.get(k) ?? 0) + r.cost);
  }

  type Acc = { def: MonthAllowanceDef; days: DayLine[]; products: Set<number> };
  const acc = new Map<string, Acc>();
  const months = [...new Set(dates.map(monthOf))];
  for (const month of months) {
    for (const def of input.allowances.get(month) ?? []) {
      if (!def.productIds.some(inArea)) continue;
      const key = allowanceKey(def);
      if (!acc.has(key)) acc.set(key, { def, days: [], products: new Set() });
      const a = acc.get(key)!;
      a.def = def; // latest month's name/products win for display
      def.productIds.forEach((id) => a.products.add(id));
      const monthDays = dates.filter((d) => monthOf(d) === month);
      const allowanceDays = allowanceByDay(monthDays[0], monthDays[monthDays.length - 1], () => def.amount, calendar);
      for (const d of allowanceDays) {
        const realDay = sum(def.productIds.map((id) => allRealByDayProduct.get(`${d.date}|${id}`) ?? 0));
        a.days.push({ date: d.date, operating: d.operating, real: realDay, allowance: d.allowance, diff: 0, cumulative: 0 });
      }
    }
  }

  const monthToDate = from === `${monthOf(input.today)}-01` && to === input.today;
  const curMonth = monthOf(input.today);
  const opDaysTotal = operatingDaysInMonth(curMonth, calendar);
  const opDaysElapsed = monthDates(curMonth).filter((d) => d <= input.today && isOperatingDay(d, calendar)).length;

  const comparison: ComparisonRow[] = [...acc.entries()].map(([key, a]) => {
    let cumulative = 0;
    const days = a.days
      .sort((x, y) => x.date.localeCompare(y.date))
      .map((d) => {
        const diff = d.allowance - d.real;
        cumulative += diff;
        return { ...d, diff, cumulative };
      });
    const realSum = sum(days.map((d) => d.real));
    const allowanceSum = sum(days.map((d) => d.allowance));
    const ps = [...a.products].map((id) => meta.get(id)).filter((p): p is ProductMeta => !!p);
    const row: ComparisonRow = {
      key,
      kind: a.def.kind,
      name: a.def.name,
      productNames: ps.map((p) => p.name),
      area: common(ps.map((p) => p.areaName), "—"),
      category: common(ps.map((p) => p.category), "No category"),
      real: realSum,
      allowance: allowanceSum,
      diff: allowanceSum - realSum,
      pctUsed: pct(realSum, allowanceSum),
      days,
    };
    if (monthToDate && opDaysElapsed > 0) {
      const projectedReal = (realSum / opDaysElapsed) * opDaysTotal;
      row.projection = { real: projectedReal, monthAllowance: a.def.amount, diff: a.def.amount - projectedReal };
    }
    return row;
  });
  // Most over-allowance first.
  comparison.sort((x, y) => x.diff - y.diff);

  // "Product" view: one row per product with its own allowance (groups would mix items).
  const productComparison = comparison.filter((c) => c.kind === "INDIVIDUAL");

  // Products logged in the period that have no allowance: real only, so nothing drops out of the analysis.
  const covered = new Set<number>();
  for (const month of months) for (const def of input.allowances.get(month) ?? []) def.productIds.forEach((id) => covered.add(id));
  const noAllowance = new Map<number, { qty: number; cost: number }>();
  for (const r of scoped) {
    if (covered.has(r.productId)) continue;
    const t = noAllowance.get(r.productId) ?? { qty: 0, cost: 0 };
    noAllowance.set(r.productId, { qty: t.qty + r.quantity, cost: t.cost + r.cost });
  }
  const withoutAllowance = [...noAllowance.entries()]
    .map(([id, t]) => {
      const m = meta.get(id);
      return { productId: id, name: m?.name ?? `#${id}`, unit: m?.unit ?? ("EACH" as Unit), area: m?.areaName ?? "—", qty: t.qty, cost: t.cost };
    })
    .filter((p) => Math.abs(p.cost) > 1e-9 || Math.abs(p.qty) > 1e-9)
    .sort((a, b) => b.cost - a.cost);

  // "Area" view: everything logged in the area, plus excess/available of its allowances (never netted).
  const areaNames = new Set<string>([...comparison.map((c) => c.area), ...scoped.map((r) => meta.get(r.productId)?.areaName ?? "—")]);
  const areaComparison = [...areaNames]
    .map((name) => {
      const rows = comparison.filter((c) => c.area === name);
      const realAll = sum(scoped.filter((r) => (meta.get(r.productId)?.areaName ?? "—") === name).map((r) => r.cost));
      const noAllowanceReal = sum(withoutAllowance.filter((p) => p.area === name).map((p) => p.cost));
      return { name, realAll, noAllowanceReal, ...summarize(rows) };
    })
    .sort((a, b) => a.excess - b.excess);

  // Daily series for the chart: real (filtered) and the total allowance of the day.
  const allowanceByDate = new Map<string, number>();
  for (const r of comparison) for (const d of r.days) allowanceByDate.set(d.date, (allowanceByDate.get(d.date) ?? 0) + d.allowance);
  const daily = dates.map((d) => ({ date: d, real: realByDate.get(d) ?? 0, allowance: allowanceByDate.get(d) ?? 0, operating: isOperatingDay(d, calendar) }));

  // ---------- Month to date ----------
  let mtd: null | {
    monthAllowance: number;
    used: number;
    remaining: number;
    paceAllowance: number;
    paceDiff: number;
    projection: number;
    projectedDiff: number;
    opDaysElapsed: number;
    opDaysTotal: number;
  } = null;
  if (monthToDate) {
    const monthAllowance = sum((input.allowances.get(curMonth) ?? []).filter((d) => d.productIds.some(inArea)).map((d) => d.amount));
    const used = sum(comparison.map((r) => r.real));
    const paceAllowance = sum(comparison.map((r) => r.allowance));
    const projection = opDaysElapsed > 0 ? (used / opDaysElapsed) * opDaysTotal : 0;
    mtd = {
      monthAllowance,
      used,
      remaining: monthAllowance - used,
      paceAllowance,
      paceDiff: paceAllowance - used,
      projection,
      projectedDiff: monthAllowance - projection,
      opDaysElapsed,
      opDaysTotal,
    };
  }

  return {
    from,
    to,
    days: dates.length,
    total: sum(real.map((r) => r.cost)),
    byType,
    byDaypart,
    byProduct,
    byCategory: groupBy((p) => p.category),
    byArea: groupBy((p) => p.area),
    byReason,
    daily,
    comparison,
    productComparison,
    productTotals: summarize(productComparison),
    withoutAllowance,
    withoutAllowanceTotal: sum(withoutAllowance.map((p) => p.cost)),
    areaComparison,
    mtd,
  };
}

export type Report = ReturnType<typeof buildReport>;
