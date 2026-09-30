import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS } from "./schemas";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({ logActivity: (input: unknown) => mockLogActivity(input) }));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  DOUBT_ZONE_MESSAGE_RATE_LIMIT: { requests: 8, window: "60 s", prefix: "ratelimit:doubt-zone-message" },
}));

const mockGetPublishedLesson = vi.fn();
vi.mock("@/server/lessons/repo", () => ({ getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id) }));

const mockGetMentorById = vi.fn();
vi.mock("@/server/mentors/repo", () => ({ getMentorById: (id: unknown) => mockGetMentorById(id) }));

const mockGetWorldById = vi.fn();
vi.mock("@/server/worlds/repo", () => ({ getWorldById: (id: unknown) => mockGetWorldById(id) }));

const mockRepo = {
  findLessonThread: vi.fn(),
  findStandaloneThread: vi.fn(),
  getThreadById: vi.fn(),
  insertMessage: vi.fn(),
  insertThread: vi.fn(),
  listMessagesPage: vi.fn(),
  listRecentMessages: vi.fn(),
  markMessageFlagged: vi.fn(),
  touchThreadLastMessageAt: vi.fn(),
};
vi.mock("./repo", () => mockRepo);

const mockStreamDoubtZoneReply = vi.fn();
vi.mock("./reply", () => ({ streamDoubtZoneReply: (...args: unknown[]) => mockStreamDoubtZoneReply(...args) }));

const mockClassifyMessageSafety = vi.fn();
vi.mock("./safety", () => ({
  classifyMessageSafety: (text: unknown) => mockClassifyMessageSafety(text),
  // Reimplemented inline (not imported via importOriginal) so this mock
  // never pulls in the real ./safety.ts, which imports @/lib/env and would
  // require every env var mocked just to load - see safety.test.ts for the
  // real function's own direct coverage.
  isFlaggableSafetyCategory: (classification: { category: string }, flagOnAnySignal: boolean) =>
    classification.category !== "none" && flagOnAnySignal,
}));

const mockGetDoubtZoneSafetySettings = vi.fn();
vi.mock("./settings", () => ({ getDoubtZoneSafetySettings: () => mockGetDoubtZoneSafetySettings() }));

const { createOrGetThread, listThreadMessages, prepareMessage, streamReplyAndPersist } = await import("./service");

const USER = { id: "user_1", language: "en" as const };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const THREAD = {
  id: "thread_1",
  userId: "user_1",
  mentorId: "mentor_1",
  lessonId: null as string | null,
  lastMessageAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDoubtZoneSafetySettings.mockResolvedValue(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
});

