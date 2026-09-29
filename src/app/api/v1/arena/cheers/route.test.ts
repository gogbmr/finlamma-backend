import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockSendCheer = vi.fn();
vi.mock("@/server/arena/service", () => ({
  sendCheer: (user: unknown, receiverId: unknown, meta: unknown) => mockSendCheer(user, receiverId, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const RECEIVER_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/arena/cheers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/arena/cheers", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({ receiverId: RECEIVER_ID }));

    expect(res.status).toBe(401);
    expect(mockSendCheer).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing/invalid receiverId", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({ receiverId: "not-a-uuid" }));

    expect(res.status).toBe(400);
    expect(mockSendCheer).not.toHaveBeenCalled();
  });

  it("returns 409 when the receiver opted out", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockSendCheer.mockRejectedValueOnce(
      new AppError("CHEER_RECEIVER_OPTED_OUT", "This learner isn't receiving cheers right now"),
    );

    const res = await POST(makeRequest({ receiverId: RECEIVER_ID }));

    expect(res.status).toBe(409);
  });

  it("sends the cheer and returns the result", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockSendCheer.mockResolvedValueOnce({ alreadyCheeredToday: false, xpAwarded: 5, dailyCapReached: false });

    const res = await POST(makeRequest({ receiverId: RECEIVER_ID }));

    expect(res.status).toBe(200);
    expect(mockSendCheer).toHaveBeenCalledWith(USER, RECEIVER_ID, expect.any(Object));
    const body = await res.json();
    expect(body.data.xpAwarded).toBe(5);
  });
});
