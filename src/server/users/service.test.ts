import type { WebhookEvent } from "@clerk/nextjs/server";
import { describe, expect, it, vi } from "vitest";

const mockUpsert = vi.fn();
const mockAnonymize = vi.fn();
const mockUpdatePrefs = vi.fn();
vi.mock("./repo", () => ({
  upsertUserFromClerk: (input: unknown) => mockUpsert(input),
  anonymizeUserFromClerk: (id: unknown) => mockAnonymize(id),
  updateUserPrefs: (id: unknown, input: unknown) => mockUpdatePrefs(id, input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockDeleteConsumerClerkUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  deleteConsumerClerkUser: (id: unknown) => mockDeleteConsumerClerkUser(id),
}));

const mockScrubConsentData = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  scrubConsentDataForDeletedUser: (userId: unknown, meta: unknown) => mockScrubConsentData(userId, meta),
}));

import { deleteMe, getMe, syncUserFromClerkEvent, updateMe } from "./service";

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

describe("syncUserFromClerkEvent", () => {
  it("upserts first_name + last-initial-only and the verified primary email on user.created", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);

    await syncUserFromClerkEvent(userEvent("user.created"));

    expect(mockUpsert).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      firstName: "Chirag",
      lastInitial: "B",
      email: "chirag@example.com",
      phone: null,
      clerkUpdatedAt: new Date(1_700_000_000_000),
    });
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

    await syncUserFromClerkEvent(
      userEvent("user.created", {
        first_name: null,
        last_name: null,
        email_addresses: [],
        primary_email_address_id: null,
      }),
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: null, lastInitial: null, email: null }),
    );
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

  it("anonymizes, scrubs consent data (no request meta from a webhook), and logs on user.deleted", async () => {
    mockAnonymize.mockResolvedValueOnce({ id: "u1" });
    mockScrubConsentData.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);

    const evt = {
      type: "user.deleted",
      object: "event",
      data: { id: "user_123", object: "user", deleted: true },
      event_attributes: { http_request: { client_ip: "", user_agent: "" } },
    } as unknown as WebhookEvent;

    await syncUserFromClerkEvent(evt);

    expect(mockAnonymize).toHaveBeenCalledWith("user_123");
    expect(mockScrubConsentData).toHaveBeenCalledWith("u1", { ip: null, userAgent: null });
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "system",
      action: "user.deleted_from_clerk",
      targetType: "user",
      targetId: "user_123",
    });
  });

  it("skips the consent-data scrub when anonymize is a no-op (redelivered/already-deleted event)", async () => {
    mockAnonymize.mockResolvedValueOnce(null);
    mockLogActivity.mockResolvedValueOnce(undefined);

    const evt = {
      type: "user.deleted",
      object: "event",
      data: { id: "user_123", object: "user", deleted: true },
      event_attributes: { http_request: { client_ip: "", user_agent: "" } },
    } as unknown as WebhookEvent;

    await syncUserFromClerkEvent(evt);

    expect(mockScrubConsentData).not.toHaveBeenCalled();
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
  email: "chirag@example.com",
  phone: null,
  dateOfBirth: null,
  onboardingCompletedAt: null,
  language: "en" as const,
  theme: "dark" as const,
  bio: null,
  preferences: { sound: true, haptics: true, dataSaver: false },
  clerkUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("getMe", () => {
  it("shapes the users row into the public profile fields", () => {
    expect(getMe(USER_ROW)).toEqual({
      id: "u1",
      firstName: "Chirag",
      lastInitial: "B",
      email: "chirag@example.com",
      phone: null,
      language: "en",
      theme: "dark",
      bio: null,
      preferences: { sound: true, haptics: true, dataSaver: false },
    });
  });
});

const META = { ip: "203.0.113.5", userAgent: "FinlammaApp/1.0" };

describe("updateMe", () => {
  it("persists the update and logs it as the user's own action, with request meta", async () => {
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, language: "hi" as const });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await updateMe(USER_ROW, { language: "hi" }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { language: "hi" });
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "user",
      actorId: "u1",
      action: "user.updated_prefs",
      targetType: "user",
      targetId: "u1",
      metadata: { language: "hi" },
      ip: "203.0.113.5",
      userAgent: "FinlammaApp/1.0",
    });
    expect(result.language).toBe("hi");
  });

  it("persists a bio update", async () => {
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, bio: "Saving up!" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await updateMe(USER_ROW, { bio: "Saving up!" }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { bio: "Saving up!" });
    expect(result.bio).toBe("Saving up!");
  });

  it("persists a whole-object preferences update", async () => {
    const preferences = { sound: false, haptics: false, dataSaver: true };
    mockUpdatePrefs.mockResolvedValueOnce({ ...USER_ROW, preferences });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await updateMe(USER_ROW, { preferences }, META);

    expect(mockUpdatePrefs).toHaveBeenCalledWith("u1", { preferences });
    expect(result.preferences).toEqual(preferences);
  });
});

describe("deleteMe", () => {
  it("deletes from Clerk, anonymizes the DB row, scrubs consent data with request meta, then logs it", async () => {
    mockDeleteConsumerClerkUser.mockResolvedValueOnce(undefined);
    mockAnonymize.mockResolvedValueOnce({ id: "u1" });
    mockScrubConsentData.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);

    await deleteMe(USER_ROW, META);

    expect(mockDeleteConsumerClerkUser).toHaveBeenCalledWith("clerk_123");
    expect(mockAnonymize).toHaveBeenCalledWith("clerk_123");
    expect(mockScrubConsentData).toHaveBeenCalledWith("u1", META);
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "user",
      actorId: "u1",
      action: "user.deleted_self",
      targetType: "user",
      targetId: "u1",
      ip: "203.0.113.5",
      userAgent: "FinlammaApp/1.0",
    });
  });

  it("does not anonymize or scrub consent data if the Clerk deletion fails", async () => {
    mockDeleteConsumerClerkUser.mockRejectedValueOnce(new Error("Clerk unavailable"));

    await expect(deleteMe(USER_ROW, META)).rejects.toThrow();

    expect(mockAnonymize).not.toHaveBeenCalled();
    expect(mockScrubConsentData).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
