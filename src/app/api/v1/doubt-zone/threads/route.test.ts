import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockCreateOrGetThread = vi.fn();
vi.mock("@/server/doubt-zone/service", () => ({
  createOrGetThread: (...args: unknown[]) => mockCreateOrGetThread(...args),
}));

import { POST } from "./route";

const USER = { id: "u1", language: "en" };
const MENTOR_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/doubt-zone/threads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("POST /api/v1/doubt-zone/threads", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({ mentorId: MENTOR_ID }));

    expect(res.status).toBe(401);
    expect(mockCreateOrGetThread).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is missing", async () => {
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await POST(makeRequest({ mentorId: MENTOR_ID }));

    expect(res.status).toBe(403);
  });

  it("passes an empty body through to the service, which is what enforces mentorId-when-no-lessonId (both fields are optional at the schema level)", async () => {
    mockCreateOrGetThread.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "mentorId is required when lessonId is omitted"),
    );

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(mockCreateOrGetThread).toHaveBeenCalledWith({ id: "u1", language: "en" }, {}, expect.anything());
  });

  it("returns 201 with the thread on success, passing the caller's own language", async () => {
    mockCreateOrGetThread.mockResolvedValueOnce({
      id: "thread_1",
      mentorId: MENTOR_ID,
      lessonId: null,
      disclosureMessage: "Hi! I'm Lamma AI...",
    });

    const res = await POST(makeRequest({ mentorId: MENTOR_ID }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("thread_1");
    expect(mockCreateOrGetThread).toHaveBeenCalledWith(
      { id: "u1", language: "en" },
      { mentorId: MENTOR_ID },
      expect.anything(),
    );
  });

  it("propagates a NOT_FOUND from the service (e.g. unpublished mentor) as 404", async () => {
    mockCreateOrGetThread.mockRejectedValueOnce(new AppError("NOT_FOUND", "No published mentor with this id"));

    const res = await POST(makeRequest({ mentorId: MENTOR_ID }));

    expect(res.status).toBe(404);
  });
});
