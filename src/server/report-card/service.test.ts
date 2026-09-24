import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetCoachNoteTemplateById = vi.fn();
const mockGetPublishedCoachNoteTemplatesByCategory = vi.fn();
const mockGetReportSnapshot = vi.fn();
const mockInsertDraftCoachNoteTemplate = vi.fn();
const mockInsertReportSnapshot = vi.fn();
const mockListAllCoachNoteTemplates = vi.fn();
const mockListAnsweredQuestionHistoryForUser = vi.fn();
const mockListAnsweredQuestionsWithWorldForUserInRange = vi.fn();
const mockListCompletedGradedLessonsForUserInRange = vi.fn();
const mockListCompletedUngradedLessonsForUserInRange = vi.fn();
const mockListCompletedVideoAttemptsForUserInRange = vi.fn();
const mockListReportSnapshotsForUser = vi.fn();
const mockPublishCoachNoteTemplateRow = vi.fn();
const mockUnpublishCoachNoteTemplateRow = vi.fn();
const mockUpdateDraftCoachNoteTemplate = vi.fn();

vi.mock("./repo", () => ({
  getCoachNoteTemplateById: (id: unknown) => mockGetCoachNoteTemplateById(id),
  getPublishedCoachNoteTemplatesByCategory: (category: unknown) =>
    mockGetPublishedCoachNoteTemplatesByCategory(category),
  getReportSnapshot: (userId: unknown, weekStartDate: unknown) => mockGetReportSnapshot(userId, weekStartDate),
  insertDraftCoachNoteTemplate: (input: unknown) => mockInsertDraftCoachNoteTemplate(input),
  insertReportSnapshot: (input: unknown) => mockInsertReportSnapshot(input),
  listAllCoachNoteTemplates: () => mockListAllCoachNoteTemplates(),
  listAnsweredQuestionHistoryForUser: (userId: unknown) => mockListAnsweredQuestionHistoryForUser(userId),
  listAnsweredQuestionsWithWorldForUserInRange: (userId: unknown, since: unknown, until: unknown) =>
    mockListAnsweredQuestionsWithWorldForUserInRange(userId, since, until),
  listCompletedGradedLessonsForUserInRange: (userId: unknown, since: unknown, until: unknown) =>
    mockListCompletedGradedLessonsForUserInRange(userId, since, until),
  listCompletedUngradedLessonsForUserInRange: (userId: unknown, since: unknown, until: unknown) =>
    mockListCompletedUngradedLessonsForUserInRange(userId, since, until),
  listCompletedVideoAttemptsForUserInRange: (userId: unknown, since: unknown, until: unknown) =>
    mockListCompletedVideoAttemptsForUserInRange(userId, since, until),
  listReportSnapshotsForUser: (userId: unknown, limit: unknown) => mockListReportSnapshotsForUser(userId, limit),
  publishCoachNoteTemplateRow: (id: unknown, staffId: unknown) => mockPublishCoachNoteTemplateRow(id, staffId),
  unpublishCoachNoteTemplateRow: (id: unknown) => mockUnpublishCoachNoteTemplateRow(id),
  updateDraftCoachNoteTemplate: (input: unknown) => mockUpdateDraftCoachNoteTemplate(input),
}));

const mockGetConsentRecord = vi.fn();
const mockGetParentContact = vi.fn();
vi.mock("@/server/onboarding/repo", () => ({
  getConsentRecord: (userId: unknown) => mockGetConsentRecord(userId),
  getParentContact: (userId: unknown) => mockGetParentContact(userId),
}));

// Real isMinor logic, duplicated here rather than importing the real module -
// that module transitively imports @/db/client, which throws by design under
// NODE_ENV=test (CLAUDE.md rule 12). isMinor itself is pure (no DB), so a
// faithful copy keeps these tests meaningful without pulling that in.
vi.mock("@/server/onboarding/service", () => ({
  isMinor: (dateOfBirth: string) => {
    const dob = new Date(`${dateOfBirth}T00:00:00Z`);
    const now = new Date();
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const hadBirthdayThisYear =
      now.getUTCMonth() > dob.getUTCMonth() ||
      (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
    if (!hadBirthdayThisYear) age -= 1;
    return age < 18;
  },
}));

const mockGetStreakStats = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  getStreakStats: (userId: unknown, at: unknown) => mockGetStreakStats(userId, at),
}));

const mockGetWorldById = vi.fn();
vi.mock("@/server/worlds/repo", () => ({
  getWorldById: (id: unknown) => mockGetWorldById(id),
}));

