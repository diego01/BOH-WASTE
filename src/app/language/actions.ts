"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isLang, LANG_COOKIE, type Lang } from "@/lib/i18n";

export async function setLangCookie(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
}

/** Device + (when signed in) the person's saved preference. */
export async function setLanguage(lang: string) {
  if (!isLang(lang)) return;
  await setLangCookie(lang);
  const user = await getCurrentUser();
  if (user) await db.update(schema.users).set({ language: lang }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
}
