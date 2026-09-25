ALTER TABLE "vmoney_ledger" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vmoney_ledger" ADD COLUMN "amount_paise" bigint;--> statement-breakpoint
-- Hand-added (drizzle-kit only generates DDL, not data migrations) - backfills
-- every existing row's paise-scaled amount from its whole-VM amount. See
-- docs/ARCHITECTURE.md D37 for the full reasoning.
UPDATE "vmoney_ledger" SET "amount_paise" = "amount" * 100 WHERE "amount_paise" IS NULL;
