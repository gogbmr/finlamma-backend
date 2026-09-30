import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockListThreadMessages = vi.fn();
const mockPrepareMessage = vi.fn();
const mockStreamReplyAndPersist = vi.fn();
vi.mock("@/server/doubt-zone/service", () => ({
  listThreadMessages: (...args: unknown[]) => mockListThreadMessages(...args),
  prepareMessage: (...args: unknown[]) => mockPrepareMessage(...args),
  streamReplyAndPersist: (...args: unknown[]) => mockStreamReplyAndPersist(...args),
}));

import { GET, POST } from "./route";

const USER = { id: "u1", language: "en" };
const THREAD_ID = "11111111-1111-4111-8111-111111111111";

function makeGetRequest(qs = "") {
  return new Request(`http://localhost/api/v1/doubt-zone/threads/${THREAD_ID}/messages${qs}`);
}

function makePostRequest(body: unknown) {
  return new Request(`http://localhost/api/v1/doubt-zone/threads/${THREAD_ID}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function readNdjson(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("GET /api/v1/doubt-zone/threads/{id}/messages", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(401);
  });

  it("returns 404 for a thread that isn't the caller's own", async () => {
    mockListThreadMessages.mockRejectedValueOnce(new AppError("NOT_FOUND", "No Doubt Zone thread with this id"));

    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(404);
  });

  it("returns a page of messages", async () => {
    mockListThreadMessages.mockResolvedValueOnce({
      data: [{ id: "m1", role: "learner", content: "hi", createdAt: "2026-09-30T00:00:00.000Z" }],
      nextCursor: null,
    });

    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });
});

describe("POST /api/v1/doubt-zone/threads/{id}/messages", () => {
  it("returns 401 when not signed in, before ever calling prepareMessage", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makePostRequest({ content: "hi" }), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(401);
    expect(mockPrepareMessage).not.toHaveBeenCalled();
  });

  it("returns 400 on an empty message", async () => {
    const res = await POST(makePostRequest({ content: "" }), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(400);
    expect(mockPrepareMessage).not.toHaveBeenCalled();
  });

  it("returns a clean 429 JSON response (not a stream) when prepareMessage rate-limits, never opening the stream", async () => {
    mockPrepareMessage.mockRejectedValueOnce(new AppError("RATE_LIMITED", "Too many messages"));

    const res = await POST(makePostRequest({ content: "hi" }), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).not.toContain("ndjson");
    expect(mockStreamReplyAndPersist).not.toHaveBeenCalled();
  });

  it("returns a clean 503 JSON response when the safety classifier fails, never opening the stream", async () => {
    mockPrepareMessage.mockRejectedValueOnce(new AppError("SERVICE_UNAVAILABLE", "Safety classifier call failed"));

    const res = await POST(makePostRequest({ content: "hi" }), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(503);
  });

  it("returns a clean 404 JSON response for someone else's thread, never opening the stream", async () => {
    mockPrepareMessage.mockRejectedValueOnce(new AppError("NOT_FOUND", "No Doubt Zone thread with this id"));

    const res = await POST(makePostRequest({ content: "hi" }), { params: Promise.resolve({ id: THREAD_ID }) });

    expect(res.status).toBe(404);
  });

  it("streams an instant done line (no delta lines, no call to streamReplyAndPersist) when the message was flagged", async () => {
    mockPrepareMessage.mockResolvedValueOnce({
      kind: "flagged",
      assistantMessageId: "assistant_1",
      replacementText: "Please talk to a trusted adult...",
    });

    const res = await POST(makePostRequest({ content: "concerning text" }), {
      params: Promise.resolve({ id: THREAD_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    const lines = await readNdjson(res);
    expect(lines).toEqual([
      { type: "done", messageId: "assistant_1", replaced: true, replacementText: "Please talk to a trusted adult..." },
    ]);
    expect(mockStreamReplyAndPersist).not.toHaveBeenCalled();
  });

  it("streams via streamReplyAndPersist when the message needs a real reply", async () => {
    mockPrepareMessage.mockResolvedValueOnce({ kind: "needs_reply", systemPrompt: "sys", chatMessages: [] });
    mockStreamReplyAndPersist.mockImplementationOnce(
      async (_user: unknown, _threadId: unknown, _prepared: unknown, emit: (line: unknown) => void) => {
        emit({ type: "delta", text: "A mutual " });
        emit({ type: "delta", text: "A mutual fund..." });
        emit({ type: "done", messageId: "assistant_2", replaced: false });
      },
    );

    const res = await POST(makePostRequest({ content: "What is a mutual fund?" }), {
      params: Promise.resolve({ id: THREAD_ID }),
    });

    expect(res.status).toBe(200);
    const lines = await readNdjson(res);
    expect(lines).toEqual([
      { type: "delta", text: "A mutual " },
      { type: "delta", text: "A mutual fund..." },
      { type: "done", messageId: "assistant_2", replaced: false },
    ]);
  });
});
