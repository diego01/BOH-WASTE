import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  mapDayparts,
  mapRole,
  mapType,
  mapUnit,
  parseInventory,
  splitNameCode,
  type InventoryParseResult,
} from "@/lib/import/inventory";
import { suggestCategory } from "@/lib/import/categorySuggest";

describe("field mapping", () => {
  it("splits name and code on the non-breaking space", () => {
    expect(splitNameCode("Chicken, Filets (1)")).toEqual({ name: "Chicken, Filets", code: "1" });
    expect(splitNameCode("Eggs Scramble")).toEqual({ name: "Eggs Scramble", code: null });
    expect(splitNameCode("Milk and Egg Wash Mix CFA (62)")).toEqual({ name: "Milk and Egg Wash Mix CFA", code: "62" });
  });

  it("maps units", () => {
    expect(mapUnit("Pound")).toBe("LB");
    expect(mapUnit("Each")).toBe("EACH");
    expect(mapUnit("Ounce")).toBe("OZ");
    expect(mapUnit("50 oz Bag")).toBe("BAG_50OZ");
    expect(mapUnit("Gallon")).toBeNull();
  });

  it("maps type without guessing", () => {
    expect(mapType("Donations")).toBe("DONATION");
    expect(mapType("Waste")).toBe("WASTE");
    expect(mapType("")).toBeNull();
    expect(mapType("Trash")).toBeNull();
  });

  it("maps parte del día to available dayparts", () => {
    expect(mapDayparts("Breakfast").dayparts).toEqual(["BREAKFAST"]);
    expect(mapDayparts("Lunch/Dinner").dayparts).toEqual(["LUNCH", "AFTERNOON", "DINNER"]);
    expect(mapDayparts("Todas").dayparts).toEqual(["BREAKFAST", "LUNCH", "AFTERNOON", "DINNER"]);
    for (const v of ["Desert", "Prep"]) {
      const r = mapDayparts(v);
      expect(r.dayparts).toHaveLength(4);
      expect(r.provisional).toBe(true);
    }
  });

  it("maps profiles", () => {
    expect(mapRole("admin")).toBe("ADMIN");
    expect(mapRole("team leader")).toBe("TEAM_LEADER");
    expect(mapRole("Team Member")).toBe("TEAM_MEMBER");
    expect(mapRole("boss")).toBeNull();
  });

  it("suggests categories", () => {
    expect(suggestCategory("Bacon, Full Strip")).toBe("Bacon & Sausage");
    expect(suggestCategory("Chicken, Tenders")).toBe("Strips");
    expect(suggestCategory("Coater, Spicy CFA")).toBe("Prep / Ingredients");
    expect(suggestCategory("Macaroni & Cheese")).toBe("Sides");
    expect(suggestCategory("Side Salad")).toBe("Sides");
    expect(suggestCategory("Salad, Cobb Base")).toBe("Cold");
  });
});

describe("referencias/inventory.xlsx", () => {
  let r: InventoryParseResult;

  beforeAll(async () => {
    r = await parseInventory(readFileSync(path.resolve(__dirname, "../../referencias/inventory.xlsx")));
  });

  it("reads 41 products from the Donations sheet and skips empty rows", () => {
    expect(r.sheetName).toBe("Donations");
    expect(r.products).toHaveLength(41);
    expect(r.emptyRowsSkipped).toBeGreaterThan(0);
  });

  it("counts 37 Donation and 4 Waste", () => {
    expect(r.products.filter((p) => p.type === "DONATION")).toHaveLength(37);
    const waste = r.products.filter((p) => p.type === "WASTE").map((p) => p.name);
    expect(waste).toEqual(["Cheese Sauce", "Coater, CFA", "Coater, Spicy CFA", "Milk and Egg Wash Mix CFA"]);
  });

  it("has no row errors, no untyped rows and no duplicate codes", () => {
    expect(r.products.flatMap((p) => p.errors)).toEqual([]);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("cleans names and codes", () => {
    for (const p of r.products) {
      expect(p.name).not.toMatch(/ /);
      expect(p.name).not.toMatch(/\(/);
    }
    expect(r.products.filter((p) => !p.code).map((p) => p.name)).toEqual(["Eggs Scramble"]);
    const wash = r.products.find((p) => p.code === "62")!;
    expect(wash.unit).toBe("BAG_50OZ");
    expect(wash.unitCost).toBe(11.17);
  });

  it("marks Desert and Prep as provisional all-day", () => {
    const prov = r.products.filter((p) => p.daypartsProvisional);
    expect(prov).toHaveLength(13);
    expect(prov.every((p) => p.dayparts.length === 4)).toBe(true);
  });

  it("gives every product a suggested category", () => {
    expect(r.products.filter((p) => !p.suggestedCategory).map((p) => p.name)).toEqual([]);
  });

  it("reads the users sheet", () => {
    expect(r.users.length).toBeGreaterThan(0);
    expect(r.users.filter((u) => u.role === "ADMIN").length).toBeGreaterThanOrEqual(1);
    expect(r.users.flatMap((u) => u.errors)).toEqual([]);
  });
});
