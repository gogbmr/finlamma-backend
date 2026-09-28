ALTER TABLE "questions" ADD COLUMN "source_story_id" uuid;--> statement-breakpoint
ALTER TABLE "pulse_check_attempts" ADD COLUMN "raw_vm_earned_paise" bigint;--> statement-breakpoint
ALTER TABLE "pulse_check_attempts" ADD COLUMN "daily_cap_reached" boolean;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_story_id_news_stories_id_fk" FOREIGN KEY ("source_story_id") REFERENCES "public"."news_stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_source_story_id_idx" ON "questions" USING btree ("source_story_id");