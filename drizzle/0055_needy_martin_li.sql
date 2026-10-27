CREATE TABLE "news_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"story_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_bookmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "news_bookmarks" ADD CONSTRAINT "news_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_bookmarks" ADD CONSTRAINT "news_bookmarks_story_id_news_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."news_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "news_bookmarks_user_story_idx" ON "news_bookmarks" USING btree ("user_id","story_id");--> statement-breakpoint
CREATE INDEX "news_bookmarks_user_id_idx" ON "news_bookmarks" USING btree ("user_id");