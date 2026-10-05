import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { Daypart, ProductType, Role, Unit } from "@/db/schema";
import { DAYPARTS } from "@/lib/domain";
import { bi } from "@/lib/i18n";
import type { InventoryParseResult, Issue } from "./inventory";

export const IMPORT_AREA_NAME = "BOH";

export type ProductPreviewRow = {
  row: number;
  name: string;
  code: string | null;
  unit: Unit | null;
  rawUnit: string;
  unitCost: number | null;
  type: ProductType | null;
  rawType: string;
  dayparts: Daypart[];
  parteDelDiaOriginal: string;
  daypartsProvisional: boolean;
  suggestedCategory: string | null;
  /** Category already linked in the DB (existing products only). */
  currentCategory: string | null;
  errors: string[];
  status: "new" | "update" | "unchanged";
  changes: string[];
};

export type UserPreviewRow = {
  row: number;
  name: string;
  role: Role | null;
  rawRole: string;
  errors: string[];
  status: "new" | "exists";
};

export type ImportPreview = {
  sheetName: string;
  usersSheetName: string | null;
  emptyRowsSkipped: number;
  totals: {
    products: number;
    byType: Record<string, number>;
    byDaypartOriginal: Record<string, number>;
    byUnit: Record<string, number>;
  };
  products: ProductPreviewRow[];
  users: UserPreviewRow[];
  issues: Issue[];
  existingCategories: string[];
};

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return out;
}

type ExistingProduct = typeof schema.products.$inferSelect;

function findExisting(p: { code: string | null; name: string }, all: ExistingProduct[]) {
  if (p.code) return all.find((e) => e.code === p.code);
  return all.find((e) => !e.code && e.name.toLowerCase() === p.name.toLowerCase());
}

function diff(p: InventoryParseResult["products"][number], e: ExistingProduct): string[] {
  const changes: string[] = [];
  if (e.name !== p.name) changes.push(`name: ${e.name} → ${p.name}`);
  if (p.unit && e.unit !== p.unit) changes.push(`unit: ${e.unit} → ${p.unit}`);
  if (p.unitCost !== null && Number(e.unitCost) !== p.unitCost) changes.push(`cost: ${e.unitCost} → ${p.unitCost}`);
  if (p.type && e.type !== p.type) changes.push(`type: ${e.type} → ${p.type}`);
  if ((e.parteDelDiaOriginal ?? "") !== p.parteDelDiaOriginal)
    changes.push(`parte del día: ${e.parteDelDiaOriginal ?? "—"} → ${p.parteDelDiaOriginal}`);
  return changes;
}

/** Client-safe preview (no PINs) annotated with new/update status against the DB. */
export async function buildPreview(db: DB, parsed: InventoryParseResult): Promise<ImportPreview> {
  const existing = await db.select().from(schema.products);
  const existingUsers = await db.select({ name: schema.users.name }).from(schema.users);
  const existingCategories = (await db.select({ name: schema.categories.name }).from(schema.categories)).map((c) => c.name);
  const userNames = new Set(existingUsers.map((u) => u.name.toLowerCase()));
  const links = await db
    .select({ productId: schema.productCategories.productId, name: schema.categories.name })
    .from(schema.productCategories)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.productCategories.categoryId));
  const currentCategory = new Map<number, string>();
  for (const l of links) if (!currentCategory.has(l.productId)) currentCategory.set(l.productId, l.name);

  const products: ProductPreviewRow[] = parsed.products.map((p) => {
    const e = findExisting(p, existing);
    const changes = e ? diff(p, e) : [];
    return {
      row: p.row,
      name: p.name,
      code: p.code,
      unit: p.unit,
      rawUnit: p.rawUnit,
      unitCost: p.unitCost,
      type: p.type,
      rawType: p.rawType,
      dayparts: p.dayparts,
      parteDelDiaOriginal: p.parteDelDiaOriginal,
      daypartsProvisional: p.daypartsProvisional,
      suggestedCategory: p.suggestedCategory,
      currentCategory: e ? (currentCategory.get(e.id) ?? null) : null,
      errors: p.errors,
      status: !e ? "new" : changes.length ? "update" : "unchanged",
      changes,
    };
  });

  return {
    sheetName: parsed.sheetName,
    usersSheetName: parsed.usersSheetName,
    emptyRowsSkipped: parsed.emptyRowsSkipped,
    totals: {
      products: parsed.products.length,
      byType: countBy(parsed.products, (p) => p.type ?? "NO TYPE"),
      byDaypartOriginal: countBy(parsed.products, (p) => p.parteDelDiaOriginal || "(empty)"),
      byUnit: countBy(parsed.products, (p) => p.unit ?? `? ${p.rawUnit}`),
    },
    products,
    users: parsed.users.map((u) => ({
      row: u.row,
      name: u.name,
      role: u.role,
      rawRole: u.rawRole,
      errors: u.errors,
      status: userNames.has(u.name.toLowerCase()) ? "exists" : "new",
    })),
    issues: parsed.issues,
    existingCategories,
  };
}

