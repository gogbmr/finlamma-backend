CREATE TYPE "public"."legal_reapproval_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "legal_reapproval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"legal_document_id" uuid NOT NULL,
	"parent_contact_id" uuid NOT NULL,
	"status" "legal_reapproval_status" DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"acted_at" timestamp with time zone,
	"actor_ip" text,
	"actor_user_agent" text,
	"last_requested_at" timestamp with time zone,
	"request_count" integer DEFAULT 1 NOT NULL,
	"request_count_date" date
);
--> statement-breakpoint
ALTER TABLE "legal_reapproval_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "requires_parent_reapproval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_reapproval_requests" ADD CONSTRAINT "legal_reapproval_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_reapproval_requests" ADD CONSTRAINT "legal_reapproval_requests_legal_document_id_legal_documents_id_fk" FOREIGN KEY ("legal_document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_reapproval_requests" ADD CONSTRAINT "legal_reapproval_requests_parent_contact_id_parent_contacts_id_fk" FOREIGN KEY ("parent_contact_id") REFERENCES "public"."parent_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_reapproval_requests_user_document_idx" ON "legal_reapproval_requests" USING btree ("user_id","legal_document_id");--> statement-breakpoint
CREATE INDEX "legal_reapproval_requests_legal_document_id_idx" ON "legal_reapproval_requests" USING btree ("legal_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_reapproval_requests_token_hash_idx" ON "legal_reapproval_requests" USING btree ("token_hash");