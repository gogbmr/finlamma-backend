CREATE TABLE "dob_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"staff_id" uuid,
	"old_date_of_birth" date NOT NULL,
	"new_date_of_birth" date NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dob_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dob_corrections" ADD CONSTRAINT "dob_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dob_corrections" ADD CONSTRAINT "dob_corrections_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dob_corrections_user_id_idx" ON "dob_corrections" USING btree ("user_id");