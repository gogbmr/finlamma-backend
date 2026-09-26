import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { istDateString } from "@/lib/ist-date";
import { getFundByIdInternal } from "@/server/funds/repo";
import { isTradingUnlocked } from "@/server/worlds/service";
import {
  cancelSipPlan,
  createSipPlan,
  getSipPlanForUser,
  listRecentFundOrdersForSipPlan,
  listSipPlansForUser,
  pauseSipPlan,
  resumeSipPlan,
  type SipPlanRow,
} from "./sip-repo";
import type { CreateSipPlanInput, SipPlanAction } from "./sip-schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

const RECENT_EXECUTIONS_LIMIT = 12;

// The next calendar date (IST) this plan is due, or null if it's
// cancelled - a cancelled plan never runs again. If today IS the due day,
// "next due" is today (the execution job hasn't necessarily run yet).
function computeNextDueDate(dayOfMonth: number, status: SipPlanRow["status"], now: Date): string | null {
  if (status === "cancelled") return null;
  const todayIst = istDateString(now);
  const [yearStr, monthStr, dayStr] = todayIst.split("-") as [string, string, string];
  const year = Number(yearStr);
  const month = Number(monthStr);
  const today = Number(dayStr);

  if (dayOfMonth >= today) {
    return `${yearStr}-${monthStr}-${String(dayOfMonth).padStart(2, "0")}`;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

async function shapeSipPlan(plan: SipPlanRow, now: Date) {
  const executions = await listRecentFundOrdersForSipPlan(plan.id, RECENT_EXECUTIONS_LIMIT);
  return {
    id: plan.id,
    fundId: plan.fundId,
    amountPaise: plan.amountPaise,
    dayOfMonth: plan.dayOfMonth,
    status: plan.status,
    nextDueDate: computeNextDueDate(plan.dayOfMonth, plan.status, now),
    recentExecutions: executions.map((e) => ({
      id: e.id,
      status: e.status,
      dueDate: e.dueDate!,
      amountPaise: e.amountPaise,
      unitsMilli: e.unitsMilli,
      navPaise: e.navPaise,
      navDate: e.navDate,
      failureReason: e.failureReason,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function createSip(user: { id: string }, input: CreateSipPlanInput, meta: RequestMeta, now: Date = new Date()) {
  const fund = await getFundByIdInternal(input.fundId);
  if (!fund || !fund.active) throw new AppError("NOT_FOUND", "No fund with this id");

  if (!(await isTradingUnlocked(user.id))) {
    throw new AppError("FORBIDDEN", "Trading is locked until you clear more worlds");
  }

  if (input.amountPaise < fund.minSipPaise) {
    throw new AppError("VALIDATION_FAILED", `Minimum SIP amount for this fund is ${fund.minSipPaise} paise`);
  }

  const plan = await createSipPlan(user.id, input.fundId, input.amountPaise, input.dayOfMonth);

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "sip.created",
    targetType: "sip_plan",
    targetId: plan.id,
    metadata: { fundId: input.fundId, amountPaise: input.amountPaise, dayOfMonth: input.dayOfMonth },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return shapeSipPlan(plan, now);
}

export async function listMySips(userId: string, now: Date = new Date()) {
  const plans = await listSipPlansForUser(userId);
  return Promise.all(plans.map((p) => shapeSipPlan(p, now)));
}

export async function updateSipPlanStatus(
  user: { id: string },
  sipId: string,
  action: SipPlanAction,
  meta: RequestMeta,
  now: Date = new Date(),
) {
  const existing = await getSipPlanForUser(sipId, user.id);
  if (!existing) throw new AppError("NOT_FOUND", "No SIP plan with this id");

  const updated =
    action === "pause"
      ? await pauseSipPlan(sipId, user.id, now)
      : action === "resume"
        ? await resumeSipPlan(sipId, user.id)
        : await cancelSipPlan(sipId, user.id, now);

  if (!updated) {
    throw new AppError("CONFLICT", `Cannot ${action} a SIP plan that is currently "${existing.status}"`);
  }

  const activityAction: Record<SipPlanAction, string> = {
    pause: "sip.paused",
    resume: "sip.resumed",
    cancel: "sip.cancelled",
  };

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: activityAction[action],
    targetType: "sip_plan",
    targetId: sipId,
    metadata: { previousStatus: existing.status },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return shapeSipPlan(updated, now);
}
