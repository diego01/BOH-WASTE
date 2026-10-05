import { describe, expect, it } from "vitest";
import { can, capabilityForPath, navFor } from "@/lib/auth/permissions";

describe("permission matrix", () => {
  it("everyone can log waste and change the daypart", () => {
    for (const role of ["ADMIN", "TEAM_LEADER", "TEAM_MEMBER"] as const) {
      expect(can(role, "entries:create")).toBe(true);
      expect(can(role, "entries:changeDaypart")).toBe(true);
    }
  });

  it("reports: Admin and Team Leader only", () => {
    expect(can("ADMIN", "reports:view")).toBe(true);
    expect(can("TEAM_LEADER", "reports:view")).toBe(true);
    expect(can("TEAM_MEMBER", "reports:view")).toBe(false);
  });

  it("settings and users: Admin only", () => {
    for (const cap of ["settings:view", "settings:edit", "users:manage"] as const) {
      expect(can("ADMIN", cap)).toBe(true);
      expect(can("TEAM_LEADER", cap)).toBe(false);
      expect(can("TEAM_MEMBER", cap)).toBe(false);
    }
  });

  it("guards routes by prefix, including direct URLs and APIs", () => {
    expect(capabilityForPath("/settings")).toBe("settings:view");
    expect(capabilityForPath("/settings/users")).toBe("settings:view");
    expect(capabilityForPath("/api/settings/import")).toBe("settings:view");
    expect(capabilityForPath("/reports")).toBe("reports:view");
    expect(capabilityForPath("/settingsx")).toBeNull();
    expect(capabilityForPath("/log")).toBeNull();
  });

  it("bottom nav adapts to the profile", () => {
    expect(navFor("TEAM_MEMBER").map((n) => n.href)).toEqual(["/log", "/log/history", "/account"]);
    expect(navFor("TEAM_LEADER").map((n) => n.href)).toEqual(["/log", "/log/history", "/reports", "/account"]);
    expect(navFor("ADMIN").map((n) => n.href)).toEqual(["/log", "/log/history", "/reports", "/settings", "/account"]);
  });
});
