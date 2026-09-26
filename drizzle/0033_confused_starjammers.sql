ALTER TABLE "holdings" ADD COLUMN "position_opened_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "realized_pnl_paise" bigint;