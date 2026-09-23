CREATE TABLE "rank_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"min_level" integer NOT NULL,
	"title" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_titles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_titles_min_level_idx" ON "rank_titles" USING btree ("min_level");