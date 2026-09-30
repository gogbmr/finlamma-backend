CREATE TABLE "league_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"scope" text NOT NULL,
	"zone" "league_zone" NOT NULL,
	"xp" integer NOT NULL,
	"vm_awarded" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferences" SET DEFAULT '{"sound":true,"haptics":true,"dataSaver":false,"cheersEnabled":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "league_settlements" ADD CONSTRAINT "league_settlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_settlements_user_week_idx" ON "league_settlements" USING btree ("user_id","week_start_date");--> statement-breakpoint
CREATE INDEX "league_settlements_week_idx" ON "league_settlements" USING btree ("week_start_date");