// A leaderboard scope is one of four kinds a learner can view (FEATURE_MAP
// AR-07: My World / My State / India / Global). Internally each is encoded
// as a single string key (used as leaderboard_snapshots.scope and, later,
// leagues.scope) so both tables share one format instead of a set of
// nullable columns: "global", "india", "state:<STATE>", "world:<worldId>".
// This module is the ONLY place that builds or parses that string - every
// other file goes through these functions rather than concatenating/
// splitting "state:"/"world:" itself.
export type ArenaScopeKind = "world" | "state" | "india" | "global";

export type ArenaScope =
  | { kind: "global" }
  | { kind: "india" }
  | { kind: "state"; state: string }
  | { kind: "world"; worldId: string };

export function encodeScope(scope: ArenaScope): string {
  switch (scope.kind) {
    case "global":
      return "global";
    case "india":
      return "india";
    case "state":
      return `state:${scope.state}`;
    case "world":
      return `world:${scope.worldId}`;
  }
}

export function parseScope(encoded: string): ArenaScope | null {
  if (encoded === "global") return { kind: "global" };
  if (encoded === "india") return { kind: "india" };
  if (encoded.startsWith("state:")) return { kind: "state", state: encoded.slice("state:".length) };
  if (encoded.startsWith("world:")) return { kind: "world", worldId: encoded.slice("world:".length) };
  return null;
}

export type ScopeResolution = {
  // The scope actually queried - may differ from what the caller asked for
  // (the state-scope privacy floor below).
  resolved: ArenaScope;
  // Set when `resolved` isn't what the caller asked for.
  fallbackFrom: ArenaScope | null;
  // true when even `resolved` doesn't have enough learners to show
  // meaningfully (or safely) - the caller should render "not enough players
  // yet" rather than a thin, potentially identifying list.
  notEnoughPlayers: boolean;
};

// The state-scope privacy floor (founder's Phase 6 kickoff decision): a
// state pool below `minPoolSize` (settings_kv, default 20) both risks
// identifying a specific child ("public profile + state + rank" narrows
// fast in a small pool) and is statistically meaningless as a leaderboard.
// Below the floor, State transparently falls back to India instead of
// showing a thin list. The SAME floor applies to every scope, not just
// State (the founder's instruction: "apply to any scope narrow enough to
// have the problem") - World has no broader scope to fall back to (it isn't
// part of the State->India->Global geography chain), so a thin World or
// India/Global pool just renders as "not enough players yet" rather than
// silently showing a list too small to be meaningful or safe.
//
// `poolSizeForRequested` is the caller-supplied count for the scope being
// evaluated - this function makes the decision, it never queries the DB
// itself, so it's a pure function the tests can exercise directly.
export function resolveScopeForRequest(
  requested: ArenaScope,
  poolSizeForRequested: number,
  minPoolSize: number,
): ScopeResolution {
  const meetsFloor = poolSizeForRequested >= minPoolSize;

  if (meetsFloor) {
    return { resolved: requested, fallbackFrom: null, notEnoughPlayers: false };
  }

  if (requested.kind === "state") {
    // India is assumed to always meet the floor in practice (checked again
    // by the caller against ITS OWN pool size before rendering, same as any
    // other scope) - falling back here is a best-effort UX choice, not a
    // safety guarantee on its own account.
    return { resolved: { kind: "india" }, fallbackFrom: requested, notEnoughPlayers: false };
  }

  return { resolved: requested, fallbackFrom: null, notEnoughPlayers: true };
}
