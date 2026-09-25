import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockGetMe = vi.fn();
const mockUpdateMe = vi.fn();
const mockDeleteMe = vi.fn();
vi.mock("@/server/users/service", () => ({
  getMe: (user: unknown) => mockGetMe(user),
  updateMe: (user: unknown, input: unknown, meta: unknown) => mockUpdateMe(user, input, meta),
  deleteMe: (user: unknown, meta: unknown) => mockDeleteMe(user, meta),
}));

import { DELETE, GET, PATCH } from "./route";

const USER = { id: "u1", clerkUserId: "clerk_1", language: "en", theme: "dark" };

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/v1/me", {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

describe("GET /api/v1/me", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockGetMe.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest("GET"));

    expect(res.status).toBe(401);
    expect(mockGetMe).not.toHaveBeenCalled();
  });

  it("returns the caller's profile", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockGetMe.mockReturnValueOnce({ id: "u1", language: "en", theme: "dark" });

    const res = await GET(makeRequest("GET"));

    expect(res.status).toBe(200);
    expect(mockGetMe).toHaveBeenCalledWith(USER);
    const body = await res.json();
    expect(body.data).toEqual({ id: "u1", language: "en", theme: "dark" });
  });
});

describe("PATCH /api/v1/me", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockUpdateMe.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await PATCH(makeRequest("PATCH", { language: "hi" }));

    expect(res.status).toBe(401);
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  it("returns 400 when neither language nor theme is provided", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);

    const res = await PATCH(makeRequest("PATCH", {}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  it("updates and returns the profile", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockUpdateMe.mockResolvedValueOnce({ id: "u1", language: "hi", theme: "dark" });

    const res = await PATCH(makeRequest("PATCH", { language: "hi" }));

    expect(res.status).toBe(200);
    expect(mockUpdateMe).toHaveBeenCalledWith(USER, { language: "hi" }, { ip: null, userAgent: null });
    const body = await res.json();
    expect(body.data.language).toBe("hi");
  });

  it("updates bio", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockUpdateMe.mockResolvedValueOnce({ id: "u1", language: "en", theme: "dark", bio: "Hi!" });

    const res = await PATCH(makeRequest("PATCH", { bio: "Hi!" }));

    expect(res.status).toBe(200);
    expect(mockUpdateMe).toHaveBeenCalledWith(USER, { bio: "Hi!" }, { ip: null, userAgent: null });
  });

  it("rejects a bio over 280 characters", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);

    const res = await PATCH(makeRequest("PATCH", { bio: "a".repeat(281) }));

    expect(res.status).toBe(400);
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  it("updates preferences as a whole object, not merged", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    const preferences = { sound: false, haptics: true, dataSaver: true };
    mockUpdateMe.mockResolvedValueOnce({ id: "u1", language: "en", theme: "dark", preferences });

    const res = await PATCH(makeRequest("PATCH", { preferences }));

    expect(res.status).toBe(200);
    expect(mockUpdateMe).toHaveBeenCalledWith(USER, { preferences }, { ip: null, userAgent: null });
  });

  it("rejects preferences missing a required field", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);

    const res = await PATCH(makeRequest("PATCH", { preferences: { sound: true } }));

    expect(res.status).toBe(400);
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/me", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockDeleteMe.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await DELETE(makeRequest("DELETE"));

    expect(res.status).toBe(401);
    expect(mockDeleteMe).not.toHaveBeenCalled();
  });

  it("deletes the account and returns confirmation", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockDeleteMe.mockResolvedValueOnce(undefined);

    const res = await DELETE(makeRequest("DELETE"));

    expect(res.status).toBe(200);
    expect(mockDeleteMe).toHaveBeenCalledWith(USER, { ip: null, userAgent: null });
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });

  it("surfaces SERVICE_UNAVAILABLE if Clerk deletion fails", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockDeleteMe.mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE", "Could not delete account right now"),
    );

    const res = await DELETE(makeRequest("DELETE"));

    expect(res.status).toBe(503);
  });
});
