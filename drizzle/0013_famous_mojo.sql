CREATE TYPE "public"."question_format" AS ENUM('single_select', 'ordering', 'sort_buckets', 'fill_blank', 'match_pairs', 'spot_mistake');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"format" "question_format" NOT NULL,
	"topic" text,
	"prompt" jsonb NOT NULL,
	"explanation" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status");