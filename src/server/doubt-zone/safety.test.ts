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

import { classifyMessageSafety, isFlaggableSafetyCategory } from "./safety";

function toolUseResponse(input: unknown) {
  return { content: [{ type: "tool_use", name: "classify_message_safety", id: "tu_1", input }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.ANTHROPIC_API_KEY = "ant_test_key";
  mockEnv.ANTHROPIC_MODEL_FAST = "claude-haiku-4-5";
});

describe("classifyMessageSafety", () => {
  it("throws SERVICE_UNAVAILABLE when ANTHROPIC_API_KEY is not configured", async () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;

    await expect(classifyMessageSafety("hi")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws SERVICE_UNAVAILABLE when ANTHROPIC_MODEL_FAST is not configured", async () => {
    mockEnv.ANTHROPIC_MODEL_FAST = undefined;

    await expect(classifyMessageSafety("hi")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("parses a valid classification", async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse({ category: "none", reason: "ordinary finance question" }));

    const result = await classifyMessageSafety("What is a mutual fund?");

    expect(result).toEqual({ category: "none", reason: "ordinary finance question" });
  });

  it("throws SERVICE_UNAVAILABLE when the model returns no tool_use block", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "I refuse." }] });

    await expect(classifyMessageSafety("hi")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("throws SERVICE_UNAVAILABLE (never a raw crash, never a silent 'none') when the tool input doesn't match the schema", async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse({ category: "not_a_real_category" }));

    await expect(classifyMessageSafety("hi")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("throws SERVICE_UNAVAILABLE (fails closed, never silently proceeds) when the API call itself throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network error"));

    await expect(classifyMessageSafety("hi")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("isFlaggableSafetyCategory", () => {
  it("never flags 'none' regardless of the sensitivity setting", () => {
    expect(isFlaggableSafetyCategory({ category: "none", reason: "x" }, true)).toBe(false);
    expect(isFlaggableSafetyCategory({ category: "none", reason: "x" }, false)).toBe(false);
  });

  it("flags any real category when flagOnAnySignal is true (the default)", () => {
    expect(isFlaggableSafetyCategory({ category: "self_harm_or_suicide", reason: "x" }, true)).toBe(true);
    expect(isFlaggableSafetyCategory({ category: "abuse_or_neglect", reason: "x" }, true)).toBe(true);
    expect(isFlaggableSafetyCategory({ category: "other_wellbeing_concern", reason: "x" }, true)).toBe(true);
  });

  it("does not flag the fuzzy other_wellbeing_concern bucket when flagOnAnySignal is false", () => {
    expect(isFlaggableSafetyCategory({ category: "other_wellbeing_concern", reason: "x" }, false)).toBe(false);
  });

  it("/phase-audit 7: self_harm_or_suicide and abuse_or_neglect ALWAYS flag, even with flagOnAnySignal false - the toggle can never switch off a crisis redirect", () => {
    expect(isFlaggableSafetyCategory({ category: "self_harm_or_suicide", reason: "x" }, false)).toBe(true);
    expect(isFlaggableSafetyCategory({ category: "abuse_or_neglect", reason: "x" }, false)).toBe(true);
  });
});
