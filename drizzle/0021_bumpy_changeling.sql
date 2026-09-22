CREATE TYPE "public"."reward_activity_kind" AS ENUM('video', 'story', 'ai_chat', 'role_play', 'quiz', 'boss_quiz');--> statement-breakpoint
CREATE TABLE "reward_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activity_kind" "reward_activity_kind" NOT NULL,
	"default_xp" integer NOT NULL,
	"default_vm" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reward_rules_activity_kind_unique" UNIQUE("activity_kind")
);
--> statement-breakpoint
ALTER TABLE "reward_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vmoney_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"rule_id" uuid,
	"multiplier_applied" double precision,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vmoney_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"rule_id" uuid,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xp_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "xp_override" integer;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "vm_override" integer;--> statement-breakpoint
ALTER TABLE "vmoney_ledger" ADD CONSTRAINT "vmoney_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmoney_ledger" ADD CONSTRAINT "vmoney_ledger_rule_id_reward_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."reward_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_rule_id_reward_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."reward_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vmoney_ledger_user_source_idx" ON "vmoney_ledger" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "vmoney_ledger_user_id_idx" ON "vmoney_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_events_user_source_idx" ON "xp_events" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "xp_events_user_id_idx" ON "xp_events" USING btree ("user_id");