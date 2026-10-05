"use client";

import { useMemo, useState, useTransition } from "react";
import type { Daypart, ProductType, Unit } from "@/db/schema";
import { IconChevronDown, IconPlus } from "@/components/icons";
import {
  Badge,
  BottomSheet,
  Button,
  ChipGroup,
  ConfirmDialog,
  cx,
  ErrorText,
  fieldClass,
  Label,
  MultiSelect,
  SearchBox,
  SelectField,
  TextField,
  Toggle,
} from "@/components/ui";
import { DAYPARTS, UNITS } from "@/lib/domain";
import { useT } from "@/components/I18nProvider";
import type { SettingsArea, SettingsCategory, SettingsProduct } from "@/lib/settingsData";
import { deleteProduct, saveProduct, setProductActive } from "../actions";

type Draft = {
  id?: number;
  name: string;
  code: string;
  areaId: string;
  categoryIds: string[];
  unit: Unit | "";
  unitCost: string;
  type: ProductType | "";
  availableDayparts: Daypart[];
  active: boolean;
  parteDelDiaOriginal?: string | null;
  archived?: boolean;
};

function toDraft(p: SettingsProduct): Draft {
  return {
    id: p.id,
    name: p.name,
    code: p.code ?? "",
    areaId: String(p.areaId),
    categoryIds: p.categoryIds.map(String),
    unit: p.unit,
    unitCost: p.unitCost.toFixed(2),
    type: p.type,
    availableDayparts: p.availableDayparts,
    active: p.active,
    parteDelDiaOriginal: p.parteDelDiaOriginal,
    archived: p.archived,
  };
}

