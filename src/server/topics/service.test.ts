import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetTopicById = vi.fn();
const mockInsertTopic = vi.fn();
const mockListActiveTopics = vi.fn();
const mockListTopics = vi.fn();
const mockUpdateTopicRow = vi.fn();
vi.mock("./repo", () => ({
  getTopicById: (id: unknown) => mockGetTopicById(id),
  insertTopic: (input: unknown) => mockInsertTopic(input),
  listActiveTopics: () => mockListActiveTopics(),
  listTopics: () => mockListTopics(),
  updateTopicRow: (id: unknown, input: unknown) => mockUpdateTopicRow(id, input),
}));

import { createTopicForAdmin, listActiveTopicsForPicker, listTopicsForAdmin, updateTopicForAdmin } from "./service";

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const NAME = { en: "RBI & Rates", hi: "x", hx: "x" };
const INPUT = { order: 1, name: NAME, active: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listActiveTopicsForPicker", () => {
  it("passes through to the repo - no auth check, a shared cross-domain read", async () => {
    mockListActiveTopics.mockResolvedValueOnce([{ id: "topic_1", order: 1, name: NAME, active: true }]);

    const result = await listActiveTopicsForPicker();

    expect(result).toHaveLength(1);
    expect(mockListActiveTopics).toHaveBeenCalled();
  });
});

describe("listTopicsForAdmin", () => {
  it("passes through to the repo", async () => {
    mockListTopics.mockResolvedValueOnce([{ id: "topic_1", order: 1, name: NAME, active: true }]);

    expect(await listTopicsForAdmin()).toHaveLength(1);
  });
});

describe("createTopicForAdmin", () => {
  it("creates and logs the new row", async () => {
    mockInsertTopic.mockResolvedValueOnce({ id: "topic_1", ...INPUT });

    const result = await createTopicForAdmin(ACTOR, INPUT, META);

    expect(result.id).toBe("topic_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "staff", actorId: "staff_1", action: "topics.created" }),
    );
  });

  it("turns a unique-constraint violation on order into a clear CONFLICT", async () => {
    mockInsertTopic.mockRejectedValueOnce({ code: "23505" });

    await expect(createTopicForAdmin(ACTOR, INPUT, META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("updateTopicForAdmin", () => {
  it("updates and logs previous/next", async () => {
    mockGetTopicById.mockResolvedValueOnce({ id: "topic_1", order: 1, name: NAME, active: true });
    mockUpdateTopicRow.mockResolvedValueOnce({ id: "topic_1", order: 2, name: NAME, active: false });

    const result = await updateTopicForAdmin(ACTOR, "topic_1", { order: 2, name: NAME, active: false }, META);

    expect(result.order).toBe(2);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "topics.updated",
        metadata: {
          previous: { order: 1, name: NAME, active: true },
          next: { order: 2, name: NAME, active: false },
        },
      }),
    );
  });

  it("throws NOT_FOUND when the row doesn't exist", async () => {
    mockGetTopicById.mockResolvedValueOnce(null);

    await expect(updateTopicForAdmin(ACTOR, "nope", INPUT, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUpdateTopicRow).not.toHaveBeenCalled();
  });

  it("turns a unique-constraint violation on order into a clear CONFLICT", async () => {
    mockGetTopicById.mockResolvedValueOnce({ id: "topic_1", order: 1, name: NAME, active: true });
    mockUpdateTopicRow.mockRejectedValueOnce({ code: "23505" });

    await expect(updateTopicForAdmin(ACTOR, "topic_1", INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
