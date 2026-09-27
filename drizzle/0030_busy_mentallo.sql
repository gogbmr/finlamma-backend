CREATE TYPE "public"."feed_mode" AS ENUM('live', 'delayed_15m', 'paused');--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text DEFAULT 'NSE' NOT NULL,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"about" jsonb NOT NULL,
	"tip" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"mcap" bigint,
	"pe" double precision,
	"lot_size" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"halted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "instruments_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
ALTER TABLE "instruments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "market_controls" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"feed_mode" "feed_mode" DEFAULT 'live' NOT NULL,
	"global_halt" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "market_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "market_holidays_date_idx" ON "market_holidays" USING btree ("date");