export type ImportOverrides = {
  /** row → category name ("" = none) */
  categories: Record<number, string>;
  /** row → type, required for rows the file left untyped */
  types: Record<number, ProductType>;
  importUsers: boolean;
};

export type ImportResult = {
  productsCreated: number;
  productsUpdated: number;
  productsUnchanged: number;
  usersCreated: number;
  usersSkipped: number;
};

export async function applyImport(
  db: DB,
  parsed: InventoryParseResult,
  overrides: ImportOverrides,
  actorId: string | null,
): Promise<ImportResult> {
  const blocking = parsed.products.filter((p) => p.errors.length || (!p.type && !overrides.types[p.row]));
  if (blocking.length) {
    const rows = blocking.map((p) => p.row).join(", ");
    throw new Error(bi(`Fix rows before importing: ${rows}`, `Corrige estas filas antes de importar: ${rows}`));
  }
  const dupCodes = parsed.issues.filter((i) => i.level === "error" && i.message.startsWith("Duplicate code"));
  if (dupCodes.length) throw new Error(dupCodes.map((i) => i.message).join(" "));

  return db.transaction(async (tx) => {
    const result: ImportResult = { productsCreated: 0, productsUpdated: 0, productsUnchanged: 0, usersCreated: 0, usersSkipped: 0 };

    let [area] = await tx.select().from(schema.areas).where(eq(schema.areas.name, IMPORT_AREA_NAME));
    if (!area) {
      [area] = await tx.insert(schema.areas).values({ name: IMPORT_AREA_NAME, color: "#2196F3", sortOrder: 0 }).returning();
    }

    const categoryIds = new Map<string, number>();
    for (const c of await tx.select().from(schema.categories)) categoryIds.set(c.name.toLowerCase(), c.id);
    async function categoryId(name: string) {
      const key = name.toLowerCase();
      if (!categoryIds.has(key)) {
        const [c] = await tx.insert(schema.categories).values({ name, sortOrder: categoryIds.size }).returning();
        categoryIds.set(key, c.id);
      }
      return categoryIds.get(key)!;
    }

    const existing = await tx.select().from(schema.products);

    for (const p of parsed.products) {
      const type = (p.type ?? overrides.types[p.row])!;
      const values = {
        name: p.name,
        code: p.code,
        unit: p.unit!,
        unitCost: p.unitCost!,
        type,
        parteDelDiaOriginal: p.parteDelDiaOriginal,
      };
      const e = findExisting(p, existing);
      let productId: number;
      if (!e) {
        const [created] = await tx
          .insert(schema.products)
          .values({ ...values, areaId: area.id, availableDayparts: p.dayparts.length ? p.dayparts : DAYPARTS })
          .returning({ id: schema.products.id });
        productId = created.id;
        result.productsCreated++;
      } else {
        productId = e.id;
        // Re-import keeps admin-edited dayparts/area/active; it refreshes catalog data only.
        if (diff(p, e).length) {
          await tx
            .update(schema.products)
            .set({ ...values, updatedAt: sql`now()` })
            .where(eq(schema.products.id, e.id));
          result.productsUpdated++;
        } else {
          result.productsUnchanged++;
        }
      }

      // Existing products keep their categories unless the admin picked one in the preview.
      const chosen = p.row in overrides.categories ? overrides.categories[p.row] : e ? undefined : p.suggestedCategory;
      if (chosen !== undefined) {
        await tx.delete(schema.productCategories).where(eq(schema.productCategories.productId, productId));
        if (chosen) {
          await tx.insert(schema.productCategories).values({ productId, categoryId: await categoryId(chosen) });
        }
      }
    }

    if (overrides.importUsers) {
      const existingNames = new Set(
        (await tx.select({ name: schema.users.name }).from(schema.users)).map((u) => u.name.toLowerCase()),
      );
      for (const u of parsed.users) {
        if (u.errors.length || !u.role) continue;
        if (existingNames.has(u.name.toLowerCase())) {
          result.usersSkipped++;
          continue;
        }
        await tx.insert(schema.users).values({
          name: u.name,
          role: u.role,
          pinHash: await bcrypt.hash(u.pin, 10),
          mustChangePin: true,
        });
        existingNames.add(u.name.toLowerCase());
        result.usersCreated++;
      }
    }

    await tx.insert(schema.auditLog).values({
      userId: actorId,
      entity: "import",
      action: "inventory.xlsx",
      after: result,
    });

    return result;
  });
}
