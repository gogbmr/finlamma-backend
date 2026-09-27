CREATE TYPE "public"."fund_category" AS ENUM('index', 'equity', 'hybrid', 'debt', 'elss');--> statement-breakpoint
CREATE TYPE "public"."fund_order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."fund_order_status" AS ENUM('filled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fund_risk" AS ENUM('very_low', 'low', 'moderate', 'high', 'very_high');--> statement-breakpoint
CREATE TYPE "public"."sip_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TABLE "fund_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"units_milli" bigint DEFAULT 0 NOT NULL,
	"avg_nav_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fund_navs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fund_id" uuid NOT NULL,
	"date" date NOT NULL,
	"nav_paise" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_navs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fund_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"side" "fund_order_side" NOT NULL,
	"status" "fund_order_status" DEFAULT 'filled' NOT NULL,
	"amount_paise" bigint,
	"units_milli" bigint,
	"nav_paise" bigint,
	"nav_date" date,
	"realized_pnl_paise" bigint,
	"idempotency_key" text,
	"sip_plan_id" uuid,
	"due_date" date,
	"failure_reason" text
);
--> statement-breakpoint
ALTER TABLE "fund_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"category" "fund_category" NOT NULL,
	"risk" "fund_risk" NOT NULL,
	"description" jsonb NOT NULL,
	"amfi_scheme_code" text NOT NULL,
	"expense_ratio_bps" integer NOT NULL,
	"min_lump_sum_paise" bigint NOT NULL,
	"min_sip_paise" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "funds_amfi_scheme_code_unique" UNIQUE("amfi_scheme_code")
);
--> statement-breakpoint
ALTER TABLE "funds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sip_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"day_of_month" integer NOT NULL,
	"status" "sip_status" DEFAULT 'active' NOT NULL,
	"paused_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sip_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fund_holdings" ADD CONSTRAINT "fund_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_holdings" ADD CONSTRAINT "fund_holdings_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_navs" ADD CONSTRAINT "fund_navs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_orders" ADD CONSTRAINT "fund_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_orders" ADD CONSTRAINT "fund_orders_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_orders" ADD CONSTRAINT "fund_orders_sip_plan_id_sip_plans_id_fk" FOREIGN KEY ("sip_plan_id") REFERENCES "public"."sip_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_plans" ADD CONSTRAINT "sip_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_plans" ADD CONSTRAINT "sip_plans_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fund_holdings_user_fund_idx" ON "fund_holdings" USING btree ("user_id","fund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_navs_fund_date_idx" ON "fund_navs" USING btree ("fund_id","date");--> statement-breakpoint
CREATE INDEX "fund_navs_fund_id_idx" ON "fund_navs" USING btree ("fund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_orders_user_idempotency_idx" ON "fund_orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_orders_sip_due_idx" ON "fund_orders" USING btree ("sip_plan_id","due_date");--> statement-breakpoint
CREATE INDEX "fund_orders_user_id_idx" ON "fund_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sip_plans_user_id_idx" ON "sip_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sip_plans_status_idx" ON "sip_plans" USING btree ("status");