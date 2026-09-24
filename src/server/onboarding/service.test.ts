import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  APP_URL: "https://app.finlamma.in",
  RESEND_API_KEY: undefined as string | undefined,
  EMAIL_FROM: undefined as string | undefined,
  NODE_ENV: "test" as string,
  VERCEL_ENV: undefined as "production" | "preview" | "development" | undefined,
  CONSENT_PII_HMAC_KEY: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockSetDateOfBirthOnce = vi.fn();
const mockMarkOnboardingCompletedOnce = vi.fn();
const mockGetParentContact = vi.fn();
const mockUpsertParentContact = vi.fn();
const mockCountChildrenForParentEmail = vi.fn();
const mockGetConsentRecord = vi.fn();
const mockGetConsentRecordByTokenHash = vi.fn();
const mockGetConsentRecordByWithdrawTokenHash = vi.fn();
const mockSumRequestsTodayForParentEmail = vi.fn();
const mockClaimConsentRequestSlot = vi.fn();
const mockConfirmConsentAndRecordAcceptances = vi.fn();
const mockDeclineConsentRecord = vi.fn();
const mockWithdrawConsentRecord = vi.fn();
const mockListConsentRecordsForReview = vi.fn();
const mockGetParentContactForReview = vi.fn();
const mockGetUserFirstName = vi.fn();
const mockIsUserDeleted = vi.fn();
const mockAnonymizeParentContact = vi.fn();
const mockSetConsentRecordParentEmailHmac = vi.fn();
const mockListCandidatesForReapproval = vi.fn();
const mockClaimReapprovalRequestSlot = vi.fn();
const mockGetReapprovalRequestByTokenHash = vi.fn();
const mockListPendingReapprovalRequestsForUser = vi.fn();
const mockApproveReapprovalAndRecordAcceptance = vi.fn();
const mockDeclineReapprovalAndRefuseConsent = vi.fn();
const mockSetConsentRecordWithdrawTokenHash = vi.fn();
const mockSetParentContactWeeklyReportOptIn = vi.fn();
const mockGetParentContactByWeeklyReportUnsubscribeTokenHash = vi.fn();
const mockUnsubscribeParentContactFromWeeklyReport = vi.fn();
vi.mock("./repo", () => ({
  setDateOfBirthOnce: (id: unknown, dob: unknown) => mockSetDateOfBirthOnce(id, dob),
  markOnboardingCompletedOnce: (id: unknown) => mockMarkOnboardingCompletedOnce(id),
  getParentContact: (id: unknown) => mockGetParentContact(id),
  upsertParentContact: (id: unknown, name: unknown, email: unknown) =>
    mockUpsertParentContact(id, name, email),
  countChildrenForParentEmail: (email: unknown) => mockCountChildrenForParentEmail(email),
  getConsentRecord: (id: unknown) => mockGetConsentRecord(id),
  getConsentRecordByTokenHash: (hash: unknown) => mockGetConsentRecordByTokenHash(hash),
  getConsentRecordByWithdrawTokenHash: (hash: unknown) => mockGetConsentRecordByWithdrawTokenHash(hash),
  sumRequestsTodayForParentEmail: (email: unknown, today: unknown) =>
    mockSumRequestsTodayForParentEmail(email, today),
  claimConsentRequestSlot: (input: unknown) => mockClaimConsentRequestSlot(input),
  confirmConsentAndRecordAcceptances: (input: unknown) => mockConfirmConsentAndRecordAcceptances(input),
  declineConsentRecord: (id: unknown, meta: unknown) => mockDeclineConsentRecord(id, meta),
  withdrawConsentRecord: (id: unknown, meta: unknown) => mockWithdrawConsentRecord(id, meta),
  listConsentRecordsForReview: (limit: unknown, includeDeleted: unknown) =>
    mockListConsentRecordsForReview(limit, includeDeleted),
  getParentContactForReview: (userId: unknown) => mockGetParentContactForReview(userId),
  getUserFirstName: (id: unknown) => mockGetUserFirstName(id),
  isUserDeleted: (userId: unknown) => mockIsUserDeleted(userId),
  anonymizeParentContact: (id: unknown) => mockAnonymizeParentContact(id),
  setConsentRecordParentEmailHmac: (userId: unknown, hmac: unknown) =>
    mockSetConsentRecordParentEmailHmac(userId, hmac),
  listCandidatesForReapproval: (legalDocumentId: unknown) =>
    mockListCandidatesForReapproval(legalDocumentId),
  claimReapprovalRequestSlot: (input: unknown) => mockClaimReapprovalRequestSlot(input),
  getReapprovalRequestByTokenHash: (hash: unknown) => mockGetReapprovalRequestByTokenHash(hash),
  listPendingReapprovalRequestsForUser: (userId: unknown) =>
    mockListPendingReapprovalRequestsForUser(userId),
  approveReapprovalAndRecordAcceptance: (input: unknown) => mockApproveReapprovalAndRecordAcceptance(input),
  declineReapprovalAndRefuseConsent: (input: unknown) => mockDeclineReapprovalAndRefuseConsent(input),
  setConsentRecordWithdrawTokenHash: (userId: unknown, hash: unknown) =>
    mockSetConsentRecordWithdrawTokenHash(userId, hash),
  setParentContactWeeklyReportOptIn: (userId: unknown, optIn: unknown) =>
    mockSetParentContactWeeklyReportOptIn(userId, optIn),
  getParentContactByWeeklyReportUnsubscribeTokenHash: (hash: unknown) =>
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash(hash),
  unsubscribeParentContactFromWeeklyReport: (parentContactId: unknown) =>
    mockUnsubscribeParentContactFromWeeklyReport(parentContactId),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (input: unknown) => mockSendEmail(input),
}));

const mockGetSettingNumber = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingNumber: (key: unknown, fallback: unknown) => mockGetSettingNumber(key, fallback),
}));

const mockListPublishedDocuments = vi.fn();
const mockGetLegalDocumentById = vi.fn();
vi.mock("@/server/legal/repo", () => ({
  listPublishedDocuments: () => mockListPublishedDocuments(),
  getLegalDocumentById: (id: unknown) => mockGetLegalDocumentById(id),
}));

