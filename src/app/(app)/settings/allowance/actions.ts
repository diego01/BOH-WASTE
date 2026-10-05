"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { runAction, UserError } from "@/lib/actionResult";
import { ensureMonth } from "@/lib/allowanceData";
import { bi } from "@/lib/i18n";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, bi("Invalid month", "Mes no válido"));
const amount = z
  .number({ message: bi("Amount must be a number", "El monto debe ser un número") })
  .min(0, bi("Amount can't be negative", "El monto no puede ser negativo"))
  .max(1_000_000);
const ids = z.array(z.number().int().positive());

const refresh = () => revalidatePath("/settings/allowance");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Allowances (other than `exceptId`) that already hold any of these products this month. */
async function conflicts(tx: Tx, m: string, productIds: number[], exceptId?: number) {
  if (!productIds.length) return [];
  const rows = await tx
    .select({
      productId: schema.allowanceProducts.productId,
      productName: schema.products.name,
      allowanceId: schema.allowances.id,
      allowanceName: schema.allowances.name,
      kind: schema.allowances.kind,
    })
    .from(schema.allowanceProducts)
    .innerJoin(schema.allowances, eq(schema.allowances.id, schema.allowanceProducts.allowanceId))
    .innerJoin(schema.products, eq(schema.products.id, schema.allowanceProducts.productId))
    .where(and(eq(schema.allowanceProducts.month, m), inArray(schema.allowanceProducts.productId, productIds)));
  return rows.filter((r) => r.allowanceId !== exceptId);
}

/** Takes products out of their current allowances; empty individual allowances are deleted. */
async function detach(tx: Tx, m: string, rows: Awaited<ReturnType<typeof conflicts>>) {
  for (const r of rows) {
    await tx
      .delete(schema.allowanceProducts)
      .where(and(eq(schema.allowanceProducts.productId, r.productId), eq(schema.allowanceProducts.month, m)));
    if (r.kind === "INDIVIDUAL") await tx.delete(schema.allowances).where(eq(schema.allowances.id, r.allowanceId));
  }
}

function conflictError(rows: Awaited<ReturnType<typeof conflicts>>) {
  const en = rows.map((r) => `${r.productName} (in “${r.allowanceName}”)`).join(", ");
  const es = rows.map((r) => `${r.productName} (en “${r.allowanceName}”)`).join(", ");
  // "[CONFLICT] " lets the screen offer to move the products, in either language.
  return new UserError(
    bi(
      `[CONFLICT] Already in another allowance this month: ${en}. A product can only count once per month.`,
      `[CONFLICT] Ya está en otro allowance este mes: ${es}. Un producto solo puede contar una vez por mes.`,
    ),
  );
}

/** Sets the same monthly amount on each product as its own (individual) allowance. */
export async function setIndividualAllowances(raw: { month: string; productIds: number[]; amount: number; moveConflicts?: boolean }) {
  return runAction("settings:edit", async (user) => {
    const input = z.object({ month, productIds: ids.min(1, bi("Select products", "Elige productos")), amount, moveConflicts: z.boolean().optional() }).parse(raw);
    await ensureMonth(db, input.month);
    await db.transaction(async (tx) => {
      const found = await conflicts(tx, input.month, input.productIds);
      const inGroups = found.filter((c) => c.kind === "GROUP");
      if (inGroups.length && !input.moveConflicts) throw conflictError(inGroups);
      if (inGroups.length) await detach(tx, input.month, inGroups);

      const products = await tx.select().from(schema.products).where(inArray(schema.products.id, input.productIds));
      for (const p of products) {
        const own = found.find((c) => c.productId === p.id && c.kind === "INDIVIDUAL");
        if (own) {
          await tx
            .update(schema.allowances)
            .set({ monthlyAmount: input.amount, updatedAt: sql`now()` })
            .where(eq(schema.allowances.id, own.allowanceId));
        } else {
          const [a] = await tx
            .insert(schema.allowances)
            .values({ month: input.month, kind: "INDIVIDUAL", name: p.name, monthlyAmount: input.amount })
            .returning({ id: schema.allowances.id });
          await tx.insert(schema.allowanceProducts).values({ allowanceId: a.id, productId: p.id, month: input.month });
        }
      }
      await tx.insert(schema.auditLog).values({ userId: user.id, entity: "allowance", action: "set.individual", after: input });
    });
    refresh();
    return undefined;
  });
}

