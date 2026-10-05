"use server";

import bcrypt from "bcryptjs";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { daypartEnum, productTypeEnum, roleEnum, unitEnum } from "@/db/schema";
import { runAction, UserError } from "@/lib/actionResult";
import { can } from "@/lib/auth/permissions";
import { DAYPART_LABEL, validatePin } from "@/lib/domain";
import { bi } from "@/lib/i18n";
import { refreezeFromCurrentMonth } from "@/lib/allowanceData";
import { applyImport, buildPreview, type ImportOverrides } from "@/lib/import/apply";
import { parseInventory } from "@/lib/import/inventory";

const refresh = () => revalidatePath("/", "layout");

async function audit(userId: string, entity: string, entityId: string | number, action: string, before?: unknown, after?: unknown) {
  await db.insert(schema.auditLog).values({ userId, entity, entityId: String(entityId), action, before, after });
}

// ---------- Products ----------

const productInput = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, bi("Name is required", "El nombre es obligatorio")).max(120),
  code: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  areaId: z.number({ message: bi("Choose a waste area", "Elige un área de waste") }).int(),
  categoryIds: z.array(z.number().int()),
  unit: z.enum(unitEnum.enumValues, { message: bi("Choose a measurement type", "Elige el tipo de medida") }),
  unitCost: z.number({ message: bi("Cost must be a number", "El costo debe ser un número") }).min(0, bi("Cost can't be negative", "El costo no puede ser negativo")).max(100000),
  type: z.enum(productTypeEnum.enumValues, { message: bi("Choose Waste or Donation", "Elige Waste o Donación") }),
  availableDayparts: z.array(z.enum(daypartEnum.enumValues)).min(1, bi("Pick at least one available daypart", "Elige al menos un horario disponible")),
  active: z.boolean(),
  confirmTypeChange: z.boolean().optional(),
});
export type ProductInput = z.input<typeof productInput>;

export async function saveProduct(raw: ProductInput) {
  return runAction("settings:edit", async (user) => {
    const input = productInput.parse(raw);
    const values = {
      name: input.name,
      code: input.code,
      areaId: input.areaId,
      unit: input.unit,
      unitCost: Math.round(input.unitCost * 10000) / 10000,
      type: input.type,
      availableDayparts: input.availableDayparts,
      active: input.active,
    };

    const id = await db.transaction(async (tx) => {
      let productId: number;
      if (input.id) {
        const [before] = await tx.select().from(schema.products).where(eq(schema.products.id, input.id));
        if (!before) throw new UserError(bi("Product not found", "Producto no encontrado"));
        if (before.type !== input.type && !input.confirmTypeChange) {
          throw new UserError(bi("Confirm the type change first", "Primero confirma el cambio de tipo"));
        }
        await tx
          .update(schema.products)
          .set({ ...values, archivedAt: input.active ? null : before.archivedAt, updatedAt: sql`now()` })
          .where(eq(schema.products.id, input.id));
        productId = input.id;
        await tx.insert(schema.auditLog).values({
          userId: user.id,
          entity: "product",
          entityId: String(productId),
          action: before.type !== input.type ? "update.type" : "update",
          before,
          after: values,
        });
      } else {
        const [created] = await tx.insert(schema.products).values(values).returning({ id: schema.products.id });
        productId = created.id;
        await tx.insert(schema.auditLog).values({ userId: user.id, entity: "product", entityId: String(productId), action: "create", after: values });
      }
      await tx.delete(schema.productCategories).where(eq(schema.productCategories.productId, productId));
      if (input.categoryIds.length) {
        await tx.insert(schema.productCategories).values(input.categoryIds.map((categoryId) => ({ productId, categoryId })));
      }
      return productId;
    });
    refresh();
    return { id };
  });
}

export async function setProductActive(id: number, active: boolean) {
  return runAction("settings:edit", async (user) => {
    await db
      .update(schema.products)
      .set({ active, archivedAt: active ? null : undefined, updatedAt: sql`now()` })
      .where(eq(schema.products.id, id));
    await audit(user.id, "product", id, active ? "activate" : "deactivate");
    refresh();
    return undefined;
  });
}

