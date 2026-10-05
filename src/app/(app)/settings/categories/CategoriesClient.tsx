"use client";

import { useState, useTransition } from "react";
import { IconPlus } from "@/components/icons";
import { BottomSheet, Button, ConfirmDialog, cx, ErrorText, Label, TextField, Toggle } from "@/components/ui";
import type { SettingsCategory } from "@/lib/settingsData";
import { useT } from "@/components/I18nProvider";
import { deleteCategory, saveCategory } from "../actions";

type Draft = { id?: number; name: string; active: boolean; productCount: number };

export function CategoriesClient({ categories }: { categories: SettingsCategory[] }) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <>
      <p className="text-[15px] leading-snug text-ink/80">
        {t(
          "Categories become the filter chips on the logging screen. A product can belong to several.",
          "Las categorías son los filtros de la pantalla de registro. Un producto puede tener varias.",
        )}
      </p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
        {categories.map((c) => (
          <li key={c.id}>
            <button onClick={() => setDraft({ ...c })} className="flex h-14 w-full items-center justify-between px-4 text-left active:bg-gray-50">
              <span className={cx("text-[16px] font-medium", !c.active && "text-muted line-through")}>{c.name}</span>
              <span className="text-sm text-muted">{c.productCount} {t("products", "productos")}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="mt-4 flex w-full items-center justify-center gap-2"
        onClick={() => setDraft({ name: "", active: true, productCount: 0 })}
      >
        <IconPlus /> {t("Add category", "Agregar categoría")}
      </Button>
      {draft && <CategorySheet key={draft.id ?? "new"} initial={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

function CategorySheet({ initial, onClose }: { initial: Draft; onClose: () => void }) {
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
      title={initial.id ? t("Edit Category", "Editar categoría") : t("New Category", "Nueva categoría")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button
            className="w-full"
            disabled={!dirty || !d.name.trim() || pending}
            onClick={() => run(() => saveCategory({ id: d.id, name: d.name, active: d.active }))}
          >
            {t("Save", "Guardar")}
          </Button>
          {initial.id && (
            <button onClick={() => setConfirm(true)} className="mt-1 h-11 w-full font-semibold text-bad">
              {t("Delete Category", "Eliminar categoría")}
            </button>
          )}
        </div>
      }
    >
      <Label>{t("Name", "Nombre")}</Label>
      <TextField value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <div className="mt-6 flex items-center justify-between">
        <span className="text-[17px] font-medium">{t("Active", "Activa")}</span>
        <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t("Active", "Activa")} />
      </div>
      <ErrorText>{error}</ErrorText>
      <ConfirmDialog
        open={confirm}
        danger
        title={t("Delete category?", "¿Eliminar categoría?")}
        message={
          initial.productCount
            ? t(
                `It will be removed from ${initial.productCount} product(s). The products themselves are kept.`,
                `Se quitará de ${initial.productCount} producto(s). Los productos se conservan.`,
              )
            : t("This cannot be undone.", "Esto no se puede deshacer.")
        }
        confirmLabel={t("Delete", "Eliminar")}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run(() => deleteCategory(initial.id!));
        }}
      />
    </BottomSheet>
  );
}
