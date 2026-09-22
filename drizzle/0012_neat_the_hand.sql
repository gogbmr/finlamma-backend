CREATE TYPE "public"."lesson_kind" AS ENUM('video', 'story', 'quiz', 'boss_quiz', 'role_play', 'doubt_zone');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"world_id" uuid NOT NULL,
	"chapter" integer NOT NULL,
	"step" integer NOT NULL,
	"kind" "lesson_kind" NOT NULL,
	"title" jsonb NOT NULL,
	"blurb" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"status" "lesson_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lessons_status_idx" ON "lessons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lessons_world_id_idx" ON "lessons" USING btree ("world_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_world_chapter_step_idx" ON "lessons" USING btree ("world_id","chapter","step");