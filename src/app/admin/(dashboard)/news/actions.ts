"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  NewsQualityGradeSchema,
  NewsQuizGeneratorSettingsSchema,
  NewsStoryStatusSchema,
} from "@/server/news/schemas";
import {
  updateNewsQuizGeneratorSettings,
  updateNewsStoryQualityOverrideForAdmin,
  updateNewsStoryStatusForAdmin,
  updateNewsStoryTopicForAdmin,
} from "@/server/news/service";

type ActionResult = { ok: true } | { ok: false; error: string };

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

// news.publish - the instant publish/hidden toggle (NW-37), the only thing
// that makes a story visible to (or pulls it from) the feed.
export async function updateNewsStoryStatusAction(id: string, status: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("news.publish");
    const parsedStatus = NewsStoryStatusSchema.parse(status);
    await updateNewsStoryStatusForAdmin(actor, id, parsedStatus, requestMeta(await headers()));
    revalidatePath("/admin/news");
  });
}

// news.manage - editing a draft's fields (quality override, topic tag).
export async function updateNewsStoryQualityOverrideAction(
  id: string,
  qualityGradeOverride: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("news.manage");
    const parsed = qualityGradeOverride === null ? null : NewsQualityGradeSchema.parse(qualityGradeOverride);
    await updateNewsStoryQualityOverrideForAdmin(actor, id, parsed, requestMeta(await headers()));
    revalidatePath("/admin/news");
  });
}

export async function updateNewsStoryTopicAction(id: string, topicId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("news.manage");
    const parsed = topicId === null ? null : String(topicId);
    await updateNewsStoryTopicForAdmin(actor, id, parsed, requestMeta(await headers()));
    revalidatePath("/admin/news");
  });
}

// settings.manage, not news.manage - a global Pulse Check knob (question
// count, timer, base VM), same trust bar as lesson_flow_scoring /
// vm_issuance_multiplier, not a per-story content edit.
export async function updateNewsQuizGeneratorSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("settings.manage");
    const parsed = NewsQuizGeneratorSettingsSchema.parse(input);
    await updateNewsQuizGeneratorSettings(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/news");
  });
}
