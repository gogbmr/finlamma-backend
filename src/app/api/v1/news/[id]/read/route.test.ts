import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockMarkNewsStoryRead = vi.fn();
vi.mock("@/server/news/service", () => ({
  markNewsStoryRead: (user: unknown, id: unknown, dwell: unknown, meta: unknown) =>
    mockMarkNewsStoryRead(user, id, dwell, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const STORY_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/v1/news/${STORY_ID}/read`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/news/{id}/read", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({ dwellSeconds: 20 }), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(401);
    expect(mockMarkNewsStoryRead).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing/invalid dwellSeconds", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(400);
    expect(mockMarkNewsStoryRead).not.toHaveBeenCalled();
  });

  it("returns 429 when the service rejects NEWS_READ_TOO_SOON", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockMarkNewsStoryRead.mockRejectedValueOnce(
      new AppError("NEWS_READ_TOO_SOON", "Keep reading for at least 20 seconds"),
    );

    const res = await POST(makeRequest({ dwellSeconds: 3 }), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(429);
  });

  it("records the read on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockMarkNewsStoryRead.mockResolvedValueOnce({ read: true, alreadyRead: false });

    const res = await POST(makeRequest({ dwellSeconds: 30 }), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(200);
    expect(mockMarkNewsStoryRead).toHaveBeenCalledWith(USER, STORY_ID, 30, expect.any(Object));
  });
});
