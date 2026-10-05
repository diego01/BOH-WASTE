import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const roleEnum = pgEnum("role", ["ADMIN", "TEAM_LEADER", "TEAM_MEMBER"]);
export const productTypeEnum = pgEnum("product_type", ["WASTE", "DONATION"]);
export const unitEnum = pgEnum("unit", ["LB", "EACH", "OZ", "BAG_50OZ"]);
export const daypartEnum = pgEnum("daypart", ["BREAKFAST", "LUNCH", "AFTERNOON", "DINNER"]);
export const allowanceKindEnum = pgEnum("allowance_kind", ["INDIVIDUAL", "GROUP"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------- Store (single row; storeId kept implicit for single-store, see README) ----------

export const store = pgTable("store", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  /** Shared-device idle logout, in minutes. */
  autoLogoutMinutes: smallint("auto_logout_minutes").notNull().default(2),
  /** The header total keeps showing the daypart that just ended for this long (whiteboard time). */
  boardGraceMinutes: smallint("board_grace_minutes").notNull().default(60),
  ...timestamps,
});

// ---------- Users ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  role: roleEnum("role").notNull(),
  pinHash: text("pin_hash").notNull(),
  active: boolean("active").notNull().default(true),
  mustChangePin: boolean("must_change_pin").notNull().default(true),
  /** "en" | "es"; null = follow the device. */
  language: text("language"),
  failedAttempts: smallint("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  ...timestamps,
});

// ---------- Catalog ----------

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#2196F3"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id),
  name: text("name").notNull(),
  /** Inventory code, e.g. "1" for "Chicken, Filets (1)". Null when the source has none. */
  code: text("code").unique(),
  unit: unitEnum("unit").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4, mode: "number" }).notNull(),
  type: productTypeEnum("type").notNull(),
  availableDayparts: daypartEnum("available_dayparts").array().notNull(),
  /** Raw "parte del día" from the Excel import, informational only. */
  parteDelDiaOriginal: text("parte_del_dia_original"),
  active: boolean("active").notNull().default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const productCategories = pgTable(
  "product_categories",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })],
);

export const reasons = pgTable("reasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// ---------- Schedule ----------

/** Daypart windows as local store time "HH:MM". Dinner's end comes from dinner_close. */
export const dayparts = pgTable("dayparts", {
  key: daypartEnum("key").primaryKey(),
  label: text("label").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  sortOrder: smallint("sort_order").notNull(),
});

/** weekday: 0 = Sunday … 6 = Saturday */
export const dinnerClose = pgTable("dinner_close", {
  weekday: smallint("weekday").primaryKey(),
  closeTime: text("close_time").notNull(),
});

export const operatingWeekdays = pgTable("operating_weekdays", {
  weekday: smallint("weekday").primaryKey(),
  isOpen: boolean("is_open").notNull(),
});

export const holidays = pgTable("holidays", {
  date: date("date").primaryKey(),
  label: text("label").notNull(),
});

// ---------- Entries ----------

export const wasteEntries = pgTable(
  "waste_entries",
  {
  /** Generated on the device so offline retries are idempotent. */
  id: uuid("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  // Snapshots taken at entry time so later product edits never change history.
  type: productTypeEnum("type").notNull(),
  unit: unitEnum("unit").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4, mode: "number" }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
  totalCost: numeric("total_cost", { precision: 14, scale: 4, mode: "number" }).notNull(),
  reasonId: integer("reason_id").references(() => reasons.id),
  note: text("note"),
  daypart: daypartEnum("daypart").notNull(),
  daypartManual: boolean("daypart_manual").notNull().default(false),
  /** Store-local business date the entry counts toward. */
  businessDate: date("business_date").notNull(),
  dateManual: boolean("date_manual").notNull().default(false),
  /** Real device time when the entry was made (not sync time). */
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by").references(() => users.id),
  /**
   * Corrections ("Remove") are negative rows pointing at the entry they reduce;
   * they copy its type, daypart, date and unit cost so every total nets out.
   */
  correctsEntryId: uuid("corrects_entry_id").references((): AnyPgColumn => wasteEntries.id),
  /** One Remove action may split across several entries; this groups those rows (= device id). */
  correctionGroup: uuid("correction_group"),
  },
  (t) => [
    index("waste_entries_date_idx").on(t.businessDate),
    index("waste_entries_product_date_idx").on(t.productId, t.businessDate),
    index("waste_entries_corrects_idx").on(t.correctsEntryId),
  ],
);

// ---------- Allowance ----------

export const allowances = pgTable("allowances", {
  id: serial("id").primaryKey(),
  /** "YYYY-MM" */
  month: text("month").notNull(),
  kind: allowanceKindEnum("kind").notNull(),
  name: text("name").notNull(),
  monthlyAmount: numeric("monthly_amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const allowanceProducts = pgTable(
  "allowance_products",
  {
    allowanceId: integer("allowance_id")
      .notNull()
      .references(() => allowances.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    month: text("month").notNull(),
  },
  // A product can belong to only one allowance per month.
  (t) => [primaryKey({ columns: [t.allowanceId, t.productId] }), unique().on(t.productId, t.month)],
);

/**
 * A month whose allowance has been set up. Created when the month is first
 * opened (copying the previous month's allowances). It also freezes the open
 * weekdays used to prorate that month, so later changes to operating days
 * don't rewrite past months' reports.
 */
export const allowanceMonths = pgTable("allowance_months", {
  month: text("month").primaryKey(),
  openWeekdays: smallint("open_weekdays").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Audit ----------

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = (typeof roleEnum.enumValues)[number];
export type ProductType = (typeof productTypeEnum.enumValues)[number];
export type Unit = (typeof unitEnum.enumValues)[number];
export type Daypart = (typeof daypartEnum.enumValues)[number];
