import type { WebhookEvent } from "@clerk/nextjs/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUpsert = vi.fn();
const mockAnonymize = vi.fn();
const mockUpdatePrefs = vi.fn();
const mockGetUserById = vi.fn();
const mockGetUserByClerkUserId = vi.fn();
const mockMarkDeletionRequested = vi.fn();
const mockListStuckAccountDeletions = vi.fn();
vi.mock("./repo", () => ({
  upsertUserFromClerk: (input: unknown) => mockUpsert(input),
  anonymizeUserFromClerk: (id: unknown) => mockAnonymize(id),
  updateUserPrefs: (id: unknown, input: unknown) => mockUpdatePrefs(id, input),
  getUserById: (id: unknown) => mockGetUserById(id),
  getUserByClerkUserId: (id: unknown) => mockGetUserByClerkUserId(id),
  markDeletionRequested: (id: unknown) => mockMarkDeletionRequested(id),
  listStuckAccountDeletions: () => mockListStuckAccountDeletions(),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockDeleteConsumerClerkUser = vi.fn();
const mockConsumerClerkUserExists = vi.fn();
vi.mock("@/lib/auth", () => ({
  deleteConsumerClerkUser: (id: unknown) => mockDeleteConsumerClerkUser(id),
  consumerClerkUserExists: (id: unknown) => mockConsumerClerkUserExists(id),
}));

const mockInngestSend = vi.fn();
vi.mock("@/lib/inngest", () => ({
  inngest: { send: (input: unknown) => mockInngestSend(input) },
}));

const mockScrubConsentData = vi.fn();
const mockGetOnboardingConsentState = vi.fn();
const mockScrubDobCorrectionsForUser = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  scrubConsentDataForDeletedUser: (userId: unknown, meta: unknown) => mockScrubConsentData(userId, meta),
  getOnboardingConsentState: (user: unknown) => mockGetOnboardingConsentState(user),
  scrubDobCorrectionsForUser: (userId: unknown) => mockScrubDobCorrectionsForUser(userId),
}));

const mockDeleteAllPushTokensForUser = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  deleteAllPushTokensForUser: (userId: unknown) => mockDeleteAllPushTokensForUser(userId),
}));

const mockScrubDoubtZoneContentForUser = vi.fn();
vi.mock("@/server/doubt-zone/service", () => ({
  scrubDoubtZoneContentForUser: (userId: unknown) => mockScrubDoubtZoneContentForUser(userId),
}));

const mockAssignRandomHandleIfMissing = vi.fn();
const mockGetMyHandle = vi.fn();
vi.mock("@/server/peer-handles/service", () => ({
  assignRandomHandleIfMissing: (userId: unknown) => mockAssignRandomHandleIfMissing(userId),
  getMyHandle: (userId: unknown) => mockGetMyHandle(userId),
}));

import {
  deleteMe,
  getMe,
  reconcileAccountDeletion,
  runAccountDeletionReconciliationSweep,
  syncUserFromClerkEvent,
  updateMe,
} from "./service";

function userEvent(
  type: "user.created" | "user.updated",
  overrides: Partial<{
    first_name: string | null;
    last_name: string | null;
    email_addresses: unknown[];
    phone_numbers: unknown[];
    primary_email_address_id: string | null;
    primary_phone_number_id: string | null;
    updated_at: number;
  }> = {},
): WebhookEvent {
  return {
    type,
    object: "event",
    data: {
      id: "user_123",
      first_name: "Chirag",
      last_name: "Bansal",
      email_addresses: [
        {
          id: "email_1",
          email_address: "chirag@example.com",
          verification: { status: "verified" },
        },
      ],
      phone_numbers: [],
      primary_email_address_id: "email_1",
      primary_phone_number_id: null,
      updated_at: 1_700_000_000_000,
      ...overrides,
    },
    event_attributes: { http_request: { client_ip: "", user_agent: "" } },
  } as unknown as WebhookEvent;
}

const HANDLE_FIXTURE = { en: "Smart Saver", hi: "समझदार बचतकर्ता", hx: "Smart Saver" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyHandle.mockResolvedValue(HANDLE_FIXTURE);
});

