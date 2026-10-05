"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { validatePin } from "@/lib/domain";
import { isLang, pickMsg } from "@/lib/i18n";
import { getT } from "@/lib/i18nServer";
import { setLangCookie } from "../language/actions";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export type LoginState = { error?: string } | undefined;

export async function login(userId: string, pin: string): Promise<LoginState> {
  const { t } = await getT();
  const wrong = t("Wrong PIN", "PIN incorrecto");
  const parsed = z.object({ userId: z.uuid(), pin: z.string().regex(/^\d{4,8}$/) }).safeParse({ userId, pin });
  if (!parsed.success) return { error: wrong };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user || !user.active) return { error: wrong };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      error: t(`Too many attempts. Try again in ${mins} min or ask an Admin.`, `Demasiados intentos. Intenta en ${mins} min o pide ayuda a un Admin.`),
    };
  }

  const ok = await bcrypt.compare(pin, user.pinHash);
  if (!ok) {
    const attempts = user.failedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await db
      .update(schema.users)
      .set({
        failedAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      })
      .where(eq(schema.users.id, user.id));
    const left = MAX_ATTEMPTS - attempts;
    return {
      error: lock
        ? t(`Too many attempts. Locked for ${LOCK_MINUTES} min.`, `Demasiados intentos. Bloqueado por ${LOCK_MINUTES} min.`)
        : t(`Wrong PIN (${left} left)`, `PIN incorrecto (quedan ${left})`),
    };
  }

  await db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, user.id));
  await createSession(user);
  // Each person's saved language follows them on a shared phone.
  if (isLang(user.language)) await setLangCookie(user.language);
  redirect(user.mustChangePin ? "/change-pin" : "/log");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePin(newPin: string, confirm: string): Promise<LoginState> {
  const { t, lang } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (newPin !== confirm) return { error: t("PINs don't match", "Los PIN no coinciden") };
  const err = validatePin(newPin, user.role);
  if (err) return { error: pickMsg(err, lang) };

  const [row] = await db.select({ pinHash: schema.users.pinHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (row && (await bcrypt.compare(newPin, row.pinHash))) {
    return { error: t("Choose a PIN different from the current one", "Elige un PIN distinto al actual") };
  }

  await db
    .update(schema.users)
    .set({ pinHash: await bcrypt.hash(newPin, 10), mustChangePin: false, updatedAt: sql`now()` })
    .where(eq(schema.users.id, user.id));
  await db.insert(schema.auditLog).values({ userId: user.id, entity: "user", entityId: user.id, action: "pin.change" });
  await createSession({ ...user, mustChangePin: false });
  redirect("/log");
}
