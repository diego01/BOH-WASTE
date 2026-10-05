import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { can } from "@/lib/auth/permissions";
import { verifyEntryToken } from "@/lib/auth/entryToken";
import { assignDaypart, daysBetween, type ScheduleConfig } from "@/lib/dayparts";
import { UNIT_SHORT } from "@/lib/domain";
import { bi } from "@/lib/i18n";
import { entryPayload, type EntryResult } from "./payload";
import { allocateRemoval, removableEntries, removableTotal } from "./removal";
import { maxBackdateDays, maxRemoveBackDays } from "./rules";

const FUTURE_TOLERANCE_MS = 10 * 60_000;
const MAX_AGE_MS = 8 * 86_400_000;

class Reject extends Error {}

/**
 * Validates and stores queued entries. Idempotent by entry id, so a device can
 * safely resend after a timeout. Daypart and business date are recomputed here
 * from the device time (occurredAt), never from the sync time.
 */
export async function ingestEntries(db: DB, raw: unknown[], config: ScheduleConfig, now = new Date()): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  const userCache = new Map<string, typeof schema.users.$inferSelect | undefined>();

  for (const item of raw) {
    const id = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : "unknown";
    try {
      const parsed = entryPayload.safeParse(item);
      if (!parsed.success) throw new Reject(parsed.error.issues[0]?.message ?? bi("Invalid entry", "Registro no válido"));
      const e = parsed.data;

      const userId = await verifyEntryToken(e.token);
      if (!userId) throw new Reject(bi("Sign-in expired for this entry", "La sesión de este registro expiró"));
      if (!userCache.has(userId)) {
        const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
        userCache.set(userId, u);
      }
      const user = userCache.get(userId);
      if (!user || !user.active || !can(user.role, "entries:create")) throw new Reject(bi("User can't log entries", "El usuario no puede registrar"));

      const occurredAt = new Date(e.occurredAt);
      if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) throw new Reject(bi("Device clock is ahead; check the phone's time", "La hora del teléfono está adelantada; revísala"));
      if (now.getTime() - occurredAt.getTime() > MAX_AGE_MS) throw new Reject(bi("Entry is too old to sync", "El registro es muy antiguo para sincronizar"));

      const auto = assignDaypart(occurredAt, config);
      let businessDate = auto.businessDate;
      if (e.dateManual) {
        const maxBack = e.kind === "REMOVE" ? maxRemoveBackDays(user.role) : maxBackdateDays(user.role);
        const back = daysBetween(e.businessDate, auto.businessDate);
        if (back < 0 || back > maxBack) {
          throw new Reject(
            maxBack === 0
              ? bi("You can only remove from today's entries", "Solo puedes quitar de los registros de hoy")
              : bi(`Date must be within ${maxBack} day(s) back`, `La fecha debe estar dentro de ${maxBack} día(s) atrás`),
          );
        }
        businessDate = e.businessDate;
      }

      const [product] = await db.select().from(schema.products).where(eq(schema.products.id, e.productId));
      if (!product) throw new Reject(bi("Product not found", "Producto no encontrado"));

      if (e.kind === "REMOVE") {
        const status = await db.transaction(async (tx) => {
          // Serialize removals per product so two phones can't remove the same quantity.
          await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, product.id)).for("update");

          const [already] = await tx
            .select({ id: schema.wasteEntries.id })
            .from(schema.wasteEntries)
            .where(eq(schema.wasteEntries.correctionGroup, e.id))
            .limit(1);
          if (already) return "duplicate" as const;

          const rows = await tx
            .select()
            .from(schema.wasteEntries)
            .where(and(eq(schema.wasteEntries.productId, product.id), eq(schema.wasteEntries.businessDate, businessDate)));
          const candidates = removableEntries(
            rows.map((r) => ({ ...r, unitCost: Number(r.unitCost), quantity: Number(r.quantity) })),
            { id: user.id, role: user.role },
            product.id,
            businessDate,
          );
          const parts = allocateRemoval(candidates, e.quantity);
          if (!parts) {
            const max = removableTotal(candidates);
            throw new Reject(
              max > 0
                ? bi(`Only ${max} ${UNIT_SHORT[product.unit]} can be removed`, `Solo se puede quitar ${max} ${UNIT_SHORT[product.unit]}`)
                : bi("Nothing logged that you can remove", "No hay nada registrado que puedas quitar"),
            );
          }
          await tx.insert(schema.wasteEntries).values(
            parts.map((p, i) => ({
              id: i === 0 ? e.id : randomUUID(),
              productId: product.id,
              areaId: product.areaId,
              userId: user.id,
              type: p.type,
              unit: product.unit,
              unitCost: p.unitCost,
              quantity: -p.quantity,
              totalCost: -p.quantity * p.unitCost,
              reasonId: null,
              note: e.note || null,
              daypart: p.daypart,
              daypartManual: false,
              businessDate,
              dateManual: businessDate !== auto.businessDate,
              occurredAt,
              correctsEntryId: p.entryId,
              correctionGroup: e.id,
            })),
          );
          return "saved" as const;
        });
        results.push({ id: e.id, status });
        continue;
      }

      if (e.daypartManual && !can(user.role, "entries:changeDaypart")) throw new Reject(bi("Not allowed to change the daypart", "No puedes cambiar el horario"));
      const daypart = e.daypartManual ? e.daypart : auto.daypart;
      const unitCost = Number(product.unitCost);
      const inserted = await db
        .insert(schema.wasteEntries)
        .values({
          id: e.id,
          productId: product.id,
          areaId: product.areaId,
          userId: user.id,
          type: product.type,
          unit: product.unit,
          unitCost,
          quantity: e.quantity,
          totalCost: e.quantity * unitCost,
          reasonId: e.reasonId,
          note: e.note || null,
          daypart,
          daypartManual: daypart !== auto.daypart,
          businessDate,
          dateManual: businessDate !== auto.businessDate,
          occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: schema.wasteEntries.id });
      results.push({ id: e.id, status: inserted.length ? "saved" : "duplicate" });
    } catch (err) {
      if (err instanceof Reject) results.push({ id, status: "rejected", error: err.message });
      else throw err;
    }
  }
  return results;
}
