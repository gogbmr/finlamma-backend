import { describe, expect, it } from "vitest";
import { encodeScope, parseScope, resolveScopeForRequest } from "./scope";

describe("encodeScope / parseScope", () => {
  it("round-trips every scope kind", () => {
    const scopes = [
      { kind: "global" as const },
      { kind: "india" as const },
      { kind: "state" as const, state: "Maharashtra" },
      { kind: "world" as const, worldId: "11111111-1111-1111-1111-111111111111" },
    ];
    for (const scope of scopes) {
      expect(parseScope(encodeScope(scope))).toEqual(scope);
    }
  });

  it("returns null for an unrecognized encoded scope", () => {
    expect(parseScope("class:9A")).toBeNull();
  });
});

describe("resolveScopeForRequest", () => {
  const MIN = 20;

  it("keeps the requested scope when its pool meets the floor", () => {
    const requested = { kind: "state" as const, state: "Goa" };
    expect(resolveScopeForRequest(requested, 20, MIN)).toEqual({
      resolved: requested,
      fallbackFrom: null,
      notEnoughPlayers: false,
    });
  });

  it("falls back a thin state pool to India", () => {
    const requested = { kind: "state" as const, state: "Sikkim" };
    expect(resolveScopeForRequest(requested, 3, MIN)).toEqual({
      resolved: { kind: "india" },
      fallbackFrom: requested,
      notEnoughPlayers: false,
    });
  });

  it("marks a thin world scope as not-enough-players instead of falling back", () => {
    const requested = { kind: "world" as const, worldId: "w1" };
    expect(resolveScopeForRequest(requested, 2, MIN)).toEqual({
      resolved: requested,
      fallbackFrom: null,
      notEnoughPlayers: true,
    });
  });

  it("marks a thin India/Global pool as not-enough-players (no broader fallback exists)", () => {
    expect(resolveScopeForRequest({ kind: "india" }, 5, MIN)).toEqual({
      resolved: { kind: "india" },
      fallbackFrom: null,
      notEnoughPlayers: true,
    });
    expect(resolveScopeForRequest({ kind: "global" }, 5, MIN)).toEqual({
      resolved: { kind: "global" },
      fallbackFrom: null,
      notEnoughPlayers: true,
    });
  });

  it("treats a pool exactly at the floor as meeting it", () => {
    const requested = { kind: "state" as const, state: "Goa" };
    expect(resolveScopeForRequest(requested, MIN, MIN).notEnoughPlayers).toBe(false);
    expect(resolveScopeForRequest(requested, MIN, MIN).fallbackFrom).toBeNull();
  });
});
