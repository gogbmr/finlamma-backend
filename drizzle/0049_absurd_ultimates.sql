ALTER TABLE "parent_contacts" ADD COLUMN "scrubbed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;