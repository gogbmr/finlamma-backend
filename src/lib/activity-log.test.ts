import { describe, expect, it, vi } from "vitest";

const mockValues = vi.fn();
const mockLimit = vi.fn();
vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => mockValues(row),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => mockLimit(),
          }),
        }),
      }),
    }),
  },
}));

import { listActivityLogs, logActivity } from "./activity-log";

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

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "log-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    actorType: "staff" as const,
    actorId: "s1",
    action: "staff.created",
    targetType: "staff_member",
    targetId: "s2",
    metadata: null,
    ip: null,
    userAgent: null,
    ...overrides,
  };
}

describe("listActivityLogs", () => {
  it("returns null nextCursor when there is no extra row past the limit", async () => {
    mockLimit.mockResolvedValueOnce([row()]);

    const result = await listActivityLogs({ limit: 20, cursor: null });

    expect(result.data).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns a cursor and trims the page when there's an extra row past the limit", async () => {
    // limit: 1 -> fetches 2 rows internally to detect "is there more"
    mockLimit.mockResolvedValueOnce([
      row({ id: "log-1", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      row({ id: "log-2", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ]);

    const result = await listActivityLogs({ limit: 1, cursor: null });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("log-1");
    expect(result.nextCursor).not.toBeNull();

    const decoded = JSON.parse(Buffer.from(result.nextCursor!, "base64url").toString("utf8"));
    expect(decoded).toEqual({ createdAt: "2026-01-02T00:00:00.000Z", id: "log-1" });
  });

  it("returns an empty page with no cursor when there are no rows", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const result = await listActivityLogs({ limit: 20, cursor: null });

    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
