ALTER TABLE "users" ADD COLUMN "state" text;--> statement-breakpoint
CREATE INDEX "xp_events_created_at_idx" ON "xp_events" USING btree ("created_at");