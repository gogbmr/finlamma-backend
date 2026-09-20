ALTER TABLE "consent_records" ADD COLUMN "last_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "request_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "request_count_date" date;