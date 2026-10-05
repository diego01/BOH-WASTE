import { describe, expect, it } from "vitest";
import { fmtSignedMoney, simpleCalendar } from "@/lib/allowance";
import { buildReport, type AggRow, type ReportInput } from "@/lib/reports";

const cal = simpleCalendar([1, 2, 3, 4, 5, 6]);
const products = [
  { id: 1, name: "Filet", unit: "LB" as const, areaId: 1, areaName: "BOH", category: "Filets" },
  { id: 2, name: "Nugget", unit: "LB" as const, areaId: 1, areaName: "BOH", category: "Nuggets" },
  { id: 3, name: "Tenders", unit: "LB" as const, areaId: 1, areaName: "BOH", category: "Strips" },
  { id: 4, name: "Cookie", unit: "EACH" as const, areaId: 1, areaName: "BOH", category: "Desserts" },
];
const row = (over: Partial<AggRow>): AggRow => ({
  date: "2026-10-01",
  productId: 1,
  daypart: "LUNCH",
  type: "DONATION",
  reasonId: null,
  quantity: 1,
  cost: 1,
  ...over,
});

function input(rows: AggRow[], over: Partial<ReportInput> = {}): ReportInput {
  return {
    from: "2026-10-01",
    to: "2026-10-07",
    rows,
    products,
    reasons: [{ id: 1, name: "Expired" }],
    allowances: new Map([
      [
        "2026-10",
        [
          { kind: "INDIVIDUAL", name: "Filet", amount: 200, productIds: [1] },
          { kind: "GROUP", name: "Nuggets & Strips", amount: 270, productIds: [2, 3] },
        ],
      ],
    ]),
    calendar: cal,
    today: "2026-10-20",
    filters: { type: "ALL", daypart: "ALL", areaId: null },
    ...over,
  };
}

// Filet real $50.00 in Oct 1–7, spread over days and dayparts, waste + donation.
const filetRows = [
  row({ date: "2026-10-01", cost: 20, quantity: 5.1, daypart: "LUNCH" }),
  row({ date: "2026-10-02", cost: 15, quantity: 3.8, daypart: "DINNER", type: "WASTE" }),
  row({ date: "2026-10-04", cost: 5, quantity: 1.3, daypart: "DINNER" }), // Sunday: real counts, no allowance
  row({ date: "2026-10-06", cost: 10, quantity: 2.6, daypart: "AFTERNOON", reasonId: 1 }),
];

describe("required test case through the report", () => {
  it("Filet Oct 1–7: real $50, allowance $44.44, difference −$5.56 (red)", () => {
    const r = buildReport(input(filetRows));
    const filet = r.comparison.find((c) => c.name === "Filet")!;
    expect(filet.real).toBeCloseTo(50, 9);
    expect(filet.allowance).toBeCloseTo(44.444, 3);
    expect(filet.diff).toBeCloseTo(-5.556, 3);
    expect(fmtSignedMoney(filet.diff)).toBe("−$5.56");
    expect(filet.pctUsed).toBeCloseTo(112.5, 1);
  });

  it("real $40 → +$4.44 (green)", () => {
    const r = buildReport(input([row({ cost: 40 })]));
    expect(fmtSignedMoney(r.comparison.find((c) => c.name === "Filet")!.diff)).toBe("+$4.44");
  });

  it("day by day: Sunday has real but no allowance; cumulative ends at the total difference", () => {
    const filet = buildReport(input(filetRows)).comparison.find((c) => c.name === "Filet")!;
    const sunday = filet.days.find((d) => d.date === "2026-10-04")!;
    expect(sunday).toMatchObject({ operating: false, real: 5, allowance: 0, diff: -5 });
    expect(filet.days[0].diff).toBeCloseTo(200 / 27 - 20, 9);
    expect(filet.days.at(-1)!.cumulative).toBeCloseTo(filet.diff, 9);
  });
});

