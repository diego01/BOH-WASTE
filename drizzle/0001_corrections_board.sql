ALTER TABLE "store" ADD COLUMN "board_grace_minutes" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD COLUMN "corrects_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD COLUMN "correction_group" uuid;--> statement-breakpoint
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_corrects_entry_id_waste_entries_id_fk" FOREIGN KEY ("corrects_entry_id") REFERENCES "public"."waste_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waste_entries_date_idx" ON "waste_entries" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "waste_entries_corrects_idx" ON "waste_entries" USING btree ("corrects_entry_id");