import {
  computeAndStoreWeeklySnapshot,
  createCoachNoteTemplate,
  getEligibleParentContactForWeeklyReport,
  getMyReportCard,
  publishCoachNoteTemplate,
  unpublishCoachNoteTemplate,
  updateCoachNoteTemplate,
} from "./service";

const ACTOR = { id: "staff_1" };
const META = { ip: null, userAgent: null };
const USER_ID = "user_1";
const TEMPLATE_ID = "template_1";
const FULL_TEMPLATE = { en: "Nice work on {{metric}}!", hi: "x", hx: "x" };
const AT = new Date("2026-09-24T10:00:00Z"); // Thursday, IST week starting 2026-09-21

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin coach note template CRUD", () => {
  it("createCoachNoteTemplate inserts and logs", async () => {
    mockInsertDraftCoachNoteTemplate.mockResolvedValueOnce({ id: TEMPLATE_ID, category: "strength" });

    const result = await createCoachNoteTemplate(ACTOR, { category: "strength", template: FULL_TEMPLATE }, META);

    expect(result).toEqual({ id: TEMPLATE_ID, category: "strength" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coach_note_template.created", targetId: TEMPLATE_ID }),
    );
  });

  it("updateCoachNoteTemplate throws NOT_FOUND when the row doesn't exist", async () => {
    mockUpdateDraftCoachNoteTemplate.mockResolvedValueOnce(null);

    await expect(
      updateCoachNoteTemplate(ACTOR, { id: TEMPLATE_ID, category: "gap", template: FULL_TEMPLATE }, META),
    ).rejects.toThrow(AppError);
  });

  it("publishCoachNoteTemplate throws NOT_FOUND for a missing template", async () => {
    mockGetCoachNoteTemplateById.mockResolvedValueOnce(null);

    await expect(publishCoachNoteTemplate(ACTOR, TEMPLATE_ID, META)).rejects.toThrow(AppError);
    expect(mockPublishCoachNoteTemplateRow).not.toHaveBeenCalled();
  });

  it("publishCoachNoteTemplate throws CONFLICT when the template isn't a draft", async () => {
    mockGetCoachNoteTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID,
      status: "published",
      template: FULL_TEMPLATE,
    });

    await expect(publishCoachNoteTemplate(ACTOR, TEMPLATE_ID, META)).rejects.toThrow(AppError);
    expect(mockPublishCoachNoteTemplateRow).not.toHaveBeenCalled();
  });

  it("publishCoachNoteTemplate rejects when any language is missing (the en/hi/hx publish gate)", async () => {
    mockGetCoachNoteTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID,
      status: "draft",
      template: { en: "Nice work!", hi: "", hx: "x" },
    });

    await expect(publishCoachNoteTemplate(ACTOR, TEMPLATE_ID, META)).rejects.toThrow(/missing template.hi/);
    expect(mockPublishCoachNoteTemplateRow).not.toHaveBeenCalled();
  });

  it("publishCoachNoteTemplate publishes and logs when every language is filled in", async () => {
    mockGetCoachNoteTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID,
      status: "draft",
      category: "strength",
      template: FULL_TEMPLATE,
    });
    mockPublishCoachNoteTemplateRow.mockResolvedValueOnce({
      id: TEMPLATE_ID,
      status: "published",
      category: "strength",
    });

    const result = await publishCoachNoteTemplate(ACTOR, TEMPLATE_ID, META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coach_note_template.published" }),
    );
  });

  it("unpublishCoachNoteTemplate throws CONFLICT when the template isn't currently published", async () => {
    mockUnpublishCoachNoteTemplateRow.mockResolvedValueOnce(null);

    await expect(unpublishCoachNoteTemplate(ACTOR, TEMPLATE_ID, META)).rejects.toThrow(AppError);
  });
});