describe("syncUserFromClerkEvent", () => {
  it("upserts first_name (no last_name/lastInitial) and the verified primary email on user.created", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetUserByClerkUserId.mockResolvedValueOnce({ id: "u1" });
    mockAssignRandomHandleIfMissing.mockResolvedValueOnce(true);

    await syncUserFromClerkEvent(userEvent("user.created"));

    expect(mockUpsert).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      firstName: "Chirag",
      email: "chirag@example.com",
      phone: null,
      clerkUpdatedAt: new Date(1_700_000_000_000),
    });
    expect(mockAssignRandomHandleIfMissing).toHaveBeenCalledWith("u1");
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "system",
      action: "user.synced_from_clerk",
      targetType: "user",
      targetId: "user_123",
      metadata: { clerkEventType: "user.created" },
    });
  });

  it("allows null first_name/last_name (phone-only signup, no name yet)", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetUserByClerkUserId.mockResolvedValueOnce(null);

    await syncUserFromClerkEvent(
      userEvent("user.created", {
        first_name: null,
        last_name: null,
        email_addresses: [],
        primary_email_address_id: null,
      }),
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: null, email: null }),
    );
  });

  it("skips handle assignment when the just-synced user can't be resolved back by clerk id", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetUserByClerkUserId.mockResolvedValueOnce(null);

    await syncUserFromClerkEvent(userEvent("user.created"));

    expect(mockAssignRandomHandleIfMissing).not.toHaveBeenCalled();
  });

  it("does not crash when primary_email_address_id points at an id absent from email_addresses", async () => {
    // Regression test: Clerk's own "send example event" payload for
    // user.created sets primary_email_address_id to a placeholder id while
    // email_addresses is []. find() over the empty array just returns
    // undefined, so this must resolve to no verified email, not throw.
    mockUpsert.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);

    await syncUserFromClerkEvent(
      userEvent("user.created", {
        email_addresses: [],
        primary_email_address_id: "idn_does_not_exist",
      }),
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    );
  });

  it("ignores an unverified primary email/phone", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);

    await syncUserFromClerkEvent(
      userEvent("user.updated", {
        email_addresses: [
          {
            id: "email_1",
            email_address: "chirag@example.com",
            verification: { status: "unverified" },
          },
        ],
      }),
    );

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  describe("user.deleted", () => {
    // Shared happy-path setup for the reconciliation this branch delegates
    // to (reconcileAccountDeletion) - individual tests override whichever
    // mock they need to differ.
    beforeEach(() => {
      mockGetUserByClerkUserId.mockResolvedValue({ id: "u1", clerkUserId: "user_123", deletedAt: null });
      mockGetUserById.mockResolvedValue({ id: "u1", clerkUserId: "user_123", deletedAt: null });
      mockConsumerClerkUserExists.mockResolvedValue(false);
      mockAnonymize.mockResolvedValue({ id: "u1" });
      mockScrubConsentData.mockResolvedValue(undefined);
      mockDeleteAllPushTokensForUser.mockResolvedValue(undefined);
      mockScrubDoubtZoneContentForUser.mockResolvedValue(0);
      mockScrubDobCorrectionsForUser.mockResolvedValue(0);
    });

    it("reconciles the account and logs both the reconciliation and the webhook receipt", async () => {
      await syncUserFromClerkEvent({
        type: "user.deleted",
        object: "event",
        data: { id: "user_123", object: "user", deleted: true },
        event_attributes: { http_request: { client_ip: "", user_agent: "" } },
      } as unknown as WebhookEvent);

      expect(mockAnonymize).toHaveBeenCalledWith("user_123");
      expect(mockScrubConsentData).toHaveBeenCalledWith("u1", { ip: null, userAgent: null });
      expect(mockDeleteAllPushTokensForUser).toHaveBeenCalledWith("u1");
      expect(mockScrubDoubtZoneContentForUser).toHaveBeenCalledWith("u1");
      expect(mockScrubDobCorrectionsForUser).toHaveBeenCalledWith("u1");
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ actorType: "system", action: "user.deletion_reconciled", targetId: "u1" }),
      );
      expect(mockLogActivity).toHaveBeenCalledWith({
        actorType: "system",
        action: "user.deleted_from_clerk",
        targetType: "user",
        targetId: "user_123",
      });
    });

    it("skips reconciliation entirely when no user row matches this clerk id", async () => {
      mockGetUserByClerkUserId.mockResolvedValueOnce(null);

      await syncUserFromClerkEvent({
        type: "user.deleted",
        object: "event",
        data: { id: "user_123", object: "user", deleted: true },
        event_attributes: { http_request: { client_ip: "", user_agent: "" } },
      } as unknown as WebhookEvent);

      expect(mockAnonymize).not.toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user.deleted_from_clerk" }),
      );
    });

    it("is a no-op redelivery when the row is already fully deleted", async () => {
      mockGetUserByClerkUserId.mockResolvedValueOnce({ id: "u1", clerkUserId: "user_123", deletedAt: new Date() });
      mockGetUserById.mockResolvedValueOnce({ id: "u1", clerkUserId: "user_123", deletedAt: new Date() });

      await syncUserFromClerkEvent({
        type: "user.deleted",
        object: "event",
        data: { id: "user_123", object: "user", deleted: true },
        event_attributes: { http_request: { client_ip: "", user_agent: "" } },
      } as unknown as WebhookEvent);

      expect(mockAnonymize).not.toHaveBeenCalled();
      expect(mockScrubConsentData).not.toHaveBeenCalled();
    });
  });

  it("ignores event types it doesn't act on", async () => {
    const evt = { type: "session.created", data: {} } as unknown as WebhookEvent;

    await syncUserFromClerkEvent(evt);

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockAnonymize).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

const USER_ROW = {
  id: "u1",
  clerkUserId: "clerk_123",
  firstName: "Chirag",
  lastInitial: "B",
  handleId: null,
  handleRerolledAt: null,
  email: "chirag@example.com",
  phone: null,
  dateOfBirth: null,
  onboardingCompletedAt: null,
  language: "en" as const,
  theme: "dark" as const,
  bio: null,
  state: null,
  preferences: { sound: true, haptics: true, dataSaver: false, cheersEnabled: true },
  clerkUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  deletionRequestedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("getMe", () => {
  it("shapes the users row into the public profile fields, including onboarding/consent state", async () => {
    mockGetOnboardingConsentState.mockResolvedValueOnce({
      dobSet: false,
      isMinor: null,
      parentConsentStatus: "not_required",
    });

    await expect(getMe(USER_ROW)).resolves.toEqual({
      id: "u1",
      firstName: "Chirag",
      lastInitial: "B",
      handle: HANDLE_FIXTURE,
      email: "chirag@example.com",
      phone: null,
      language: "en",
      theme: "dark",
      bio: null,
      state: null,
      preferences: { sound: true, haptics: true, dataSaver: false, cheersEnabled: true },
      dobSet: false,
      isMinor: null,
      parentConsentStatus: "not_required",
    });
    expect(mockGetOnboardingConsentState).toHaveBeenCalledWith(USER_ROW);
    expect(mockGetMyHandle).toHaveBeenCalledWith("u1");
  });

  it("carries a minor's pending-consent state through to the response", async () => {
    mockGetOnboardingConsentState.mockResolvedValueOnce({
      dobSet: true,
      isMinor: true,
      parentConsentStatus: "pending",
    });

    const result = await getMe({ ...USER_ROW, dateOfBirth: "2015-01-01" });

    expect(result.dobSet).toBe(true);
    expect(result.isMinor).toBe(true);
    expect(result.parentConsentStatus).toBe("pending");
  });
});

const META = { ip: "203.0.113.5", userAgent: "FinlammaApp/1.0" };

describe("updateMe", () => {
  it("persists the update and logs the changed field NAMES only, never their values", async () => {
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, language: "hi" as const });
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetOnboardingConsentState.mockResolvedValueOnce({
      dobSet: false,
      isMinor: null,
      parentConsentStatus: "not_required",
    });

    const result = await updateMe(USER_ROW, { language: "hi" }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { language: "hi" });
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "user",
      actorId: "u1",
      action: "user.updated_prefs",
      targetType: "user",
      targetId: "u1",
      metadata: { changedFields: ["language"] },
      ip: "203.0.113.5",
      userAgent: "FinlammaApp/1.0",
    });
    expect(result.language).toBe("hi");
  });

  it("logs only the field name for a bio update - never the bio text itself", async () => {
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, bio: "Saving up!" });
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetOnboardingConsentState.mockResolvedValueOnce({
      dobSet: false,
      isMinor: null,
      parentConsentStatus: "not_required",
    });

    const result = await updateMe(USER_ROW, { bio: "Saving up!" }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { bio: "Saving up!" });
    expect(result.bio).toBe("Saving up!");
    const loggedCall = mockLogActivity.mock.calls[0][0];
    expect(loggedCall.metadata).toEqual({ changedFields: ["bio"] });
    expect(JSON.stringify(loggedCall)).not.toMatch(/Saving up/);
  });

  it("persists a state update (Arena's state-scope leaderboard, never shown on any profile)", async () => {
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, state: "Maharashtra" });
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetOnboardingConsentState.mockResolvedValueOnce({
      dobSet: false,
      isMinor: null,
      parentConsentStatus: "not_required",
    });

    const result = await updateMe(USER_ROW, { state: "Maharashtra" }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { state: "Maharashtra" });
    expect(result.state).toBe("Maharashtra");
  });

  it("logs every changed field name when several fields change at once", async () => {
    const preferences = { sound: false, haptics: false, dataSaver: true, cheersEnabled: false };
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, preferences, theme: "light" as const });
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockGetOnboardingConsentState.mockResolvedValueOnce({
      dobSet: false,
      isMinor: null,
      parentConsentStatus: "not_required",
    });

    const result = await updateMe(USER_ROW, { preferences, theme: "light" }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { preferences, theme: "light" });
    expect(result.preferences).toEqual(preferences);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { changedFields: ["preferences", "theme"] } }),
    );
  });
});

