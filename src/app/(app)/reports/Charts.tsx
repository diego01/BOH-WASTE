"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { cx } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

/* Chart roles: one hue for "real", a neutral ink for the allowance reference. Text stays in text colors. */
const REAL = "#2a78d6";
const REF = "#52514e";

/** Horizontal bars with direct value labels: magnitude by category (dayparts, reasons, areas…). */
export function HBarList({ rows, emptyText }: { rows: { name: string; value: number; note?: string }[]; emptyText?: string }) {
  const { t } = useT();
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max <= 0) return <p className="text-sm text-muted">{emptyText ?? t("No data", "Sin datos")}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {fmtMoney(r.value)}
              {r.note && <span className="ml-1 font-normal text-muted">{r.note}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-gray-100">
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${Math.max(0, (r.value / max) * 100)}%`, minWidth: r.value > 0 ? 4 : 0, background: REAL }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Daily real (bars) against the day's allowance (reference ticks), one $ axis. Tap a day for its values. */
export function DailyChart({ days }: { days: { date: string; real: number; allowance: number; operating: boolean }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const { t, locale } = useT();
  const hasAllowance = days.some((d) => d.allowance > 0);
  const max = Math.max(1, ...days.map((d) => Math.max(d.real, d.allowance)));
  const W = 340;
  const H = 150;
  const padB = 18;
  const n = days.length;
  const slot = W / n;
  const barW = Math.max(2, Math.min(18, slot - 2));
  const y = (v: number) => H - padB - (Math.max(0, v) / max) * (H - padB - 8);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const shown = active ?? null;
  const tickEvery = Math.ceil(n / 6);

  return (
    <div>
      <div className="mb-2 flex min-h-10 items-end justify-between gap-2 text-sm">
        {shown !== null ? (
          <span>
            <b>{label(days[shown].date)}</b>
            {!days[shown].operating && <span className="text-muted">{t(" · closed", " · cerrado")}</span>}
            <br />
            Real <b className="tabular-nums">{fmtMoney(days[shown].real)}</b>
            {hasAllowance && (
              <>
                {" "}
                · Allowance <b className="tabular-nums">{fmtMoney(days[shown].allowance)}</b>
              </>
            )}
          </span>
        ) : (
          <span className="text-muted">{t("Tap a day for details", "Toca un día para ver detalle")}</span>
        )}
        <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: REAL }} />
            Real
          </span>
          {hasAllowance && (
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3" style={{ background: REF }} />
              Allowance
            </span>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-manipulation" role="img" aria-label={t("Daily real versus allowance", "Real por día vs. allowance")}>
        <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke="#e5e7eb" />
        {days.map((d, i) => {
          const cx0 = i * slot + slot / 2;
          const top = y(d.real);
          return (
            <g key={d.date} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} className="cursor-pointer">
              {/* oversized hit target */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {d.real > 0 && (
                <g fill={REAL} opacity={active === null || active === i ? 1 : 0.45}>
                  {/* rounded data end, square baseline end */}
                  <rect x={cx0 - barW / 2} y={top} width={barW} height={H - padB - top} rx={Math.min(3, barW / 2)} />
                  <rect x={cx0 - barW / 2} y={(top + H - padB) / 2} width={barW} height={(H - padB - top) / 2} />
                </g>
              )}
              {hasAllowance && d.allowance > 0 && (
                <line
                  x1={cx0 - slot / 2 + 1}
                  x2={cx0 + slot / 2 - 1}
                  y1={y(d.allowance)}
                  y2={y(d.allowance)}
                  stroke={REF}
                  strokeWidth={2}
                />
              )}
              {!d.operating && <circle cx={cx0} cy={H - padB + 5} r={1.5} fill="#9ca3af" />}
              {i % tickEvery === 0 && (
                <text x={cx0} y={H - 2} textAnchor="middle" fontSize={9} fill="#6b7280">
                  {label(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted">
        {t("Closed days are hidden unless something was logged (gray dot).", "Los días cerrados no se muestran salvo que tengan registros (punto gris).")}
      </p>
    </div>
  );
}

export function Diff({ value, className }: { value: number; className?: string }) {
  const r = Math.round(value * 100) / 100;
  const neg = r < 0;
  const abs = fmtMoney(Math.abs(r));
  return (
    <span className={cx("whitespace-nowrap font-semibold tabular-nums", neg ? "text-bad" : "text-good", className)}>
      {neg ? `−${abs}` : `+${abs}`}
    </span>
  );
}

type Seg = { key: string; from: number; to: number; color: string; label: string; amount: number; tone?: "good" | "bad" };

/**
 * Month-to-date bar. Left of the black mark: spent within the allowance
 * prorated to today. Right of it (red): spent over that pace, i.e. the excess
 * to date. Hover or tap a segment to see its amount.
 */
export function MtdBar({ used, pace, month }: { used: number; pace: number; month: number }) {
  const [active, setActive] = useState<string | null>(null);
  const { t } = useT();
  const scale = Math.max(month, used, pace, 0.01);
  const p = (v: number) => (Math.max(0, v) / scale) * 100;
  const within = Math.min(used, pace);
  const segs: Seg[] = [];
  if (within > 0) segs.push({ key: "within", from: 0, to: within, color: REAL, label: t("Spent within pace", "Gastado dentro del ritmo"), amount: within });
  if (used > pace)
    segs.push({
      key: "over",
      from: pace,
      to: used,
      color: "#d32f2f",
      label: t("Over the allowance to date", "Excedido del allowance a la fecha"),
      amount: used - pace,
      tone: "bad",
    });
  if (pace > used)
    segs.push({
      key: "under",
      from: used,
      to: pace,
      color: "#a5d6a7",
      label: t("Below pace (still available to date)", "Bajo el ritmo (aún disponible a la fecha)"),
      amount: pace - used,
      tone: "good",
    });
  const end = Math.max(used, pace);
  if (month > end)
    segs.push({ key: "rest", from: end, to: month, color: "#f3f4f6", label: t("Rest of the month's allowance", "Resto del allowance del mes"), amount: month - end });
  const shown = segs.find((s) => s.key === active);

  // Hit zones are wider than the marks: everything right of the black mark
  // answers with the excess to date (or the rest of the month when on pace).
  const zones: { key: string; from: number; to: number }[] = [];
  if (within > 0) zones.push({ key: "within", from: 0, to: p(within) });
  if (pace > used) zones.push({ key: "under", from: p(used), to: p(pace) });
  const rightKey = used > pace ? "over" : month > end ? "rest" : null;
  if (rightKey) zones.push({ key: rightKey, from: p(pace), to: 100 });

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="mb-1.5 min-h-5 text-sm">
        {shown ? (
          <span>
            {shown.label}:{" "}
            <b className={cx("tabular-nums", shown.tone === "bad" && "text-bad", shown.tone === "good" && "text-good")}>
              {fmtMoney(shown.amount)}
            </b>
          </span>
        ) : (
          <span className="text-muted">{t("Hover or tap the bar for amounts", "Pasa el mouse o toca la barra para ver montos")}</span>
        )}
      </div>
      <div className="relative h-8 touch-manipulation">
        <div className="absolute inset-x-0 top-2 h-4 overflow-hidden rounded-full bg-gray-100">
          {segs.map((s) => (
            <div
              key={s.key}
              className="absolute top-0 h-4 transition-opacity"
              style={{
                left: `${p(s.from)}%`,
                width: `${p(s.to) - p(s.from)}%`,
                minWidth: s.key === "over" ? 4 : undefined,
                background: s.color,
                opacity: active && active !== s.key ? 0.4 : 1,
                boxShadow: active === s.key ? "inset 0 0 0 2px rgba(0,0,0,0.35)" : undefined,
              }}
            />
          ))}
        </div>
        {zones.map((z) => {
          const s = segs.find((x) => x.key === z.key)!;
          return (
            <div
              key={z.key}
              role="button"
              tabIndex={0}
              aria-label={`${s.label}: ${fmtMoney(s.amount)}`}
              onMouseEnter={() => setActive(z.key)}
              onFocus={() => setActive(z.key)}
              onClick={() => setActive(z.key)}
              className="absolute top-0 h-8 cursor-pointer outline-none"
              style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }}
            />
          );
        })}
        <div className="pointer-events-none absolute top-0 h-8 w-0.5 bg-ink" style={{ left: `${p(pace)}%` }} />
      </div>
    </div>
  );
}
