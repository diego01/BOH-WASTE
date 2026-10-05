import "server-only";
import { cookies, headers } from "next/headers";
import { isLang, LANG_COOKIE, langFromHeader, makeT, type Lang } from "./i18n";

/** Device choice (cookie) first, then the phone's language. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  return langFromHeader((await headers()).get("accept-language"));
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