/** Hard delete only when nothing references the product; otherwise archive (soft delete). */
export async function deleteProduct(id: number) {
  return runAction("settings:edit", async (user) => {
    const [{ n: entries }] = await db.select({ n: count() }).from(schema.wasteEntries).where(eq(schema.wasteEntries.productId, id));
    const [{ n: allowances }] = await db
      .select({ n: count() })
      .from(schema.allowanceProducts)
      .where(eq(schema.allowanceProducts.productId, id));
    if (entries > 0 || allowances > 0) {
      await db
        .update(schema.products)
        .set({ active: false, archivedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(schema.products.id, id));
      await audit(user.id, "product", id, "archive");
      refresh();
      return { archived: true };
    }
    const [before] = await db.select().from(schema.products).where(eq(schema.products.id, id));
    await db.delete(schema.products).where(eq(schema.products.id, id));
    await audit(user.id, "product", id, "delete", before);
    refresh();
    return { archived: false };
  });
}

// ---------- Areas ----------

const areaInput = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, bi("Name is required", "El nombre es obligatorio")).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, bi("Pick a color", "Elige un color")),
  active: z.boolean(),
});

export async function saveArea(raw: z.input<typeof areaInput>) {
  return runAction("settings:edit", async (user) => {
    const input = areaInput.parse(raw);
    if (input.id) {
      if (!input.active) {
        const [{ n }] = await db
          .select({ n: count() })
          .from(schema.areas)
          .where(and(eq(schema.areas.active, true), ne(schema.areas.id, input.id)));
        if (n === 0) throw new UserError(bi("At least one area must stay active", "Al menos un área debe seguir activa"));
      }
      await db
        .update(schema.areas)
        .set({ name: input.name, color: input.color, active: input.active, updatedAt: sql`now()` })
        .where(eq(schema.areas.id, input.id));
      await audit(user.id, "area", input.id, "update", undefined, input);
    } else {
      const [{ n }] = await db.select({ n: count() }).from(schema.areas);
      const [a] = await db
        .insert(schema.areas)
        .values({ name: input.name, color: input.color, active: input.active, sortOrder: n })
        .returning({ id: schema.areas.id });
      await audit(user.id, "area", a.id, "create", undefined, input);
    }
    refresh();
    return undefined;
  });
}

export async function deleteArea(id: number) {
  return runAction("settings:edit", async (user) => {
    const [{ n: products }] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.areaId, id));
    if (products > 0) throw new UserError(bi(`This area has ${products} product(s). Move them to another area or deactivate the area instead.`, `Esta área tiene ${products} producto(s). Muévelos a otra área o desactívala.`));
    const [{ n: entries }] = await db.select({ n: count() }).from(schema.wasteEntries).where(eq(schema.wasteEntries.areaId, id));
    if (entries > 0) throw new UserError(bi("This area has history. Deactivate it instead.", "Esta área tiene historial. Mejor desactívala."));
    const [{ n: others }] = await db.select({ n: count() }).from(schema.areas).where(ne(schema.areas.id, id));
    if (others === 0) throw new UserError(bi("You need at least one area", "Necesitas al menos un área"));
    await db.delete(schema.areas).where(eq(schema.areas.id, id));
    await audit(user.id, "area", id, "delete");
    refresh();
    return undefined;
  });
}

// ---------- Categories ----------

const categoryInput = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, bi("Name is required", "El nombre es obligatorio")).max(60),
  active: z.boolean(),
});

export async function saveCategory(raw: z.input<typeof categoryInput>) {
  return runAction("settings:edit", async (user) => {
    const input = categoryInput.parse(raw);
    if (input.id) {
      await db
        .update(schema.categories)
        .set({ name: input.name, active: input.active, updatedAt: sql`now()` })
        .where(eq(schema.categories.id, input.id));
      await audit(user.id, "category", input.id, "update", undefined, input);
    } else {
      const [{ n }] = await db.select({ n: count() }).from(schema.categories);
      const [c] = await db
        .insert(schema.categories)
        .values({ name: input.name, active: input.active, sortOrder: n })
        .returning({ id: schema.categories.id });
      await audit(user.id, "category", c.id, "create", undefined, input);
    }
    refresh();
    return undefined;
  });
}

