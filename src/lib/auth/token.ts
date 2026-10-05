import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/db/schema";

/** DB-free token helpers, safe to import from proxy.ts. */

export const SESSION_COOKIE = "boh_session";
export const SESSION_HOURS = 12;

export type SessionPayload = { uid: string; role: Role; mcp: boolean };

export function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ chars)");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-0000");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(sessionSecret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