describe("deleteMe", () => {
  it("durably records the deletion request, logs it, and fires the reconciliation event - does nothing else synchronously", async () => {
    mockMarkDeletionRequested.mockResolvedValueOnce({ id: "u1", deletionRequestedAt: new Date() });
    mockLogActivity.mockResolvedValueOnce(undefined);
    mockInngestSend.mockResolvedValueOnce(undefined);

    await deleteMe(USER_ROW, META);

    expect(mockMarkDeletionRequested).toHaveBeenCalledWith("u1");
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "user",
      actorId: "u1",
      action: "user.deletion_requested",
      targetType: "user",
      targetId: "u1",
      ip: "203.0.113.5",
      userAgent: "FinlammaApp/1.0",
    });
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "account/deletion.requested",
      data: { userId: "u1" },
    });
    // The actual Clerk delete/anonymize/scrub never happen inline anymore -
    // reconcileAccountDeletion (run via the Inngest event) owns all of that.
    expect(mockDeleteConsumerClerkUser).not.toHaveBeenCalled();
    expect(mockAnonymize).not.toHaveBeenCalled();
  });
});

describe("reconcileAccountDeletion", () => {
  beforeEach(() => {
    mockGetUserById.mockResolvedValue({ id: "u1", clerkUserId: "clerk_123", deletedAt: null });
    mockConsumerClerkUserExists.mockResolvedValue(false);
    mockAnonymize.mockResolvedValue({ id: "u1" });
    mockScrubConsentData.mockResolvedValue(undefined);
    mockDeleteAllPushTokensForUser.mockResolvedValue(undefined);
    mockScrubDoubtZoneContentForUser.mockResolvedValue(0);
    mockScrubDobCorrectionsForUser.mockResolvedValue(0);
  });

  it("is a no-op when the account is already fully deleted", async () => {
    mockGetUserById.mockResolvedValueOnce({ id: "u1", clerkUserId: "clerk_123", deletedAt: new Date() });

    const result = await reconcileAccountDeletion("u1", META);

    expect(result).toEqual({ alreadyDone: true });
    expect(mockConsumerClerkUserExists).not.toHaveBeenCalled();
    expect(mockAnonymize).not.toHaveBeenCalled();
  });

  it("is a no-op when the user row no longer exists", async () => {
    mockGetUserById.mockResolvedValueOnce(null);

    await expect(reconcileAccountDeletion("gone", META)).resolves.toEqual({ alreadyDone: true });
  });

  it("deletes the Clerk identity too when it still exists (the original request died before that step)", async () => {
    mockConsumerClerkUserExists.mockResolvedValueOnce(true);

    await reconcileAccountDeletion("u1", META);

    expect(mockDeleteConsumerClerkUser).toHaveBeenCalledWith("clerk_123");
  });

  it("skips the Clerk delete call when Clerk already has no such user", async () => {
    mockConsumerClerkUserExists.mockResolvedValueOnce(false);

    await reconcileAccountDeletion("u1", META);

    expect(mockDeleteConsumerClerkUser).not.toHaveBeenCalled();
  });

  it("runs every scrub step and logs completion with the user id only - never an email or name", async () => {
    const result = await reconcileAccountDeletion("u1", META);

    expect(mockAnonymize).toHaveBeenCalledWith("clerk_123");
    expect(mockScrubConsentData).toHaveBeenCalledWith("u1", META);
    expect(mockDeleteAllPushTokensForUser).toHaveBeenCalledWith("u1");
    expect(mockScrubDoubtZoneContentForUser).toHaveBeenCalledWith("u1");
    expect(mockScrubDobCorrectionsForUser).toHaveBeenCalledWith("u1");
    expect(result).toEqual({ alreadyDone: false });

    const loggedCall = mockLogActivity.mock.calls.find(
      (c) => c[0].action === "user.deletion_reconciled",
    )?.[0];
    expect(loggedCall).toEqual({
      actorType: "system",
      action: "user.deletion_reconciled",
      targetType: "user",
      targetId: "u1",
      ip: META.ip,
      userAgent: META.userAgent,
    });
    expect(JSON.stringify(loggedCall)).not.toMatch(/chirag|@example\.com/i);
  });
});

