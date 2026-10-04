import { VM_TO_LEDGER_PAISE } from "@/server/economy/schemas";
import { getVmIssuanceMultiplier } from "@/server/economy/service";
import { getNewsQuizGeneratorSettings } from "@/server/news/service";
import { answerSchemaForFormat, type QuestionFormat } from "@/server/questions/schemas";
import { getTopicById } from "@/server/topics/repo";
import { recordPulseCheckActivity } from "@/server/streaks/service";
import { captureEvent } from "@/lib/analytics";
import { AppError } from "@/lib/errors";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { istDateStartUtc, istDateString } from "@/lib/ist-date";
import { computePulseCheckAnswerScore } from "./scoring";
import {
  finishAttemptTx,
  getActiveUserCount,
  getAnswerByStep,
  getAttemptById,
  getCompletedAttemptForEdition,
  getDailyCompletedAttemptCounts,
  getEditionByDate,
  getEditionById,
  getInProgressAttempt,
  getQuestionForServing,
  getQuestionRevisionForGrading,
  getStoryHeadline,
  gradeAnswerRowIfUnanswered,
  insertAttempt,
  insertEditionIfNew,
  insertServedAnswerIfNew,
  listAnswersForAttempt,
  listEligibleQuestionsForEdition,
} from "./repo";
import {
  DEFAULT_PULSE_CHECK_SCORING,
  PULSE_CHECK_SCORING_SETTINGS_KEY,
  PulseCheckScoringSchema,
  type PulseCheckScoring,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

export async function getPulseCheckScoring(): Promise<PulseCheckScoring> {
  const raw = await getSettingJson(PULSE_CHECK_SCORING_SETTINGS_KEY);
  if (raw === null) return DEFAULT_PULSE_CHECK_SCORING;
  const parsed = PulseCheckScoringSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PULSE_CHECK_SCORING;
}

// settings.manage-gated (super_admin only) - same trust bar as every other
// economy-affecting constant (lesson_flow_scoring, vm_issuance_multiplier),
// since dailyVmCap in particular bounds every learner's earnings.
export async function updatePulseCheckScoring(
  actor: { id: string },
  input: PulseCheckScoring,
  meta: RequestMeta,
): Promise<PulseCheckScoring> {
  const previous = await getPulseCheckScoring();
  await setSettingJson(
    PULSE_CHECK_SCORING_SETTINGS_KEY,
    input,
    "Pulse Check scoring constants (speed/combo/all-correct bonuses, daily VM cap) - see docs/ARCHITECTURE.md D51.",
  );
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "pulse_check.scoring_updated",
    targetType: "settings_kv",
    targetId: PULSE_CHECK_SCORING_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

// The best-case total a learner could see advertised on the CTA card
// (NW-03) - every question correct and fast, combo escalating normally,
// plus the all-correct bonus. Pure arithmetic, no DB access - deliberately
// does NOT reflect D51's daily cap, since the cap is a per-LEARNER running
// total (depends on what they've already earned today from a possible
// earlier attempt), not a property of the edition itself.
function computeMaxVmPayout(questionCount: number, baseVm: number, scoring: PulseCheckScoring): number {
  let total = 0;
  for (let i = 1; i <= questionCount; i++) {
    const comboBonus = scoring.comboBonusPerStep * Math.min(i, scoring.comboBonusCap);
    total += baseVm + scoring.speedBonusVm + comboBonus;
  }
  return total + scoring.allCorrectBonusVm;
}

async function ensureTodaysEdition(at: Date) {
  const todayIst = istDateString(at);
  const existing = await getEditionByDate(todayIst);
  if (existing) return existing;

  const quizSettings = await getNewsQuizGeneratorSettings();
  const eligible = await listEligibleQuestionsForEdition(quizSettings.enabledFormats, quizSettings.questionCount);
  if (eligible.length === 0) {
    throw new AppError("NOT_FOUND", "No Pulse Check questions are available yet today");
  }

  const inserted = await insertEditionIfNew(
    todayIst,
    eligible.map((q) => q.id),
  );
  // A concurrent request may have won the race to build today's edition
  // (news_editions.date is UNIQUE) - re-read rather than treat this as an
  // error, same "insert, then re-read on conflict" shape as every other
  // idempotent write in this codebase.
  return inserted ?? (await getEditionByDate(todayIst));
}

export async function getCurrentPulseCheck(userId: string, at: Date = new Date()) {
  const todayIst = istDateString(at);
  const edition = await getEditionByDate(todayIst);
  const quizSettings = await getNewsQuizGeneratorSettings();
  const scoring = await getPulseCheckScoring();

  const [inProgress, completed] = edition
    ? await Promise.all([getInProgressAttempt(userId, edition.id), getCompletedAttemptForEdition(userId, edition.id)])
    : [null, null];

  return {
    editionId: edition?.id ?? null,
    date: todayIst,
    questionCount: quizSettings.questionCount,
    perQuestionTimerSeconds: quizSettings.perQuestionTimerSeconds,
    baseVmPerQuestion: quizSettings.baseVmPerQuestion,
    maxVmPayout: computeMaxVmPayout(quizSettings.questionCount, quizSettings.baseVmPerQuestion, scoring),
    alreadyCompletedToday: completed !== null,
    inProgressAttemptId: inProgress?.id ?? null,
  };
}

export async function startAttempt(user: { id: string }, meta: RequestMeta, at: Date = new Date()) {
  const edition = await ensureTodaysEdition(at);

  const existing = await getInProgressAttempt(user.id, edition.id);
  if (existing) {
    return { attemptId: existing.id, editionId: edition.id, totalSteps: edition.questionIds.length, resumed: true };
  }

  const created = await insertAttempt(user.id, edition.id);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "pulse_check.attempt_started",
    targetType: "pulse_check_attempts",
    targetId: created.id,
    metadata: { editionId: edition.id },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { attemptId: created.id, editionId: edition.id, totalSteps: edition.questionIds.length, resumed: false };
}

async function requireOwnAttempt(user: { id: string }, attemptId: string) {
  const attempt = await getAttemptById(attemptId);
  if (!attempt || attempt.userId !== user.id) throw new AppError("NOT_FOUND", "No Pulse Check attempt with this id");
  return attempt;
}

// The D51 cap-race root cause (Phase 5 security audit): startAttempt only
// ever targets TODAY's IST edition (ensureTodaysEdition above), so a
// learner can never directly start an attempt on a past edition - but
// nothing previously stopped them from leaving an attempt in_progress
// forever (closing the app mid-quiz) and coming back on a LATER day to
// serve/answer/finish it, by which point it belongs to a past edition. That
// gap is what let concurrent finish calls target several different
// editions' stale attempts at once and each race the same day's cap. Fix:
// once an in_progress attempt's edition is no longer today's IST date, it's
// simply expired - every further serve/answer/finish call on it rejects.
// No expiry job needed: an expired attempt just sits there forever,
// harmless, since it can never again be served, answered or credited.
// (Edge case, accepted: an attempt started just before midnight IST that's
// still being played when the date rolls over also expires mid-session,
// same as this codebase's other daily-reset boundaries, e.g. streaks.)
async function requireCurrentEditionAttempt(user: { id: string }, attemptId: string, at: Date) {
  const attempt = await requireOwnAttempt(user, attemptId);
  if (attempt.status === "in_progress") {
    const edition = await getEditionById(attempt.editionId);
    if (!edition || edition.date !== istDateString(at)) {
      throw new AppError("CONFLICT", "This Pulse Check has expired - start a new one for today");
    }
  }
  return attempt;
}

export async function serveStep(user: { id: string }, attemptId: string, stepIndex: number, at: Date = new Date()) {
  const attempt = await requireOwnAttempt(user, attemptId);
  if (attempt.status !== "in_progress") throw new AppError("CONFLICT", "This attempt is already finished");

  const edition = await getEditionById(attempt.editionId);
  if (!edition) throw new AppError("NOT_FOUND", "Edition not found");
  // D51 root-cause fix: an in_progress attempt left open past its edition's
  // IST day can never be served again - see requireCurrentEditionAttempt's
  // comment above for why.
  if (edition.date !== istDateString(at)) {
    throw new AppError("CONFLICT", "This Pulse Check has expired - start a new one for today");
  }
  const totalSteps = edition.questionIds.length;
  if (stepIndex < 1 || stepIndex > totalSteps) {
    throw new AppError("VALIDATION_FAILED", `stepIndex must be between 1 and ${totalSteps}`);
  }

  if (stepIndex > 1) {
    const previous = await getAnswerByStep(attemptId, stepIndex - 1);
    if (!previous || !previous.answeredAt) {
      throw new AppError("CONFLICT", "Answer the previous question first");
    }
  }

  const quizSettings = await getNewsQuizGeneratorSettings();
  const questionId = edition.questionIds[stepIndex - 1];
  const question = await getQuestionForServing(questionId);
  if (!question) throw new AppError("NOT_FOUND", "Question not found");

  const servedRow = await insertServedAnswerIfNew({
    attemptId,
    questionId,
    stepIndex,
    timerSeconds: quizSettings.perQuestionTimerSeconds,
    servedRevision: question.revision,
  });
  if (!servedRow) throw new AppError("INTERNAL", "Failed to serve question");

  const [topic, sourceHeadline] = await Promise.all([
    question.topicId ? getTopicById(question.topicId) : null,
    question.sourceStoryId ? getStoryHeadline(question.sourceStoryId) : null,
  ]);

  return {
    stepIndex,
    totalSteps,
    question: {
      questionId: question.id,
      format: question.format,
      topic: topic?.name ?? null,
      sourceHeadline,
      prompt: question.prompt,
      payload: question.payload,
      timerSeconds: servedRow.timerSeconds,
    },
  };
}

export async function submitAnswer(
  user: { id: string },
  attemptId: string,
  stepIndex: number,
  rawAnswer: unknown,
  meta: RequestMeta,
  at: Date = new Date(),
) {
  const attempt = await requireCurrentEditionAttempt(user, attemptId, at);
  if (attempt.status !== "in_progress") throw new AppError("CONFLICT", "This attempt is already finished");

  const servedRow = await getAnswerByStep(attemptId, stepIndex);
  if (!servedRow) throw new AppError("CONFLICT", "This step hasn't been served yet");

  const question = await getQuestionForServing(servedRow.questionId);
  if (!question) throw new AppError("NOT_FOUND", "Question not found");
  const revision = await getQuestionRevisionForGrading(question.id, servedRow.servedRevision);
  if (!revision) throw new AppError("INTERNAL", "Question revision snapshot missing");

  // Idempotent replay: an already-answered step returns the exact original
  // graded result, never re-scored - same D21 reasoning.
  if (servedRow.answeredAt) {
    return {
      isCorrect: servedRow.isCorrect ?? false,
      timedOut: servedRow.timedOut ?? false,
      speedBonusAwarded: servedRow.speedBonusAwarded ?? false,
      comboAfter: servedRow.comboAfter ?? 0,
      vmAwarded: Math.round((servedRow.vmAwardedPaise ?? 0) / VM_TO_LEDGER_PAISE),
      correctAnswer: revision.answer,
      explanation: revision.explanation,
    };
  }

  const answerSchema = answerSchemaForFormat(question.format as QuestionFormat);
  const parsedAnswer = answerSchema.safeParse(rawAnswer);
  if (!parsedAnswer.success) {
    throw new AppError("VALIDATION_FAILED", `Invalid answer for a "${question.format}" question`);
  }

  const previousStep = stepIndex > 1 ? await getAnswerByStep(attemptId, stepIndex - 1) : null;
  const comboBefore = previousStep?.comboAfter ?? 0;

  const [scoring, quizSettings] = await Promise.all([getPulseCheckScoring(), getNewsQuizGeneratorSettings()]);
  const score = computePulseCheckAnswerScore({
    format: question.format as QuestionFormat,
    submittedAnswer: parsedAnswer.data,
    correctAnswer: revision.answer,
    elapsedMs: at.getTime() - servedRow.servedAt.getTime(),
    timerSeconds: servedRow.timerSeconds,
    comboBefore,
    settings: scoring,
    baseVm: quizSettings.baseVmPerQuestion,
  });

  const graded = await gradeAnswerRowIfUnanswered(attemptId, stepIndex, {
    submittedAnswer: parsedAnswer.data,
    isCorrect: score.isCorrect,
    timedOut: score.timedOut,
    speedBonusAwarded: score.speedBonusAwarded,
    comboAfter: score.comboAfter,
    vmAwardedPaise: score.vmAwarded * VM_TO_LEDGER_PAISE,
  });
  // Lost a race with a concurrent identical request - re-read and return
  // whatever the winner actually stored, never re-score.
  const finalRow = graded ?? (await getAnswerByStep(attemptId, stepIndex));
  if (!finalRow) throw new AppError("INTERNAL", "Failed to grade answer");

  // Logged only on a genuinely fresh grade (never on the idempotent-replay
  // branch above, which writes nothing) - same "log the mutation, not the
  // read" rule quiz-attempts/service.ts's step_answered already follows.
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "pulse_check.step_answered",
    targetType: "pulse_check_attempts",
    targetId: attemptId,
    metadata: { stepIndex, isCorrect: finalRow.isCorrect, vmAwardedPaise: finalRow.vmAwardedPaise },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return {
    isCorrect: finalRow.isCorrect ?? false,
    timedOut: finalRow.timedOut ?? false,
    speedBonusAwarded: finalRow.speedBonusAwarded ?? false,
    comboAfter: finalRow.comboAfter ?? 0,
    vmAwarded: Math.round((finalRow.vmAwardedPaise ?? 0) / VM_TO_LEDGER_PAISE),
    correctAnswer: revision.answer,
    explanation: revision.explanation,
  };
}

// D51 (docs/ARCHITECTURE.md): applies the global vm_issuance_multiplier
// once, to the attempt's total (PRODUCT_SPEC.md §2 - it "scales every VM
// award at the moment it's issued", not just reward_rules ones), then
// clamps to what's left of today's daily cap. Crediting is idempotent via
// vmoney_ledger's (userId, sourceType, sourceId) unique index keyed on
// editionId (not attemptId) - so however many attempts a learner starts at
// one edition, only the first one that actually earns a nonzero amount
// ever successfully credits; every later one (even a better-scoring retry)
// conflicts and credits nothing, matching "retries earn nothing". An
// attempt that legitimately earns 0 (every answer wrong) does NOT consume
// that one slot - nothing was credited, so there's nothing to protect
// against re-earning.
export async function finishAttempt(user: { id: string }, attemptId: string, meta: RequestMeta, at: Date = new Date()) {
  const attempt = await requireOwnAttempt(user, attemptId);

  if (attempt.status === "completed") {
    return {
      accuracyPct: attempt.accuracyPct ?? 0,
      bestCombo: attempt.bestCombo ?? 0,
      allCorrectBonusAwarded: attempt.allCorrectBonusAwarded ?? false,
      rawVmEarnedPaise: attempt.rawVmEarnedPaise ?? 0,
      totalVmAwardedPaise: attempt.totalVmAwardedPaise ?? 0,
      dailyCapReached: attempt.dailyCapReached ?? false,
    };
  }

  const edition = await getEditionById(attempt.editionId);
  if (!edition) throw new AppError("NOT_FOUND", "Edition not found");
  // D51 root-cause fix: this is what actually closes the cap race at its
  // source - a stale in_progress attempt (left open past its edition's IST
  // day) can never reach the credit path below. Combined with the
  // transactional lock in finishAttemptTx, which stops a race between
  // TODAY's edition and any other in_progress attempt for this user, VM can
  // only ever be credited once per edition per day, full stop. See
  // requireCurrentEditionAttempt's comment above for the fuller reasoning.
  if (edition.date !== istDateString(at)) {
    throw new AppError("CONFLICT", "This Pulse Check has expired - start a new one for today");
  }
  const answers = await listAnswersForAttempt(attemptId);
  if (answers.length < edition.questionIds.length || answers.some((a) => !a.answeredAt)) {
    throw new AppError("CONFLICT", "Answer every question before finishing");
  }

  const correctCount = answers.filter((a) => a.isCorrect).length;
  const totalSteps = answers.length;
  const accuracyPct = Math.round((correctCount / totalSteps) * 100);
  const bestCombo = Math.max(0, ...answers.map((a) => a.comboAfter ?? 0));
  const allCorrect = correctCount === totalSteps;

  const scoring = await getPulseCheckScoring();
  const sumAnswersPaise = answers.reduce((sum, a) => sum + (a.vmAwardedPaise ?? 0), 0);
  const allCorrectBonusPaise = allCorrect ? scoring.allCorrectBonusVm * VM_TO_LEDGER_PAISE : 0;
  const multiplier = await getVmIssuanceMultiplier();
  const rawVmEarnedPaise = Math.round((sumAnswersPaise + allCorrectBonusPaise) * multiplier);
  const dailyCapPaise = scoring.dailyVmCap * VM_TO_LEDGER_PAISE;

  // Everything from here on (reading today's already-credited total,
  // clamping to the cap, marking the attempt completed, crediting the
  // ledger) happens inside one locked transaction - see finishAttemptTx's
  // comment in repo.ts for why the lock has to come before the read.
  const { completed, totalVmAwardedPaise, dailyCapReached } = await finishAttemptTx({
    userId: user.id,
    attemptId,
    at,
    dailyCapPaise,
    accuracyPct,
    bestCombo,
    allCorrectBonusAwarded: allCorrect,
    rawVmEarnedPaise,
    multiplierApplied: multiplier,
  });

  if (completed) {
    await recordPulseCheckActivity(user.id, at);
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "pulse_check.attempt_finished",
      targetType: "pulse_check_attempts",
      targetId: attemptId,
      metadata: { accuracyPct, rawVmEarnedPaise, totalVmAwardedPaise, dailyCapReached },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // docs/ARCHITECTURE.md D69 - bucketed to the nearest 10%, not the exact
    // score, same "no finer than needed" rule the other event properties
    // follow.
    captureEvent(user.id, "pulse_check_finished", {
      accuracyBucket: Math.round(accuracyPct / 10) * 10,
      allCorrect,
    });
  }

  const finalAttempt = completed ?? (await getAttemptById(attemptId));
  return {
    accuracyPct: finalAttempt?.accuracyPct ?? accuracyPct,
    bestCombo: finalAttempt?.bestCombo ?? bestCombo,
    allCorrectBonusAwarded: finalAttempt?.allCorrectBonusAwarded ?? allCorrect,
    rawVmEarnedPaise: finalAttempt?.rawVmEarnedPaise ?? rawVmEarnedPaise,
    totalVmAwardedPaise: finalAttempt?.totalVmAwardedPaise ?? totalVmAwardedPaise,
    dailyCapReached: finalAttempt?.dailyCapReached ?? dailyCapReached,
  };
}

export async function getResult(user: { id: string }, attemptId: string) {
  const attempt = await requireOwnAttempt(user, attemptId);
  if (attempt.status !== "completed") throw new AppError("CONFLICT", "This attempt isn't finished yet");

  const answers = await listAnswersForAttempt(attemptId);
  return {
    attemptId: attempt.id,
    accuracyPct: attempt.accuracyPct ?? 0,
    bestCombo: attempt.bestCombo ?? 0,
    allCorrectBonusAwarded: attempt.allCorrectBonusAwarded ?? false,
    rawVmEarnedPaise: attempt.rawVmEarnedPaise ?? 0,
    totalVmAwardedPaise: attempt.totalVmAwardedPaise ?? 0,
    dailyCapReached: attempt.dailyCapReached ?? false,
    answers: answers.map((a) => ({
      stepIndex: a.stepIndex,
      isCorrect: a.isCorrect,
      timedOut: a.timedOut,
      speedBonusAwarded: a.speedBonusAwarded,
      vmAwarded: a.vmAwardedPaise === null ? null : Math.round(a.vmAwardedPaise / VM_TO_LEDGER_PAISE),
    })),
  };
}

// NW-43: News Desk's 7-day engagement chart (% of active users who
// completed Pulse Check each day). Fills in every day in the window with
// 0% (not omitted) so a genuinely quiet day is visually distinct from a
// missing data point, then averages across the window.
export async function getPulseCheckEngagement(days = 7, at: Date = new Date()) {
  const sinceUtc = istDateStartUtc(new Date(at.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const [counts, activeUserCount] = await Promise.all([getDailyCompletedAttemptCounts(sinceUtc), getActiveUserCount()]);
  const countsByDate = new Map(counts.map((c) => [c.date, c.distinctUsers]));

  const daily = Array.from({ length: days }, (_, i) => {
    const date = istDateString(new Date(at.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000));
    const distinctUsers = countsByDate.get(date) ?? 0;
    const pct = activeUserCount === 0 ? 0 : Math.round((distinctUsers / activeUserCount) * 100);
    return { date, distinctUsers, pct };
  });

  const averagePct = daily.length === 0 ? 0 : Math.round(daily.reduce((sum, d) => sum + d.pct, 0) / daily.length);
  return { daily, averagePct, activeUserCount };
}
