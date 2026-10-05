import type { Daypart, ProductType, Role } from "@/db/schema";
import { can } from "@/lib/auth/permissions";

/**
 * "Remove" corrections. Pure so the device (offline preview) and the server
 * (authoritative) allocate exactly the same way.
 *
 * A removal reduces the most recent entries first (LIFO). Each affected entry
 * gets a negative row that copies its daypart, date, type and unit cost, so
 * daypart totals, reports and allowance all net out correctly.
 */

export type LedgerRow = {
  id: string;
  userId: string;
  productId: number;
  businessDate: string;
  daypart: Daypart;
  type: ProductType;
  unitCost: number;
  quantity: number;
  occurredAt: string | Date;
  correctsEntryId: string | null;
  voidedAt?: string | Date | null;
};

/** A ledger row plus display data, as kept on the device. */
export type OptimisticRow = LedgerRow & { areaId: number; totalCost: number };

export type RemovalPart = { entryId: string; quantity: number; daypart: Daypart; unitCost: number; type: ProductType };

const EPS = 1e-9;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Remaining quantity per original entry after its (non-voided) corrections. */
export function remainingByEntry(rows: LedgerRow[]): Map<string, number> {
  const remaining = new Map<string, number>();
  for (const r of rows) if (!r.voidedAt && !r.correctsEntryId) remaining.set(r.id, r.quantity);
  for (const r of rows) {
    if (r.voidedAt || !r.correctsEntryId || !remaining.has(r.correctsEntryId)) continue;
    remaining.set(r.correctsEntryId, remaining.get(r.correctsEntryId)! + r.quantity); // correction quantity is negative
  }
  return remaining;
}

/** Team Members may only remove from their own entries; leaders from anyone's. */
export function removableEntries(
  rows: LedgerRow[],
  actor: { id: string; role: Role },
  productId: number,
  businessDate: string,
): (LedgerRow & { remaining: number })[] {
  const remaining = remainingByEntry(rows);
  const anyone = can(actor.role, "reports:view");
  return rows
    .filter(
      (r) =>
        !r.voidedAt &&
        !r.correctsEntryId &&
        r.productId === productId &&
        r.businessDate === businessDate &&
        (anyone || r.userId === actor.id) &&
        (remaining.get(r.id) ?? 0) > EPS,
    )
    .map((r) => ({ ...r, remaining: round3(remaining.get(r.id)!) }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function removableTotal(candidates: { remaining: number }[]): number {
  return round3(candidates.reduce((s, c) => s + c.remaining, 0));
}

/** Splits `amount` over the candidates, newest first. Null when there isn't enough to remove. */
export function allocateRemoval(candidates: (LedgerRow & { remaining: number })[], amount: number): RemovalPart[] | null {
  if (amount <= 0 || amount > removableTotal(candidates) + EPS) return null;
  const parts: RemovalPart[] = [];
  let left = amount;
  for (const c of candidates) {
    if (left <= EPS) break;
    const take = round3(Math.min(c.remaining, left));
    parts.push({ entryId: c.id, quantity: take, daypart: c.daypart, unitCost: c.unitCost, type: c.type });
    left = round3(left - take);
  }
  return parts;
}
