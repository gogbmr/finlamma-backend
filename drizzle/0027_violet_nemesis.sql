CREATE TYPE "public"."badge_category" AS ENUM('learning', 'streak', 'trading', 'news');--> statement-breakpoint
CREATE TYPE "public"."badge_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."reward_category" AS ENUM('finlamma', 'brand_partner');--> statement-breakpoint
CREATE TYPE "public"."reward_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"category" "badge_category" NOT NULL,
	"criteria" jsonb NOT NULL,
	"vm_reward" integer NOT NULL,
	"icon_key" text,
	"status" "badge_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"price_paid" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"category" "reward_category" NOT NULL,
	"price_vm" integer NOT NULL,
	"icon_key" text,
	"status" "reward_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "badges_status_idx" ON "badges" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_badges_user_badge_idx" ON "user_badges" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_claims_user_reward_idx" ON "reward_claims" USING btree ("user_id","reward_id");--> statement-breakpoint
CREATE INDEX "rewards_status_idx" ON "rewards" USING btree ("status");