describe("computeAndStoreWeeklySnapshot", () => {
  it("is idempotent - returns the existing snapshot without recomputing anything", async () => {
    const existing = { id: "snap_1", userId: USER_ID, weekStartDate: "2026-09-21" };
    mockGetReportSnapshot.mockResolvedValueOnce(existing);

    const result = await computeAndStoreWeeklySnapshot(USER_ID, AT);

    expect(result).toBe(existing);
    expect(mockListAnsweredQuestionHistoryForUser).not.toHaveBeenCalled();
    expect(mockInsertReportSnapshot).not.toHaveBeenCalled();
  });

  it("computes and stores a fresh snapshot when none exists yet", async () => {
    mockGetReportSnapshot.mockResolvedValueOnce(null);
    mockListAnsweredQuestionHistoryForUser.mockResolvedValueOnce([]);
    mockListCompletedVideoAttemptsForUserInRange.mockResolvedValueOnce([]);
    mockListCompletedGradedLessonsForUserInRange.mockResolvedValueOnce([
      {
        worldId: "world_1",
        lessonId: "lesson_1",
        startedAt: new Date("2026-09-22T00:00:00Z"),
        completedAt: new Date("2026-09-22T00:05:00Z"),
      },
    ]);
    mockListCompletedUngradedLessonsForUserInRange.mockResolvedValueOnce([]);
    mockListAnsweredQuestionsWithWorldForUserInRange.mockResolvedValueOnce([]);
    mockGetStreakStats.mockResolvedValueOnce({ learning: { current: 1, longest: 1 }, pulseCheck: { current: 0, longest: 0 } });
    mockGetWorldById.mockResolvedValueOnce({ title: { en: "Money Wise" } });
    mockGetPublishedCoachNoteTemplatesByCategory.mockResolvedValue([
      { id: "tpl_1", template: FULL_TEMPLATE },
    ]);
    const insertedRow = { id: "snap_new", userId: USER_ID, weekStartDate: "2026-09-21" };
    mockInsertReportSnapshot.mockResolvedValueOnce(insertedRow);

    const result = await computeAndStoreWeeklySnapshot(USER_ID, AT);

    expect(result).toBe(insertedRow);
    expect(mockInsertReportSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        weekStartDate: "2026-09-21",
        strengthNoteId: "tpl_1",
        gapNoteId: "tpl_1",
        habitNoteId: "tpl_1",
      }),
    );
  });

  it("re-reads the row when a concurrent run wins the insert race", async () => {
    mockGetReportSnapshot.mockResolvedValueOnce(null); // first check: nothing yet
    mockListAnsweredQuestionHistoryForUser.mockResolvedValueOnce([]);
    mockListCompletedVideoAttemptsForUserInRange.mockResolvedValueOnce([]);
    mockListCompletedGradedLessonsForUserInRange.mockResolvedValueOnce([]);
    mockListCompletedUngradedLessonsForUserInRange.mockResolvedValueOnce([]);
    mockListAnsweredQuestionsWithWorldForUserInRange.mockResolvedValueOnce([]);
    mockGetStreakStats.mockResolvedValueOnce({ learning: { current: 0, longest: 0 }, pulseCheck: { current: 0, longest: 0 } });
    mockGetPublishedCoachNoteTemplatesByCategory.mockResolvedValue([]);
    mockInsertReportSnapshot.mockResolvedValueOnce(null); // lost the race
    const wonByOther = { id: "snap_other", userId: USER_ID, weekStartDate: "2026-09-21" };
    mockGetReportSnapshot.mockResolvedValueOnce(wonByOther); // re-read

    const result = await computeAndStoreWeeklySnapshot(USER_ID, AT);

    expect(result).toBe(wonByOther);
  });
});

describe("getEligibleParentContactForWeeklyReport - D33: age re-checked every send", () => {
  it("no consent means no send, even for a minor with weeklyReportOptIn true", async () => {
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce({ email: "parent@example.com", weeklyReportOptIn: true });

    const result = await getEligibleParentContactForWeeklyReport({ id: USER_ID, dateOfBirth: "2015-01-01" });

    expect(result).toBeNull();
  });

  it("a consent record that isn't status 'consented' means no send", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "withdrawn" });
    mockGetParentContact.mockResolvedValueOnce({ email: "parent@example.com", weeklyReportOptIn: true });

    const result = await getEligibleParentContactForWeeklyReport({ id: USER_ID, dateOfBirth: "2015-01-01" });

    expect(result).toBeNull();
  });

  it("a consented minor whose parent never opted in gets no send", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    mockGetParentContact.mockResolvedValueOnce({ email: "parent@example.com", weeklyReportOptIn: false });

    const result = await getEligibleParentContactForWeeklyReport({ id: USER_ID, dateOfBirth: "2015-01-01" });

    expect(result).toBeNull();
  });

  it("an 18+ learner never gets a parent send, even with consent and opt-in on file", async () => {
    // Today is 2026-09-24 - this DOB makes the learner 20 years old. Deliberately
    // NOT queuing a mockGetConsentRecord/mockGetParentContact return value here -
    // this test asserts below that neither is ever called, and a vi.fn() queued
    // via mockResolvedValueOnce but never consumed survives vi.clearAllMocks()
    // (clearMock resets call history, not queued implementations), so it would
    // otherwise leak into whichever later test in this file calls these mocks
    // next - a real bug this test previously had.
    const result = await getEligibleParentContactForWeeklyReport({ id: USER_ID, dateOfBirth: "2006-01-01" });

    expect(result).toBeNull();
    // The whole point of D33: the check short-circuits on age before ever
    // looking at consent/opt-in state for someone who's no longer a minor.
    expect(mockGetConsentRecord).not.toHaveBeenCalled();
    expect(mockGetParentContact).not.toHaveBeenCalled();
  });

  it("a user with no dateOfBirth on file gets no send", async () => {
    const result = await getEligibleParentContactForWeeklyReport({ id: USER_ID, dateOfBirth: null });
    expect(result).toBeNull();
  });

  it("a consented, opted-in minor's parent email is returned", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    mockGetParentContact.mockResolvedValueOnce({ email: "parent@example.com", weeklyReportOptIn: true });

    const result = await getEligibleParentContactForWeeklyReport({ id: USER_ID, dateOfBirth: "2015-01-01" });

    expect(result).toEqual({ email: "parent@example.com" });
  });
});

