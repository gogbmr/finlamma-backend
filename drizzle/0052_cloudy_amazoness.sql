CREATE TYPE "public"."order_cancel_reason" AS ENUM('user_requested', 'eod_expired');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" "order_cancel_reason";