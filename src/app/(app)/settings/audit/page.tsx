import Link from "next/link";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { cx } from "@/lib/cx";
import { requirePageUser } from "@/lib/auth/session";
import { auditChanges, auditLabel } from "@/lib/auditSummary";
import { loadScheduleConfig } from "@/lib/storeConfig";
import { locale } from "@/lib/i18n";
import { getT } from "@/lib/i18nServer";

const PAGE = 50;
const FILTERS = [
  { key: "", en: "All", es: "Todo" },
  { key: "entry", en: "Entries", es: "Registros" },
  { key: "product", en: "Products", es: "Productos" },
  { key: "allowance", en: "Allowance", es: "Allowance" },
  { key: "user", en: "Users", es: "Usuarios" },
  { key: "schedule", en: "Schedule", es: "Horarios" },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; before?: string }> }) {
  await requirePageUser("settings:view");
  const { entity = "", before } = await searchParams;
  const { timezone } = await loadScheduleConfig(db);
  const { t, lang } = await getT();

  const where: SQL[] = [];
  if (entity) where.push(eq(schema.auditLog.entity, entity));
  const cursor = Number(before);
  if (Number.isInteger(cursor) && cursor > 0) where.push(lt(schema.auditLog.id, cursor));

  const rows = await db
    .select({
      id: schema.auditLog.id,
      at: schema.auditLog.at,
      entity: schema.auditLog.entity,
      entityId: schema.auditLog.entityId,
      action: schema.auditLog.action,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      user: schema.users.name,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.auditLog.id))
    .limit(PAGE + 1);

  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const fmt = (d: Date) =>
    d.toLocaleString(locale(lang), { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="pb-8">
      <p className="text-[15px] leading-snug text-ink/80">{t("Every change to settings, users and logged entries: who, when and what changed.", "Cada cambio en ajustes, usuarios y registros: quién, cuándo y qué cambió.")}</p>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/settings/audit?entity=${f.key}` : "/settings/audit"}
              className={cx("flex h-10 items-center rounded-full px-4 text-[15px] font-medium", entity === f.key ? "bg-ink text-white" : "bg-white shadow-sm")}
            >
              {lang === "es" ? f.es : f.en}
            </Link>
          ))}
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
        {list.map((r) => {
          const changes = auditChanges(r.before, r.after);
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{auditLabel(r.entity, r.action, lang)}</span>
                <span className="shrink-0 text-xs text-muted">{fmt(r.at)}</span>
              </div>
              <div className="text-sm text-muted">
                <span className="capitalize">{r.user ?? t("System", "Sistema")}</span>
                {r.entityId && r.entity !== "entry" && <span> · #{r.entityId}</span>}
              </div>
              {changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-ink/80">
                  {changes.map((c, i) => (
                    <li key={i} className="break-words">
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {!list.length && <li className="px-4 py-4 text-muted">{t("No changes recorded.", "No hay cambios registrados.")}</li>}
      </ul>
      {more && (
        <Link
          href={`/settings/audit?${new URLSearchParams({ ...(entity ? { entity } : {}), before: String(list.at(-1)!.id) })}`}
          className="mt-3 flex h-12 items-center justify-center rounded-xl bg-white font-medium text-brand-dark shadow-sm"
        >
          {t("Older changes", "Cambios anteriores")}
        </Link>
      )}
    </div>
  );
}
