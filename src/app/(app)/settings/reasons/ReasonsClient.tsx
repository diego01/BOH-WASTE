"use client";

import { useState, useTransition } from "react";
import { IconPlus } from "@/components/icons";
import { BottomSheet, Button, ConfirmDialog, cx, ErrorText, Label, TextField, Toggle } from "@/components/ui";
import { deleteReason, moveReason, saveReason } from "../actions";
import { useT } from "@/components/I18nProvider";

type R = { id: number; name: string; active: boolean; uses: number };
type Draft = { id?: number; name: string; active: boolean; uses: number };

export function ReasonsClient({ reasons }: { reasons: R[] }) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [, start] = useTransition();

  return (
    <>
      <p className="text-[15px] leading-snug text-ink/80">{t("Reason chips shown when logging, in this order.", "Motivos que aparecen al registrar, en este orden.")}</p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
        {reasons.map((r, i) => (
          <li key={r.id} className="flex items-center gap-1 pr-2">
            <button onClick={() => setDraft({ ...r })} className="flex h-14 flex-1 items-center justify-between px-4 text-left active:bg-gray-50">
              <span className={cx("text-[16px] font-medium", !r.active && "text-muted line-through")}>{r.name}</span>
              <span className="text-sm text-muted">{r.uses} {t("uses", "usos")}</span>
            </button>
            <button
              disabled={i === 0}
              onClick={() => start(() => void moveReason(r.id, -1))}
              className="h-11 w-10 rounded-lg text-lg disabled:opacity-25"
              aria-label={t(`Move ${r.name} up`, `Subir ${r.name}`)}
            >
              ↑
            </button>
            <button
              disabled={i === reasons.length - 1}
              onClick={() => start(() => void moveReason(r.id, 1))}
              className="h-11 w-10 rounded-lg text-lg disabled:opacity-25"
              aria-label={t(`Move ${r.name} down`, `Bajar ${r.name}`)}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="mt-4 flex w-full items-center justify-center gap-2"
        onClick={() => setDraft({ name: "", active: true, uses: 0 })}
      >
        <IconPlus /> {t("Add reason", "Agregar motivo")}
      </Button>
      {draft && <ReasonSheet key={draft.id ?? "new"} initial={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

function ReasonSheet({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { t } = useT();
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const dirty = d.name !== initial.name || d.active !== initial.active;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) onClose();
      else setError(res.error);
    });

  return (
    <BottomSheet
      open
      title={initial.id ? t("Edit reason", "Editar motivo") : t("New reason", "Nuevo motivo")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button className="w-full" disabled={!dirty || !d.name.trim() || pending} onClick={() => run(() => saveReason(d))}>
            {t("Save", "Guardar")}
          </Button>
          {initial.id && (
            <button onClick={() => setConfirm(true)} className="mt-1 h-11 w-full font-semibold text-bad">
              {t("Delete reason", "Eliminar motivo")}
            </button>
          )}
        </div>
      }
    >
      <Label>{t("Name", "Nombre")}</Label>
      <TextField value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <div className="mt-6 flex items-center justify-between">
        <span className="text-[17px] font-medium">{t("Active", "Activo")}</span>
        <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t("Active", "Activo")} />
      </div>
      <ErrorText>{error}</ErrorText>
      <ConfirmDialog
        open={confirm}
        danger
        title={t("Delete reason?", "¿Eliminar motivo?")}
        message={
          initial.uses
            ? t(`Used by ${initial.uses} entries; deactivate it instead.`, `Lo usan ${initial.uses} registros; mejor desactívalo.`)
            : t("This cannot be undone.", "Esto no se puede deshacer.")
        }
        confirmLabel={t("Delete", "Eliminar")}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run(() => deleteReason(initial.id!));
        }}
      />
    </BottomSheet>
  );
}
