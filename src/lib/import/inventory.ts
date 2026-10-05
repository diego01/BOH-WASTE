import ExcelJS from "exceljs";
import type { Daypart, ProductType, Role, Unit } from "@/db/schema";
import { DAYPARTS, validatePin } from "@/lib/domain";
import { bi } from "@/lib/i18n";
import { suggestCategory } from "./categorySuggest";

/**
 * Pure parser for inventory.xlsx. No DB access: it returns a preview that the
 * admin reviews before anything is written.
 */

export type ParsedProduct = {
  row: number;
  rawName: string;
  name: string;
  code: string | null;
  unit: Unit | null;
  rawUnit: string;
  unitCost: number | null;
  type: ProductType | null;
  rawType: string;
  dayparts: Daypart[];
  parteDelDiaOriginal: string;
  /** Desert / Prep / unknown: all dayparts assigned provisionally. */
  daypartsProvisional: boolean;
  suggestedCategory: string | null;
  errors: string[];
};

export type ParsedUser = {
  row: number;
  name: string;
  role: Role | null;
  rawRole: string;
  /** Kept server-side only; never sent to the client preview. */
  pin: string;
  errors: string[];
};

export type Issue = { level: "error" | "warning" | "info"; message: string; rows?: number[] };

export type InventoryParseResult = {
  sheetName: string;
  products: ParsedProduct[];
  users: ParsedUser[];
  usersSheetName: string | null;
  emptyRowsSkipped: number;
  issues: Issue[];
};

const NBSP = / /g;

export function normalizeHeader(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(NBSP, " ")
    .trim()
    .toLowerCase();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "result" in value) return cellNumber(value.result as ExcelJS.CellValue);
  const s = cellText(value).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "Chicken, Filets (1)" → { name: "Chicken, Filets", code: "1" } */
export function splitNameCode(raw: string): { name: string; code: string | null } {
  const clean = raw.replace(NBSP, " ").replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m && m[1]) return { name: m[1].trim(), code: m[2].trim() };
  return { name: clean, code: null };
}

const UNIT_MAP: Record<string, Unit> = {
  pound: "LB",
  pounds: "LB",
  lb: "LB",
  lbs: "LB",
  each: "EACH",
  ea: "EACH",
  ounce: "OZ",
  ounces: "OZ",
  oz: "OZ",
  "50 oz bag": "BAG_50OZ",
  "bag 50 oz": "BAG_50OZ",
};

export function mapUnit(raw: string): Unit | null {
  return UNIT_MAP[normalizeHeader(raw)] ?? null;
}

export function mapType(raw: string): ProductType | null {
  const v = normalizeHeader(raw);
  if (v === "donations" || v === "donation") return "DONATION";
  if (v === "waste") return "WASTE";
  return null;
}

export function mapDayparts(raw: string): { dayparts: Daypart[]; provisional: boolean; known: boolean } {
  const v = normalizeHeader(raw);
  if (v === "breakfast") return { dayparts: ["BREAKFAST"], provisional: false, known: true };
  if (v === "lunch/dinner") return { dayparts: ["LUNCH", "AFTERNOON", "DINNER"], provisional: false, known: true };
  if (v === "todas") return { dayparts: [...DAYPARTS], provisional: false, known: true };
  if (v === "desert" || v === "dessert" || v === "prep") return { dayparts: [...DAYPARTS], provisional: true, known: true };
  return { dayparts: [...DAYPARTS], provisional: true, known: false };
}

export function mapRole(raw: string): Role | null {
  const v = normalizeHeader(raw).replace(/[_-]/g, " ").replace(/\s+/g, " ");
  if (v === "admin" || v === "administrator") return "ADMIN";
  if (v === "team leader" || v === "leader") return "TEAM_LEADER";
  if (v === "team member" || v === "member") return "TEAM_MEMBER";
  return null;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const PRODUCT_HEADERS = {
  name: "item name",
  unit: "medida",
  cost: "monto",
  daypart: "parte del dia",
  type: "tipo de waste",
} as const;

function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => map.set(normalizeHeader(cellText(cell.value)), col));
  return map;
}

