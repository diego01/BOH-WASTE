"use client";

import { IconBackspace } from "./icons";
import { useT } from "./I18nProvider";
import { cx } from "./ui";

/** Big glove-friendly keypad. */
export function PinPad({
  value,
  onChange,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  disabled?: boolean;
}) {
  const { t } = useT();
  const press = (k: string) => {
    if (disabled) return;
    if (k === "del") onChange(value.slice(0, -1));
    else if (value.length < maxLength) onChange(value + k);
  };
  return (
    <div>
      <div className="mb-6 flex justify-center gap-3" aria-label={t(`${value.length} digits entered`, `${value.length} dígitos ingresados`)}>
        {Array.from({ length: Math.max(maxLength, 4) }).map((_, i) => (
          <span
            key={i}
            className={cx("h-4 w-4 rounded-full border-2 border-brand-dark", i < value.length && "bg-brand-dark")}
          />
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => press(k)}
              aria-label={k === "del" ? t("Delete", "Borrar") : k}
              className="grid h-[72px] place-items-center rounded-2xl bg-white text-3xl font-medium shadow-sm active:bg-brand-soft disabled:opacity-50"
            >
              {k === "del" ? <IconBackspace /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