/** Categories are labels only (entries don't reference them), so delete just unlinks products. */
export async function deleteCategory(id: number) {
  return runAction("settings:edit", async (user) => {
    const [before] = await db.select().from(schema.categories).where(eq(schema.categories.id, id));
    await db.delete(schema.categories).where(eq(schema.categories.id, id));
    await audit(user.id, "category", id, "delete", before);
    refresh();
    return undefined;
  });
}

// ---------- Users ----------

const userInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, bi("Name is required", "El nombre es obligatorio")).max(60),
  role: z.enum(roleEnum.enumValues),
  active: z.boolean(),
  /** New users: initial PIN. Existing users: optional reset. Always a temporary PIN. */
  pin: z.string().trim().optional(),
  unlock: z.boolean().optional(),
});

export async function saveUser(raw: z.input<typeof userInput>) {
  return runAction("users:manage", async (actor) => {
    const input = userInput.parse(raw);
    const pin = input.pin || undefined;
    if (!input.id && !pin) throw new UserError(bi("Set an initial PIN", "Define un PIN inicial"));
    if (pin) {
      const err = validatePin(pin, input.role);
      if (err) throw new UserError(err);
    }

    await db.transaction(async (tx) => {
      if (input.id) {
        const [before] = await tx.select().from(schema.users).where(eq(schema.users.id, input.id));
        if (!before) throw new UserError(bi("User not found", "Usuario no encontrado"));

        // Always keep at least one active Admin.
        const losesAdmin = before.role === "ADMIN" && before.active && (input.role !== "ADMIN" || !input.active);
        if (losesAdmin) {
          const [{ n }] = await tx
            .select({ n: count() })
            .from(schema.users)
            .where(and(eq(schema.users.role, "ADMIN"), eq(schema.users.active, true), ne(schema.users.id, input.id)));
          if (n === 0) throw new UserError(bi("This is the last active Admin. Make another Admin first.", "Es el último Admin activo. Primero crea otro Admin."));
        }
        if (input.role === "ADMIN" && !pin && before.role !== "ADMIN") {
          throw new UserError(bi("Promoting to Admin needs a new PIN (6+ digits)", "Para pasar a Admin se necesita un PIN nuevo (6+ dígitos)"));
        }

        await tx
          .update(schema.users)
          .set({
            name: input.name,
            role: input.role,
            active: input.active,
            ...(pin ? { pinHash: await bcrypt.hash(pin, 10), mustChangePin: true, failedAttempts: 0, lockedUntil: null } : {}),
            ...(input.unlock ? { failedAttempts: 0, lockedUntil: null } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(schema.users.id, input.id));
        await tx.insert(schema.auditLog).values({
          userId: actor.id,
          entity: "user",
          entityId: input.id,
          action: pin ? "update+pin.reset" : "update",
          before: { name: before.name, role: before.role, active: before.active },
          after: { name: input.name, role: input.role, active: input.active },
        });
      } else {
        const [u] = await tx
          .insert(schema.users)
          .values({ name: input.name, role: input.role, active: input.active, pinHash: await bcrypt.hash(pin!, 10), mustChangePin: true })
          .returning({ id: schema.users.id });
        await tx.insert(schema.auditLog).values({
          userId: actor.id,
          entity: "user",
          entityId: u.id,
          action: "create",
          after: { name: input.name, role: input.role, active: input.active },
        });
      }
    });
    refresh();
    return undefined;
  });
}

// ---------- Excel import ----------

async function readFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError(bi("Choose an .xlsx file", "Elige un archivo .xlsx"));
  if (file.size > 5 * 1024 * 1024) throw new UserError(bi("File too large (max 5 MB)", "Archivo muy grande (máx. 5 MB)"));
  return parseInventory(Buffer.from(await file.arrayBuffer()));
}

export async function previewImport(form: FormData) {
  return runAction("settings:edit", async () => buildPreview(db, await readFile(form)));
}

const overridesInput = z.object({
  categories: z.record(z.string(), z.string()),
  types: z.record(z.string(), z.enum(productTypeEnum.enumValues)),
  importUsers: z.boolean(),
});

/** Re-parses the uploaded file on confirm so nothing from the client preview is trusted. */
export async function confirmImport(form: FormData) {
  return runAction("settings:edit", async (user) => {
    const parsed = await readFile(form);
    const raw = overridesInput.parse(JSON.parse(String(form.get("overrides") ?? "{}")));
    const overrides: ImportOverrides = {
      categories: Object.fromEntries(Object.entries(raw.categories).map(([k, v]) => [Number(k), v])),
      types: Object.fromEntries(Object.entries(raw.types).map(([k, v]) => [Number(k), v])),
      importUsers: raw.importUsers,
    };
    if (overrides.importUsers && !can(user.role, "users:manage")) throw new UserError(bi("Not allowed to import users", "No tienes permiso para importar usuarios"));
    try {
      const result = await applyImport(db, parsed, overrides, user.id);
      refresh();
      return result;
    } catch (e) {
      if (e instanceof Error && /^Fix rows|^Duplicate code/.test(e.message)) throw new UserError(e.message);
      throw e;
    }
  });
}

// ---------- Schedule ----------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, bi("Use HH:MM", "Usa HH:MM"));
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const scheduleInput = z.object({
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, bi("Unknown timezone", "Zona horaria desconocida")),
  dayparts: z
    .array(z.object({ key: z.enum(daypartEnum.enumValues), startTime: hhmm, endTime: hhmm.nullable() }))
    .length(4),
  dinnerClose: z.record(z.string(), hhmm),
  boardGraceMinutes: z.number().int().min(0).max(240),
  autoLogoutMinutes: z.number().int().min(0).max(60),
});

