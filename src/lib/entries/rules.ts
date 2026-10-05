import type { Role } from "@/db/schema";
import { can } from "@/lib/auth/permissions";

/** Entry rules agreed with the store. Pure, so the UI and the server use the same logic. */

/** How many days back an entry's business date may be set. */
export function maxBackdateDays(role: Role): number {
  return role === "TEAM_MEMBER" ? 1 : 7;
}

/** Removing quantity: Team Members only from today's entries, leaders up to 7 days back. */
export function maxRemoveBackDays(role: Role): number {
  return role === "TEAM_MEMBER" ? 0 : 7;
}

export const AUTHOR_EDIT_MINUTES = 15;

/** Team Leader / Admin: any entry. Others: their own, within 15 minutes of creating it. */
export function canModifyEntry(
  user: { id: string; role: Role },
  entry: { userId: string; createdAt: Date | string; voidedAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (entry.voidedAt) return false;
  if (can(user.role, "reports:view")) return true;
  if (entry.userId !== user.id) return false;
  return now.getTime() - new Date(entry.createdAt).getTime() <= AUTHOR_EDIT_MINUTES * 60_000;
}

export const MAX_QUANTITY = 10_000;
