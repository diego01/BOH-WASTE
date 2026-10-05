/**
 * Suggested category per imported product. The Excel has no categories, so
 * these are only proposals shown in the import preview for the admin to
 * approve or change. First matching rule wins.
 */
export const DEFAULT_CATEGORIES = [
  "Filets",
  "Nuggets",
  "Strips",
  "Bacon & Sausage",
  "Egg",
  "Bread",
  "Sandwiches",
  "Nuggets & Strips",
  "Sides",
  "Cold",
  "Desserts",
  "Biscuits",
  "Muffins",
  "Entrees",
  "Condiments",
  "Prep / Ingredients",
];

const RULES: { test: RegExp; category: string }[] = [
  { test: /coater|egg wash|blueberr|diced apple/i, category: "Prep / Ingredients" },
  { test: /filet/i, category: "Filets" },
  { test: /nugget/i, category: "Nuggets" },
  { test: /bacon|sausage/i, category: "Bacon & Sausage" },
  { test: /tender|strip/i, category: "Strips" },
  { test: /\begg/i, category: "Egg" },
  { test: /biscuit/i, category: "Biscuits" },
  { test: /muffin/i, category: "Muffins" },
  { test: /\bbun\b|roll|tortilla|bread/i, category: "Bread" },
  { test: /brownie|cookie|dessert/i, category: "Desserts" },
  { test: /cheese sauce|sauce|dressing/i, category: "Condiments" },
  { test: /side salad|kale|fruit cup|hashround|fries|mac(aroni)? ?(&|and) ?cheese/i, category: "Sides" },
  { test: /salad|wrap|parf|yogurt/i, category: "Cold" },
];

export function suggestCategory(name: string): string | null {
  return RULES.find((r) => r.test.test(name))?.category ?? null;
}
