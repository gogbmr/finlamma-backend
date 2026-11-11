import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockReportMessage = vi.fn();
vi.mock("@/server/doubt-zone/service", () => ({
  reportMessage: (...args: unknown[]) => mockReportMessage(...args),
}));

import { POST } from "./route";

const USER = { id: "u1", language: "en" };
const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest() {
  return new Request(`http://localhost/api/v1/doubt-zone/threads/${THREAD_ID}/messages/${MESSAGE_ID}/report`, {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("POST /api/v1/doubt-zone/threads/{id}/messages/{messageId}/report", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: THREAD_ID, messageId: MESSAGE_ID }) });

    expect(res.status).toBe(401);
    expect(mockReportMessage).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's thread/message", async () => {
    mockReportMessage.mockRejectedValueOnce(new AppError("NOT_FOUND", "No message with this id in this thread"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: THREAD_ID, messageId: MESSAGE_ID }) });

    expect(res.status).toBe(404);
  });

  it("returns 400 when reporting a non-assistant message", async () => {
    mockReportMessage.mockRejectedValueOnce(new AppError("VALIDATION_FAILED", "Only an assistant reply can be reported"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: THREAD_ID, messageId: MESSAGE_ID }) });

    expect(res.status).toBe(400);
  });

  it("returns 403 DOUBT_ZONE_DISABLED when the server-side kill switch is off", async () => {
    mockReportMessage.mockRejectedValueOnce(new AppError("DOUBT_ZONE_DISABLED", "Doubt Zone is not available right now"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: THREAD_ID, messageId: MESSAGE_ID }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("DOUBT_ZONE_DISABLED");
  });

  it("reports the message and returns 200", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: THREAD_ID, messageId: MESSAGE_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reported: true });
    expect(mockReportMessage).toHaveBeenCalledWith({ id: "u1" }, THREAD_ID, MESSAGE_ID, expect.anything());
  });
});
