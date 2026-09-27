"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { FeedModeSchema, HaltReasonSchema } from "@/server/trading/schemas";
import { updateFeedMode, updateGlobalHalt, updateInstrumentHalted } from "@/server/trading/service";
import { RiskThresholdsSchema } from "@/server/ops/schemas";
import { getUserTradingLedgerPage, updateRiskThresholds } from "@/server/ops/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as every other admin actions.ts.
// Every action here is gated on trading.ops, not instrument.manage or
// settings.manage - scripts/seed-roles.ts grants trading.ops to
// super_admin only, since a global halt or a feed-mode change affects
// every learner immediately (docs/ARCHITECTURE.md D47/D48).
async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    throw err;
  }
}

export async function setGlobalHaltAction(halt: boolean, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("trading.ops");
    const parsedReason = HaltReasonSchema.parse(reason);
    await updateGlobalHalt(actor, halt, parsedReason, requestMeta(await headers()));
    revalidatePath("/admin/ops");
    revalidatePath("/admin"); // the persistent halt banner shows on every admin page
  });
}

export async function setFeedModeAction(mode: unknown, reason?: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("trading.ops");
    const parsedMode = FeedModeSchema.parse(mode);
    await updateFeedMode(actor, parsedMode, requestMeta(await headers()), reason?.trim() || undefined);
    revalidatePath("/admin/ops");
  });
}

export async function setSymbolHaltedAction(
  instrumentId: string,
  halted: boolean,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("trading.ops");
    const parsedReason = HaltReasonSchema.parse(reason);
    await updateInstrumentHalted(actor, instrumentId, halted, parsedReason, requestMeta(await headers()));
    revalidatePath("/admin/ops");
  });
}

export async function updateRiskThresholdsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("trading.ops");
    const parsed = RiskThresholdsSchema.parse(input);
    await updateRiskThresholds(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/ops");
  });
}

// The User Trading Ledger's "load more" page - a Server Action (not a URL
// search-param page reload) specifically so every page fetch reliably goes
// through getUserTradingLedgerPage's own logging (founder's requirement:
// "log every view") with the real request headers, the same way a normal
// page load does.
export async function loadLedgerPageAction(cursor: string | null) {
  const actor = await requireStaff("trading.ops");
  return getUserTradingLedgerPage(actor, { cursor }, requestMeta(await headers()));
}
