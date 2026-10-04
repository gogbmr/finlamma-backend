import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: "ant_test_key" as string | undefined,
  ANTHROPIC_MODEL_SMART: "claude-sonnet-test" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockStreamFn = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStreamFn };
  },
}));

import { findAllDoubtZoneAdvicePhrases, streamDoubtZoneReply } from "./reply";

// A minimal fake of Anthropic's MessageStream: registers "text" listeners,
// then replays `chunks` as cumulative snapshots when finalMessage() is
// awaited - stopping early and rejecting if a listener called abort() on a
// prior chunk, the same way the real SDK's abort() cuts an in-flight
// stream short.
function fakeStream(chunks: string[]) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  let aborted = false;
  const stream = {
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return stream;
    },
    abort() {
      aborted = true;
    },
    async finalMessage() {
      let acc = "";
      for (const chunk of chunks) {
        if (aborted) break;
        acc += chunk;
        for (const cb of listeners.text ?? []) cb(chunk, acc);
      }
      if (aborted) throw new Error("aborted (simulated)");
      return { content: [{ type: "text", text: acc }] };
    },
  };
  return stream;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.ANTHROPIC_API_KEY = "ant_test_key";
  mockEnv.ANTHROPIC_MODEL_SMART = "claude-sonnet-test";
});

describe("findAllDoubtZoneAdvicePhrases", () => {
  it("matches the shared advice-language list", () => {
    expect(findAllDoubtZoneAdvicePhrases("This is a sure shot winner")).toContain("sure shot");
  });

  it("matches doubt-zone-specific conversational advice phrasing", () => {
    expect(findAllDoubtZoneAdvicePhrases("You should buy this stock now")).toContain("you should buy");
  });

  it("returns empty for ordinary educational text", () => {
    expect(findAllDoubtZoneAdvicePhrases("A stock represents partial ownership of a company.")).toEqual([]);
  });
});

describe("streamDoubtZoneReply", () => {
  it("throws SERVICE_UNAVAILABLE when ANTHROPIC_API_KEY is not configured", async () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;

    await expect(streamDoubtZoneReply({ systemPrompt: "s", messages: [] }, () => {})).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(mockStreamFn).not.toHaveBeenCalled();
  });

  it("throws SERVICE_UNAVAILABLE when ANTHROPIC_MODEL_SMART is not configured", async () => {
    mockEnv.ANTHROPIC_MODEL_SMART = undefined;

    await expect(streamDoubtZoneReply({ systemPrompt: "s", messages: [] }, () => {})).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("streams accumulated deltas and resolves ok for clean text", async () => {
    mockStreamFn.mockReturnValueOnce(fakeStream(["A stock ", "is a share ", "of a company."]));
    const deltas: string[] = [];

    const result = await streamDoubtZoneReply({ systemPrompt: "s", messages: [] }, (snapshot) =>
      deltas.push(snapshot),
    );

    expect(result).toEqual({ kind: "ok", text: "A stock is a share of a company." });
    expect(deltas).toEqual(["A stock ", "A stock is a share ", "A stock is a share of a company."]);
  });

  it("cuts the stream and reports matched phrases when advice-like language appears, never forwarding it", async () => {
    mockStreamFn.mockReturnValueOnce(fakeStream(["Great question! ", "You should buy this stock today."]));
    const deltas: string[] = [];

    const result = await streamDoubtZoneReply({ systemPrompt: "s", messages: [] }, (snapshot) =>
      deltas.push(snapshot),
    );

    expect(result.kind).toBe("cut_for_advice_language");
    if (result.kind === "cut_for_advice_language") {
      expect(result.matchedPhrases).toContain("you should buy");
    }
    expect(deltas.some((d) => d.toLowerCase().includes("you should buy"))).toBe(false);
  });

  it("throws SERVICE_UNAVAILABLE (never a raw crash) on a real stream failure", async () => {
    const stream = fakeStream([]);
    stream.finalMessage = async () => {
      throw new Error("network error");
    };
    mockStreamFn.mockReturnValueOnce(stream);

    await expect(streamDoubtZoneReply({ systemPrompt: "s", messages: [] }, () => {})).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
