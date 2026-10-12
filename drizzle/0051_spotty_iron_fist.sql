CREATE TABLE "peer_handles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "peer_handles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "peer_handles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle_rerolled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "peer_handles_active_idx" ON "peer_handles" USING btree ("active");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_id_peer_handles_id_fk" FOREIGN KEY ("handle_id") REFERENCES "public"."peer_handles"("id") ON DELETE restrict ON UPDATE no action;