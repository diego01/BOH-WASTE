"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown, IconClose, IconSearch } from "./icons";
import { useT } from "./I18nProvider";

import { cx } from "@/lib/cx";

export { cx };

/* ---------- Bottom sheet ---------- */

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useT();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={t("Close", "Cerrar")} className="animate-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-sheet-up relative mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label={t("Close", "Cerrar")} className="-mr-2 grid h-11 w-11 place-items-center rounded-full active:bg-gray-100">
            <IconClose />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Confirm dialog ---------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-6" role="alertdialog" aria-modal="true">
      <button aria-label={t("Cancel", "Cancelar")} className="animate-fade-in absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="animate-fade-in relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-bold">{title}</h3>
        <div className="mt-2 text-[15px] text-muted">{message}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {t("Cancel", "Cancelar")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel ?? t("Confirm", "Confirmar")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Buttons & fields ---------- */

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      {...props}
      className={cx(
        "h-12 rounded-xl px-4 text-[16px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed",
        variant === "primary" && "bg-brand-dark text-white disabled:bg-brand-soft disabled:text-white",
        variant === "secondary" && "bg-gray-100 text-ink disabled:opacity-50",
        variant === "danger" && "bg-bad text-white disabled:opacity-50",
        variant === "ghost" && "text-brand-dark disabled:opacity-50",
        className,
      )}
    />
  );
}

export function Label({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <div className={cx("mb-1.5 mt-5", strong ? "text-lg font-bold" : "text-[15px] font-medium text-muted")}>{children}</div>;
}

export const fieldClass =
  "h-14 w-full rounded-xl border border-line bg-field px-4 text-[17px] outline-none focus:border-brand focus:bg-white";

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClass, props.className)} />;
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(fieldClass, "appearance-none pr-10")}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        "relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50",
        checked ? "bg-brand/60" : "bg-gray-300",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-7 w-7 rounded-full shadow transition-all",
          checked ? "left-[26px] bg-brand-dark" : "left-0.5 bg-white",
        )}
      />
    </button>
  );
}

/** Pill chips; multi or single select. */
export function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  colorFor,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
  colorFor?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            style={on && colorFor ? { background: colorFor(o.value), borderColor: colorFor(o.value) } : undefined}
            className={cx(
              "flex h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition",
              on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink",
            )}
          >
            {on && <IconCheck width={16} height={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Dropdown multi-select with search, like the reference "Select categories". */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())),
    [options, q],
  );
  const labels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(fieldClass, "flex items-center justify-between text-left", open && "border-brand bg-white")}
      >
        <span className={cx("truncate", !labels.length && "font-medium")}>{labels.length ? labels.join(", ") : placeholder}</span>
        <IconChevronDown className={cx("shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-line bg-white p-3 shadow-xl">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search...", "Buscar...")}
              className="h-11 w-full rounded-lg border border-line pl-9 pr-3 outline-none focus:border-brand"
            />
          </div>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => onChange(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
                    className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-[16px] font-medium active:bg-gray-50"
                  >
                    <span
                      className={cx(
                        "grid h-5 w-5 place-items-center rounded-full border-2",
                        on ? "border-brand-dark bg-brand-dark text-white" : "border-gray-400",
                      )}
                    >
                      {on && <IconCheck width={12} height={12} strokeWidth={3} />}
                    </span>
                    {o.label}
                  </button>
                </li>
              );
            })}
            {!filtered.length && <li className="px-2 py-3 text-muted">{t("No matches", "Sin resultados")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useT();
  return (
    <div className="relative">
      <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("Search", "Buscar")}
        className="h-14 w-full rounded-xl border border-line bg-white pl-12 pr-4 text-[17px] outline-none focus:border-brand"
      />
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[15px] text-bad">{children}</p>;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "waste" | "donation" | "brand" | "warn" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tone === "gray" && "bg-gray-100 text-muted",
        tone === "waste" && "bg-waste-soft text-waste",
        tone === "donation" && "bg-donation-soft text-donation",
        tone === "brand" && "bg-brand-soft text-brand-dark",
        tone === "warn" && "bg-amber-100 text-amber-800",
      )}
    >
      {children}
    </span>
  );
}
