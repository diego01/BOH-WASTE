import type { Daypart, ProductType, Role, Unit } from "@/db/schema";
import { bi } from "./i18n";

export const DAYPARTS: Daypart[] = ["BREAKFAST", "LUNCH", "AFTERNOON", "DINNER"];

export const DAYPART_LABEL: Record<Daypart, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  AFTERNOON: "Afternoon",
  DINNER: "Dinner",
};

export const UNITS: Unit[] = ["LB", "EACH", "OZ", "BAG_50OZ"];

export const UNIT_LABEL: Record<Unit, string> = {
  LB: "Pounds",
  EACH: "Each",
  OZ: "Ounces",
  BAG_50OZ: "Bag (50 oz)",
};

export const UNIT_SHORT: Record<Unit, string> = {
  LB: "lb",
  EACH: "each",
  OZ: "oz",
  BAG_50OZ: "bag 50 oz",
};

export const PRODUCT_TYPES: ProductType[] = ["WASTE", "DONATION"];

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  WASTE: "Waste",
  DONATION: "Donation",
};

export const ROLES: Role[] = ["ADMIN", "TEAM_LEADER", "TEAM_MEMBER"];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  TEAM_LEADER: "Team Leader",
  TEAM_MEMBER: "Team Member",
};

/** Admins need a longer PIN than kitchen staff. */
export function pinRule(role: Role): { min: number; max: number } {
  return role === "ADMIN" ? { min: 6, max: 8 } : { min: 4, max: 6 };
}

/** Returns a bilingual message ("English||Español") or null. */
export function validatePin(pin: string, role: Role): string | null {
  const { min, max } = pinRule(role);
  if (!/^\d+$/.test(pin)) return bi("PIN must contain digits only", "El PIN solo puede tener números");
  if (pin.length < min || pin.length > max) return bi(`PIN must be ${min}–${max} digits`, `El PIN debe tener ${min}–${max} dígitos`);
  return null;
}

export const AREA_COLORS = [
  "#2196F3",
  "#F44336",
  "#4CAF50",
  "#E91E63",
  "#FF9800",
  "#9C27B0",
  "#009688",
  "#607D8B",
];
