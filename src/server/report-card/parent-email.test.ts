import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWeeklyReportCardEmail = vi.fn();
vi.mock("@/emails/weekly-report-card", () => ({
  WeeklyReportCardEmail: (props: unknown) => mockWeeklyReportCardEmail(props),
}));

const mockSendEmailOrLog = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmailOrLog: (input: unknown) => mockSendEmailOrLog(input),
}));

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://app.finlamma.example" },
}));

const mockGetUserFirstName = vi.fn();
const mockSetConsentRecordWithdrawTokenHash = vi.fn();
const mockSetParentContactWeeklyReportUnsubscribeTokenHash = vi.fn();
vi.mock("@/server/onboarding/repo", () => ({
  getUserFirstName: (userId: unknown) => mockGetUserFirstName(userId),
  setConsentRecordWithdrawTokenHash: (userId: unknown, hash: unknown) =>
    mockSetConsentRecordWithdrawTokenHash(userId, hash),
  setParentContactWeeklyReportUnsubscribeTokenHash: (userId: unknown, hash: unknown) =>
    mockSetParentContactWeeklyReportUnsubscribeTokenHash(userId, hash),
}));

const mockGetStreakStats = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  getStreakStats: (userId: unknown) => mockGetStreakStats(userId),
}));

import { sendWeeklyReportParentEmail } from "./parent-email";

const USER = { id: "user_1" };
const SNAPSHOT = {
  weekStartDate: "2026-09-21",
  efficiencyScore: 82,
  moduleBreakdown: [
    { worldId: "w1", worldTitle: "Money Wise", lessonsCompleted: 2, minutesSpent: 10, accuracyPct: 90, grade: "S" },
    { worldId: "w2", worldTitle: "Save Smart", lessonsCompleted: 1, minutesSpent: 5, accuracyPct: 80, grade: "A" },
  ],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserFirstName.mockResolvedValue("Aanya");
  mockGetStreakStats.mockResolvedValue({ learning: { current: 4, longest: 6 }, pulseCheck: { current: 0, longest: 0 } });
  mockWeeklyReportCardEmail.mockReturnValue("rendered-email-element");
});

describe("sendWeeklyReportParentEmail", () => {
  it("mints a fresh withdraw token and stores its hash before sending", async () => {
    await sendWeeklyReportParentEmail(USER, "parent@example.com", SNAPSHOT);

    expect(mockSetConsentRecordWithdrawTokenHash).toHaveBeenCalledTimes(1);
    const [userId, hash] = mockSetConsentRecordWithdrawTokenHash.mock.calls[0];
    expect(userId).toBe(USER.id);
    expect(typeof hash).toBe("string");
    expect(hash).toHaveLength(64); // sha256 hex digest
  });

  it("builds the withdraw URL from the token that was just hashed and stored, and includes it in the email", async () => {
    await sendWeeklyReportParentEmail(USER, "parent@example.com", SNAPSHOT);

    const emailProps = mockWeeklyReportCardEmail.mock.calls[0][0];
    expect(emailProps.withdrawUrl).toMatch(/^https:\/\/app\.finlamma\.example\/consent\/withdraw\?token=.+/);
  });

  it("also mints a fresh, separate unsubscribe token and includes its URL in the email", async () => {
    await sendWeeklyReportParentEmail(USER, "parent@example.com", SNAPSHOT);

    expect(mockSetParentContactWeeklyReportUnsubscribeTokenHash).toHaveBeenCalledTimes(1);
    const [userId, hash] = mockSetParentContactWeeklyReportUnsubscribeTokenHash.mock.calls[0];
    expect(userId).toBe(USER.id);
    expect(typeof hash).toBe("string");
    expect(hash).toHaveLength(64); // sha256 hex digest

    const emailProps = mockWeeklyReportCardEmail.mock.calls[0][0];
    expect(emailProps.unsubscribeUrl).toMatch(
      /^https:\/\/app\.finlamma\.example\/consent\/weekly-report\/unsubscribe\?token=.+/,
    );
    // The withdraw and unsubscribe tokens must never be the same link.
    expect(emailProps.unsubscribeUrl).not.toBe(emailProps.withdrawUrl);
  });

  it("sums lessonsCompleted across every module in the snapshot's breakdown", async () => {
    await sendWeeklyReportParentEmail(USER, "parent@example.com", SNAPSHOT);

    const emailProps = mockWeeklyReportCardEmail.mock.calls[0][0];
    expect(emailProps.lessonsCompleted).toBe(3);
  });

  it("passes the child's first name and falls back to a generic label when unavailable", async () => {
    mockGetUserFirstName.mockResolvedValueOnce(null);

    await sendWeeklyReportParentEmail(USER, "parent@example.com", SNAPSHOT);

    const emailProps = mockWeeklyReportCardEmail.mock.calls[0][0];
    expect(emailProps.childFirstName).toBe("Your child");
    expect(mockSendEmailOrLog).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Your child's Finlamma progress this week" }),
    );
  });

  it("sends to the given parent email with the rendered element and a dev-log fallback", async () => {
    await sendWeeklyReportParentEmail(USER, "parent@example.com", SNAPSHOT);

    expect(mockSendEmailOrLog).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        react: "rendered-email-element",
        devLogLabel: `weekly report card for user ${USER.id}`,
      }),
    );
  });
});
