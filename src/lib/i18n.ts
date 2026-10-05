import type { Daypart, ProductType, Role, Unit } from "@/db/schema";

/**
 * Two languages, chosen per person (saved on the user) and per device (cookie).
 * UI text is written inline as t("English", "Español") so both versions sit
 * side by side. Server messages travel as "English||Español" and are split for
 * the reader's language (see pickMsg).
 */
export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];
export const LANG_COOKIE = "boh_lang";

export type T = (en: string, es: string) => string;

export function makeT(lang: Lang): T {
  return (en, es) => (lang === "es" ? es : en);
}

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "es";
}

/** "English||Español" → the reader's half (plain strings pass through). */
export function pickMsg(msg: string, lang: Lang): string {
  const i = msg.indexOf("||");
  if (i < 0) return msg;
  return lang === "es" ? msg.slice(i + 2) : msg.slice(0, i);
}

/** Bilingual message for server errors / zod messages. */
export function bi(en: string, es: string): string {
  return `${en}||${es}`;
}

export function locale(lang: Lang): string {
  return lang === "es" ? "es-US" : "en-US";
}

type Labels = {
  daypart: Record<Daypart, string>;
  unit: Record<Unit, string>;
  unitShort: Record<Unit, string>;
  type: Record<ProductType, string>;
  role: Record<Role, string>;
  weekdays: string[];
  weekdaysShort: string[];
};

const LABELS: Record<Lang, Labels> = {
  en: {
    daypart: { BREAKFAST: "Breakfast", LUNCH: "Lunch", AFTERNOON: "Afternoon", DINNER: "Dinner" },
    unit: { LB: "Pounds", EACH: "Each", OZ: "Ounces", BAG_50OZ: "Bag (50 oz)" },
    unitShort: { LB: "lb", EACH: "each", OZ: "oz", BAG_50OZ: "bag 50 oz" },
    type: { WASTE: "Waste", DONATION: "Donation" },
    role: { ADMIN: "Admin", TEAM_LEADER: "Team Leader", TEAM_MEMBER: "Team Member" },
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  es: {
    // Store terms: the team uses the English daypart names in both languages.
    daypart: { BREAKFAST: "Breakfast", LUNCH: "Lunch", AFTERNOON: "Afternoon", DINNER: "Dinner" },
    unit: { LB: "Libras", EACH: "Unidades", OZ: "Onzas", BAG_50OZ: "Bolsa (50 oz)" },
    unitShort: { LB: "lb", EACH: "unid.", OZ: "oz", BAG_50OZ: "bolsa 50 oz" },
    type: { WASTE: "Waste", DONATION: "Donación" },
    role: { ADMIN: "Admin", TEAM_LEADER: "Team Leader", TEAM_MEMBER: "Team Member" },
    weekdays: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
    weekdaysShort: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  },
};

export function labels(lang: Lang): Labels {
  return LABELS[lang];
}

/** "Today" / "Yesterday" / "Mon, Oct 5" for a store date "YYYY-MM-DD". */
export function dayLabel(date: string, today: string, lang: Lang): string {
  const t = makeT(lang);
  if (date === today) return t("Today", "Hoy");
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (date === y.toISOString().slice(0, 10)) return t("Yesterday", "Ayer");
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(lang), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 5" style short date. */
export function shortDate(date: string, lang: Lang): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(lang), { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Accept-Language → "es" when Spanish comes first, else "en". */
export function langFromHeader(header: string | null): Lang {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : "en";
}
