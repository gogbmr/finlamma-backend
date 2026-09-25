CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('open', 'filled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit');--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"avg_price_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"side" "order_side" NOT NULL,
	"type" "order_type" NOT NULL,
	"qty" integer NOT NULL,
	"limit_price_paise" bigint,
	"status" "order_status" DEFAULT 'open' NOT NULL,
	"fill_price_paise" bigint,
	"idempotency_key" text NOT NULL,
	"filled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_user_instrument_idx" ON "holdings" USING btree ("user_id","instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_idempotency_idx" ON "orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");