const mockGetLegalStatus = vi.fn();
vi.mock("@/server/legal/service", () => ({
  getLegalStatus: (user: unknown) => mockGetLegalStatus(user),
}));

import {
  approveReapproval,
  completeOnboarding,
  confirmParentConsent,
  declineParentConsent,
  declineReapproval,
  getConsentRequestView,
  getConsentReviewList,
  getReapprovalRequestView,
  getWeeklyReportUnsubscribeView,
  getWithdrawRequestView,
  isMinor,
  notifyAffectedMinorsForReapproval,
  requestParentConsent,
  requireFullAccess,
  resendReapprovalRequests,
  revealParentContact,
  scrubConsentDataForDeletedUser,
  setDateOfBirth,
  unsubscribeWeeklyReport,
  withdrawParentConsent,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.RESEND_API_KEY = undefined;
  mockEnv.EMAIL_FROM = undefined;
  mockEnv.NODE_ENV = "test";
  mockEnv.VERCEL_ENV = undefined;
  mockEnv.CONSENT_PII_HMAC_KEY = undefined;
  mockGetSettingNumber.mockImplementation((_key, fallback) => Promise.resolve(fallback));
  mockIsUserDeleted.mockResolvedValue(false);
});

describe("isMinor", () => {
  it("is true for someone who turns 18 tomorrow", () => {
    const now = new Date();
    const dob = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate() + 1));
    expect(isMinor(dob.toISOString().slice(0, 10))).toBe(true);
  });

  it("is false for someone who turned 18 yesterday", () => {
    const now = new Date();
    const dob = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate() - 1));
    expect(isMinor(dob.toISOString().slice(0, 10))).toBe(false);
  });

  it("is false for someone turning 18 exactly today", () => {
    const now = new Date();
    const dob = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
    expect(isMinor(dob.toISOString().slice(0, 10))).toBe(false);
  });
});

