CREATE TYPE "public"."competition_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "competition_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cash_paise" bigint NOT NULL,
	"qty_held" integer DEFAULT 0 NOT NULL,
	"avg_price_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competition_prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"ending_value_paise" bigint NOT NULL,
	"roi_pct_basis_points" integer NOT NULL,
	"vm_awarded" integer NOT NULL,
	"badge_id" uuid
);
--> statement-breakpoint
ALTER TABLE "competition_prizes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competition_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" uuid NOT NULL,
	"side" "order_side" NOT NULL,
	"qty" integer NOT NULL,
	"fill_price_paise" bigint NOT NULL,
	"realized_pnl_paise" bigint,
	"idempotency_key" text NOT NULL,
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_trades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" jsonb NOT NULL,
	"instrument_id" uuid NOT NULL,
	"virtual_capital_paise" bigint NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"prizes" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"status" "competition_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "competitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_prizes" ADD CONSTRAINT "competition_prizes_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_prizes" ADD CONSTRAINT "competition_prizes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_prizes" ADD CONSTRAINT "competition_prizes_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_trades" ADD CONSTRAINT "competition_trades_entry_id_competition_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_entries_competition_user_idx" ON "competition_entries" USING btree ("competition_id","user_id");--> statement-breakpoint
CREATE INDEX "competition_entries_user_id_idx" ON "competition_entries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_prizes_competition_user_idx" ON "competition_prizes" USING btree ("competition_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_trades_entry_idempotency_idx" ON "competition_trades" USING btree ("entry_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "competition_trades_entry_id_idx" ON "competition_trades" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "competitions_status_idx" ON "competitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "competitions_window_end_idx" ON "competitions" USING btree ("window_end");