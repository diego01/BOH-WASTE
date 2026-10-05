import { jwtVerify, SignJWT } from "jose";
import { sessionSecret } from "./token";

/**
 * Offline entries are queued on the device and may sync after the person who
 * made them has signed out (shared phone). Each queued entry carries this
 * signed token, so the server credits the right user without trusting a raw
 * user id from the client, and without needing the current session.
 */
export const ENTRY_TOKEN_DAYS = 7;

export async function signEntryToken(userId: string): Promise<string> {
  return new SignJWT({ k: "entry" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ENTRY_TOKEN_DAYS}d`)
    .sign(sessionSecret());
}

export async function verifyEntryToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return payload.k === "entry" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
