CREATE TABLE "question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"prompt" jsonb NOT NULL,
	"explanation" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"answer" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "revision" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "question_answers" ALTER COLUMN "question_revision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_revisions_question_id_revision_idx" ON "question_revisions" USING btree ("question_id","revision");