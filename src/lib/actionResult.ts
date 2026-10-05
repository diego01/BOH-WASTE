import "server-only";
import { z } from "zod";
import { AuthError, requireCap, type CurrentUser } from "@/lib/auth/session";
import { bi, pickMsg } from "@/lib/i18n";
import { getLang } from "@/lib/i18nServer";
import type { Capability } from "@/lib/auth/permissions";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Expected failure shown to the user; message may be bilingual ("English||Español"). */
export class UserError extends Error {}

function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^\d{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Runs a mutation behind a capability check and turns expected failures into
 * a message the UI can show. Unexpected errors are logged and stay generic.
 */
export async function runAction<T>(cap: Capability, fn: (user: CurrentUser) => Promise<T>): Promise<ActionResult<T>> {
  const fail = async (msg: string): Promise<ActionResult<T>> => ({ ok: false, error: pickMsg(msg, await getLang()) });
  try {
    const user = await requireCap(cap);
    return { ok: true, data: await fn(user) };
  } catch (e) {
    if (e instanceof AuthError || e instanceof UserError) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? bi("Invalid data", "Datos no válidos"));
    if (pgCode(e) === "23505") return fail(bi("That name or code is already in use", "Ese nombre o código ya está en uso"));
    console.error(e);
    return fail(bi("Something went wrong. Try again.", "Algo salió mal. Inténtalo de nuevo."));
  }
}
