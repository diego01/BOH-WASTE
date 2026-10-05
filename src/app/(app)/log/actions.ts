"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { daypartEnum } from "@/db/schema";
import { runAction, UserError } from "@/lib/actionResult";
import { bi } from "@/lib/i18n";
import { assignDaypart, daysBetween } from "@/lib/dayparts";
import { canModifyEntry, MAX_QUANTITY, maxBackdateDays } from "@/lib/entries/rules";
import { loadScheduleConfig } from "@/lib/storeConfig";

async function loadModifiable(id: string, user: { id: string; role: Parameters<typeof canModifyEntry>[0]["role"] }) {
  const [entry] = await db.select().from(schema.wasteEntries).where(eq(schema.wasteEntries.id, id));
  if (!entry) throw new UserError(bi("Entry not found", "Registro no encontrado"));
  if (!canModifyEntry(user, entry)) {
    throw new UserError(
      entry.voidedAt
        ? bi("This entry is voided", "Este registro está anulado")
        : bi(
            "You can only change your own entries within 15 minutes. Ask a Team Leader.",
            "Solo puedes cambiar tus propios registros dentro de 15 minutos. Pide ayuda a un Team Leader.",
          ),
    );
  }
  return entry;
}

const editInput = z.object({
  quantity: z.number().positive(bi("Quantity must be more than 0", "La cantidad debe ser mayor que 0")).max(MAX_QUANTITY),
  reasonId: z.number().int().positive().nullable(),
  note: z.string().trim().max(500).nullable(),
  daypart: z.enum(daypartEnum.enumValues),
  businessDate: z.iso.date(),
});

export async function editEntry(id: string, raw: z.input<typeof editInput>) {
  return runAction("entries:create", async (user) => {
    const input = editInput.parse(raw);
    const entry = await loadModifiable(id, user);
    if (entry.correctsEntryId) throw new UserError(bi("This is a removal. Undo it instead of editing it.", "Esto es algo quitado. Deshazlo en vez de editarlo."));
    if (entry.unit === "EACH" && !Number.isInteger(input.quantity)) throw new UserError(bi("Whole units only", "Solo unidades enteras"));
    const removed = (
      await db
        .select({ q: schema.wasteEntries.quantity })
        .from(schema.wasteEntries)
        .where(and(eq(schema.wasteEntries.correctsEntryId, id), isNull(schema.wasteEntries.voidedAt)))
    ).reduce((s, r) => s - Number(r.q), 0);
    if (input.quantity < removed - 1e-9) {
      throw new UserError(
        bi(
          `${removed} was already removed from this entry; the quantity can't go below that`,
          `Ya se quitó ${removed} de este registro; la cantidad no puede ser menor`,
        ),
      );
    }

    const auto = assignDaypart(entry.occurredAt, await loadScheduleConfig(db));
    const back = daysBetween(input.businessDate, auto.businessDate);
    if (input.businessDate !== entry.businessDate && (back < 0 || back > maxBackdateDays(user.role))) {
      throw new UserError(
        bi(
          `Date must be within ${maxBackdateDays(user.role)} day(s) of when it was logged`,
          `La fecha debe estar dentro de ${maxBackdateDays(user.role)} día(s) desde que se registró`,
        ),
      );
    }

    const after = {
      quantity: input.quantity,
      totalCost: input.quantity * Number(entry.unitCost), // cost snapshot never changes
      reasonId: input.reasonId,
      note: input.note || null,
      daypart: input.daypart,
      daypartManual: input.daypart !== auto.daypart,
      businessDate: input.businessDate,
      dateManual: input.businessDate !== auto.businessDate,
    };
    await db.transaction(async (tx) => {
      await tx
        .update(schema.wasteEntries)
        .set({ ...after, editedAt: sql`now()` })
        .where(eq(schema.wasteEntries.id, id));
      await tx.insert(schema.auditLog).values({
        userId: user.id,
        entity: "entry",
        entityId: id,
        action: "edit",
        before: {
          quantity: entry.quantity,
          reasonId: entry.reasonId,
          note: entry.note,
          daypart: entry.daypart,
          businessDate: entry.businessDate,
        },
        after,
      });
    });
    revalidatePath("/log", "layout");
    return undefined;
  });
}

export async function voidEntry(id: string) {
  return runAction("entries:create", async (user) => {
    const entry = await loadModifiable(id, user);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.wasteEntries)
        .set({ voidedAt: sql`now()`, voidedBy: user.id })
        .where(eq(schema.wasteEntries.id, id));
      // Removals against a voided entry would leave a negative balance: void them too.
      await tx
        .update(schema.wasteEntries)
        .set({ voidedAt: sql`now()`, voidedBy: user.id })
        .where(and(eq(schema.wasteEntries.correctsEntryId, id), isNull(schema.wasteEntries.voidedAt)));
      await tx.insert(schema.auditLog).values({
        userId: user.id,
        entity: "entry",
        entityId: id,
        action: entry.correctsEntryId ? "removal.undo" : "void",
      });
    });
    revalidatePath("/log", "layout");
    return undefined;
  });
}
