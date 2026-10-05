import { describe, expect, it } from "vitest";
import { auditChanges, auditLabel } from "@/lib/auditSummary";

describe("audit summary", () => {
  it("lists only changed, visible fields", () => {
    const before = { id: 1, name: "Filet", unitCost: "3.9200", type: "DONATION", pinHash: "x", updatedAt: "t" };
    const after = { name: "Filet", unitCost: 4.1, type: "WASTE", pinHash: "y" };
    expect(auditChanges(before, after)).toEqual(["unitCost: 3.9200 → 4.1", "type: DONATION → WASTE"]);
  });

  it("shows created values when there is no before", () => {
    expect(auditChanges(null, { name: "Quality", active: true })).toEqual(["name: Quality", "active: true"]);
  });

  it("caps long change lists", () => {
    const after = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, i]));
    expect(auditChanges(null, after).at(-1)).toBe("+3 more");
  });

  it("has readable labels", () => {
    expect(auditLabel("product", "update.type")).toBe("Product type changed");
    expect(auditLabel("weird", "thing")).toBe("weird · thing");
  });
});
