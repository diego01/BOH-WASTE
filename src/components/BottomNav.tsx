"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/auth/permissions";
import { IconAccount, IconHistory, IconLog, IconReports, IconSettings } from "./icons";
import { useT } from "./I18nProvider";
import { cx } from "./ui";

const ICONS = { log: IconLog, history: IconHistory, reports: IconReports, settings: IconSettings, account: IconAccount };

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useT();
  const LABEL = {
    log: t("Waste", "Waste"),
    history: t("History", "Historial"),
    reports: t("Reports", "Reportes"),
    settings: t("Settings", "Ajustes"),
    account: t("Account", "Cuenta"),
  };
  // Longest matching href wins, so /log/history doesn't also light up /log.
  const activeHref = items
    .filter((it) => pathname === it.href || pathname.startsWith(it.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {items.map((it) => {
          const Icon = ICONS[it.icon];
          const active = it.href === activeHref;
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={cx("flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium", active ? "text-brand-dark" : "text-muted")}
              >
                <Icon width={26} height={26} />
                {LABEL[it.icon]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
