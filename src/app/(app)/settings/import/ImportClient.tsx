"use client";

import { useMemo, useState, useTransition } from "react";
import type { ProductType } from "@/db/schema";
import { IconUpload } from "@/components/icons";
import { Badge, Button, cx, ErrorText } from "@/components/ui";
import { useT } from "@/components/I18nProvider";
import type { ImportPreview, ImportResult } from "@/lib/import/apply";
import { DEFAULT_CATEGORIES } from "@/lib/import/categorySuggest";
import { confirmImport, previewImport } from "../actions";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-[17px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Counts({ data, label }: { data: Record<string, number>; label?: (k: string) => string }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <li key={k} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[15px]">
            {label ? label(k) : k} <b>{v}</b>
          </li>
        ))}
    </ul>
  );
}

export function ImportClient() {
  const { t: tr, L, msg } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [categories, setCategories] = useState<Record<number, string>>({});
  const [types, setTypes] = useState<Record<number, ProductType>>({});
  const [importUsers, setImportUsers] = useState(true);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const categoryOptions = useMemo(() => {
    const all = new Set([...(preview?.existingCategories ?? []), ...DEFAULT_CATEGORIES]);
    return [...all];
  }, [preview]);

  function load(f: File) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(undefined);
    const form = new FormData();
    form.set("file", f);
    start(async () => {
      const res = await previewImport(form);
      if (!res.ok) return setError(res.error);
      setPreview(res.data);
      // Prefill: existing products keep their category, new ones get the suggestion.
      setCategories(Object.fromEntries(res.data.products.map((p) => [p.row, (p.status === "new" ? p.suggestedCategory : p.currentCategory) ?? ""])));
      setTypes({});
    });
  }

  function confirm() {
    if (!file || !preview) return;
    const form = new FormData();
    form.set("file", file);
    form.set("overrides", JSON.stringify({ categories, types, importUsers }));
    start(async () => {
      const res = await confirmImport(form);
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setPreview(null);
      setFile(null);
    });
  }

  const untyped = preview?.products.filter((p) => !p.type) ?? [];
  const rowErrors = preview?.products.filter((p) => p.errors.length) ?? [];
  const blockingIssues = preview?.issues.filter((i) => i.level === "error" && !i.message.includes("Tipo de waste")) ?? [];
  const canImport = !!preview && !rowErrors.length && !blockingIssues.length && untyped.every((p) => types[p.row]);
  const provisional = preview?.products.filter((p) => p.daypartsProvisional) ?? [];
  const newUsers = preview?.users.filter((u) => u.status === "new" && !u.errors.length) ?? [];

  return (
    <div className="pb-8">
      <p className="text-[15px] leading-snug text-ink/80">
        {tr(
          "Load the product catalog (and optional users) from inventory.xlsx. You'll see a full summary before anything is saved. Re-importing updates products by code and never changes their available dayparts, area or active status.",
          "Carga el catálogo de productos (y, si quieres, usuarios) desde inventory.xlsx. Verás un resumen completo antes de guardar. Reimportar actualiza los productos por código y nunca cambia sus horarios disponibles, área ni si están activos.",
        )}
      </p>

      <label className="mt-4 flex h-16 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand bg-brand-soft font-semibold text-brand-dark">
        <IconUpload />
        {file ? file.name : tr("Choose .xlsx file", "Elegir archivo .xlsx")}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
        />
      </label>

      {pending && <p className="mt-4 text-center text-muted">{tr("Working…", "Procesando…")}</p>}
      <ErrorText>{error}</ErrorText>

      {result && (
        <Card title={tr("Import complete", "Importación completa")}>
          <ul className="space-y-1 text-[15px]">
            <li>{tr("Products created", "Productos creados")}: <b>{result.productsCreated}</b></li>
            <li>{tr("Products updated", "Productos actualizados")}: <b>{result.productsUpdated}</b></li>
            <li>{tr("Unchanged", "Sin cambios")}: <b>{result.productsUnchanged}</b></li>
            <li>{tr("Users created", "Usuarios creados")}: <b>{result.usersCreated}</b> ({tr("skipped existing", "ya existían")}: {result.usersSkipped})</li>
          </ul>
        </Card>
      )}

      {preview && (
        <>
          <Card title={`${tr("Summary — sheet", "Resumen — hoja")} "${preview.sheetName}"`}>
            <p className="text-[15px]">
              <b>{preview.totals.products}</b> {tr("products", "productos")} · {preview.emptyRowsSkipped} {tr("empty rows skipped", "filas vacías ignoradas")} ·{" "}
              {preview.products.filter((p) => p.status === "new").length} {tr("new", "nuevos")},{" "}
              {preview.products.filter((p) => p.status === "update").length} {tr("updates", "actualizaciones")},{" "}
              {preview.products.filter((p) => p.status === "unchanged").length} {tr("unchanged", "sin cambios")}
            </p>
            <h3 className="mb-1 mt-3 text-sm font-semibold text-muted">{tr("By type", "Por tipo")}</h3>
            <Counts data={preview.totals.byType} label={(k) => L.type[k as ProductType] ?? (k === "NO TYPE" ? tr("NO TYPE", "SIN TIPO") : k)} />
            <h3 className="mb-1 mt-3 text-sm font-semibold text-muted">{tr("By “parte del día”", "Por “parte del día”")}</h3>
            <Counts data={preview.totals.byDaypartOriginal} />
            <h3 className="mb-1 mt-3 text-sm font-semibold text-muted">{tr("By measure", "Por medida")}</h3>
            <Counts data={preview.totals.byUnit} label={(k) => L.unitShort[k as keyof typeof L.unitShort] ?? k} />
          </Card>

          {preview.issues.length > 0 && (
            <Card title={tr("Checks", "Revisiones")}>
              <ul className="space-y-2 text-[15px]">
                {preview.issues.map((i, n) => (
                  <li key={n} className="flex gap-2">
                    <Badge tone={i.level === "error" ? "waste" : i.level === "warning" ? "warn" : "gray"}>{i.level === "error" ? tr("error", "error") : i.level === "warning" ? tr("warning", "aviso") : "info"}</Badge>
                    <span>
                      {msg(i.message)}
                      {i.rows && (
                        <span className="text-muted">
                          {" "}
                          ({tr("rows", "filas")} {i.rows.join(", ")})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {rowErrors.length > 0 && (
            <Card title={tr("Rows with errors (fix the file and reload)", "Filas con errores (corrige el archivo y vuelve a cargarlo)")}>
              <ul className="space-y-1 text-[15px] text-bad">
                {rowErrors.map((p) => (
                  <li key={p.row}>
                    {tr("Row", "Fila")} {p.row} {p.name}: {p.errors.map(msg).join("; ")}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {untyped.length > 0 && (
            <Card title={tr("Rows without type — choose one", "Filas sin tipo — elige uno")}>
              {untyped.map((p) => (
                <div key={p.row} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                  <span className="text-[15px]">
                    {p.name} <span className="text-muted">(“{p.rawType || tr("empty", "vacío")}”)</span>
                  </span>
                  <div className="flex gap-1">
                    {(["WASTE", "DONATION"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypes((x) => ({ ...x, [p.row]: t }))}
                        className={cx(
                          "h-10 rounded-lg px-3 text-sm font-semibold",
                          types[p.row] === t ? (t === "WASTE" ? "bg-waste text-white" : "bg-donation text-white") : "bg-gray-100",
                        )}
                      >
                        {L.type[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {provisional.length > 0 && (
            <Card title={`${tr("Desert / Prep — provisional all-day", "Desert / Prep — todos los horarios (provisional)")} (${provisional.length})`}>
              <p className="mb-2 text-sm text-muted">
                {tr(
                  "These get Breakfast, Lunch, Afternoon and Dinner so none are hidden. Adjust their dayparts in Products after importing.",
                  "Reciben Breakfast, Lunch, Afternoon y Dinner para que ninguno quede oculto. Ajusta sus horarios en Productos después de importar.",
                )}
              </p>
              <ul className="space-y-1 text-[15px]">
                {provisional.map((p) => (
                  <li key={p.row} className="flex justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="text-muted">{p.parteDelDiaOriginal}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={tr("Products & proposed categories", "Productos y categorías propuestas")}>
            <p className="mb-2 text-sm text-muted">{tr("The Excel has no categories. Approve or change each suggestion.", "El Excel no trae categorías. Aprueba o cambia cada sugerencia.")}</p>
            <ul className="divide-y divide-line">
              {preview.products.map((p) => (
                <li key={p.row} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-medium leading-tight">{p.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                        {p.code && <span>#{p.code}</span>}
                        <span>· ${p.unitCost?.toFixed(2)} / {p.unit ? L.unitShort[p.unit] : p.rawUnit}</span>
                        <span>· {p.dayparts.map((d) => L.daypart[d]).join(", ")}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.type && <Badge tone={p.type === "WASTE" ? "waste" : "donation"}>{L.type[p.type]}</Badge>}
                        <Badge tone={p.status === "new" ? "brand" : p.status === "update" ? "warn" : "gray"}>{p.status === "new" ? tr("new", "nuevo") : p.status === "update" ? tr("update", "actualiza") : tr("unchanged", "sin cambios")}</Badge>
                      </div>
                      {p.changes.length > 0 && <div className="mt-1 text-xs text-amber-700">{p.changes.join(" · ")}</div>}
                    </div>
                  </div>
                  <select
                    value={categories[p.row] ?? ""}
                    onChange={(e) => setCategories((c) => ({ ...c, [p.row]: e.target.value }))}
                    className="mt-2 h-11 w-full rounded-lg border border-line bg-field px-3"
                    aria-label={`${tr("Category for", "Categoría de")} ${p.name}`}
                  >
                    <option value="">— {tr("No category", "Sin categoría")} —</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                        {c === p.suggestedCategory ? ` (${tr("suggested", "sugerida")})` : ""}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </Card>

          {preview.users.length > 0 && (
            <Card title={`${tr("Users — sheet", "Usuarios — hoja")} "${preview.usersSheetName}"`}>
              <ul className="divide-y divide-line">
                {preview.users.map((u) => (
                  <li key={u.row} className="flex items-center justify-between py-2 text-[15px]">
                    <span className="capitalize">{u.name}</span>
                    <span className="flex gap-1">
                      {u.role ? <Badge tone={u.role === "ADMIN" ? "brand" : "gray"}>{L.role[u.role]}</Badge> : <Badge tone="waste">{u.rawRole}</Badge>}
                      <Badge tone={u.status === "new" ? "brand" : "gray"}>{u.status === "new" ? tr("new", "nuevo") : tr("exists, skipped", "ya existe, se omite")}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
              {preview.users.some((u) => u.errors.length) && (
                <ul className="mt-2 text-sm text-bad">
                  {preview.users
                    .filter((u) => u.errors.length)
                    .map((u) => (
                      <li key={u.row}>
                        {tr("Row", "Fila")} {u.row} {u.name}: {u.errors.map(msg).join("; ")} ({tr("will be skipped", "se omitirá")})
                      </li>
                    ))}
                </ul>
              )}
              <label className="mt-3 flex items-center gap-3 text-[15px]">
                <input type="checkbox" checked={importUsers} onChange={(e) => setImportUsers(e.target.checked)} className="h-5 w-5" />
                {tr(
                  `Create ${newUsers.length} new user(s). PINs from the file are temporary; each person sets their own at first sign-in.`,
                  `Crear ${newUsers.length} usuario(s) nuevo(s). Los PIN del archivo son temporales; cada persona elige el suyo en su primer ingreso.`,
                )}
              </label>
            </Card>
          )}

          <div className="sticky bottom-20 mt-4">
            <Button className="w-full shadow-lg" disabled={!canImport || pending} onClick={confirm}>
              {pending ? tr("Importing…", "Importando…") : tr(`Import ${preview.totals.products} products`, `Importar ${preview.totals.products} productos`)}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