describe("setDateOfBirth", () => {
  const USER = { id: "u1", email: "kid@example.com", firstName: "Aarav", dateOfBirth: null };

  it("throws CONFLICT when the user already has a date of birth", async () => {
    await expect(
      setDateOfBirth({ ...USER, dateOfBirth: "2010-01-01" }, { dateOfBirth: "2010-01-01" }, META),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockSetDateOfBirthOnce).not.toHaveBeenCalled();
  });

  it("throws VALIDATION_FAILED for a future date", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
    await expect(setDateOfBirth(USER, { dateOfBirth: future }, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("throws CONFLICT if the DB update races and finds it already set", async () => {
    mockSetDateOfBirthOnce.mockResolvedValueOnce(null);
    await expect(setDateOfBirth(USER, { dateOfBirth: "2010-01-01" }, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("sets the date of birth, logs it, and reports isMinor/requiresParentConsent", async () => {
    mockSetDateOfBirthOnce.mockResolvedValueOnce({ id: "u1", dateOfBirth: "2015-01-01" });

    const result = await setDateOfBirth(USER, { dateOfBirth: "2015-01-01" }, META);

    expect(result).toEqual({ dateOfBirth: "2015-01-01", isMinor: true, requiresParentConsent: true });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "onboarding.date_of_birth_set", actorId: "u1" }),
    );
  });
});

describe("completeOnboarding", () => {
  const USER = {
    id: "u1",
    email: "kid@example.com",
    firstName: "Aarav",
    dateOfBirth: null,
    onboardingCompletedAt: null,
  };

  it("marks it complete, logs it, and returns the timestamp on the first call", async () => {
    const stamp = new Date("2026-01-01T00:00:00.000Z");
    mockMarkOnboardingCompletedOnce.mockResolvedValueOnce({ id: "u1", onboardingCompletedAt: stamp });

    const result = await completeOnboarding(USER, META);

    expect(result).toEqual({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "onboarding.completed", actorId: "u1" }),
    );
  });

  it("is a no-op (no activity log) on a repeat call - returns the original timestamp without erroring", async () => {
    const originalStamp = new Date("2025-06-01T00:00:00.000Z");
    // repo.ts re-fetches and returns the existing row unchanged on a repeat call.
    mockMarkOnboardingCompletedOnce.mockResolvedValueOnce({
      id: "u1",
      onboardingCompletedAt: originalStamp,
    });

    const result = await completeOnboarding(
      { ...USER, onboardingCompletedAt: originalStamp },
      META,
    );

    expect(result).toEqual({ onboardingCompletedAt: "2025-06-01T00:00:00.000Z" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND if the user row is gone", async () => {
    mockMarkOnboardingCompletedOnce.mockResolvedValueOnce(null);

    await expect(completeOnboarding(USER, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("requestParentConsent", () => {
  const MINOR = { id: "u1", email: "kid@example.com", firstName: "Aarav", dateOfBirth: "2015-01-01" };
  const INPUT = { parentName: "Priya", parentEmail: "priya@example.com" };

  it("throws CONSENT_NOT_NEEDED when the account has no date of birth yet", async () => {
    await expect(
      requestParentConsent({ ...MINOR, dateOfBirth: null }, INPUT, META),
    ).rejects.toMatchObject({ code: "CONSENT_NOT_NEEDED" });
  });

  it("throws CONSENT_NOT_NEEDED for an adult account", async () => {
    await expect(
      requestParentConsent({ ...MINOR, dateOfBirth: "1990-01-01" }, INPUT, META),
    ).rejects.toMatchObject({ code: "CONSENT_NOT_NEEDED" });
  });

  it("throws PARENT_EMAIL_INVALID when the parent email matches the user's own", async () => {
    await expect(
      requestParentConsent(MINOR, { ...INPUT, parentEmail: "kid@example.com" }, META),
    ).rejects.toMatchObject({ code: "PARENT_EMAIL_INVALID" });
  });

  it("throws CONSENT_NOT_NEEDED when already consented", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    await expect(requestParentConsent(MINOR, INPUT, META)).rejects.toMatchObject({
      code: "CONSENT_NOT_NEEDED",
    });
  });

  it("throws RESEND_TOO_SOON when the atomic claim (see repo.ts) says the cooldown hasn't passed", async () => {
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" }); // not a new email
    mockGetSettingNumber.mockResolvedValueOnce(5); // consent_resend_daily_cap
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({
      ok: false,
      reason: "too_soon",
      retryAfterSeconds: 42,
    });

    await expect(requestParentConsent(MINOR, INPUT, META)).rejects.toMatchObject({
      code: "RESEND_TOO_SOON",
      details: { retryAfterSeconds: 42 },
    });
  });

  it("throws RESEND_LIMIT_REACHED once the atomic claim says the per-user daily cap is hit", async () => {
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" });
    mockGetSettingNumber.mockResolvedValueOnce(5);
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({ ok: false, reason: "daily_cap" });

    await expect(requestParentConsent(MINOR, INPUT, META)).rejects.toMatchObject({
      code: "RESEND_LIMIT_REACHED",
    });
  });

  it("normalizes the parent email's casing before every check and before storing it", async () => {
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce(null);
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({ ok: true, record: {} });

    await requestParentConsent(MINOR, { ...INPUT, parentEmail: " Priya@Example.com " }, META);

    expect(mockCountChildrenForParentEmail).toHaveBeenCalledWith("priya@example.com");
    expect(mockSumRequestsTodayForParentEmail).toHaveBeenCalledWith("priya@example.com", expect.any(String));
    expect(mockUpsertParentContact).toHaveBeenCalledWith("u1", "Priya", "priya@example.com");
  });

  it("falls back to console-logging the link on a Vercel preview deployment, even though NODE_ENV is 'production' there", async () => {
    // next build always sets NODE_ENV=production, preview deployments
    // included - VERCEL_ENV is the actual signal this must key off, or the
    // preview fallback (needed to test this flow before Resend is set up)
    // would never trigger. See sendConsentEmailOrLog in service.ts.
    mockEnv.NODE_ENV = "production";
    mockEnv.VERCEL_ENV = "preview";
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce(null);
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({ ok: true, record: {} });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await requestParentConsent(MINOR, INPUT, META);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("parent consent link"));
    consoleSpy.mockRestore();
  });

  it("always attempts a real send on the real production deployment, even if NODE_ENV somehow isn't 'production' and Resend isn't configured (never silently falls back there)", async () => {
    mockEnv.NODE_ENV = "development";
    mockEnv.VERCEL_ENV = "production";
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce(null);
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({ ok: true, record: {} });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockSendEmail.mockResolvedValueOnce(undefined);

    await requestParentConsent(MINOR, INPUT, META);

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "priya@example.com" }));
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("throws PARENT_EMAIL_LIMIT_REACHED when the parent email already backs the max number of children", async () => {
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce(null); // no existing contact -> new parent email
    mockGetSettingNumber
      .mockResolvedValueOnce(5) // consent_resend_daily_cap (user check)
      .mockResolvedValueOnce(2); // parent_email_max_children
    mockCountChildrenForParentEmail.mockResolvedValueOnce(2);

    await expect(requestParentConsent(MINOR, INPUT, META)).rejects.toMatchObject({
      code: "PARENT_EMAIL_LIMIT_REACHED",
    });
    expect(mockUpsertParentContact).not.toHaveBeenCalled();
  });

  it("throws RESEND_LIMIT_REACHED when the parent email's own daily total is exhausted", async () => {
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" }); // same email, not new
    mockGetSettingNumber.mockResolvedValueOnce(5); // consent_resend_daily_cap
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(5);

    await expect(requestParentConsent(MINOR, INPUT, META)).rejects.toMatchObject({
      code: "RESEND_LIMIT_REACHED",
    });
  });

  it("on success: saves the contact/token, logs the console link in non-production when email isn't configured, and logs the activity", async () => {
    mockEnv.NODE_ENV = "development";
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce(null);
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({ ok: true, record: {} });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await requestParentConsent(MINOR, INPUT, META);

    expect(result).toEqual({ status: "pending", parentEmail: "priya@example.com" });
    expect(mockClaimConsentRequestSlot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", parentContactId: "pc1", dailyCap: 5 }),
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("parent consent link"));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent.requested", actorId: "u1" }),
    );
    consoleSpy.mockRestore();
  });

  it("sends via Resend when configured, even in a non-production environment", async () => {
    mockEnv.NODE_ENV = "development";
    mockEnv.RESEND_API_KEY = "re_test";
    mockEnv.EMAIL_FROM = "Finlamma <consent@mail.finlamma.in>";
    mockGetConsentRecord.mockResolvedValueOnce(null);
    mockGetParentContact.mockResolvedValueOnce(null);
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);
    mockSumRequestsTodayForParentEmail.mockResolvedValueOnce(0);
    mockUpsertParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockClaimConsentRequestSlot.mockResolvedValueOnce({ ok: true, record: {} });
    mockSendEmail.mockResolvedValueOnce(undefined);

    await requestParentConsent(MINOR, INPUT, META);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "priya@example.com" }),
    );
  });
});

describe("getConsentRequestView", () => {
  it("returns invalid when no record matches the token", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce(null);
    expect(await getConsentRequestView("bad-token")).toEqual({ state: "invalid" });
  });

  it("returns already_resolved when the record isn't pending", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({ status: "consented", usedAt: new Date() });
    expect(await getConsentRequestView("t")).toEqual({ state: "already_resolved" });
  });

  it("returns expired when the token's ttl has passed", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    expect(await getConsentRequestView("t")).toEqual({ state: "expired" });
  });

  it("returns already_resolved when the account has been deleted, even though the record is still pending", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      userId: "u1",
    });
    mockIsUserDeleted.mockResolvedValueOnce(true);

    expect(await getConsentRequestView("t")).toEqual({ state: "already_resolved" });
    expect(mockIsUserDeleted).toHaveBeenCalledWith("u1");
  });

  it("returns the valid view with child name and published documents", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      userId: "u1",
    });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockListPublishedDocuments.mockResolvedValueOnce([
      { type: "terms", version: 1, content: { en: "a", hi: "b", hx: "c" } },
    ]);

    const view = await getConsentRequestView("t");

    expect(view).toEqual({
      state: "valid",
      childFirstName: "Aarav",
      documents: [{ type: "terms", version: 1, content: { en: "a", hi: "b", hx: "c" } }],
    });
  });
});

