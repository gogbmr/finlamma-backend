import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: "ant_test_key" as string | undefined,
  ANTHROPIC_MODEL_FAST: "claude-haiku-4-5" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  // A real class (not an arrow function) so `new Anthropic(...)` works under
  // the mock the same way it does against the real package.
  default: class {
    messages = { create: mockCreate };
  },
}));

import { draftNewsStoryFromRaw } from "./ai";

const RAW = {
  externalId: "a",
  url: "https://example.com/a",
  headline: "RBI holds repo rate at 5.50%",
  summary: "The RBI's MPC kept the repo rate unchanged.",
  publishedAt: new Date("2026-09-28T04:00:00.000Z"),
};

const VALID_DRAFT_INPUT = {
  content: {
    headline: { en: "H", hi: "H", hx: "H" },
    summary: { en: "S", hi: "S", hx: "S" },
    body: [{ en: "Body.", hi: "x", hx: "x" }],
  },
  jargon: { term: { en: "repo rate", hi: "x", hx: "x" }, explanation: { en: "x", hi: "x", hx: "x" } },
  category: "rbi_rates",
  impact: "neutral",
  question: {
    prompt: { en: "What did the RBI do?", hi: "x", hx: "x" },
    options: [
      { en: "Held the rate", hi: "x", hx: "x" },
      { en: "Raised the rate", hi: "x", hx: "x" },
      { en: "Cut the rate", hi: "x", hx: "x" },
    ],
    correctIndex: 0,
    explanation: { en: "x", hi: "x", hx: "x" },
  },
};

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "submit_news_draft", id: "tu_1", input }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.ANTHROPIC_API_KEY = "ant_test_key";
  mockEnv.ANTHROPIC_MODEL_FAST = "claude-haiku-4-5";
});

describe("draftNewsStoryFromRaw", () => {
  it("throws SERVICE_UNAVAILABLE when ANTHROPIC_API_KEY is not configured", async () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;

    await expect(draftNewsStoryFromRaw(RAW)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws SERVICE_UNAVAILABLE when ANTHROPIC_MODEL_FAST is not configured", async () => {
    mockEnv.ANTHROPIC_MODEL_FAST = undefined;

    await expect(draftNewsStoryFromRaw(RAW)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("parses a valid tool_use response into a NewsDraftAiOutput", async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse(VALID_DRAFT_INPUT));

    const result = await draftNewsStoryFromRaw(RAW);

    expect(result.category).toBe("rbi_rates");
    expect(result.jargon.term.en).toBe("repo rate");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        tool_choice: { type: "tool", name: "submit_news_draft" },
      }),
    );
  });

  it("throws SERVICE_UNAVAILABLE when the model returns no tool_use block", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "I refuse." }] });

    await expect(draftNewsStoryFromRaw(RAW)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("throws SERVICE_UNAVAILABLE (never a raw crash) when the tool input doesn't match the schema", async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse({ content: { headline: "not localized" } }));

    await expect(draftNewsStoryFromRaw(RAW)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
