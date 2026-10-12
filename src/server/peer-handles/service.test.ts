import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDeletePeerHandleRow = vi.fn();
const mockGetHandlesForUserIds = vi.fn();
const mockGetPeerHandleById = vi.fn();
const mockGetUserHandleState = vi.fn();
const mockInsertPeerHandle = vi.fn();
const mockListActivePeerHandles = vi.fn();
const mockListPeerHandles = vi.fn();
const mockListUserIdsWithoutHandle = vi.fn();
const mockPickRandomActivePeerHandleId = vi.fn();
const mockSetUserHandle = vi.fn();
const mockSetUserHandleAndRerolledAt = vi.fn();
const mockUpdatePeerHandleRow = vi.fn();
vi.mock("./repo", () => ({
  deletePeerHandleRow: (id: unknown) => mockDeletePeerHandleRow(id),
  getHandlesForUserIds: (ids: unknown) => mockGetHandlesForUserIds(ids),
  getPeerHandleById: (id: unknown) => mockGetPeerHandleById(id),
  getUserHandleState: (userId: unknown) => mockGetUserHandleState(userId),
  insertPeerHandle: (input: unknown) => mockInsertPeerHandle(input),
  listActivePeerHandles: () => mockListActivePeerHandles(),
  listPeerHandles: () => mockListPeerHandles(),
  listUserIdsWithoutHandle: () => mockListUserIdsWithoutHandle(),
  pickRandomActivePeerHandleId: (excludeId?: unknown) => mockPickRandomActivePeerHandleId(excludeId),
  setUserHandle: (userId: unknown, handleId: unknown) => mockSetUserHandle(userId, handleId),
  setUserHandleAndRerolledAt: (userId: unknown, handleId: unknown) =>
    mockSetUserHandleAndRerolledAt(userId, handleId),
  updatePeerHandleRow: (id: unknown, input: unknown) => mockUpdatePeerHandleRow(id, input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", () => ({
  logInternalError: (errorId: unknown, err: unknown) => mockLogInternalError(errorId, err),
}));

const mockIsForeignKeyViolation = vi.fn();
vi.mock("@/lib/db-errors", () => ({
  isForeignKeyViolation: (err: unknown) => mockIsForeignKeyViolation(err),
}));

import {
  assignRandomHandleIfMissing,
  backfillMissingHandles,
  createPeerHandleForAdmin,
  deletePeerHandleForAdmin,
  getMyHandle,
  rerollMyHandle,
  updatePeerHandleForAdmin,
} from "./service";

const META = { ip: null, userAgent: null };
const HANDLE = { en: "Smart Saver", hi: "समझदार बचतकर्ता", hx: "Smart Saver" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("assignRandomHandleIfMissing", () => {
  it("assigns a random active handle to a user with none yet", async () => {
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: null, handleRerolledAt: null });
    mockPickRandomActivePeerHandleId.mockResolvedValueOnce("h1");

    const assigned = await assignRandomHandleIfMissing("u1");

    expect(assigned).toBe(true);
    expect(mockSetUserHandle).toHaveBeenCalledWith("u1", "h1");
  });

  it("is a no-op for a user who already has a handle", async () => {
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: "h-existing", handleRerolledAt: null });

    const assigned = await assignRandomHandleIfMissing("u1");

    expect(assigned).toBe(false);
    expect(mockSetUserHandle).not.toHaveBeenCalled();
  });

  it("logs and returns false, never throws, when the catalog has no active handle", async () => {
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: null, handleRerolledAt: null });
    mockPickRandomActivePeerHandleId.mockResolvedValueOnce(null);

    const assigned = await assignRandomHandleIfMissing("u1");

    expect(assigned).toBe(false);
    expect(mockSetUserHandle).not.toHaveBeenCalled();
    expect(mockLogInternalError).toHaveBeenCalledWith("peer_handles.no_active_handles", expect.anything());
  });

  it("logs and returns false, never throws, on an unexpected repo failure", async () => {
    mockGetUserHandleState.mockRejectedValueOnce(new Error("db down"));

    const assigned = await assignRandomHandleIfMissing("u1");

    expect(assigned).toBe(false);
    expect(mockLogInternalError).toHaveBeenCalledWith("peer_handles.assign_failed", expect.anything());
  });
});

describe("getMyHandle", () => {
  it("returns the caller's own handle", async () => {
    mockGetHandlesForUserIds.mockResolvedValueOnce(new Map([["u1", HANDLE]]));

    expect(await getMyHandle("u1")).toEqual(HANDLE);
  });

  it("returns null when unassigned", async () => {
    mockGetHandlesForUserIds.mockResolvedValueOnce(new Map([["u1", null]]));

    expect(await getMyHandle("u1")).toBeNull();
  });
});