describe("confirmParentConsent", () => {
  it("throws NOT_FOUND for an unknown token", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce(null);
    await expect(confirmParentConsent("bad", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT if the record is no longer pending", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({ status: "consented", usedAt: new Date() });
    await expect(confirmParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws NOT_FOUND if the token has expired", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(confirmParentConsent("t", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT if confirmConsentAndRecordAcceptances loses a race (already resolved concurrently)", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce(null);

    await expect(confirmParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT (not a distinct message) when the account has been deleted", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockIsUserDeleted.mockResolvedValueOnce(true);

    await expect(confirmParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockConfirmConsentAndRecordAcceptances).not.toHaveBeenCalled();
  });

  it("mints a fresh withdraw token on every confirm - re-consenting after a withdrawal invalidates the old link", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce(null);

    await confirmParentConsent("t", META);

    const firstCallArgs = mockConfirmConsentAndRecordAcceptances.mock.calls[0][0];
    expect(typeof firstCallArgs.withdrawTokenHash).toBe("string");
    expect(firstCallArgs.withdrawTokenHash.length).toBeGreaterThan(0);

    // A second confirm (e.g. after a withdrawal + fresh consent request)
    // must mint a different hash - confirmConsentAndRecordAcceptances
    // (repo.ts) overwrites withdraw_token_hash unconditionally on the same
    // row, so the old value stops matching any lookup.
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce(null);

    await confirmParentConsent("t2", META);

    const secondCallArgs = mockConfirmConsentAndRecordAcceptances.mock.calls[1][0];
    expect(secondCallArgs.withdrawTokenHash).not.toBe(firstCallArgs.withdrawTokenHash);
  });

  it("on success: records parent acceptance for every published doc (one transaction) and logs it", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([
      { id: "doc1", type: "terms", version: 1 },
      { id: "doc2", type: "privacy", version: 1 },
    ]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await confirmParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav" });
    expect(mockConfirmConsentAndRecordAcceptances).toHaveBeenCalledWith(
      expect.objectContaining({
        consentRecordId: "cr1",
        userId: "u1",
        legalDocumentIds: ["doc1", "doc2"],
        legalDocumentVersions: { terms: 1, privacy: 1 },
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent.given", targetId: "u1" }),
    );
    consoleSpy.mockRestore();
  });

  it("does not fail the whole request if the receipt email fails to send - consent is already recorded", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" });
    mockEnv.RESEND_API_KEY = "re_test";
    mockEnv.EMAIL_FROM = "Finlamma <consent@mail.finlamma.in>";
    mockSendEmail.mockRejectedValueOnce(new Error("Resend is down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await confirmParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav" });
    consoleErrorSpy.mockRestore();
  });

  it("default off - never touches the weekly-report opt-in when the caller omits it", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce(null);

    await confirmParentConsent("t", META); // no third argument

    expect(mockSetParentContactWeeklyReportOptIn).not.toHaveBeenCalled();
  });

  it("opt-in path - checking the box sets weekly-report opt-in and logs the change", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce(null);
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(true);

    await confirmParentConsent("t", META, true);

    expect(mockSetParentContactWeeklyReportOptIn).toHaveBeenCalledWith("u1", true);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.weekly_report_opted_in",
        targetId: "u1",
        metadata: { method: "consent_confirm" },
      }),
    );
  });

  it("does not log a weekly-report opt-in change when it was already on (no-op)", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockListPublishedDocuments.mockResolvedValueOnce([]);
    mockConfirmConsentAndRecordAcceptances.mockResolvedValueOnce({ id: "cr1", status: "consented" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce(null);
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(false); // no-op, already true

    await confirmParentConsent("t", META, true);

    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent.weekly_report_opted_in" }),
    );
  });
});

describe("requireFullAccess", () => {
  const ADULT = { id: "u1", email: "a@example.com", firstName: "A", dateOfBirth: "1990-01-01" };
  const MINOR = { id: "u2", email: "b@example.com", firstName: "B", dateOfBirth: "2015-01-01" };

  it("throws FORBIDDEN when there's no date of birth yet", async () => {
    await expect(requireFullAccess({ ...ADULT, dateOfBirth: null })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN for a minor without consented status", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "pending" });
    await expect(requireFullAccess(MINOR)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when legal documents aren't all self-accepted", async () => {
    mockGetLegalStatus.mockResolvedValueOnce({ allAccepted: false });
    await expect(requireFullAccess(ADULT)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes for an adult who has accepted everything", async () => {
    mockGetLegalStatus.mockResolvedValueOnce({ allAccepted: true });
    await expect(requireFullAccess(ADULT)).resolves.toBeUndefined();
  });

  it("passes for a consented minor who has accepted everything", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    mockGetLegalStatus.mockResolvedValueOnce({ allAccepted: true, allParentApproved: true });
    await expect(requireFullAccess(MINOR)).resolves.toBeUndefined();
  });

  it("throws PARENT_REAPPROVAL_REQUIRED for a consented minor whose parent hasn't approved a changed document", async () => {
    mockGetConsentRecord.mockResolvedValueOnce({ status: "consented" });
    mockGetLegalStatus.mockResolvedValueOnce({ allAccepted: true, allParentApproved: false });
    await expect(requireFullAccess(MINOR)).rejects.toMatchObject({
      code: "PARENT_REAPPROVAL_REQUIRED",
    });
  });

  it("doesn't require parent re-approval for an adult, even if allParentApproved were false", async () => {
    mockGetLegalStatus.mockResolvedValueOnce({ allAccepted: true, allParentApproved: false });
    await expect(requireFullAccess(ADULT)).resolves.toBeUndefined();
  });
});

describe("declineParentConsent", () => {
  it("throws NOT_FOUND for an unknown token", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce(null);
    await expect(declineParentConsent("bad", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT if the record is no longer pending", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({ status: "consented", usedAt: new Date() });
    await expect(declineParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws NOT_FOUND if the token has expired", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(declineParentConsent("t", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT if declineConsentRecord loses a race", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockDeclineConsentRecord.mockResolvedValueOnce(null);
    await expect(declineParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT when the account has been deleted", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockIsUserDeleted.mockResolvedValueOnce(true);

    await expect(declineParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockDeclineConsentRecord).not.toHaveBeenCalled();
  });

  it("on success: records the refusal and logs it, without touching legal_acceptances", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockDeclineConsentRecord.mockResolvedValueOnce({ id: "cr1", status: "refused" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await declineParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent.refused", targetId: "u1" }),
    );
  });

  it("decline clears opt-in - a real change is cleared and logged", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockDeclineConsentRecord.mockResolvedValueOnce({ id: "cr1", status: "refused" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(true); // was on, now cleared

    await declineParentConsent("t", META);

    expect(mockSetParentContactWeeklyReportOptIn).toHaveBeenCalledWith("u1", false);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.weekly_report_opted_out",
        targetId: "u1",
        metadata: { method: "consent_declined" },
      }),
    );
  });

  it("decline is a no-op for weekly-report opt-in when it was already off", async () => {
    mockGetConsentRecordByTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockDeclineConsentRecord.mockResolvedValueOnce({ id: "cr1", status: "refused" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(false);

    await declineParentConsent("t", META);

    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent.weekly_report_opted_out" }),
    );
  });
});

describe("getWithdrawRequestView", () => {
  it("returns invalid when no record matches the withdraw token", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce(null);
    expect(await getWithdrawRequestView("bad")).toEqual({ state: "invalid" });
  });

  it("returns already_withdrawn when the record is already withdrawn", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "withdrawn" });
    expect(await getWithdrawRequestView("t")).toEqual({ state: "already_withdrawn" });
  });

  it("returns not_applicable when the record was never consented", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "pending" });
    expect(await getWithdrawRequestView("t")).toEqual({ state: "not_applicable" });
  });

  it("returns the valid view with the child's name for an active consent", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "consented", userId: "u1" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    expect(await getWithdrawRequestView("t")).toEqual({ state: "valid", childFirstName: "Aarav" });
  });

  it("returns already_withdrawn when the account has been deleted, even though consent is still 'consented'", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "consented", userId: "u1" });
    mockIsUserDeleted.mockResolvedValueOnce(true);

    expect(await getWithdrawRequestView("t")).toEqual({ state: "already_withdrawn" });
  });
});

