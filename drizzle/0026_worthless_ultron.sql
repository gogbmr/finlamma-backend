CREATE TABLE "session_time_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"date_ist" date NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_time_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_time_daily" ADD CONSTRAINT "session_time_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_time_daily_user_date_idx" ON "session_time_daily" USING btree ("user_id","date_ist");