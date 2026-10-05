"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLanguage } from "@/app/language/actions";
import { LANGS } from "@/lib/i18n";
import { cx } from "@/lib/cx";
import { useT } from "./I18nProvider";

export function LangToggle({ className }: { className?: string }) {
  const { lang, t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("Language", "Idioma")} className={cx("inline-flex rounded-full bg-gray-200/80 p-1", pending && "opacity-60", className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          aria-pressed={lang === l}
          onClick={() =>
            start(async () => {
              await setLanguage(l);
              router.refresh();
            })
          }
          className={cx("h-9 min-w-12 rounded-full px-3 text-sm font-bold", lang === l ? "bg-white text-brand-dark shadow-sm" : "text-muted")}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