describe("withdrawParentConsent", () => {
  it("throws NOT_FOUND for an unknown withdraw token", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce(null);
    await expect(withdrawParentConsent("bad", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is idempotent - re-withdrawing an already-withdrawn record succeeds without writing again", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "withdrawn", userId: "u1" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await withdrawParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyWithdrawn: true });
    expect(mockWithdrawConsentRecord).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when there's no active consent to withdraw", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "pending", userId: "u1" });
    await expect(withdrawParentConsent("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reports alreadyWithdrawn:true (not an error) when the account has been deleted", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "consented", userId: "u1" });
    mockIsUserDeleted.mockResolvedValueOnce(true);
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await withdrawParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyWithdrawn: true });
    expect(mockWithdrawConsentRecord).not.toHaveBeenCalled();
  });

  it("on success: records the withdrawal, logs it, and sends a withdrawal-confirmation email", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "consented",
    });
    mockWithdrawConsentRecord.mockResolvedValueOnce({ id: "cr1", status: "withdrawn" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await withdrawParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyWithdrawn: false });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent.withdrawn", targetId: "u1" }),
    );
    // Not configured/production in this test, so it falls back to the
    // console-log path rather than a real Resend call - same as every
    // other email in this suite.
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("withdrawal confirmed"));
    consoleSpy.mockRestore();
  });

  it("does not send a withdrawal-confirmation email on the idempotent already-withdrawn path", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "withdrawn", userId: "u1" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await withdrawParentConsent("t", META);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(mockGetParentContact).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("reports alreadyWithdrawn:true (not an error) when a concurrent request wins the withdraw race", async () => {
    // record still reads as 'consented' here, but withdrawConsentRecord's
    // atomic WHERE clause loses to a concurrent request that withdrew it
    // first - a security audit found this used to throw CONFLICT, breaking
    // the "withdrawal is idempotent" promise documented above.
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "consented",
    });
    mockWithdrawConsentRecord.mockResolvedValueOnce(null);
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await withdrawParentConsent("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyWithdrawn: true });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("withdrawal clears opt-in - a genuine new withdrawal clears a real opt-in and logs it", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({
      id: "cr1",
      userId: "u1",
      status: "consented",
    });
    mockWithdrawConsentRecord.mockResolvedValueOnce({ id: "cr1", status: "withdrawn" });
    mockGetUserFirstName.mockResolvedValue("Aarav");
    mockGetParentContact.mockResolvedValueOnce({ email: "priya@example.com" });
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(true);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await withdrawParentConsent("t", META);

    expect(mockSetParentContactWeeklyReportOptIn).toHaveBeenCalledWith("u1", false);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.weekly_report_opted_out",
        targetId: "u1",
        metadata: { method: "consent_withdrawn" },
      }),
    );
    consoleSpy.mockRestore();
  });

  it("never touches the weekly-report opt-in on the idempotent already-withdrawn path", async () => {
    mockGetConsentRecordByWithdrawTokenHash.mockResolvedValueOnce({ status: "withdrawn", userId: "u1" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    await withdrawParentConsent("t", META);

    expect(mockSetParentContactWeeklyReportOptIn).not.toHaveBeenCalled();
  });
});

