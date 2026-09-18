import { describe, expect, it, vi } from "vitest";

const mockValues = vi.fn();
vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => mockValues(row),
    }),
  },
}));

import { logActivity } from "./activity-log";

describe("logActivity", () => {
  it("inserts a row with the given fields", async () => {
    mockValues.mockResolvedValueOnce(undefined);

    await logActivity({
      actorType: "system",
      action: "user.synced_from_clerk",
      targetType: "user",
      targetId: "u1",
      metadata: { clerkUserId: "clerk_123" },
    });

    expect(mockValues).toHaveBeenCalledWith({
      actorType: "system",
      actorId: null,
      action: "user.synced_from_clerk",
      targetType: "user",
      targetId: "u1",
      metadata: { clerkUserId: "clerk_123" },
      ip: null,
      userAgent: null,
    });
  });

  it("defaults optional fields to null", async () => {
    mockValues.mockResolvedValueOnce(undefined);

    await logActivity({ actorType: "user", actorId: "u1", action: "quiz.submitted" });

    expect(mockValues).toHaveBeenCalledWith({
      actorType: "user",
      actorId: "u1",
      action: "quiz.submitted",
      targetType: null,
      targetId: null,
      metadata: undefined,
      ip: null,
      userAgent: null,
    });
  });
});
