import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import {
  deleteMarketHolidayRow,
  getInstrumentById,
  getOrCreateMarketControls,
  insertInstrument,
  insertMarketHoliday,
  listAllInstruments,
  listMarketHolidays,
  setFeedMode,
  setGlobalHalt,
  setInstrumentHalted,
  updateInstrumentRow,
  type FeedMode,
} from "./repo";
import type { CreateInstrumentInput, CreateMarketHolidayInput, UpdateInstrumentInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// --- Instruments (instrument.manage) - no draft/publish split (D25-style
// content types have one; instruments don't - `active` is the only
// visibility switch, and edits apply immediately, same trust tier as a D20
// hotfix rather than a reviewed draft->publish cycle) ---

export async function getInstrumentEditorData() {
  return listAllInstruments();
}

export async function createInstrument(
  actor: { id: string },
  input: CreateInstrumentInput,
  meta: RequestMeta,
) {
  let created;
  try {
    created = await insertInstrument(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Symbol ${input.symbol} is already in use by another instrument`);
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "instrument.created",
    targetType: "instrument",
    targetId: created.id,
    metadata: { symbol: created.symbol, name: created.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateInstrument(
  actor: { id: string },
  input: UpdateInstrumentInput,
  meta: RequestMeta,
) {
  const existing = await getInstrumentById(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "Instrument not found");

  const updated = await updateInstrumentRow(input);
  if (!updated) throw new AppError("NOT_FOUND", "Instrument not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "instrument.updated",
    targetType: "instrument",
    targetId: updated.id,
    metadata: { symbol: updated.symbol, name: updated.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// --- Market holidays (instrument.manage - same permission, same trust tier
// as the instrument catalog itself) ---

export async function getMarketHolidayEditorData() {
  return listMarketHolidays();
}

export async function createMarketHoliday(
  actor: { id: string },
  input: CreateMarketHolidayInput,
  meta: RequestMeta,
) {
  let created;
  try {
    created = await insertMarketHoliday(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `A holiday is already recorded for ${input.date}`);
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "market_holiday.created",
    targetType: "market_holiday",
    targetId: created.id,
    metadata: { date: created.date, name: created.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function deleteMarketHoliday(actor: { id: string }, id: string, meta: RequestMeta) {
  const deleted = await deleteMarketHolidayRow(id);
  if (!deleted) throw new AppError("NOT_FOUND", "Market holiday not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "market_holiday.deleted",
    targetType: "market_holiday",
    targetId: id,
    metadata: { date: deleted.date, name: deleted.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return deleted;
}

// --- Market controls (Checkpoint 9, trading.ops - docs/ARCHITECTURE.md D47) ---
// Every function below is a "dangerous control": it takes effect for every
// learner immediately, requires the caller to already hold trading.ops
// (checked one level up, in the admin Server Action - these functions
// trust `actor` was already authorized), and is unconditionally logged
// with who/when/reason. Halt/unhalt requires a non-empty reason (enforced
// by HaltReasonSchema at the action boundary, not re-validated here) -
// these functions accept it as a plain string and always log it, so a
// caller that somehow bypassed the schema still produces a traceable log
// entry rather than a silent, unexplained halt.

export async function getMarketControls() {
  return getOrCreateMarketControls();
}

export async function updateGlobalHalt(
  actor: { id: string },
  halt: boolean,
  reason: string,
  meta: RequestMeta,
) {
  const updated = await setGlobalHalt(halt);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: halt ? "ops.global_halt_enabled" : "ops.global_halt_disabled",
    targetType: "market_controls",
    targetId: updated.id,
    metadata: { reason },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function updateFeedMode(
  actor: { id: string },
  mode: FeedMode,
  meta: RequestMeta,
  reason?: string,
) {
  const previous = await getOrCreateMarketControls();
  const updated = await setFeedMode(mode);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "ops.feed_mode_changed",
    targetType: "market_controls",
    targetId: updated.id,
    metadata: { previous: previous.feedMode, next: mode, reason: reason ?? null },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function updateInstrumentHalted(
  actor: { id: string },
  instrumentId: string,
  halted: boolean,
  reason: string,
  meta: RequestMeta,
) {
  const existing = await getInstrumentById(instrumentId);
  if (!existing) throw new AppError("NOT_FOUND", "No instrument with this id");

  const updated = await setInstrumentHalted(instrumentId, halted);
  if (!updated) throw new AppError("NOT_FOUND", "No instrument with this id");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: halted ? "ops.symbol_halted" : "ops.symbol_unhalted",
    targetType: "instrument",
    targetId: instrumentId,
    metadata: { symbol: existing.symbol, reason },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}
