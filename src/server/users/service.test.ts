import type { WebhookEvent } from "@clerk/nextjs/server";
import { describe, expect, it, vi } from "vitest";

const mockUpsert = vi.fn();
const mockAnonymize = vi.fn();
vi.mock("./repo", () => ({
  upsertUserFromClerk: (input: unknown) => mockUpsert(input),
  anonymizeUserFromClerk: (id: unknown) => mockAnonymize(id),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import { syncUserFromClerkEvent } from "./service";

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

  it("anonymizes and logs on user.deleted", async () => {
    mockAnonymize.mockResolvedValueOnce(undefined);
    mockLogActivity.mockResolvedValueOnce(undefined);

    const evt = {
      type: "user.deleted",
      object: "event",
      data: { id: "user_123", object: "user", deleted: true },
      event_attributes: { http_request: { client_ip: "", user_agent: "" } },
    } as unknown as WebhookEvent;

    await syncUserFromClerkEvent(evt);

    expect(mockAnonymize).toHaveBeenCalledWith("user_123");
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "system",
      action: "user.deleted_from_clerk",
      targetType: "user",
      targetId: "user_123",
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
