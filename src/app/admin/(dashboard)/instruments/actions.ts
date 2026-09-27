"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateInstrumentSchema,
  CreateMarketHolidaySchema,
  MarketHolidayIdSchema,
  UpdateInstrumentSchema,
} from "@/server/trading/schemas";
import {
  createInstrument,
  createMarketHoliday,
  deleteMarketHoliday,
  updateInstrument,
} from "@/server/trading/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/mentors/actions.ts - every action independently
// re-checks the caller's permission, never trusting the page's props alone.
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

export async function createInstrumentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("instrument.manage");
    const parsed = CreateInstrumentSchema.parse(input);
    await createInstrument(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/instruments");
  });
}

export async function updateInstrumentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("instrument.manage");
    const parsed = UpdateInstrumentSchema.parse(input);
    await updateInstrument(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/instruments");
  });
}

export async function createMarketHolidayAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("instrument.manage");
    const parsed = CreateMarketHolidaySchema.parse(input);
    await createMarketHoliday(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/instruments");
  });
}

export async function deleteMarketHolidayAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("instrument.manage");
    const { id } = MarketHolidayIdSchema.parse(input);
    await deleteMarketHoliday(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/instruments");
  });
}
