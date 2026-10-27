import { describe, expect, it } from "vitest";
import { NotificationResponseSchema } from "./schemas";

// App asks batch, item A9: proves the discriminated union actually
// enforces the documented per-kind `data` shape (confirmed against every
// real notifyUser() call site) - not just a comment someone could let
// drift from the real behavior.
function baseFields() {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    title: "t",
    body: "b",
    readAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("NotificationResponseSchema", () => {
  it.each(["streak_risk", "session_goal", "cheer_received", "league_rank_change"] as const)(
    "accepts %s with data: null",
    (kind) => {
      const result = NotificationResponseSchema.safeParse({ ...baseFields(), kind, data: null });
      expect(result.success).toBe(true);
    },
  );

  it("accepts boss_battle with { worldId }", () => {
    const result = NotificationResponseSchema.safeParse({
      ...baseFields(),
      kind: "boss_battle",
      data: { worldId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects boss_battle with data: null - this kind always carries worldId", () => {
    const result = NotificationResponseSchema.safeParse({ ...baseFields(), kind: "boss_battle", data: null });
    expect(result.success).toBe(false);
  });

  it("accepts market_news with { newsStoryId }", () => {
    const result = NotificationResponseSchema.safeParse({
      ...baseFields(),
      kind: "market_news",
      data: { newsStoryId: "22222222-2222-4222-8222-222222222222" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects market_news with data: null - this kind always carries newsStoryId", () => {
    const result = NotificationResponseSchema.safeParse({ ...baseFields(), kind: "market_news", data: null });
    expect(result.success).toBe(false);
  });

  it("rejects streak_risk with non-null data - this kind never carries one", () => {
    const result = NotificationResponseSchema.safeParse({
      ...baseFields(),
      kind: "streak_risk",
      data: { somethingUnexpected: true },
    });
    expect(result.success).toBe(false);
  });
});
