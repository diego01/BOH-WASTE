import ExcelJS from "exceljs";
import { DAYPARTS } from "./domain";
import { labels, locale, makeT, type Lang } from "./i18n";
import type { Report } from "./reports";
import type { loadEntriesForExport } from "./reportData";

type Entries = Awaited<ReturnType<typeof loadEntriesForExport>>;
type Cell = string | number | null;

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Text with explicit sign for CSV: "+4.44" / "-5.56". */
const signed = (n: number) => {
  const v = r2(n);
  return v < 0 ? v.toFixed(2) : `+${v.toFixed(2)}`;
};
const typeLabel = (ty: string, lang: Lang) => (ty === "WASTE" || ty === "DONATION" ? labels(lang).type[ty] : makeT(lang)("Mixed", "Mixto"));
/** Columns whose numbers are signed differences (header text in either language). */
const isSignedHeader = (h: string) => /^(Difference|Cumulative|Diferencia)/.test(h);

export function comparisonTable(report: Report, lang: Lang = "en"): { header: string[]; rows: Cell[][] } {
  const t = makeT(lang);
  return {
    header: [
      t("Product / Group", "Producto / Grupo"),
      t("Kind", "Clase"),
      t("Products", "Productos"),
      t("Area", "Área"),
      t("Category", "Categoría"),
      "Real ($)",
      "Allowance ($)",
      t("Difference ($)", "Diferencia ($)"),
      t("% used", "% usado"),
    ],
    rows: [
      ...report.comparison.map((c) => [
        c.name,
        c.kind === "GROUP" ? t("Group", "Grupo") : t("Product", "Producto"),
        c.productNames.join("; "),
        c.area,
        c.category,
        r2(c.real),
        r2(c.allowance),
        c.diff,
        c.pctUsed === null ? null : Math.round(c.pctUsed * 10) / 10,
      ]),
      [
        "TOTAL",
        "",
        "",
        "",
        "",
        r2(report.comparisonTotals.real),
        r2(report.comparisonTotals.allowance),
        report.comparisonTotals.diff,
        report.comparisonTotals.pctUsed === null ? null : Math.round(report.comparisonTotals.pctUsed * 10) / 10,
      ],
    ],
  };
}

export function dailyTable(report: Report, lang: Lang = "en"): { header: string[]; rows: Cell[][] } {
  const t = makeT(lang);
  return {
    header: [
      t("Product / Group", "Producto / Grupo"),
      t("Date", "Fecha"),
      t("Operating day", "Día operativo"),
      "Real ($)",
      t("Daily allowance ($)", "Allowance diario ($)"),
      t("Difference ($)", "Diferencia ($)"),
      t("Cumulative difference ($)", "Diferencia acumulada ($)"),
    ],
    rows: report.comparison.flatMap((c) =>
      c.days.map((d) => [c.name, d.date, d.operating ? t("Yes", "Sí") : "No", r2(d.real), r2(d.allowance), d.diff, d.cumulative]),
    ),
  };
}

export function productsTable(report: Report, lang: Lang = "en"): { header: string[]; rows: Cell[][] } {
  const t = makeT(lang);
  const L = labels(lang);
  return {
    header: [
      t("Product", "Producto"),
      t("Type", "Tipo"),
      t("Area", "Área"),
      t("Category", "Categoría"),
      t("Unit", "Unidad"),
      t("Quantity", "Cantidad"),
      "Real ($)",
      ...DAYPARTS.map((d) => `${L.daypart[d]} ($)`),
    ],
    rows: report.byProduct.map((p) => [
      p.name,
      typeLabel(p.type, lang),
      p.area,
      p.category,
      L.unitShort[p.unit],
      Math.round(p.qty * 1000) / 1000,
      r2(p.cost),
      ...DAYPARTS.map((d) => r2(p.byDaypart[d].cost)),
    ]),
  };
}

