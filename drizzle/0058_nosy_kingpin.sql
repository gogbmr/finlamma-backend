CREATE TYPE "public"."staff_gender" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "gender" "staff_gender";--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "photo_key" text;