describe("getMyReportCard", () => {
  it("returns a null current snapshot before the first Monday's job has run", async () => {
    mockGetReportSnapshot.mockResolvedValueOnce(null);
    mockListReportSnapshotsForUser.mockResolvedValueOnce([]);
    // 18+ so the eligibility check short-circuits without hitting consent/parent-contact mocks
    const result = await getMyReportCard({ id: USER_ID, dateOfBirth: "1990-01-01" }, AT);

    expect(result.current).toBeNull();
    expect(result.trend).toEqual([]);
    expect(result.sharedWithParent).toBeNull();
  });

  it("renders coach notes from the stored snapshot's template ids", async () => {
    const snapshot = {
      id: "snap_1",
      weekStartDate: "2026-09-21",
      efficiencyScore: 80,
      subMetrics: { retention: 90, watchSpeed: 60, quizAccuracy: 85, consistency: 75 },
      moduleBreakdown: [],
      topicMastery: [],
      strengthNoteId: "tpl_strength",
      gapNoteId: "tpl_gap",
      opportunityNoteId: null,
      habitNoteId: null,
      opportunityTopic: null,
      habitDetail: null,
    };
    mockGetReportSnapshot.mockResolvedValueOnce(snapshot);
    mockListReportSnapshotsForUser.mockResolvedValueOnce([
      snapshot, // newest-first, as the repo returns it
      { weekStartDate: "2026-09-14", efficiencyScore: 60 },
    ]);
    mockGetCoachNoteTemplateById.mockImplementation(async (id: string) => {
      if (id === "tpl_strength") return { id, template: { en: "Great {{metric}} - {{pct}}%!", hi: "x", hx: "x" } };
      if (id === "tpl_gap") return { id, template: { en: "Room to grow in {{metric}} ({{pct}}%).", hi: "x", hx: "x" } };
      return null;
    });

    const result = await getMyReportCard({ id: USER_ID, dateOfBirth: "1990-01-01" }, AT);

    expect(result.current?.coachNotes).toEqual([
      { category: "strength", text: { en: "Great remembering what you've learned - 90%!", hi: "x", hx: "x" } },
      { category: "gap", text: { en: "Room to grow in pacing through videos (60%).", hi: "x", hx: "x" } },
    ]);
    // trend is oldest-first, reversed from the newest-first repo order
    expect(result.trend).toEqual([
      { weekStartDate: "2026-09-14", efficiencyScore: 60 },
      { weekStartDate: "2026-09-21", efficiencyScore: 80 },
    ]);
  });

  it("shows the masked email and weeklyEmailOn:false for a minor with a verified parent who has the weekly email off", async () => {
    mockGetReportSnapshot.mockResolvedValueOnce(null);
    mockListReportSnapshotsForUser.mockResolvedValueOnce([]);
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com", weeklyReportOptIn: false });

    const result = await getMyReportCard({ id: USER_ID, dateOfBirth: "2015-01-01" }, AT);

    // Non-null even though the weekly email is off - a verified parent
    // relationship exists regardless of the current opt-in state.
    expect(result.sharedWithParent).toEqual({ maskedEmail: "p***@example.com", weeklyEmailOn: false });
  });

  it("shows weeklyEmailOn:true for a minor with a verified, opted-in parent", async () => {
    mockGetReportSnapshot.mockResolvedValueOnce(null);
    mockListReportSnapshotsForUser.mockResolvedValueOnce([]);
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com", weeklyReportOptIn: true });

    const result = await getMyReportCard({ id: USER_ID, dateOfBirth: "2015-01-01" }, AT);

    expect(result.sharedWithParent).toEqual({ maskedEmail: "p***@example.com", weeklyEmailOn: true });
  });
});