export function entriesTable(entries: Entries, timezone: string, lang: Lang = "en"): { header: string[]; rows: Cell[][] } {
  const t = makeT(lang);
  const L = labels(lang);
  const time = (d: Date) => d.toLocaleString(locale(lang), { timeZone: timezone, hour12: false });
  const yes = t("Yes", "Sí");
  return {
    header: [
      t("Date", "Fecha"),
      t("Logged at", "Registrado"),
      t("Daypart", "Horario"),
      t("Daypart changed", "Horario cambiado"),
      t("Date changed", "Fecha cambiada"),
      t("Product", "Producto"),
      t("Code", "Código"),
      t("Area", "Área"),
      t("Type", "Tipo"),
      t("Unit", "Unidad"),
      t("Quantity", "Cantidad"),
      t("Unit cost ($)", "Costo unitario ($)"),
      "Total ($)",
      t("Reason", "Motivo"),
      t("Note", "Nota"),
      t("User", "Usuario"),
      t("Correction", "Corrección"),
    ],
    rows: entries.map((e) => [
      e.date,
      time(e.occurredAt),
      L.daypart[e.daypart],
      e.daypartManual ? yes : "",
      e.dateManual ? yes : "",
      e.product,
      e.code ?? "",
      e.area,
      L.type[e.type],
      L.unitShort[e.unit],
      Number(e.quantity),
      Number(e.unitCost),
      r2(Number(e.totalCost)),
      e.reason ?? "",
      e.note ?? "",
      e.user,
      e.correction ? t("Removed", "Quitado") : "",
    ]),
  };
}

function csvCell(v: Cell, header: string): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (isSignedHeader(header) ? signed(v) : String(v)) : v;
  // Neutralize spreadsheet formula injection from free text (notes, names).
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: { header: string[]; rows: Cell[][] }): string {
  const lines = [t.header.map((h) => csvCell(h, "")).join(","), ...t.rows.map((r) => r.map((v, i) => csvCell(v, t.header[i])).join(","))];
  return "﻿" + lines.join("\r\n"); // BOM so Excel opens UTF-8 correctly
}

export async function toXlsx(report: Report, entries: Entries, timezone: string, title: string, lang: Lang = "en"): Promise<Buffer> {
  const t = makeT(lang);
  const L = labels(lang);
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOH Waste";
  const money = '"$"#,##0.00';
  const signedMoney = '+"$"#,##0.00;[Red]-"$"#,##0.00;+"$"0.00';

  const sheet = (name: string, t: { header: string[]; rows: Cell[][] }) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(t.header).font = { bold: true };
    for (const r of t.rows) ws.addRow(r);
    t.header.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(40, Math.max(10, h.length + 2));
      if (isSignedHeader(h)) {
        col.numFmt = signedMoney;
        col.eachCell((c, rowNo) => {
          if (rowNo > 1 && typeof c.value === "number") c.font = { color: { argb: c.value < -0.004 ? "FFD32F2F" : "FF2E7D32" }, bold: true };
        });
      } else if (h.endsWith("($)")) col.numFmt = money;
    });
    return ws;
  };

  const summary = wb.addWorksheet(t("Summary", "Resumen"));
  summary.addRow([title]).font = { bold: true, size: 14 };
  summary.addRow([]);
  const add = (label: string, value: number | string, fmt?: string) => {
    const row = summary.addRow([label, value]);
    if (fmt) row.getCell(2).numFmt = fmt;
  };
  add("Total real", r2(report.total), money);
  add(L.type.WASTE, r2(report.byType.WASTE), money);
  add(L.type.DONATION, r2(report.byType.DONATION), money);
  for (const d of DAYPARTS) add(L.daypart[d], r2(report.byDaypart[d]), money);
  add(t("Allowance for period", "Allowance del periodo"), r2(report.comparisonTotals.allowance), money);
  add(t("Real of products with allowance", "Real de productos con allowance"), r2(report.comparisonTotals.real), money);
  add(t("Difference (allowance − real)", "Diferencia (allowance − real)"), report.comparisonTotals.diff, signedMoney);
  if (report.mtd) {
    summary.addRow([]);
    add(t("Month allowance", "Allowance del mes"), r2(report.mtd.monthAllowance), money);
    add(t("Used month to date", "Usado en el mes"), r2(report.mtd.used), money);
    add(t("Remaining", "Restante"), report.mtd.remaining, signedMoney);
    add(t("Projected month end", "Proyección a fin de mes"), r2(report.mtd.projection), money);
    add(t("Projected difference", "Diferencia proyectada"), report.mtd.projectedDiff, signedMoney);
  }
  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 16;

  sheet(t("Real vs Allowance", "Real vs Allowance"), comparisonTable(report, lang));
  sheet(t("Day by day", "Día por día"), dailyTable(report, lang));
  sheet(t("Products", "Productos"), productsTable(report, lang));
  sheet(t("Entries", "Registros"), entriesTable(entries, timezone, lang));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