describe("createOrGetThread", () => {
  it("standalone: requires mentorId when lessonId is omitted", async () => {
    await expect(createOrGetThread(USER, {}, META)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("standalone: 404s on a mentor that isn't published", async () => {
    mockGetMentorById.mockResolvedValueOnce({ id: "mentor_1", status: "draft" });

    await expect(createOrGetThread(USER, { mentorId: "mentor_1" }, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("standalone: reuses an existing thread and does not log a creation event", async () => {
    mockGetMentorById.mockResolvedValueOnce({ id: "mentor_1", status: "published" });
    mockRepo.findStandaloneThread.mockResolvedValueOnce(THREAD);

    const result = await createOrGetThread(USER, { mentorId: "mentor_1" }, META);

    expect(result.id).toBe(THREAD.id);
    expect(mockRepo.insertThread).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("standalone: creates a new thread and logs it (without message content) when none exists", async () => {
    mockGetMentorById.mockResolvedValueOnce({ id: "mentor_1", status: "published" });
    mockRepo.findStandaloneThread.mockResolvedValueOnce(null);
    mockRepo.insertThread.mockResolvedValueOnce(THREAD);

    const result = await createOrGetThread(USER, { mentorId: "mentor_1" }, META);

    expect(result.disclosureMessage).toBe(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.threadDisclosureMessage.en);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "doubt_zone.thread_created", metadata: { mentorId: "mentor_1", lessonId: null } }),
    );
  });

  it("lesson-scoped: derives the mentor from the lesson's world, ignoring any client mentorId", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce({ id: "lesson_1", worldId: "world_1", title: { en: "x", hi: "x", hx: "x" } });
    mockGetWorldById.mockResolvedValueOnce({ id: "world_1", mentorId: "world_mentor" });
    mockRepo.findLessonThread.mockResolvedValueOnce(null);
    mockRepo.insertThread.mockResolvedValueOnce({ ...THREAD, mentorId: "world_mentor", lessonId: "lesson_1" });

    await createOrGetThread(USER, { lessonId: "lesson_1", mentorId: "attacker_supplied_mentor" }, META);

    expect(mockRepo.insertThread).toHaveBeenCalledWith({ userId: USER.id, mentorId: "world_mentor", lessonId: "lesson_1" });
  });

  it("lesson-scoped: 404s on an unpublished/nonexistent lesson", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(null);

    await expect(createOrGetThread(USER, { lessonId: "nope" }, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("listThreadMessages", () => {
  it("404s when the thread belongs to a different user", async () => {
    mockRepo.getThreadById.mockResolvedValueOnce({ ...THREAD, userId: "someone_else" });

    await expect(listThreadMessages(USER, THREAD.id, { limit: 20, cursor: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("404s when the thread does not exist", async () => {
    mockRepo.getThreadById.mockResolvedValueOnce(null);

    await expect(listThreadMessages(USER, THREAD.id, { limit: 20, cursor: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps rows and omits nextCursor when the page isn't full", async () => {
    mockRepo.getThreadById.mockResolvedValueOnce(THREAD);
    mockRepo.listMessagesPage.mockResolvedValueOnce([
      { id: "m1", role: "learner", content: "hi", createdAt: new Date("2026-09-30T00:00:00Z") },
    ]);

    const result = await listThreadMessages(USER, THREAD.id, { limit: 20, cursor: null });

    expect(result.data).toEqual([{ id: "m1", role: "learner", content: "hi", createdAt: "2026-09-30T00:00:00.000Z" }]);
    expect(result.nextCursor).toBeNull();
  });
});

describe("prepareMessage", () => {
  beforeEach(() => {
    mockRepo.getThreadById.mockResolvedValue(THREAD);
    mockRepo.insertMessage.mockImplementation((input: { role: string }) =>
      Promise.resolve({ id: `${input.role}_msg`, ...input }),
    );
    mockRepo.listRecentMessages.mockResolvedValue([]);
    mockGetMentorById.mockResolvedValue({ id: "mentor_1", persona: "Warm and encouraging." });
  });

  it("404s when the thread belongs to a different user", async () => {
    mockRepo.getThreadById.mockResolvedValueOnce({ ...THREAD, userId: "someone_else" });

    await expect(prepareMessage(USER, THREAD.id, "hi", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rate-limits (burst) before ever inserting a message", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: true });

    await expect(prepareMessage(USER, THREAD.id, "hi", META)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mockRepo.insertMessage).not.toHaveBeenCalled();
  });

  it("rate-limits on the per-learner daily cap", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, configured: true }) // burst
      .mockResolvedValueOnce({ allowed: false, configured: true }); // daily-user

    await expect(prepareMessage(USER, THREAD.id, "hi", META)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rate-limits on the global daily cap", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, configured: true })
      .mockResolvedValueOnce({ allowed: true, configured: true })
      .mockResolvedValueOnce({ allowed: false, configured: true }); // daily-global

    await expect(prepareMessage(USER, THREAD.id, "hi", META)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("propagates a classifier failure (fails closed) without ever calling the reply model", async () => {
    mockClassifyMessageSafety.mockRejectedValueOnce(
      Object.assign(new Error("classifier down"), { code: "SERVICE_UNAVAILABLE" }),
    );

    await expect(prepareMessage(USER, THREAD.id, "hi", META)).rejects.toThrow("classifier down");
    expect(mockStreamDoubtZoneReply).not.toHaveBeenCalled();
  });

  it("flagged: persists the redirect, marks the learner message flagged, logs without message content, never calls the reply model", async () => {
    mockClassifyMessageSafety.mockResolvedValueOnce({ category: "self_harm_or_suicide", reason: "mentions wanting to disappear" });

    const result = await prepareMessage(USER, THREAD.id, "concerning message text", META);

    expect(result.kind).toBe("flagged");
    if (result.kind === "flagged") {
      expect(result.replacementText).toBe(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.safetyRedirectMessage.en);
    }
    expect(mockRepo.markMessageFlagged).toHaveBeenCalledWith(
      "learner_msg",
      expect.stringContaining("safety_classifier:self_harm_or_suicide"),
    );
    expect(mockRepo.touchThreadLastMessageAt).toHaveBeenCalledWith(THREAD.id);
    const loggedMetadata = mockLogActivity.mock.calls.find(
      (c) => c[0].action === "doubt_zone.message_flagged_by_safety_classifier",
    )?.[0].metadata;
    expect(JSON.stringify(loggedMetadata)).not.toContain("concerning message text");
    expect(mockStreamDoubtZoneReply).not.toHaveBeenCalled();
  });

  it("unflagged: returns needs_reply with a system prompt built from the mentor persona", async () => {
    mockClassifyMessageSafety.mockResolvedValueOnce({ category: "none", reason: "ordinary question" });

    const result = await prepareMessage(USER, THREAD.id, "What is a mutual fund?", META);

    expect(result.kind).toBe("needs_reply");
    if (result.kind === "needs_reply") {
      expect(result.systemPrompt).toContain("Warm and encouraging.");
      expect(result.chatMessages.at(-1)).toEqual({ role: "user", content: "What is a mutual fund?" });
    }
  });

  it("unflagged, lesson-scoped: includes the lesson's own topic in the system prompt", async () => {
    mockRepo.getThreadById.mockResolvedValueOnce({ ...THREAD, lessonId: "lesson_1" });
    mockClassifyMessageSafety.mockResolvedValueOnce({ category: "none", reason: "x" });
    mockGetPublishedLesson.mockResolvedValueOnce({ id: "lesson_1", title: { en: "Compound Interest", hi: "x", hx: "x" } });

    const result = await prepareMessage(USER, THREAD.id, "hi", META);

    if (result.kind === "needs_reply") {
      expect(result.systemPrompt).toContain("Compound Interest");
    }
  });
});

describe("streamReplyAndPersist", () => {
  const PREPARED = { kind: "needs_reply" as const, systemPrompt: "sys", chatMessages: [] };

  beforeEach(() => {
    mockRepo.insertMessage.mockImplementation((input: { role: string }) =>
      Promise.resolve({ id: `${input.role}_msg`, ...input }),
    );
  });

  it("ok: persists the reply, logs it, and emits a non-replaced done line", async () => {
    mockStreamDoubtZoneReply.mockResolvedValueOnce({ kind: "ok", text: "A mutual fund pools money from investors." });
    const lines: unknown[] = [];

    await streamReplyAndPersist(USER, THREAD.id, PREPARED, (line) => lines.push(line), META);

    expect(mockRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", content: "A mutual fund pools money from investors.", flagged: false }),
    );
    expect(lines.at(-1)).toEqual({ type: "done", messageId: "assistant_msg", replaced: false });
  });

  it("cut for advice language: persists the fallback as flagged and emits replaced: true", async () => {
    mockStreamDoubtZoneReply.mockResolvedValueOnce({
      kind: "cut_for_advice_language",
      partialText: "You should buy",
      matchedPhrases: ["you should buy"],
    });
    const lines: unknown[] = [];

    await streamReplyAndPersist(USER, THREAD.id, PREPARED, (line) => lines.push(line), META);

    expect(mockRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.adviceLanguageFallbackMessage.en,
        flagged: true,
      }),
    );
    expect(lines.at(-1)).toMatchObject({
      type: "done",
      replaced: true,
      replacementText: DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.adviceLanguageFallbackMessage.en,
    });
  });

  it("never throws on a mid-stream failure - persists the temporary-unavailable fallback instead", async () => {
    mockStreamDoubtZoneReply.mockRejectedValueOnce(new Error("network error"));
    const lines: unknown[] = [];

    await streamReplyAndPersist(USER, THREAD.id, PREPARED, (line) => lines.push(line), META);

    expect(mockRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.temporaryUnavailableMessage.en, flagged: false }),
    );
    expect(lines.at(-1)).toMatchObject({ type: "done", replaced: true });
  });
});
