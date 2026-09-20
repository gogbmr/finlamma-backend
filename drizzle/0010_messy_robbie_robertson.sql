CREATE TYPE "public"."mentor_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "mentors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order" integer NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"bio" jsonb NOT NULL,
	"world_range_start" integer NOT NULL,
	"world_range_end" integer,
	"art_key" text,
	"status" "mentor_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	CONSTRAINT "mentors_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "mentors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentors_status_idx" ON "mentors" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "mentors_order_idx" ON "mentors" USING btree ("order");