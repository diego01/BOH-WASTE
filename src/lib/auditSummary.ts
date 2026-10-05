/** Turns audit before/after snapshots into a short readable line. Pure. */

const HIDDEN = new Set(["id", "createdAt", "updatedAt", "pinHash", "failedAttempts", "lockedUntil", "token", "archivedAt"]);

const LABELS: Record<string, [string, string]> = {
  "product.create": ["Product created", "Producto creado"],
  "product.update": ["Product edited", "Producto editado"],
  "product.update.type": ["Product type changed", "Tipo de producto cambiado"],
  "product.activate": ["Product activated", "Producto activado"],
  "product.deactivate": ["Product deactivated", "Producto desactivado"],
  "product.archive": ["Product archived", "Producto archivado"],
  "product.delete": ["Product deleted", "Producto eliminado"],
  "area.create": ["Area created", "Área creada"],
  "area.update": ["Area edited", "Área editada"],
  "area.delete": ["Area deleted", "Área eliminada"],
  "category.create": ["Category created", "Categoría creada"],
  "category.update": ["Category edited", "Categoría editada"],
  "category.delete": ["Category deleted", "Categoría eliminada"],
  "user.create": ["User created", "Usuario creado"],
  "user.update": ["User edited", "Usuario editado"],
  "user.update+pin.reset": ["User edited + PIN reset", "Usuario editado + PIN restablecido"],
  "user.pin.change": ["PIN changed", "PIN cambiado"],
  "entry.edit": ["Entry edited", "Registro editado"],
  "entry.void": ["Entry voided", "Registro anulado"],
  "entry.removal.undo": ["Removal undone", "Quitado deshecho"],
  "allowance.set.individual": ["Allowance set", "Allowance asignado"],
  "allowance.group.create": ["Allowance group created", "Grupo de allowance creado"],
  "allowance.group.update": ["Allowance group edited", "Grupo de allowance editado"],
  "allowance.amount": ["Allowance amount changed", "Monto de allowance cambiado"],
  "allowance.delete": ["Allowance deleted", "Allowance eliminado"],
  "schedule.update": ["Schedule changed", "Horarios cambiados"],
  "operating_days.update": ["Open days changed", "Días abiertos cambiados"],
  "holiday.add": ["Holiday added", "Feriado agregado"],
  "holiday.delete": ["Holiday removed", "Feriado quitado"],
  "reason.create": ["Reason created", "Motivo creado"],
  "reason.update": ["Reason edited", "Motivo editado"],
  "reason.delete": ["Reason deleted", "Motivo eliminado"],
  "import.inventory.xlsx": ["Excel imported", "Excel importado"],
};

export function auditLabel(entity: string, action: string, lang: "en" | "es" = "en"): string {
  const l = LABELS[`${entity}.${action}`];
  return l ? l[lang === "es" ? 1 : 0] : `${entity} · ${action}`;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length > 4 ? `${v.slice(0, 4).join(", ")}…` : v.join(", ");
  if (typeof v === "object") return "…";
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function same(a: unknown, b: unknown) {
  if (typeof a === "number" || typeof b === "number" || /^-?\d+(\.\d+)?$/.test(String(a ?? ""))) {
    return Number(a) === Number(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function auditChanges(before: unknown, after: unknown, max = 5): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const lines: string[] = [];
  const hasBefore = Object.keys(b).length > 0;
  for (const key of Object.keys(a)) {
    if (HIDDEN.has(key)) continue;
    if (hasBefore && key in b) {
      if (!same(b[key], a[key])) lines.push(`${key}: ${show(b[key])} → ${show(a[key])}`);
    } else if (!hasBefore) {
      lines.push(`${key}: ${show(a[key])}`);
    }
  }
  if (!Object.keys(a).length && hasBefore) {
    for (const key of ["name", "label", "date", "quantity"]) if (key in b) lines.push(`${key}: ${show(b[key])}`);
  }
  return lines.length > max ? [...lines.slice(0, max), `+${lines.length - max} more`] : lines;
}
