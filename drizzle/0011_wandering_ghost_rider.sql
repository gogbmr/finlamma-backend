CREATE TYPE "public"."world_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order" integer NOT NULL,
	"title" jsonb NOT NULL,
	"tagline" jsonb NOT NULL,
	"theme" text NOT NULL,
	"display_xp_target" integer NOT NULL,
	"art_key" text,
	"mentor_id" uuid NOT NULL,
	"status" "world_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "worlds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worlds_status_idx" ON "worlds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "worlds_order_idx" ON "worlds" USING btree ("order");--> statement-breakpoint
CREATE INDEX "worlds_mentor_id_idx" ON "worlds" USING btree ("mentor_id");