ALTER TABLE "doubt_messages" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "doubt_messages" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "doubt_messages" ADD CONSTRAINT "doubt_messages_reviewed_by_staff_members_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doubt_messages_flagged_created_at_idx" ON "doubt_messages" USING btree ("flagged","created_at");