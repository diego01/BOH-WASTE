import type { Role } from "@/db/schema";

/**
 * Single source of truth for the permission matrix.
 * Used by the proxy (route redirects), server actions/route handlers
 * (enforcement) and the UI (what to show).
 */
export type Capability =
  | "entries:create"
  | "entries:changeDaypart"
  | "reports:view"
  | "settings:view"
  | "settings:edit"
  | "users:manage";

const MATRIX: Record<Capability, Role[]> = {
  "entries:create": ["ADMIN", "TEAM_LEADER", "TEAM_MEMBER"],
  "entries:changeDaypart": ["ADMIN", "TEAM_LEADER", "TEAM_MEMBER"],
  "reports:view": ["ADMIN", "TEAM_LEADER"],
  "settings:view": ["ADMIN"],
  "settings:edit": ["ADMIN"],
  "users:manage": ["ADMIN"],
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  return !!role && MATRIX[cap].includes(role);
}

/** Route prefix → capability required to open it. */
export const ROUTE_CAPABILITIES: { prefix: string; cap: Capability }[] = [
  { prefix: "/reports", cap: "reports:view" },
  { prefix: "/api/reports", cap: "reports:view" },
  { prefix: "/settings", cap: "settings:view" },
  { prefix: "/api/settings", cap: "settings:view" },
];

export function capabilityForPath(pathname: string): Capability | null {
  const hit = ROUTE_CAPABILITIES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  return hit?.cap ?? null;
}

export type NavItem = { href: string; label: string; icon: "log" | "history" | "reports" | "settings" | "account" };

export function navFor(role: Role): NavItem[] {
  const items: NavItem[] = [
    { href: "/log", label: "Waste", icon: "log" },
    { href: "/log/history", label: "History", icon: "history" },
  ];
  if (can(role, "reports:view")) items.push({ href: "/reports", label: "Reports", icon: "reports" });
  if (can(role, "settings:view")) items.push({ href: "/settings", label: "Settings", icon: "settings" });
  items.push({ href: "/account", label: "Account", icon: "account" });
  return items;
}