describe("getConsentReviewList / revealParentContact", () => {
  it("getConsentReviewList excludes deleted accounts by default", async () => {
    mockListConsentRecordsForReview.mockResolvedValueOnce([{ userId: "u1" }]);
    const result = await getConsentReviewList(50);
    expect(mockListConsentRecordsForReview).toHaveBeenCalledWith(50, false);
    expect(result).toEqual([{ userId: "u1" }]);
  });

  it("getConsentReviewList passes includeDeleted through when asked", async () => {
    mockListConsentRecordsForReview.mockResolvedValueOnce([]);
    await getConsentReviewList(50, true);
    expect(mockListConsentRecordsForReview).toHaveBeenCalledWith(50, true);
  });

  it("revealParentContact fetches the contact and logs the reveal under the staff actor", async () => {
    mockGetParentContactForReview.mockResolvedValueOnce({ name: "Priya", email: "priya@example.com" });

    const result = await revealParentContact({ id: "staff1" }, "u1", META);

    expect(result).toEqual({ name: "Priya", email: "priya@example.com" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorId: "staff1",
        action: "consent.parent_contact_viewed",
        targetId: "u1",
      }),
    );
  });

  it("revealParentContact refuses (and never logs a reveal) for a deleted account", async () => {
    mockIsUserDeleted.mockResolvedValueOnce(true);

    await expect(revealParentContact({ id: "staff1" }, "u1", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockGetParentContactForReview).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("scrubConsentDataForDeletedUser", () => {
  it("no-ops when the user never had a parent contact (adult, or minor who never requested consent)", async () => {
    mockGetParentContact.mockResolvedValueOnce(null);

    await scrubConsentDataForDeletedUser("u1", META);

    expect(mockSetConsentRecordParentEmailHmac).not.toHaveBeenCalled();
    expect(mockAnonymizeParentContact).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("anonymizes the parent contact and stores an HMAC when no other active child shares that email", async () => {
    mockEnv.CONSENT_PII_HMAC_KEY = "test-hmac-key";
    mockGetParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);

    await scrubConsentDataForDeletedUser("u1", META);

    expect(mockSetConsentRecordParentEmailHmac).toHaveBeenCalledWith(
      "u1",
      expect.any(String),
    );
    expect(mockAnonymizeParentContact).toHaveBeenCalledWith("pc1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.data_scrubbed_on_deletion",
        targetId: "u1",
        metadata: { parentContactAnonymized: true, hmacStored: true },
      }),
    );
  });

  it("computes the same HMAC for the same email (deterministic, keyed)", async () => {
    mockEnv.CONSENT_PII_HMAC_KEY = "test-hmac-key";
    mockGetParentContact.mockResolvedValue({ id: "pc1", email: "priya@example.com" });
    mockCountChildrenForParentEmail.mockResolvedValue(0);

    await scrubConsentDataForDeletedUser("u1", META);
    const firstHmac = mockSetConsentRecordParentEmailHmac.mock.calls[0][1];

    await scrubConsentDataForDeletedUser("u2", META);
    const secondHmac = mockSetConsentRecordParentEmailHmac.mock.calls[1][1];

    expect(firstHmac).toBe(secondHmac);
  });

  it("does NOT anonymize the parent contact when another active child shares that email", async () => {
    mockEnv.CONSENT_PII_HMAC_KEY = "test-hmac-key";
    mockGetParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockCountChildrenForParentEmail.mockResolvedValueOnce(1);

    await scrubConsentDataForDeletedUser("u1", META);

    expect(mockAnonymizeParentContact).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { parentContactAnonymized: false, hmacStored: true } }),
    );
  });

  it("still deletes/scrubs when CONSENT_PII_HMAC_KEY isn't configured, storing a null HMAC and logging the gap", async () => {
    mockGetParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockCountChildrenForParentEmail.mockResolvedValueOnce(0);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await scrubConsentDataForDeletedUser("u1", META);

    expect(mockSetConsentRecordParentEmailHmac).toHaveBeenCalledWith("u1", null);
    expect(mockAnonymizeParentContact).toHaveBeenCalledWith("pc1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { parentContactAnonymized: true, hmacStored: false } }),
    );
    consoleErrorSpy.mockRestore();
  });
});

const REAPPROVAL_DOC = {
  id: "doc_2",
  type: "terms" as const,
  version: 2,
  content: { en: "en v2", hi: "hi v2", hx: "hx v2" },
};

describe("notifyAffectedMinorsForReapproval", () => {
  it("throws NOT_FOUND when the legal document doesn't exist", async () => {
    mockGetLegalDocumentById.mockResolvedValueOnce(null);
    await expect(notifyAffectedMinorsForReapproval("doc_2", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("notifies only minor candidates, skipping one who has since turned 18", async () => {
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockListCandidatesForReapproval.mockResolvedValueOnce([
      {
        userId: "minor1",
        dateOfBirth: "2015-01-01",
        firstName: "Aarav",
        parentContactId: "pc1",
        parentEmail: "priya@example.com",
        parentName: "Priya",
      },
      {
        userId: "adult-now",
        dateOfBirth: "1990-01-01",
        firstName: "Rohan",
        parentContactId: "pc2",
        parentEmail: "other@example.com",
        parentName: "Other",
      },
    ]);
    mockGetSettingNumber.mockResolvedValueOnce(5);
    mockClaimReapprovalRequestSlot.mockResolvedValueOnce({ ok: true, record: { id: "rr1" } });

    const result = await notifyAffectedMinorsForReapproval("doc_2", META);

    expect(result).toEqual({ notified: 1 });
    expect(mockClaimReapprovalRequestSlot).toHaveBeenCalledTimes(1);
    expect(mockClaimReapprovalRequestSlot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "minor1", legalDocumentId: "doc_2", parentContactId: "pc1" }),
    );
    expect(mockSetConsentRecordWithdrawTokenHash).toHaveBeenCalledWith("minor1", expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "legal.reapproval_requested",
        targetId: "minor1",
        metadata: { legalDocumentId: "doc_2", type: "terms", version: 2 },
      }),
    );
  });

  it("skips a candidate whose claim unexpectedly fails without aborting the rest of the batch", async () => {
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockListCandidatesForReapproval.mockResolvedValueOnce([
      {
        userId: "minor1",
        dateOfBirth: "2015-01-01",
        firstName: "Aarav",
        parentContactId: "pc1",
        parentEmail: "priya@example.com",
        parentName: "Priya",
      },
      {
        userId: "minor2",
        dateOfBirth: "2015-01-01",
        firstName: "Diya",
        parentContactId: "pc2",
        parentEmail: "raj@example.com",
        parentName: "Raj",
      },
    ]);
    mockGetSettingNumber.mockResolvedValueOnce(5);
    mockClaimReapprovalRequestSlot
      .mockResolvedValueOnce({ ok: false, reason: "already_resolved" })
      .mockResolvedValueOnce({ ok: true, record: { id: "rr2" } });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await notifyAffectedMinorsForReapproval("doc_2", META);

    expect(result).toEqual({ notified: 1 });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ targetId: "minor2" }));
    consoleErrorSpy.mockRestore();
  });

  it("an email-send failure for one candidate never aborts the rest of the batch", async () => {
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockListCandidatesForReapproval.mockResolvedValueOnce([
      {
        userId: "minor1",
        dateOfBirth: "2015-01-01",
        firstName: "Aarav",
        parentContactId: "pc1",
        parentEmail: "priya@example.com",
        parentName: "Priya",
      },
      {
        userId: "minor2",
        dateOfBirth: "2015-01-01",
        firstName: "Diya",
        parentContactId: "pc2",
        parentEmail: "raj@example.com",
        parentName: "Raj",
      },
    ]);
    mockGetSettingNumber.mockResolvedValueOnce(5);
    mockClaimReapprovalRequestSlot
      .mockResolvedValueOnce({ ok: true, record: { id: "rr1" } })
      .mockResolvedValueOnce({ ok: true, record: { id: "rr2" } });
    // Force the real sendEmail path (not the dev-log fallback) so a Resend
    // failure actually reaches the loop.
    mockEnv.RESEND_API_KEY = "re_test_key";
    mockEnv.EMAIL_FROM = "Finlamma <consent@mail.finlamma.in>";
    mockSendEmail.mockRejectedValueOnce(new Error("Resend rejected this address"));
    mockSendEmail.mockResolvedValueOnce(undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await notifyAffectedMinorsForReapproval("doc_2", META);

    expect(result).toEqual({ notified: 1 });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ targetId: "minor2" }));
    consoleErrorSpy.mockRestore();
    mockEnv.RESEND_API_KEY = undefined;
    mockEnv.EMAIL_FROM = undefined;
  });
});