export async function saveGroup(raw: {
  id?: number;
  month: string;
  name: string;
  productIds: number[];
  amount: number;
  moveConflicts?: boolean;
}) {
  return runAction("settings:edit", async (user) => {
    const input = z
      .object({
        id: z.number().int().optional(),
        month,
        name: z.string().trim().min(1, bi("Group name is required", "El nombre del grupo es obligatorio")).max(80),
        productIds: ids.min(2, bi("A group needs at least 2 products", "Un grupo necesita al menos 2 productos")),
        amount,
        moveConflicts: z.boolean().optional(),
      })
      .parse(raw);
    await ensureMonth(db, input.month);
    await db.transaction(async (tx) => {
      const found = await conflicts(tx, input.month, input.productIds, input.id);
      if (found.length && !input.moveConflicts) throw conflictError(found);
      if (found.length) await detach(tx, input.month, found);

      let groupId = input.id;
      if (groupId) {
        const [g] = await tx.select().from(schema.allowances).where(eq(schema.allowances.id, groupId));
        if (!g || g.kind !== "GROUP" || g.month !== input.month) throw new UserError(bi("Group not found", "Grupo no encontrado"));
        await tx
          .update(schema.allowances)
          .set({ name: input.name, monthlyAmount: input.amount, updatedAt: sql`now()` })
          .where(eq(schema.allowances.id, groupId));
        await tx.delete(schema.allowanceProducts).where(eq(schema.allowanceProducts.allowanceId, groupId));
      } else {
        const [g] = await tx
          .insert(schema.allowances)
          .values({ month: input.month, kind: "GROUP", name: input.name, monthlyAmount: input.amount })
          .returning({ id: schema.allowances.id });
        groupId = g.id;
      }
      await tx
        .insert(schema.allowanceProducts)
        .values(input.productIds.map((productId) => ({ allowanceId: groupId!, productId, month: input.month })));
      await tx.insert(schema.auditLog).values({
        userId: user.id,
        entity: "allowance",
        entityId: String(groupId),
        action: input.id ? "group.update" : "group.create",
        after: input,
      });
    });
    refresh();
    return undefined;
  });
}

export async function updateAllowanceAmount(id: number, value: number) {
  return runAction("settings:edit", async (user) => {
    const amt = amount.parse(value);
    const [before] = await db.select().from(schema.allowances).where(eq(schema.allowances.id, id));
    if (!before) throw new UserError(bi("Allowance not found", "Allowance no encontrado"));
    await db.update(schema.allowances).set({ monthlyAmount: amt, updatedAt: sql`now()` }).where(eq(schema.allowances.id, id));
    await db.insert(schema.auditLog).values({
      userId: user.id,
      entity: "allowance",
      entityId: String(id),
      action: "amount",
      before: { amount: before.monthlyAmount },
      after: { amount: amt },
    });
    refresh();
    return undefined;
  });
}

/**
 * Removes an allowance from its month only. Other months are separate rows,
 * so past reports keep their allowance.
 */
export async function deleteAllowance(id: number) {
  return runAction("settings:edit", async (user) => {
    const [before] = await db.select().from(schema.allowances).where(eq(schema.allowances.id, id));
    if (!before) throw new UserError(bi("Allowance not found", "Allowance no encontrado"));
    await db.delete(schema.allowances).where(eq(schema.allowances.id, id));
    await db.insert(schema.auditLog).values({ userId: user.id, entity: "allowance", entityId: String(id), action: "delete", before });
    refresh();
    return undefined;
  });
}