/** Changing dayparts affects new entries only: each entry stores its own daypart. */
export async function saveSchedule(raw: z.input<typeof scheduleInput>) {
  return runAction("settings:edit", async (user) => {
    const input = scheduleInput.parse(raw);
    const order = ["BREAKFAST", "LUNCH", "AFTERNOON", "DINNER"] as const;
    const dps = order.map((k) => input.dayparts.find((d) => d.key === k)!);
    if (dps.some((d) => !d)) throw new UserError(bi("All four dayparts are required", "Se necesitan los cuatro horarios"));
    for (let i = 0; i < dps.length; i++) {
      const d = dps[i];
      const next = dps[i + 1];
      if (next && toMin(next.startTime) <= toMin(d.startTime)) throw new UserError(bi("Each daypart must start after the previous one", "Cada horario debe empezar después del anterior"));
      if (next) {
        if (!d.endTime) throw new UserError(bi(`${DAYPART_LABEL[d.key]} needs an end time`, `${DAYPART_LABEL[d.key]} necesita hora de fin`));
        if (toMin(d.endTime) < toMin(d.startTime) || toMin(d.endTime) >= toMin(next.startTime)) {
          throw new UserError(
            bi(
              `${DAYPART_LABEL[d.key]} must end after it starts and before ${DAYPART_LABEL[next.key]} starts`,
              `${DAYPART_LABEL[d.key]} debe terminar después de empezar y antes de que empiece ${DAYPART_LABEL[next.key]}`,
            ),
          );
        }
      }
    }
    for (let w = 0; w < 7; w++) {
      const close = input.dinnerClose[String(w)];
      if (!close) throw new UserError(bi("Set a closing time for every weekday", "Define una hora de cierre para cada día"));
      if (toMin(close) <= toMin(dps[3].startTime)) throw new UserError(bi("Closing time must be after Dinner starts", "La hora de cierre debe ser después de que empiece Dinner"));
    }

    await db.transaction(async (tx) => {
      const before = { dayparts: await tx.select().from(schema.dayparts), close: await tx.select().from(schema.dinnerClose) };
      for (const d of dps) {
        await tx
          .update(schema.dayparts)
          .set({ startTime: d.startTime, endTime: d.key === "DINNER" ? null : d.endTime })
          .where(eq(schema.dayparts.key, d.key));
      }
      for (let w = 0; w < 7; w++) {
        await tx
          .insert(schema.dinnerClose)
          .values({ weekday: w, closeTime: input.dinnerClose[String(w)] })
          .onConflictDoUpdate({ target: schema.dinnerClose.weekday, set: { closeTime: input.dinnerClose[String(w)] } });
      }
      await tx.update(schema.store).set({
        timezone: input.timezone,
        boardGraceMinutes: input.boardGraceMinutes,
        autoLogoutMinutes: input.autoLogoutMinutes,
        updatedAt: sql`now()`,
      });
      await tx.insert(schema.auditLog).values({ userId: user.id, entity: "schedule", action: "update", before, after: input });
    });
    refresh();
    return undefined;
  });
}

