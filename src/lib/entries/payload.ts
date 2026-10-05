import { z } from "zod";
import { daypartEnum } from "@/db/schema";
import { bi } from "@/lib/i18n";
import { MAX_QUANTITY } from "./rules";

/** What the device queues and sends to POST /api/entries. Shared by client and server. */
export const entryPayload = z.object({
  id: z.uuid(),
  /** ADD logs waste/donation; REMOVE takes back quantity logged by mistake (see removal.ts). */
  kind: z.enum(["ADD", "REMOVE"]).default("ADD"),
  token: z.string().min(10),
  productId: z.number().int().positive(),
  quantity: z.number().positive(bi("Quantity must be more than 0", "La cantidad debe ser mayor que 0")).max(MAX_QUANTITY),
  reasonId: z.number().int().positive().nullable(),
  note: z.string().trim().max(500).nullable(),
  /** Device time when the entry was made (ISO). */
  occurredAt: z.iso.datetime({ offset: true }),
  daypart: z.enum(daypartEnum.enumValues),
  daypartManual: z.boolean(),
  businessDate: z.iso.date(),
  dateManual: z.boolean(),
});

export type EntryPayload = z.input<typeof entryPayload>;

export type EntryResult =
  | { id: string; status: "saved" | "duplicate" }
  | { id: string; status: "rejected"; error: string };
