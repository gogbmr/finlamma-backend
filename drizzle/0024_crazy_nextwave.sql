ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb DEFAULT '{"sound":true,"haptics":true,"dataSaver":false}'::jsonb NOT NULL;