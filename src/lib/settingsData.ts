import "server-only";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function loadAreas() {
  const rows = await db
    .select({
      id: schema.areas.id,
      name: schema.areas.name,
      color: schema.areas.color,
      active: schema.areas.active,
      productCount: count(schema.products.id),
    })
    .from(schema.areas)
    .leftJoin(schema.products, eq(schema.products.areaId, schema.areas.id))
    .groupBy(schema.areas.id)
    .orderBy(asc(schema.areas.sortOrder), asc(schema.areas.id));
  return rows;
}

export async function loadCategories() {
  return db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      active: schema.categories.active,
      productCount: count(schema.productCategories.productId),
    })
    .from(schema.categories)
    .leftJoin(schema.productCategories, eq(schema.productCategories.categoryId, schema.categories.id))
    .groupBy(schema.categories.id)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.id));
}

export async function loadProducts() {
  const products = await db.select().from(schema.products).orderBy(asc(schema.products.name));
  const links = await db.select().from(schema.productCategories);
  const byProduct = new Map<number, number[]>();
  for (const l of links) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l.categoryId]);
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    areaId: p.areaId,
    unit: p.unit,
    unitCost: Number(p.unitCost),
    type: p.type,
    availableDayparts: p.availableDayparts,
    parteDelDiaOriginal: p.parteDelDiaOriginal,
    active: p.active,
    archived: !!p.archivedAt,
    categoryIds: byProduct.get(p.id) ?? [],
  }));
}

export type SettingsProduct = Awaited<ReturnType<typeof loadProducts>>[number];
export type SettingsArea = Awaited<ReturnType<typeof loadAreas>>[number];
export type SettingsCategory = Awaited<ReturnType<typeof loadCategories>>[number];
