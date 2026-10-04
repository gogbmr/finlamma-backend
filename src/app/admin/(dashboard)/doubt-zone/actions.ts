"use server";

import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { markFlaggedMessageReviewed, revealFlaggedMessageContent } from "@/server/doubt-zone/service";

type RevealResult =
  | { ok: true; content: string; role: "learner" | "assistant"; flaggedReason: string | null }
  | { ok: false; error: string };

// doubt_zone.moderate is otherwise read-only (see the queue's own
// metadata-only list query) - this is the one action that reveals a
// flagged message's actual content, and every call is logged (inside
// revealFlaggedMessageContent) with the staff member as actor and the
// message as target, same pattern as the Consent page's parent-contact
// reveal.
export async function revealFlaggedMessageAction(messageId: string): Promise<RevealResult> {
  try {
    const actor = await requireStaff("doubt_zone.moderate");
    const result = await revealFlaggedMessageContent(actor, messageId, requestMeta(await headers()));
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

type ReviewResult = { ok: true } | { ok: false; error: string };

// Marks a flagged message as reviewed - never un-flags it. flagged/
// flaggedReason stay as the permanent record of what tripped.
export async function markReviewedAction(messageId: string): Promise<ReviewResult> {
  try {
    const actor = await requireStaff("doubt_zone.moderate");
    await markFlaggedMessageReviewed(actor, messageId, requestMeta(await headers()));
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}
