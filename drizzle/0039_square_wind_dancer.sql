CREATE TYPE "public"."league_zone" AS ENUM('promote', 'safe', 'demote');--> statement-breakpoint
CREATE TABLE "about_me_chips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" jsonb NOT NULL,
	"icon_key" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "about_me_chips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cheers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"cheer_date_ist" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cheers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"week_start_date" date NOT NULL,
	"scope" text NOT NULL,
	"pool_size" integer NOT NULL,
	"rankings" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"zone" "league_zone" NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "leagues_scope_unique" UNIQUE("scope")
);
--> statement-breakpoint
ALTER TABLE "leagues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_about_me_chips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"chip_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_about_me_chips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "world_xp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"world_id" uuid NOT NULL,
	"date_ist" date NOT NULL,
	"xp_total" integer NOT NULL,
	"member_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_xp_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cheers" ADD CONSTRAINT "cheers_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheers" ADD CONSTRAINT "cheers_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_about_me_chips" ADD CONSTRAINT "user_about_me_chips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_about_me_chips" ADD CONSTRAINT "user_about_me_chips_chip_id_about_me_chips_id_fk" FOREIGN KEY ("chip_id") REFERENCES "public"."about_me_chips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_xp_snapshots" ADD CONSTRAINT "world_xp_snapshots_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "about_me_chips_active_idx" ON "about_me_chips" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "cheers_sender_receiver_date_idx" ON "cheers" USING btree ("sender_id","receiver_id","cheer_date_ist");--> statement-breakpoint
CREATE INDEX "cheers_receiver_id_idx" ON "cheers" USING btree ("receiver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_snapshots_week_scope_idx" ON "leaderboard_snapshots" USING btree ("week_start_date","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_league_user_idx" ON "league_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "league_members_user_id_idx" ON "league_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_about_me_chips_user_chip_idx" ON "user_about_me_chips" USING btree ("user_id","chip_id");--> statement-breakpoint
CREATE INDEX "user_about_me_chips_user_id_idx" ON "user_about_me_chips" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_xp_snapshots_world_date_idx" ON "world_xp_snapshots" USING btree ("world_id","date_ist");