describe("report breakdowns", () => {
  const rows = [...filetRows, row({ productId: 2, cost: 30, daypart: "LUNCH" }), row({ productId: 3, cost: 12, daypart: "BREAKFAST" }), row({ productId: 4, cost: 3, type: "WASTE" })];

  it("a group's real is the sum of its products", () => {
    const g = buildReport(input(rows)).comparison.find((c) => c.kind === "GROUP")!;
    expect(g.real).toBe(42);
    expect(g.category).toBe("Mixed");
  });

  it("products without allowance only appear as real", () => {
    const r = buildReport(input(rows));
    expect(r.comparison.map((c) => c.name)).not.toContain("Cookie");
    expect(r.byProduct.map((p) => p.name)).toContain("Cookie");
  });

  it("rows are sorted most-over first; totals use the same sign rule", () => {
    const r = buildReport(input(rows));
    expect(r.comparison[0].diff).toBeLessThanOrEqual(r.comparison[1].diff);
    expect(r.comparisonTotals.diff).toBeCloseTo(r.comparisonTotals.allowance - r.comparisonTotals.real, 9);
  });

  it("type filter changes the real views, not the allowance comparison", () => {
    const r = buildReport(input(rows, { filters: { type: "WASTE", daypart: "ALL", areaId: null } }));
    expect(r.total).toBe(18); // 15 Filet waste + 3 Cookie
    expect(r.byType).toEqual({ WASTE: 18, DONATION: 77 });
    expect(r.comparison.find((c) => c.name === "Filet")!.real).toBe(50);
  });

  it("daypart filter and breakdown apply to real only", () => {
    const r = buildReport(input(rows, { filters: { type: "ALL", daypart: "DINNER", areaId: null } }));
    expect(r.total).toBe(20);
    expect(r.byDaypart).toEqual({ BREAKFAST: 12, LUNCH: 53, AFTERNOON: 10, DINNER: 20 });
    expect(r.byProduct.find((p) => p.name === "Filet")!.byDaypart.DINNER.cost).toBe(20);
    expect(r.comparison.find((c) => c.name === "Filet")!.real).toBe(50);
  });

  it("Remove corrections net out of every total", () => {
    const r = buildReport(input([row({ cost: 10, quantity: 2 }), row({ cost: -5, quantity: -1 })]));
    expect(r.total).toBe(5);
    expect(r.byProduct[0].qty).toBe(1);
  });
});

describe("month to date", () => {
  it("pace, remaining and projection for the running month", () => {
    // Today Oct 10 (Sat): operating days elapsed = Oct 1–3, 5–10 = 9; month has 27.
    const r = buildReport(input([row({ cost: 90 })], { from: "2026-10-01", to: "2026-10-10", today: "2026-10-10" }));
    expect(r.mtd).not.toBeNull();
    expect(r.mtd!.opDaysElapsed).toBe(9);
    expect(r.mtd!.monthAllowance).toBe(470);
    expect(r.mtd!.used).toBe(90);
    expect(r.mtd!.remaining).toBe(380);
    expect(r.mtd!.paceAllowance).toBeCloseTo((470 / 27) * 9, 9);
    expect(r.mtd!.projection).toBeCloseTo((90 / 9) * 27, 9); // $270
    expect(r.mtd!.projectedDiff).toBeCloseTo(200, 9);
    const filet = r.comparison.find((c) => c.name === "Filet")!;
    expect(filet.projection!.real).toBeCloseTo(270, 9);
    expect(filet.projection!.diff).toBeCloseTo(-70, 9); // projected over → alert
  });

  it("no MTD block for other periods", () => {
    expect(buildReport(input([])).mtd).toBeNull();
  });
});

describe("export", () => {
  it("CSV has Type-aware rows and a signed Difference; Excel has all sheets", async () => {
    const { comparisonTable, toCsv, toXlsx } = await import("@/lib/reportExport");
    const ExcelJS = (await import("exceljs")).default;
    const report = buildReport(input([...filetRows, row({ productId: 2, cost: 10 })]));

    const csv = toCsv(comparisonTable(report));
    expect(csv).toContain("Difference ($)");
    expect(csv).toMatch(/"Filet"|Filet,Product/);
    expect(csv).toContain(",-5.56,");
    expect(csv).toMatch(/Nuggets & Strips,Group,.*,\+\d+\.\d\d,/);

    const buf = await toXlsx(report, [], "America/New_York", "test");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Real vs Allowance", "Day by day", "Products", "Entries"]);
    const sheet = wb.getWorksheet("Real vs Allowance")!;
    const filet = sheet.getRows(2, sheet.rowCount)!.find((r) => r.getCell(1).value === "Filet")!;
    expect(filet.getCell(8).value).toBeCloseTo(-5.556, 3);
    expect(String(sheet.getColumn(8).numFmt)).toContain("+");
  });

  it("CSV neutralizes formula-like text", async () => {
    const { toCsv } = await import("@/lib/reportExport");
    expect(toCsv({ header: ["Note"], rows: [["=HYPERLINK(1)"]] })).toContain("'=HYPERLINK(1)");
  });
});
