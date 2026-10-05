"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useT } from "@/components/I18nProvider";
import { cx } from "@/components/ui";

const TABS: { href: string; en: string; es: string }[] = [
  { href: "/settings/products", en: "Products", es: "Productos" },
  { href: "/settings/areas", en: "Areas", es: "Áreas" },
  { href: "/settings/categories", en: "Categories", es: "Categorías" },
  { href: "/settings/allowance", en: "Allowance", es: "Allowance" },
  { href: "/settings/schedule", en: "Schedule", es: "Horarios" },
  { href: "/settings/days", en: "Days", es: "Días" },
  { href: "/settings/reasons", en: "Reasons", es: "Motivos" },
  { href: "/settings/users", en: "Users", es: "Usuarios" },
  { href: "/settings/import", en: "Import", es: "Importar" },
  { href: "/settings/audit", en: "Audit", es: "Auditoría" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { lang } = useT();
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);
  return (
    <div className="my-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <div className="mx-auto flex w-max gap-1 rounded-xl bg-gray-200/70 p-1">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              ref={active ? activeRef : undefined}
              className={cx(
                "flex h-11 items-center rounded-lg px-3.5 text-[16px] font-semibold",
                active ? "bg-white text-brand-dark shadow-sm" : "text-ink",
              )}
            >
              {lang === "es" ? t.es : t.en}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
