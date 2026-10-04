CREATE TYPE "public"."entitlement_key" AS ENUM('ad_free');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('revenuecat', 'razorpay');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_source" AS ENUM('revenuecat');--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"entitlement" "entitlement_key" NOT NULL,
	"source" "entitlement_source" NOT NULL,
	"expires_at" timestamp with time zone,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "webhook_event_source" NOT NULL,
	"event_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_user_id_entitlement_idx" ON "entitlements" USING btree ("user_id","entitlement");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_event_id_idx" ON "webhook_events" USING btree ("source","event_id");