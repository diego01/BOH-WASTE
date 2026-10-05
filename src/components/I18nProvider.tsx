"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { labels, locale, makeT, pickMsg, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("en");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

/** t("English", "Español"), plus labels and helpers for the current language. */
export function useT() {
  const lang = useContext(Ctx);
  return useMemo(
    () => ({ lang, t: makeT(lang), L: labels(lang), locale: locale(lang), msg: (m: string) => pickMsg(m, lang) }),
    [lang],
  );
}