describe("getReapprovalRequestView", () => {
  it("returns 'invalid' when no request matches the token", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(null);
    await expect(getReapprovalRequestView("t")).resolves.toEqual({ state: "invalid" });
  });

  it("returns 'already_resolved' when the request isn't pending anymore", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce({
      userId: "u1",
      status: "approved",
      usedAt: new Date(),
      tokenExpiresAt: new Date(Date.now() + 1000),
      legalDocumentId: "doc_2",
    });
    await expect(getReapprovalRequestView("t")).resolves.toEqual({ state: "already_resolved" });
  });

  it("returns 'already_resolved' for a deleted account, without revealing why", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce({
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000),
      legalDocumentId: "doc_2",
    });
    mockIsUserDeleted.mockResolvedValueOnce(true);
    await expect(getReapprovalRequestView("t")).resolves.toEqual({ state: "already_resolved" });
  });

  it("returns 'expired' when the token's expiry has passed", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce({
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
      legalDocumentId: "doc_2",
    });
    await expect(getReapprovalRequestView("t")).resolves.toEqual({ state: "expired" });
  });

  it("returns the document content for a valid, pending, unexpired request", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce({
      userId: "u1",
      status: "pending",
      usedAt: null,
      tokenExpiresAt: new Date(Date.now() + 1000),
      legalDocumentId: "doc_2",
    });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);

    const result = await getReapprovalRequestView("t");

    expect(result).toEqual({
      state: "valid",
      childFirstName: "Aarav",
      documentType: "terms",
      documentVersion: 2,
      documentContent: REAPPROVAL_DOC.content,
    });
  });
});

