CREATE TYPE "public"."allowance_kind" AS ENUM('INDIVIDUAL', 'GROUP');--> statement-breakpoint
CREATE TYPE "public"."daypart" AS ENUM('BREAKFAST', 'LUNCH', 'AFTERNOON', 'DINNER');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('WASTE', 'DONATION');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'TEAM_LEADER', 'TEAM_MEMBER');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('LB', 'EACH', 'OZ', 'BAG_50OZ');--> statement-breakpoint
CREATE TABLE "allowance_products" (
	"allowance_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"month" text NOT NULL,
	CONSTRAINT "allowance_products_allowance_id_product_id_pk" PRIMARY KEY("allowance_id","product_id"),
	CONSTRAINT "allowance_products_product_id_month_unique" UNIQUE("product_id","month")
);
--> statement-breakpoint
CREATE TABLE "allowances" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"kind" "allowance_kind" NOT NULL,
	"name" text NOT NULL,
	"monthly_amount" numeric(12, 2) NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#2196F3' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "dayparts" (
	"key" "daypart" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text,
	"sort_order" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dinner_close" (
	"weekday" smallint PRIMARY KEY NOT NULL,
	"close_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_weekdays" (
	"weekday" smallint PRIMARY KEY NOT NULL,
	"is_open" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"area_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"unit" "unit" NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"type" "product_type" NOT NULL,
	"available_dayparts" "daypart"[] NOT NULL,
	"parte_del_dia_original" text,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reasons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"auto_logout_minutes" smallint DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"pin_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_pin" boolean DEFAULT true NOT NULL,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "waste_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "product_type" NOT NULL,
	"unit" "unit" NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"total_cost" numeric(14, 4) NOT NULL,
	"reason_id" integer,
	"note" text,
	"daypart" "daypart" NOT NULL,
	"daypart_manual" boolean DEFAULT false NOT NULL,
	"business_date" date NOT NULL,
	"date_manual" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"voided_by" uuid
);
--> statement-breakpoint
ALTER TABLE "allowance_products" ADD CONSTRAINT "allowance_products_allowance_id_allowances_id_fk" FOREIGN KEY ("allowance_id") REFERENCES "public"."allowances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_products" ADD CONSTRAINT "allowance_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_reason_id_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;