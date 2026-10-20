ALTER TABLE "sip_plans" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sip_plans_user_idempotency_idx" ON "sip_plans" USING btree ("user_id","idempotency_key");