describe("approveReapproval", () => {
  const PENDING_REQUEST = {
    id: "rr1",
    userId: "u1",
    legalDocumentId: "doc_2",
    status: "pending",
    usedAt: null,
    tokenExpiresAt: new Date(Date.now() + 1000),
  };

  it("throws NOT_FOUND when no request matches the token", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(null);
    await expect(approveReapproval("t", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the request has already been used", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce({ ...PENDING_REQUEST, status: "approved" });
    await expect(approveReapproval("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws NOT_FOUND when the token has expired", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce({
      ...PENDING_REQUEST,
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(approveReapproval("t", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("records the parent acceptance, merges the version onto the consent record, and logs it", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockApproveReapprovalAndRecordAcceptance.mockResolvedValueOnce({ ...PENDING_REQUEST, status: "approved" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await approveReapproval("t", META);

    expect(result).toEqual({ childFirstName: "Aarav" });
    expect(mockApproveReapprovalAndRecordAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "rr1",
        userId: "u1",
        legalDocumentId: "doc_2",
        documentType: "terms",
        documentVersion: 2,
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal.reapproval_approved", targetId: "u1" }),
    );
  });

  it("throws CONFLICT when the atomic approve loses a race (already resolved concurrently) - the whole transaction rolls back, nothing partial to clean up", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockApproveReapprovalAndRecordAcceptance.mockResolvedValueOnce(null);

    await expect(approveReapproval("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("is additive-only - omitting weeklyReportOptIn never touches an existing opt-in", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockApproveReapprovalAndRecordAcceptance.mockResolvedValueOnce({ ...PENDING_REQUEST, status: "approved" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    await approveReapproval("t", META); // no third argument - same as an unchecked box

    expect(mockSetParentContactWeeklyReportOptIn).not.toHaveBeenCalled();
  });

  it("checking the box sets weekly-report opt-in on and logs it", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockApproveReapprovalAndRecordAcceptance.mockResolvedValueOnce({ ...PENDING_REQUEST, status: "approved" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(true);

    await approveReapproval("t", META, true);

    expect(mockSetParentContactWeeklyReportOptIn).toHaveBeenCalledWith("u1", true);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.weekly_report_opted_in",
        targetId: "u1",
        metadata: { method: "reapproval_approved" },
      }),
    );
  });
});

describe("declineReapproval", () => {
  const PENDING_REQUEST = {
    id: "rr1",
    userId: "u1",
    legalDocumentId: "doc_2",
    status: "pending",
    usedAt: null,
    tokenExpiresAt: new Date(Date.now() + 1000),
  };

  it("throws NOT_FOUND when no request matches the token", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(null);
    await expect(declineReapproval("t", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("revokes the parent's original consent entirely in one atomic call, not just this document version", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockDeclineReapprovalAndRefuseConsent.mockResolvedValueOnce({ ...PENDING_REQUEST, status: "declined" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await declineReapproval("t", META);

    expect(result).toEqual({ childFirstName: "Aarav" });
    expect(mockDeclineReapprovalAndRefuseConsent).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "rr1", userId: "u1" }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal.reapproval_declined", targetId: "u1" }),
    );
  });

  it("throws CONFLICT when the atomic decline loses a race (already resolved concurrently)", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockDeclineReapprovalAndRefuseConsent.mockResolvedValueOnce(null);

    await expect(declineReapproval("t", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("decline clears opt-in - revoking consent this way also clears a real opt-in and logs it", async () => {
    mockGetReapprovalRequestByTokenHash.mockResolvedValueOnce(PENDING_REQUEST);
    mockDeclineReapprovalAndRefuseConsent.mockResolvedValueOnce({ ...PENDING_REQUEST, status: "declined" });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    mockSetParentContactWeeklyReportOptIn.mockResolvedValueOnce(true);

    await declineReapproval("t", META);

    expect(mockSetParentContactWeeklyReportOptIn).toHaveBeenCalledWith("u1", false);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.weekly_report_opted_out",
        targetId: "u1",
        metadata: { method: "reapproval_declined" },
      }),
    );
  });
});

describe("resendReapprovalRequests", () => {
  it("throws CONSENT_NOT_NEEDED when there's nothing pending", async () => {
    mockListPendingReapprovalRequestsForUser.mockResolvedValueOnce([]);
    await expect(
      resendReapprovalRequests({ id: "u1", email: null, firstName: "Aarav", dateOfBirth: "2015-01-01" }, META),
    ).rejects.toMatchObject({ code: "CONSENT_NOT_NEEDED" });
  });

  it("resends every pending request and rotates the withdraw token each time", async () => {
    mockListPendingReapprovalRequestsForUser.mockResolvedValueOnce([
      { id: "rr1", legalDocumentId: "doc_2" },
    ]);
    mockGetParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockGetSettingNumber.mockResolvedValueOnce(5);
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockClaimReapprovalRequestSlot.mockResolvedValueOnce({ ok: true, record: { id: "rr1" } });

    const result = await resendReapprovalRequests(
      { id: "u1", email: null, firstName: "Aarav", dateOfBirth: "2015-01-01" },
      META,
    );

    expect(result).toEqual({ resent: 1 });
    expect(mockSetConsentRecordWithdrawTokenHash).toHaveBeenCalledWith("u1", expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal.reapproval_resent", actorId: "u1" }),
    );
  });

  it("throws RESEND_TOO_SOON when the claim says the cooldown hasn't passed", async () => {
    mockListPendingReapprovalRequestsForUser.mockResolvedValueOnce([
      { id: "rr1", legalDocumentId: "doc_2" },
    ]);
    mockGetParentContact.mockResolvedValueOnce({ id: "pc1", email: "priya@example.com" });
    mockGetSettingNumber.mockResolvedValueOnce(5);
    mockGetLegalDocumentById.mockResolvedValueOnce(REAPPROVAL_DOC);
    mockClaimReapprovalRequestSlot.mockResolvedValueOnce({
      ok: false,
      reason: "too_soon",
      retryAfterSeconds: 30,
    });

    await expect(
      resendReapprovalRequests({ id: "u1", email: null, firstName: "Aarav", dateOfBirth: "2015-01-01" }, META),
    ).rejects.toMatchObject({ code: "RESEND_TOO_SOON", details: { retryAfterSeconds: 30 } });
  });
});

describe("getWeeklyReportUnsubscribeView", () => {
  it("returns invalid when no parent contact matches the token", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce(null);
    expect(await getWeeklyReportUnsubscribeView("bad")).toEqual({ state: "invalid" });
  });

  it("returns already_unsubscribed when the opt-in is already off", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: false,
    });
    expect(await getWeeklyReportUnsubscribeView("t")).toEqual({ state: "already_unsubscribed" });
  });

  it("returns already_unsubscribed when the account has been deleted, even though opt-in is still true", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: true,
    });
    mockIsUserDeleted.mockResolvedValueOnce(true);
    expect(await getWeeklyReportUnsubscribeView("t")).toEqual({ state: "already_unsubscribed" });
  });

  it("returns the valid view with the child's name when opt-in is currently on", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: true,
    });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");
    expect(await getWeeklyReportUnsubscribeView("t")).toEqual({ state: "valid", childFirstName: "Aarav" });
  });
});

describe("unsubscribeWeeklyReport", () => {
  it("throws NOT_FOUND for an unknown token", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce(null);
    await expect(unsubscribeWeeklyReport("bad", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is idempotent - re-unsubscribing an already-off contact succeeds without writing again", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: false,
    });
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await unsubscribeWeeklyReport("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyUnsubscribed: true });
    expect(mockUnsubscribeParentContactFromWeeklyReport).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("stops weekly emails but keeps consent - on success, only weeklyReportOptIn is touched, and it's logged", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: true,
    });
    mockUnsubscribeParentContactFromWeeklyReport.mockResolvedValueOnce({ id: "pc1", userId: "u1" });
    mockGetUserFirstName.mockResolvedValue("Aarav");

    const result = await unsubscribeWeeklyReport("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyUnsubscribed: false });
    expect(mockUnsubscribeParentContactFromWeeklyReport).toHaveBeenCalledWith("pc1");
    // Never touches consent - no consent_records repo function is called at all.
    expect(mockWithdrawConsentRecord).not.toHaveBeenCalled();
    expect(mockDeclineConsentRecord).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "consent.weekly_report_opted_out",
        targetId: "u1",
        metadata: { method: "unsubscribe_link" },
      }),
    );
  });

  it("reports alreadyUnsubscribed:true when a concurrent request wins the race", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: true,
    });
    mockUnsubscribeParentContactFromWeeklyReport.mockResolvedValueOnce(null);
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await unsubscribeWeeklyReport("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyUnsubscribed: true });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("reports alreadyUnsubscribed:true (not an error) when the account has been deleted", async () => {
    mockGetParentContactByWeeklyReportUnsubscribeTokenHash.mockResolvedValueOnce({
      id: "pc1",
      userId: "u1",
      weeklyReportOptIn: true,
    });
    mockIsUserDeleted.mockResolvedValueOnce(true);
    mockGetUserFirstName.mockResolvedValueOnce("Aarav");

    const result = await unsubscribeWeeklyReport("t", META);

    expect(result).toEqual({ childFirstName: "Aarav", alreadyUnsubscribed: true });
    expect(mockUnsubscribeParentContactFromWeeklyReport).not.toHaveBeenCalled();
  });
});
