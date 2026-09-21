CREATE TYPE "public"."quiz_attempt_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "question_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"served_at" timestamp with time zone NOT NULL,
	"timer_seconds" integer NOT NULL,
	"answered_at" timestamp with time zone,
	"submitted_answer" jsonb,
	"is_correct" boolean,
	"timed_out" boolean,
	"speed_bonus_awarded" boolean,
	"fever_active" boolean,
	"xp_awarded_preview" integer,
	"combo_after" integer,
	"question_revision" integer
);
--> statement-breakpoint
ALTER TABLE "question_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"is_first_pass" boolean NOT NULL,
	"status" "quiz_attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"total_xp_preview" integer
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_answers_attempt_step_idx" ON "question_answers" USING btree ("attempt_id","step_index");--> statement-breakpoint
CREATE INDEX "question_answers_attempt_id_idx" ON "question_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_lesson_idx" ON "quiz_attempts" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_status_idx" ON "quiz_attempts" USING btree ("status");