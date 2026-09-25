CREATE TYPE "public"."coach_note_category" AS ENUM('strength', 'gap', 'opportunity', 'habit');--> statement-breakpoint
CREATE TYPE "public"."coach_note_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "coach_note_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" "coach_note_category" NOT NULL,
	"template" jsonb NOT NULL,
	"status" "coach_note_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "coach_note_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"efficiency_score" integer NOT NULL,
	"sub_metrics" jsonb NOT NULL,
	"module_breakdown" jsonb NOT NULL,
	"topic_mastery" jsonb NOT NULL,
	"strength_note_id" uuid,
	"gap_note_id" uuid,
	"opportunity_note_id" uuid,
	"habit_note_id" uuid,
	"opportunity_topic" jsonb,
	"habit_detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "report_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parent_contacts" ADD COLUMN "weekly_report_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_note_templates" ADD CONSTRAINT "coach_note_templates_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_strength_note_id_coach_note_templates_id_fk" FOREIGN KEY ("strength_note_id") REFERENCES "public"."coach_note_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_gap_note_id_coach_note_templates_id_fk" FOREIGN KEY ("gap_note_id") REFERENCES "public"."coach_note_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_opportunity_note_id_coach_note_templates_id_fk" FOREIGN KEY ("opportunity_note_id") REFERENCES "public"."coach_note_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_habit_note_id_coach_note_templates_id_fk" FOREIGN KEY ("habit_note_id") REFERENCES "public"."coach_note_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_snapshots_user_week_idx" ON "report_snapshots" USING btree ("user_id","week_start_date");