CREATE TABLE "allowance_months" (
	"month" text PRIMARY KEY NOT NULL,
	"open_weekdays" smallint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