export async function parseInventory(data: ArrayBuffer | Buffer): Promise<InventoryParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const issues: Issue[] = [];

  const productSheet = wb.worksheets.find((ws) => headerIndex(ws).has(PRODUCT_HEADERS.name));
  if (!productSheet) {
    return {
      sheetName: "",
      products: [],
      users: [],
      usersSheetName: null,
      emptyRowsSkipped: 0,
      issues: [{ level: "error", message: bi(`No sheet has an "Item Name" header column.`, `Ninguna hoja tiene la columna "Item Name".`) }],
    };
  }

  const h = headerIndex(productSheet);
  for (const [key, header] of Object.entries(PRODUCT_HEADERS)) {
    if (!h.has(header)) issues.push({ level: "error", message: bi(`Missing column "${header}" (${key}).`, `Falta la columna "${header}" (${key}).`) });
  }

  const products: ParsedProduct[] = [];
  let emptyRowsSkipped = 0;
  const lastRow = productSheet.actualRowCount > 0 ? productSheet.rowCount : 0;

  for (let r = 2; r <= lastRow; r++) {
    const row = productSheet.getRow(r);
    const get = (header: string) => (h.has(header) ? row.getCell(h.get(header)!).value : null);
    const rawName = cellText(get(PRODUCT_HEADERS.name)).trim();
    const rawUnit = cellText(get(PRODUCT_HEADERS.unit)).trim();
    const rawCost = get(PRODUCT_HEADERS.cost);
    const rawDaypart = cellText(get(PRODUCT_HEADERS.daypart)).trim();
    const rawType = cellText(get(PRODUCT_HEADERS.type)).trim();

    if (!rawName && !rawUnit && !cellText(rawCost).trim() && !rawDaypart && !rawType) {
      emptyRowsSkipped++;
      continue;
    }

    const errors: string[] = [];
    const { name, code } = splitNameCode(rawName);
    if (!name) errors.push(bi("Missing name", "Falta el nombre"));

    const unit = mapUnit(rawUnit);
    if (!unit) errors.push(bi(`Unknown unit "${rawUnit}"`, `Medida desconocida "${rawUnit}"`));

    const costNum = cellNumber(rawCost);
    if (costNum === null) errors.push(bi(`Cost is not numeric ("${cellText(rawCost)}")`, `El costo no es numérico ("${cellText(rawCost)}")`));
    else if (costNum < 0) errors.push(bi("Cost is negative", "El costo es negativo"));

    const type = mapType(rawType);
    const dp = mapDayparts(rawDaypart);

    products.push({
      row: r,
      rawName,
      name,
      code,
      unit,
      rawUnit,
      unitCost: costNum === null ? null : round2(costNum),
      type,
      rawType,
      dayparts: dp.dayparts,
      parteDelDiaOriginal: rawDaypart,
      daypartsProvisional: dp.provisional,
      suggestedCategory: suggestCategory(name),
      errors,
    });

    if (!dp.known) {
      issues.push({ level: "warning", message: bi(`Unknown "parte del día" value "${rawDaypart}" → all dayparts provisionally.`, `Valor de "parte del día" desconocido "${rawDaypart}" → todos los horarios de forma provisional.`), rows: [r] });
    }
  }

  // Untyped rows: never guessed, the admin must pick.
  const untyped = products.filter((p) => !p.type);
  if (untyped.length) {
    issues.push({
      level: "error",
      message: bi(
        `${untyped.length} row(s) without a valid "Tipo de waste" — choose Waste or Donation before importing.`,
        `${untyped.length} fila(s) sin "Tipo de waste" válido — elige Waste o Donación antes de importar.`,
      ),
      rows: untyped.map((p) => p.row),
    });
  }

  // Duplicates by code and by name.
  const byCode = new Map<string, number[]>();
  const byName = new Map<string, number[]>();
  for (const p of products) {
    if (p.code) byCode.set(p.code, [...(byCode.get(p.code) ?? []), p.row]);
    const key = p.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), p.row]);
  }
  for (const [code, rows] of byCode) {
    if (rows.length > 1) issues.push({ level: "error", message: bi(`Duplicate code "${code}".`, `Código duplicado "${code}".`), rows });
  }
  for (const [name, rows] of byName) {
    if (rows.length > 1) issues.push({ level: "warning", message: bi(`Duplicate name "${name}".`, `Nombre duplicado "${name}".`), rows });
  }

  // Near-duplicate names (typos), excluding exact duplicates.
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i].name.toLowerCase();
      const b = products[j].name.toLowerCase();
      if (a === b) continue;
      const d = levenshtein(a, b);
      if (d <= 2 && d / Math.max(a.length, b.length) <= 0.15) {
        issues.push({
          level: "warning",
          message: bi(`Similar names: "${products[i].name}" / "${products[j].name}".`, `Nombres parecidos: "${products[i].name}" / "${products[j].name}".`),
          rows: [products[i].row, products[j].row],
        });
      }
    }
  }

  const noCode = products.filter((p) => !p.code);
  if (noCode.length) {
    issues.push({ level: "info", message: bi(`${noCode.length} product(s) without code (left empty).`, `${noCode.length} producto(s) sin código (queda vacío).`), rows: noCode.map((p) => p.row) });
  }
  const typo = products.filter((p) => normalizeHeader(p.parteDelDiaOriginal) === "desert");
  if (typo.length) {
    issues.push({ level: "info", message: bi(`"Desert" read as Dessert.`, `"Desert" se leyó como Dessert (postre).`), rows: typo.map((p) => p.row) });
  }

  // Optional users sheet: Name / PIN / acceso.
  const usersSheet = wb.worksheets.find((ws) => {
    const hh = headerIndex(ws);
    return ws !== productSheet && hh.has("name") && hh.has("pin");
  });
  const users: ParsedUser[] = [];
  if (usersSheet) {
    const uh = headerIndex(usersSheet);
    const roleCol = uh.get("acceso") ?? uh.get("role") ?? uh.get("perfil");
    for (let r = 2; r <= usersSheet.rowCount; r++) {
      const row = usersSheet.getRow(r);
      const name = cellText(row.getCell(uh.get("name")!).value).replace(NBSP, " ").trim();
      const pinRaw = row.getCell(uh.get("pin")!).value;
      const rawRole = roleCol ? cellText(row.getCell(roleCol).value).trim() : "";
      if (!name && !cellText(pinRaw) && !rawRole) continue;
      const errors: string[] = [];
      const role = mapRole(rawRole);
      if (!name) errors.push(bi("Missing name", "Falta el nombre"));
      if (!role) errors.push(bi(`Unknown profile "${rawRole}"`, `Perfil desconocido "${rawRole}"`));
      const pin = typeof pinRaw === "number" ? String(Math.trunc(pinRaw)) : cellText(pinRaw).trim();
      if (role) {
        const pinError = validatePin(pin, role);
        if (pinError) errors.push(pinError);
      }
      users.push({ row: r, name, role, rawRole, pin, errors });
    }
    const pins = new Set(users.map((u) => u.pin));
    if (users.length > 1 && pins.size === 1) {
      issues.push({
        level: "info",
        message: bi(
          "All users share the same initial PIN — each person will be asked to set a new PIN at first sign-in.",
          "Todos los usuarios tienen el mismo PIN inicial — a cada persona se le pedirá uno nuevo en su primer ingreso.",
        ),
      });
    }
  }

  return {
    sheetName: productSheet.name,
    products,
    users,
    usersSheetName: usersSheet?.name ?? null,
    emptyRowsSkipped,
    issues,
  };
}
