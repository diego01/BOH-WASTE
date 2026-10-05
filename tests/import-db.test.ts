import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedBase } from "@/db/seed";
import { applyImport, buildPreview } from "@/lib/import/apply";
import { parseInventory, type InventoryParseResult } from "@/lib/import/inventory";

const root = path.resolve(__dirname, "..");
let db: ReturnType<typeof drizzle<typeof schema>>;
let parsed: InventoryParseResult;

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(root, "drizzle") });
  await seedBase(db);
  parsed = await parseInventory(readFileSync(path.join(root, "..", "referencias", "inventory.xlsx")));
}, 60_000);

describe("import into the database", () => {
  it("previews everything as new on an empty catalog, without PINs", async () => {
    const preview = await buildPreview(db, parsed);
    expect(preview.products.every((p) => p.status === "new")).toBe(true);
    expect(JSON.stringify(preview.users)).not.toContain("pin");
  });

  it("creates 41 BOH products with snapshots of type, dayparts and original value", async () => {
    const r = await applyImport(db, parsed, { categories: {}, types: {}, importUsers: true }, null);
    expect(r.productsCreated).toBe(41);

    const [boh] = await db.select().from(schema.areas).where(eq(schema.areas.name, "BOH"));
    const products = await db.select().from(schema.products);
    expect(products).toHaveLength(41);
    expect(products.every((p) => p.areaId === boh.id)).toBe(true);

    const filet = products.find((p) => p.code === "1")!;
    expect(filet.name).toBe("Chicken, Filets");
    expect(filet.type).toBe("DONATION");
    expect(filet.availableDayparts).toEqual(["LUNCH", "AFTERNOON", "DINNER"]);
    expect(filet.parteDelDiaOriginal).toBe("Lunch/Dinner");
    expect(Number(filet.unitCost)).toBe(3.92);

    const eggs = products.find((p) => p.name === "Eggs Scramble")!;
    expect(eggs.code).toBeNull();
  });

  it("links suggested categories", async () => {
    const rows = await db
      .select({ product: schema.products.name, category: schema.categories.name })
      .from(schema.productCategories)
      .innerJoin(schema.products, eq(schema.products.id, schema.productCategories.productId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.productCategories.categoryId));
    expect(rows).toHaveLength(41);
    expect(rows.find((r) => r.product === "Chicken, Tenders")?.category).toBe("Strips");
  });

  it("creates users with hashed temporary PINs", async () => {
    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(parsed.users.length);
    for (const u of users) {
      expect(u.mustChangePin).toBe(true);
      expect(u.pinHash).not.toBe(parsed.users.find((p) => p.name === u.name)!.pin);
      expect(await bcrypt.compare(parsed.users.find((p) => p.name === u.name)!.pin, u.pinHash)).toBe(true);
    }
  });

  it("re-import is idempotent and keeps admin-edited dayparts", async () => {
    await db.update(schema.products).set({ availableDayparts: ["DINNER"] }).where(eq(schema.products.code, "1"));

    const preview = await buildPreview(db, parsed);
    expect(preview.products.every((p) => p.status === "unchanged")).toBe(true);
    expect(preview.users.every((u) => u.status === "exists")).toBe(true);

    const r = await applyImport(db, parsed, { categories: {}, types: {}, importUsers: true }, null);
    expect(r).toMatchObject({ productsCreated: 0, productsUpdated: 0, productsUnchanged: 41, usersCreated: 0 });

    const [filet] = await db.select().from(schema.products).where(eq(schema.products.code, "1"));
    expect(filet.availableDayparts).toEqual(["DINNER"]);
  });

  it("refuses rows without a type unless the admin picks one", async () => {
    const broken: InventoryParseResult = {
      ...parsed,
      products: [{ ...parsed.products[0], code: "X1", type: null }],
    };
    await expect(applyImport(db, broken, { categories: {}, types: {}, importUsers: false }, null)).rejects.toThrow(/Fix rows/);
    const ok = await applyImport(db, broken, { categories: {}, types: { [broken.products[0].row]: "WASTE" }, importUsers: false }, null);
    expect(ok.productsCreated).toBe(1);
  });
});
