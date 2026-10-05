import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { bi } from "@/lib/i18n";
import { can, type Capability } from "./permissions";
import { SESSION_COOKIE, SESSION_HOURS, signSession, verifySession, type SessionPayload } from "./token";

export type CurrentUser = {
  id: string;
  name: string;
  role: SessionPayload["role"];
  mustChangePin: boolean;
};

export async function createSession(user: { id: string; role: SessionPayload["role"]; mustChangePin: boolean }) {
  const token = await signSession({ uid: user.id, role: user.role, mcp: user.mustChangePin });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Data-access-layer check: verifies the cookie AND re-reads the user, so a
 * deactivated user or a role change takes effect immediately, not at token expiry.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      active: schema.users.active,
      mustChangePin: schema.users.mustChangePin,
    })
    .from(schema.users)
    .where(eq(schema.users.id, payload.uid));
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, role: user.role, mustChangePin: user.mustChangePin };
});

/** For pages: redirects instead of throwing. */
export async function requirePageUser(cap?: Capability): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePin) redirect("/change-pin");
  if (cap && !can(user.role, cap)) redirect("/log");
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403,
  ) {
    super(message);
  }
}

/** For server actions and route handlers: throws so nothing runs without permission. */
export async function requireCap(cap: Capability): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(bi("Not signed in", "No has iniciado sesión"), 401);
  if (user.mustChangePin) throw new AuthError(bi("PIN change required", "Debes cambiar tu PIN"), 403);
  if (!can(user.role, cap)) throw new AuthError(bi("Not allowed", "No tienes permiso"), 403);
  return user;
}
