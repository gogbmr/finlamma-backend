CREATE TYPE "public"."consent_method" AS ENUM('email_link');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('pending', 'consented', 'refused', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."legal_accepted_by" AS ENUM('self', 'parent');--> statement-breakpoint
CREATE TYPE "public"."legal_document_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."legal_document_type" AS ENUM('terms', 'privacy', 'risk_disclosure');--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_contact_id" uuid NOT NULL,
	"method" "consent_method" DEFAULT 'email_link' NOT NULL,
	"status" "consent_status" DEFAULT 'pending' NOT NULL,
	"legal_document_versions" jsonb,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"withdraw_token_hash" text,
	"acted_at" timestamp with time zone,
	"actor_ip" text,
	"actor_user_agent" text
);
--> statement-breakpoint
ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"legal_document_id" uuid NOT NULL,
	"accepted_by" "legal_accepted_by" NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "legal_document_type" NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"status" "legal_document_status" DEFAULT 'draft' NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "legal_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "parent_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "parent_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settings_kv" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	CONSTRAINT "settings_kv_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "settings_kv" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_parent_contact_id_parent_contacts_id_fk" FOREIGN KEY ("parent_contact_id") REFERENCES "public"."parent_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_legal_document_id_legal_documents_id_fk" FOREIGN KEY ("legal_document_id") REFERENCES "public"."legal_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_published_by_staff_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_contacts" ADD CONSTRAINT "parent_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_records_user_id_idx" ON "consent_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_records_parent_contact_id_idx" ON "consent_records" USING btree ("parent_contact_id");--> statement-breakpoint
CREATE INDEX "legal_acceptances_user_id_idx" ON "legal_acceptances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_acceptances_legal_document_id_idx" ON "legal_acceptances" USING btree ("legal_document_id");--> statement-breakpoint
CREATE INDEX "legal_documents_type_idx" ON "legal_documents" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_type_version_idx" ON "legal_documents" USING btree ("type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_contacts_user_id_idx" ON "parent_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parent_contacts_email_idx" ON "parent_contacts" USING btree ("email");