// ---------- Operating days ----------

export async function saveOperatingWeekdays(openWeekdays: number[]) {
  return runAction("settings:edit", async (user) => {
    const open = z.array(z.number().int().min(0).max(6)).parse(openWeekdays);
    if (!open.length) throw new UserError(bi("At least one day must be open", "Al menos un día debe estar abierto"));
    await db.transaction(async (tx) => {
      for (let w = 0; w < 7; w++) {
        await tx
          .insert(schema.operatingWeekdays)
          .values({ weekday: w, isOpen: open.includes(w) })
          .onConflictDoUpdate({ target: schema.operatingWeekdays.weekday, set: { isOpen: open.includes(w) } });
      }
      // Past months keep the weekdays they were prorated with.
      await refreezeFromCurrentMonth(tx);
      await tx.insert(schema.auditLog).values({ userId: user.id, entity: "operating_days", action: "update", after: { open } });
    });
    refresh();
    return undefined;
  });
}

export async function addHoliday(raw: { date: string; label: string }) {
  return runAction("settings:edit", async (user) => {
    const input = z.object({ date: z.iso.date(), label: z.string().trim().min(1, bi("Add a name", "Agrega un nombre")).max(60) }).parse(raw);
    await db
      .insert(schema.holidays)
      .values(input)
      .onConflictDoUpdate({ target: schema.holidays.date, set: { label: input.label } });
    await audit(user.id, "holiday", input.date, "add", undefined, input);
    refresh();
    return undefined;
  });
}

export async function deleteHoliday(date: string) {
  return runAction("settings:edit", async (user) => {
    await db.delete(schema.holidays).where(eq(schema.holidays.date, z.iso.date().parse(date)));
    await audit(user.id, "holiday", date, "delete");
    refresh();
    return undefined;
  });
}

// ---------- Reasons ----------

export async function saveReason(raw: { id?: number; name: string; active: boolean }) {
  return runAction("settings:edit", async (user) => {
    const input = z
      .object({ id: z.number().int().optional(), name: z.string().trim().min(1, bi("Name is required", "El nombre es obligatorio")).max(40), active: z.boolean() })
      .parse(raw);
    if (input.id) {
      await db.update(schema.reasons).set({ name: input.name, active: input.active }).where(eq(schema.reasons.id, input.id));
    } else {
      const [{ n }] = await db.select({ n: count() }).from(schema.reasons);
      await db.insert(schema.reasons).values({ name: input.name, active: input.active, sortOrder: n });
    }
    await audit(user.id, "reason", input.id ?? "new", input.id ? "update" : "create", undefined, input);
    refresh();
    return undefined;
  });
}

export async function moveReason(id: number, dir: -1 | 1) {
  return runAction("settings:edit", async () => {
    const list = await db.select().from(schema.reasons).orderBy(asc(schema.reasons.sortOrder), asc(schema.reasons.id));
    const i = list.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return undefined;
    [list[i], list[j]] = [list[j], list[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < list.length; k++) {
        await tx.update(schema.reasons).set({ sortOrder: k }).where(eq(schema.reasons.id, list[k].id));
      }
    });
    refresh();
    return undefined;
  });
}

export async function deleteReason(id: number) {
  return runAction("settings:edit", async (user) => {
    const [{ n }] = await db.select({ n: count() }).from(schema.wasteEntries).where(eq(schema.wasteEntries.reasonId, id));
    if (n > 0) throw new UserError(bi(`Used by ${n} entries. Deactivate it instead so history keeps the reason.`, `Lo usan ${n} registros. Mejor desactívalo para que el historial conserve el motivo.`));
    await db.delete(schema.reasons).where(eq(schema.reasons.id, id));
    await audit(user.id, "reason", id, "delete");
    refresh();
    return undefined;
  });
}