export function ProductsClient({
  areas,
  categories,
  products,
}: {
  areas: SettingsArea[];
  categories: SettingsCategory[];
  products: SettingsProduct[];
}) {
  const { t: tr, L } = useT();
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [, start] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (showArchived || !p.archived) &&
        (!term || p.name.toLowerCase().includes(term) || (p.code ?? "").toLowerCase().includes(term)),
    );
  }, [products, q, showArchived]);

  const archivedCount = products.filter((p) => p.archived).length;

  function toggleActive(p: SettingsProduct, v: boolean) {
    setOptimistic((o) => ({ ...o, [p.id]: v }));
    start(async () => {
      const res = await setProductActive(p.id, v);
      if (!res.ok) {
        alert(res.error);
        setOptimistic((o) => ({ ...o, [p.id]: !v }));
      }
    });
  }

  const newDraft = (): Draft => ({
    name: "",
    code: "",
    areaId: areas.length === 1 ? String(areas[0].id) : "",
    categoryIds: [],
    unit: "",
    unitCost: "",
    type: "",
    availableDayparts: [],
    active: true,
  });

  return (
    <>
      <p className="text-[15px] leading-snug text-ink/80">
        {tr(
          "Adjust details about your products including cost, measure, type and active status. Disabling the toggle hides the product from the logging screen.",
          "Ajusta los datos de tus productos: costo, medida, tipo y si está activo. Al desactivarlo, el producto se oculta en la pantalla de registro.",
        )}
      </p>
      <div className="mt-4">
        <SearchBox value={q} onChange={setQ} />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_64px_64px_60px] px-1 text-xs text-muted">
        <span>{tr("Products", "Productos")}</span>
        <span>{tr("Cost", "Costo")}</span>
        <span>{tr("Measure", "Medida")}</span>
        <span className="text-right">{tr("Active", "Activo")}</span>
      </div>

      {areas.map((area) => {
        const list = filtered.filter((p) => p.areaId === area.id);
        if (!list.length && q) return null;
        const isCollapsed = collapsed[area.id];
        return (
          <section key={area.id} className="mt-2">
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [area.id]: !c[area.id] }))}
              style={{ background: area.color }}
              className="flex h-14 w-full items-center justify-between rounded-xl px-4 text-white"
              aria-expanded={!isCollapsed}
            >
              <span className="text-xl font-bold">{area.name}</span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {list.length}
                <IconChevronDown className={cx("transition", !isCollapsed && "rotate-180")} />
              </span>
            </button>
            {!isCollapsed && (
              <ul className="divide-y divide-line">
                {list.map((p) => {
                  const active = optimistic[p.id] ?? p.active;
                  return (
                    <li key={p.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setDraft(toDraft(p))}
                        onKeyDown={(e) => e.key === "Enter" && setDraft(toDraft(p))}
                        className="grid min-h-[64px] grid-cols-[1fr_64px_64px_60px] items-center gap-1 px-1 py-2 active:bg-white"
                      >
                        <span className="pr-1">
                          <span className={cx("block text-[15px] leading-tight", !active && "text-muted")}>{p.name}</span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge tone={p.type === "WASTE" ? "waste" : "donation"}>{L.type[p.type]}</Badge>
                            {p.archived && <Badge>{tr("Archived", "Archivado")}</Badge>}
                          </span>
                        </span>
                        <span className="text-[15px]">${p.unitCost.toFixed(2)}</span>
                        <span className="text-[15px]">{L.unitShort[p.unit]}</span>
                        <span className="flex justify-end">
                          <Toggle checked={active} onChange={(v) => toggleActive(p, v)} label={`${p.name} ${tr("active", "activo")}`} />
                        </span>
                      </div>
                    </li>
                  );
                })}
                {!list.length && <li className="px-1 py-4 text-muted">{tr("No products in this area.", "No hay productos en esta área.")}</li>}
              </ul>
            )}
          </section>
        );
      })}

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mt-4 h-11 text-[15px] font-medium text-brand-dark">
          {showArchived ? tr("Hide archived", "Ocultar archivados") : tr("Show archived", "Ver archivados")} ({archivedCount})
        </button>
      )}

      <button
        onClick={() => setDraft(newDraft())}
        className="fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-brand-dark px-5 font-semibold text-white shadow-lg active:scale-95"
      >
        <IconPlus /> {tr("Product", "Producto")}
      </button>

      {draft && (
        <ProductSheet
          key={draft.id ?? "new"}
          initial={draft}
          areas={areas}
          categories={categories}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

function ProductSheet({
  initial,
  areas,
  categories,
  onClose,
}: {
  initial: Draft;
  areas: SettingsArea[];
  categories: SettingsCategory[];
  onClose: () => void;
}) {
  const { t: tr, L } = useT();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"type" | "delete" | null>(null);
  const isNew = !initial.id;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const cost = Number(d.unitCost);
  const valid =
    d.name.trim() && d.areaId && d.unit && d.type && d.availableDayparts.length > 0 && d.unitCost !== "" && Number.isFinite(cost) && cost >= 0;

  function save(confirmTypeChange = false) {
    if (!isNew && d.type !== initial.type && !confirmTypeChange) {
      setConfirm("type");
      return;
    }
    setError(undefined);
    start(async () => {
      const res = await saveProduct({
        id: d.id,
        name: d.name,
        code: d.code,
        areaId: Number(d.areaId),
        categoryIds: d.categoryIds.map(Number),
        unit: d.unit as Unit,
        unitCost: cost,
        type: d.type as ProductType,
        availableDayparts: d.availableDayparts,
        active: d.active,
        confirmTypeChange,
      });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteProduct(d.id!);
      if (!res.ok) return setError(res.error);
      if (res.data.archived) alert(tr("This product has history, so it was archived (hidden) instead of deleted.", "Este producto tiene historial, así que se archivó (oculto) en vez de borrarse."));
      onClose();
    });
  }

  return (
    <BottomSheet
      open
      title={isNew ? tr("New Product", "Nuevo producto") : tr("Edit Product Details", "Editar producto")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button className="w-full" disabled={!dirty || !valid || pending} onClick={() => save()}>
            {pending ? tr("Saving…", "Guardando…") : tr("Save", "Guardar")}
          </Button>
          {!isNew && (
            <button onClick={() => setConfirm("delete")} disabled={pending} className="mt-1 h-11 w-full font-semibold text-bad">
              {tr("Delete Product", "Eliminar producto")}
            </button>
          )}
        </div>
      }
    >
      <Label>{tr("Name", "Nombre")}</Label>
      <TextField value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={tr("Product name", "Nombre del producto")} />

      <Label>{tr("Code", "Código")}</Label>
      <TextField value={d.code} onChange={(e) => set("code", e.target.value)} placeholder={tr("Optional", "Opcional")} inputMode="numeric" />

      <Label strong>{tr("Waste Area", "Área de waste")}</Label>
      <SelectField
        value={d.areaId}
        onChange={(v) => set("areaId", v)}
        placeholder={tr("Choose area", "Elige un área")}
        options={areas.filter((a) => a.active || String(a.id) === d.areaId).map((a) => ({ value: String(a.id), label: a.name }))}
      />

      <Label strong>{tr("Categories", "Categorías")}</Label>
      <MultiSelect
        placeholder={tr("Select categories", "Elige categorías")}
        selected={d.categoryIds}
        onChange={(v) => set("categoryIds", v)}
        options={categories.filter((c) => c.active || d.categoryIds.includes(String(c.id))).map((c) => ({ value: String(c.id), label: c.name }))}
      />

      <Label strong>{tr("Type", "Tipo")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {(["WASTE", "DONATION"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={d.type === t}
            onClick={() => set("type", t)}
            className={cx(
              "h-14 rounded-xl border-2 text-[17px] font-semibold",
              d.type === t
                ? t === "WASTE"
                  ? "border-waste bg-waste-soft text-waste"
                  : "border-donation bg-donation-soft text-donation"
                : "border-line bg-field text-ink",
            )}
          >
            {L.type[t]}
          </button>
        ))}
      </div>
      {!isNew && d.type !== initial.type && (
        <p className="mt-2 text-sm text-amber-700">
          {tr(
            "Changing the type affects new entries only. Past entries keep their original type.",
            "Cambiar el tipo solo afecta registros nuevos. Los anteriores conservan su tipo original.",
          )}
        </p>
      )}

      <Label strong>{tr("Available dayparts", "Horarios disponibles")}</Label>
      <ChipGroup
        options={DAYPARTS.map((v) => ({ value: v, label: L.daypart[v] }))}
        selected={d.availableDayparts}
        onToggle={(v) =>
          set(
            "availableDayparts",
            d.availableDayparts.includes(v) ? d.availableDayparts.filter((x) => x !== v) : DAYPARTS.filter((x) => x === v || d.availableDayparts.includes(x)),
          )
        }
      />
      {d.availableDayparts.length === 0 && <p className="mt-2 text-sm text-bad">{tr("Pick at least one.", "Elige al menos uno.")}</p>}
      {d.parteDelDiaOriginal && <p className="mt-2 text-sm text-muted">Excel “parte del día”: {d.parteDelDiaOriginal}</p>}

      <Label strong>{tr("Measurement Type", "Tipo de medida")}</Label>
      <SelectField
        value={d.unit}
        onChange={(v) => set("unit", v as Unit)}
        placeholder={tr("Choose measure", "Elige la medida")}
        options={UNITS.map((u) => ({ value: u, label: L.unit[u] }))}
      />

      <Label>
        {tr("Cost per", "Costo por")} {d.unit ? L.unitShort[d.unit as Unit] : tr("unit", "unidad")}
      </Label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px]">$</span>
        <input
          inputMode="decimal"
          value={d.unitCost}
          onChange={(e) => set("unitCost", e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
          className={cx(fieldClass, "pl-8")}
          placeholder="0.00"
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-[17px] font-medium">{tr("Active", "Activo")}</span>
        <Toggle checked={d.active} onChange={(v) => set("active", v)} label={tr("Active", "Activo")} />
      </div>

      <ErrorText>{error}</ErrorText>

      <ConfirmDialog
        open={confirm === "type"}
        title={tr("Change product type?", "¿Cambiar el tipo del producto?")}
        message={
          <>
            <b>{d.name}</b>{" "}
            {tr(
              `will change from ${L.type[initial.type as ProductType]} to ${L.type[d.type as ProductType]}. New entries will use the new type; past entries and reports keep the old one.`,
              `cambiará de ${L.type[initial.type as ProductType]} a ${L.type[d.type as ProductType]}. Los registros nuevos usarán el nuevo tipo; los anteriores y los reportes conservan el anterior.`,
            )}
          </>
        }
        confirmLabel={tr("Change type", "Cambiar tipo")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          save(true);
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        danger
        title={tr("Delete product?", "¿Eliminar producto?")}
        message={tr(
          "If it already has entries or an allowance, it will be archived instead so history stays intact.",
          "Si ya tiene registros o allowance, se archivará en vez de borrarse para conservar el historial.",
        )}
        confirmLabel={tr("Delete", "Eliminar")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          remove();
        }}
      />
    </BottomSheet>
  );
}