describe("rerollMyHandle", () => {
  it("rejects a user with no handle assigned yet", async () => {
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: null, handleRerolledAt: null });

    await expect(rerollMyHandle({ id: "u1" }, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows the first-ever reroll (handleRerolledAt still null) and sets a new handle", async () => {
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: "h1", handleRerolledAt: null });
    mockPickRandomActivePeerHandleId.mockResolvedValueOnce("h2");
    mockGetHandlesForUserIds.mockResolvedValueOnce(new Map([["u1", HANDLE]]));

    const result = await rerollMyHandle({ id: "u1" }, META);

    expect(mockSetUserHandleAndRerolledAt).toHaveBeenCalledWith("u1", "h2");
    expect(mockPickRandomActivePeerHandleId).toHaveBeenCalledWith("h1");
    expect(result.handle).toEqual(HANDLE);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "peer_handle.rerolled", actorId: "u1" }),
    );
  });

  it("rejects a reroll inside the 30-day cooldown, with retry details", async () => {
    const rerolledAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: "h1", handleRerolledAt: rerolledAt });

    await expect(rerollMyHandle({ id: "u1" }, META)).rejects.toMatchObject({
      code: "RESEND_TOO_SOON",
      details: expect.objectContaining({
        retryAfterSeconds: expect.any(Number),
        nextRerollAvailableAt: expect.any(String),
      }),
    });
    expect(mockSetUserHandleAndRerolledAt).not.toHaveBeenCalled();
  });

  it("allows a reroll once the 30-day cooldown has fully elapsed", async () => {
    const rerolledAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: "h1", handleRerolledAt: rerolledAt });
    mockPickRandomActivePeerHandleId.mockResolvedValueOnce("h2");
    mockGetHandlesForUserIds.mockResolvedValueOnce(new Map([["u1", HANDLE]]));

    await rerollMyHandle({ id: "u1" }, META);

    expect(mockSetUserHandleAndRerolledAt).toHaveBeenCalledWith("u1", "h2");
  });

  it("fails loudly (never silently reassigns) when the catalog has nothing to reroll into", async () => {
    mockGetUserHandleState.mockResolvedValueOnce({ handleId: "h1", handleRerolledAt: null });
    mockPickRandomActivePeerHandleId.mockResolvedValueOnce(null);

    await expect(rerollMyHandle({ id: "u1" }, META)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockSetUserHandleAndRerolledAt).not.toHaveBeenCalled();
  });
});

describe("backfillMissingHandles", () => {
  it("assigns a handle to every user missing one, sequentially", async () => {
    mockListUserIdsWithoutHandle.mockResolvedValueOnce(["u1", "u2", "u3"]);
    mockGetUserHandleState
      .mockResolvedValueOnce({ handleId: null, handleRerolledAt: null })
      .mockResolvedValueOnce({ handleId: null, handleRerolledAt: null })
      .mockResolvedValueOnce({ handleId: "already-set-by-a-race", handleRerolledAt: null });
    mockPickRandomActivePeerHandleId.mockResolvedValue("h1");

    const result = await backfillMissingHandles();

    expect(result).toEqual({ assigned: 2, total: 3 });
    expect(mockSetUserHandle).toHaveBeenCalledTimes(2);
  });

  it("is a safe no-op to run again once nobody is missing a handle", async () => {
    mockListUserIdsWithoutHandle.mockResolvedValueOnce([]);

    expect(await backfillMissingHandles()).toEqual({ assigned: 0, total: 0 });
    expect(mockSetUserHandle).not.toHaveBeenCalled();
  });
});

describe("admin: createPeerHandleForAdmin / updatePeerHandleForAdmin / deletePeerHandleForAdmin", () => {
  const ACTOR = { id: "staff1" };
  const INPUT = { key: "smart-saver", name: HANDLE, active: true };

  it("creates a handle and logs the mutation", async () => {
    mockInsertPeerHandle.mockResolvedValueOnce({ id: "h1", ...INPUT });

    const created = await createPeerHandleForAdmin(ACTOR, INPUT, META);

    expect(created).toEqual({ id: "h1", ...INPUT });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "peer_handles.created", actorId: "staff1" }),
    );
  });

  it("rejects updating a handle that doesn't exist", async () => {
    mockGetPeerHandleById.mockResolvedValueOnce(null);

    await expect(
      updatePeerHandleForAdmin(ACTOR, "ghost", { name: HANDLE, active: true }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("turns a delete of an in-use handle into a clear CONFLICT, not a raw FK error", async () => {
    mockGetPeerHandleById.mockResolvedValueOnce({ id: "h1", name: HANDLE });
    mockDeletePeerHandleRow.mockRejectedValueOnce(new Error("foreign key violation"));
    mockIsForeignKeyViolation.mockReturnValueOnce(true);

    await expect(deletePeerHandleForAdmin(ACTOR, "h1", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects deleting a handle that doesn't exist", async () => {
    mockGetPeerHandleById.mockResolvedValueOnce(null);

    await expect(deletePeerHandleForAdmin(ACTOR, "ghost", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
