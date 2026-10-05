import type { Unit } from "@/db/schema";
import { labels, type Lang } from "./i18n";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Full precision is kept everywhere; round only for display. */
export function fmtMoney(n: number): string {
  return money.format(n);
}

export function fmtQty(n: number, unit?: Unit, lang: Lang = "en"): string {
  const v = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
  return unit ? `${v} ${labels(lang).unitShort[unit]}` : v;
}

/** RFC4122 v4; crypto.randomUUID is missing on plain-http LAN testing (insecure context). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* insecure context */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
