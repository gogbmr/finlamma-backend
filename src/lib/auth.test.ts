import { describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

const mockLimit = vi.fn();
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockLimit(),
        }),
      }),
    }),
  },
}));

import { requireUser } from "./auth";

describe("requireUser", () => {
  it("throws UNAUTHENTICATED when there is no Clerk session", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });

    await expect(requireUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("throws UNAUTHENTICATED when the session has no matching users row", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "clerk_123" });
    mockLimit.mockResolvedValueOnce([]);

    await expect(requireUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("throws UNAUTHENTICATED when the matching user is soft-deleted", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "clerk_123" });
    mockLimit.mockResolvedValueOnce([
      { id: "u1", clerkUserId: "clerk_123", deletedAt: new Date() },
    ]);

    await expect(requireUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("returns the users row when the session matches an active user", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "clerk_123" });
    mockLimit.mockResolvedValueOnce([
      { id: "u1", clerkUserId: "clerk_123", deletedAt: null },
    ]);

    const user = await requireUser();

    expect(user).toEqual({ id: "u1", clerkUserId: "clerk_123", deletedAt: null });
  });
});
