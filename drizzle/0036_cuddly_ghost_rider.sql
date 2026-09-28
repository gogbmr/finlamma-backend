CREATE TYPE "public"."news_category" AS ENUM('rbi_rates', 'inflation', 'stock_market_basics', 'ipos_new_listings', 'mutual_funds', 'banking', 'scams_fraud', 'government_budget', 'global_markets', 'currency');--> statement-breakpoint
CREATE TYPE "public"."news_desk_pick_kind" AS ENUM('desk_pick', 'exam_alert', 'scam_watch');--> statement-breakpoint
CREATE TYPE "public"."news_impact" AS ENUM('good', 'bad', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."news_quality_grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."news_story_status" AS ENUM('draft', 'published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."pulse_check_attempt_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
ALTER TYPE "public"."reward_activity_kind" ADD VALUE 'pulse_check';--> statement-breakpoint
ALTER TYPE "public"."question_format" ADD VALUE 'number_guess';--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" jsonb NOT NULL,
	"order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_desk_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "news_desk_pick_kind" NOT NULL,
	"story_id" uuid,
	"content" jsonb,
	"attribution" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "news_desk_picks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "news_editions_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "news_editions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_raw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_raw" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dwell_seconds" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_id" uuid,
	"topic_id" uuid,
	"category" "news_category" NOT NULL,
	"impact" "news_impact" NOT NULL,
	"content" jsonb NOT NULL,
	"jargon" jsonb,
	"outlet" text NOT NULL,
	"source_url" text NOT NULL,
	"quality_grade" "news_quality_grade" NOT NULL,
	"quality_grade_override" "news_quality_grade",
	"featured" boolean DEFAULT false NOT NULL,
	"advice_like_warnings" jsonb,
	"status" "news_story_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "news_stories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pulse_check_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"served_at" timestamp with time zone NOT NULL,
	"timer_seconds" integer NOT NULL,
	"question_revision" integer NOT NULL,
	"answered_at" timestamp with time zone,
	"submitted_answer" jsonb,
	"is_correct" boolean,
	"timed_out" boolean,
	"speed_bonus_awarded" boolean,
	"combo_after" integer,
	"vm_awarded_paise" bigint
);
--> statement-breakpoint
ALTER TABLE "pulse_check_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pulse_check_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"status" "pulse_check_attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"accuracy_pct" integer,
	"best_combo" integer,
	"all_correct_bonus_awarded" boolean,
	"total_vm_awarded_paise" bigint
);
--> statement-breakpoint
ALTER TABLE "pulse_check_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "news_desk_picks" ADD CONSTRAINT "news_desk_picks_story_id_news_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."news_stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_desk_picks" ADD CONSTRAINT "news_desk_picks_created_by_staff_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_reads" ADD CONSTRAINT "news_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_reads" ADD CONSTRAINT "news_reads_story_id_news_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."news_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_raw_id_news_raw_id_fk" FOREIGN KEY ("raw_id") REFERENCES "public"."news_raw"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_check_answers" ADD CONSTRAINT "pulse_check_answers_attempt_id_pulse_check_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."pulse_check_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_check_answers" ADD CONSTRAINT "pulse_check_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_check_attempts" ADD CONSTRAINT "pulse_check_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_check_attempts" ADD CONSTRAINT "pulse_check_attempts_edition_id_news_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."news_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topics_order_idx" ON "topics" USING btree ("order");--> statement-breakpoint
CREATE INDEX "news_desk_picks_active_idx" ON "news_desk_picks" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "news_raw_source_external_id_idx" ON "news_raw" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "news_reads_user_story_idx" ON "news_reads" USING btree ("user_id","story_id");--> statement-breakpoint
CREATE INDEX "news_stories_status_idx" ON "news_stories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "news_stories_topic_id_idx" ON "news_stories" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "news_stories_category_idx" ON "news_stories" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "pulse_check_answers_attempt_step_idx" ON "pulse_check_answers" USING btree ("attempt_id","step_index");--> statement-breakpoint
CREATE INDEX "pulse_check_answers_attempt_id_idx" ON "pulse_check_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "pulse_check_attempts_user_edition_idx" ON "pulse_check_attempts" USING btree ("user_id","edition_id");--> statement-breakpoint
CREATE INDEX "pulse_check_attempts_status_idx" ON "pulse_check_attempts" USING btree ("status");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_topic_id_idx" ON "questions" USING btree ("topic_id");