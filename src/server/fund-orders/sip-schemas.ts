import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts.
import "@/lib/openapi";
import { registry } from "@/lib/openapi";
import { MAX_FUND_AMOUNT_PAISE } from "./schemas";

// 1-28 only (never 29-31) - sidesteps "SIP due Feb 30" entirely, since
// every calendar month has a 28th (docs/ARCHITECTURE.md D45).
export const MIN_SIP_DAY_OF_MONTH = 1;
export const MAX_SIP_DAY_OF_MONTH = 28;

export const CreateSipPlanSchema = z.object({
  fundId: z.uuid(),
  amountPaise: z.number().int().positive().max(MAX_FUND_AMOUNT_PAISE),
  dayOfMonth: z.number().int().min(MIN_SIP_DAY_OF_MONTH).max(MAX_SIP_DAY_OF_MONTH),
});
export type CreateSipPlanInput = z.infer<typeof CreateSipPlanSchema>;

export const SipPlanActionSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
});
export type SipPlanAction = z.infer<typeof SipPlanActionSchema>["action"];

const SipExecutionSchema = z.object({
  id: z.uuid(),
  status: z.enum(["filled", "failed"]),
  dueDate: z.string().openapi({ example: "2026-09-05" }),
  amountPaise: z.number().int().nullable(),
  unitsMilli: z.number().int().nullable(),
  navPaise: z.number().int().nullable(),
  navDate: z.string().nullable(),
  failureReason: z.string().nullable().openapi({
    description: "Set only when status is \"failed\" - e.g. INSUFFICIENT_MARGIN.",
    example: "INSUFFICIENT_MARGIN",
  }),
  createdAt: z.string().datetime(),
});

const SipPlanPublicSchema = z.object({
  id: z.uuid(),
  fundId: z.uuid(),
  amountPaise: z.number().int(),
  dayOfMonth: z.number().int(),
  status: z.enum(["active", "paused", "cancelled"]),
  nextDueDate: z.string().nullable().openapi({
    description: "null once the plan is cancelled - a cancelled plan never runs again.",
    example: "2026-10-05",
  }),
  recentExecutions: z.array(SipExecutionSchema).openapi({
    description: "Most recent executions for this plan, newest first, including any that failed - a SIP failure is always visible here, never silently skipped.",
  }),
});

export const SipPlanResponseSchema = registry.register("SipPlanResponse", z.object({ data: SipPlanPublicSchema }));
export const SipPlanListResponseSchema = registry.register(
  "SipPlanListResponse",
  z.object({ data: z.array(SipPlanPublicSchema) }),
);
