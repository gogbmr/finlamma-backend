CREATE TYPE "public"."language" AS ENUM('en', 'hi', 'hx');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('dark', 'light');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"first_name" text,
	"last_initial" varchar(1),
	"email" text,
	"phone" text,
	"language" "language" DEFAULT 'hx' NOT NULL,
	"theme" "theme" DEFAULT 'dark' NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
