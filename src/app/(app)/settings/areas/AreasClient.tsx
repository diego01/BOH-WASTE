"use client";

import { useState, useTransition } from "react";
import { IconPlus } from "@/components/icons";
import { BottomSheet, Button, ConfirmDialog, cx, ErrorText, Label, TextField, Toggle } from "@/components/ui";
import { AREA_COLORS } from "@/lib/domain";
import { useT } from "@/components/I18nProvider";
import type { SettingsArea } from "@/lib/settingsData";
import { deleteArea, saveArea } from "../actions";

type Draft = { id?: number; name: string; color: string; active: boolean; productCount: number };

export function AreasClient({ areas }: { areas: SettingsArea[] }) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <>
      <p className="text-[15px] leading-snug text-ink/80">
        {t(
          "Group your products into waste areas that make sense for your store. Today everything lives in BOH; you can add more areas any time.",
          "Agrupa tus productos en áreas de waste que tengan sentido para tu tienda. Hoy todo está en BOH; puedes agregar más áreas cuando quieras.",
        )}
      </p>
      <ul className="mt-4 space-y-3">
        {areas.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => setDraft({ ...a })}
              style={{ background: a.color }}
              className={cx("flex h-14 w-full items-center justify-between rounded-xl px-4 text-white", !a.active && "opacity-50")}
            >
              <span className="text-xl font-bold">
                {a.name}
                {!a.active && <span className="ml-2 text-sm font-medium">({t("inactive", "inactiva")})</span>}
              </span>
              <span className="text-sm font-semibold">{t("Product Count", "Productos")}: {a.productCount}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="mt-4 flex w-full items-center justify-center gap-2"
        onClick={() => setDraft({ name: "", color: AREA_COLORS[areas.length % AREA_COLORS.length], active: true, productCount: 0 })}
      >
        <IconPlus /> {t("Add area", "Agregar área")}
      </Button>
      {draft && <AreaSheet key={draft.id ?? "new"} initial={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

function AreaSheet({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { t } = useT();
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) onClose();
      else setError(res.error);
    });

  return (
    <BottomSheet
      open
      title={initial.id ? t("Edit Area", "Editar área") : t("New Area", "Nueva área")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button
            className="w-full"
            disabled={!dirty || !d.name.trim() || pending}
            onClick={() => run(() => saveArea({ id: d.id, name: d.name, color: d.color, active: d.active }))}
          >
            {t("Save", "Guardar")}
          </Button>
          {initial.id && (
            <button onClick={() => setConfirm(true)} className="mt-1 h-11 w-full font-semibold text-bad">
              {t("Delete Area", "Eliminar área")}
            </button>
          )}
        </div>
      }
    >
      <Label>{t("Name", "Nombre")}</Label>
      <TextField value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <Label>{t("Color", "Color")}</Label>
      <div className="flex flex-wrap gap-3">
        {AREA_COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            aria-pressed={d.color === c}
            onClick={() => setD({ ...d, color: c })}
            style={{ background: c }}
            className={cx("h-12 w-12 rounded-full", d.color === c && "ring-4 ring-ink/30 ring-offset-2")}
          />
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <span className="text-[17px] font-medium">{t("Active", "Activa")}</span>
        <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t("Active", "Activa")} />
      </div>
      <ErrorText>{error}</ErrorText>
      <ConfirmDialog
        open={confirm}
        danger
        title={t("Delete area?", "¿Eliminar área?")}
        message={
          initial.productCount
            ? t(
                `It still has ${initial.productCount} product(s). Move them first, or deactivate the area instead.`,
                `Todavía tiene ${initial.productCount} producto(s). Muévelos primero o desactiva el área.`,
              )
            : t("This cannot be undone.", "Esto no se puede deshacer.")
        }
        confirmLabel={t("Delete", "Eliminar")}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run(() => deleteArea(initial.id!));
        }}
      />
    </BottomSheet>
  );
}