describe("runAccountDeletionReconciliationSweep", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it("reports nothing to do when the worklist is empty", async () => {
    mockListStuckAccountDeletions.mockResolvedValueOnce([]);

    await expect(runAccountDeletionReconciliationSweep()).resolves.toEqual({
      attempted: 0,
      succeeded: 0,
    });
  });

  it("reconciles every stuck row", async () => {
    mockListStuckAccountDeletions.mockResolvedValueOnce([
      { id: "u1", clerkUserId: "clerk_1", deletionRequestedAt: new Date() },
      { id: "u2", clerkUserId: "clerk_2", deletionRequestedAt: new Date() },
    ]);
    mockGetUserById.mockImplementation((id: string) =>
      Promise.resolve({ id, clerkUserId: `clerk_${id.slice(-1)}`, deletedAt: null }),
    );
    mockConsumerClerkUserExists.mockResolvedValue(false);
    mockAnonymize.mockResolvedValue({ id: "x" });
    mockScrubConsentData.mockResolvedValue(undefined);
    mockDeleteAllPushTokensForUser.mockResolvedValue(undefined);
    mockScrubDoubtZoneContentForUser.mockResolvedValue(0);
    mockScrubDobCorrectionsForUser.mockResolvedValue(0);

    const result = await runAccountDeletionReconciliationSweep();

    expect(result).toEqual({ attempted: 2, succeeded: 2 });
  });

  it("one failing row never blocks the rest of the batch", async () => {
    const recentlyRequested = new Date();
    mockListStuckAccountDeletions.mockResolvedValueOnce([
      { id: "bad", clerkUserId: "clerk_bad", deletionRequestedAt: recentlyRequested },
      { id: "good", clerkUserId: "clerk_good", deletionRequestedAt: recentlyRequested },
    ]);
    mockGetUserById.mockImplementation((id: string) => {
      if (id === "bad") return Promise.reject(new Error("transient DB error"));
      return Promise.resolve({ id, clerkUserId: "clerk_good", deletedAt: null });
    });
    mockConsumerClerkUserExists.mockResolvedValue(false);
    mockAnonymize.mockResolvedValue({ id: "good" });
    mockScrubConsentData.mockResolvedValue(undefined);
    mockDeleteAllPushTokensForUser.mockResolvedValue(undefined);
    mockScrubDoubtZoneContentForUser.mockResolvedValue(0);
    mockScrubDobCorrectionsForUser.mockResolvedValue(0);

    const result = await runAccountDeletionReconciliationSweep();

    expect(result).toEqual({ attempted: 2, succeeded: 1 });
  });

  it("escalates with a distinctly-named, greppable log once a row has been stuck 3+ days", async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    mockListStuckAccountDeletions.mockResolvedValueOnce([
      { id: "stuck", clerkUserId: "clerk_stuck", deletionRequestedAt: fourDaysAgo },
    ]);
    mockGetUserById.mockRejectedValueOnce(new Error("still failing"));

    await runAccountDeletionReconciliationSweep();

    const escalation = consoleErrorSpy.mock.calls.find((c) =>
      String(c[0]).includes("account_deletion.reconciliation_stuck"),
    );
    expect(escalation).toBeDefined();
    expect(String(escalation![0])).toMatch(/userId=stuck/);
  });

  it("does not escalate a row that's only failed once, recently", async () => {
    mockListStuckAccountDeletions.mockResolvedValueOnce([
      { id: "fresh", clerkUserId: "clerk_fresh", deletionRequestedAt: new Date() },
    ]);
    mockGetUserById.mockRejectedValueOnce(new Error("one-off failure"));

    await runAccountDeletionReconciliationSweep();

    const escalation = consoleErrorSpy.mock.calls.find((c) =>
      String(c[0]).includes("account_deletion.reconciliation_stuck"),
    );
    expect(escalation).toBeUndefined();
  });
});
