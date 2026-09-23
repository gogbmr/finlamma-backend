// Pure level-curve arithmetic - no DB, no settings lookups. Level is never
// stored anywhere (docs/ARCHITECTURE.md): it's derived from total XP on
// every read, using an admin-editable rising curve (src/server/leveling/
// schemas.ts's LevelCurveSettings, in settings_kv).

export type LevelCurveSettings = { baseXp: number; stepXp: number };

// XP required to go from level L to level L+1 = base + step*(L-1). Always
// positive as long as baseXp is (enforced by the schema), so the loop below
// in levelForTotalXp always terminates.
export function xpToAdvanceFromLevel(level: number, settings: LevelCurveSettings): number {
  return settings.baseXp + settings.stepXp * (level - 1);
}

export type LevelInfo = {
  level: number;
  totalXp: number;
  currentLevelStartXp: number;
  nextLevelStartXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
};

// Walks the curve from level 1 until totalXp no longer covers the next
// level's threshold. totalXp is clamped to >= 0 (a negative ledger sum
// shouldn't be possible in practice, but this keeps the function total
// rather than looping forever on bad input).
export function levelForTotalXp(totalXp: number, settings: LevelCurveSettings): LevelInfo {
  const xp = Math.max(0, Math.trunc(totalXp));
  let level = 1;
  let levelStartXp = 0;
  for (;;) {
    const cost = xpToAdvanceFromLevel(level, settings);
    if (xp < levelStartXp + cost) {
      return {
        level,
        totalXp: xp,
        currentLevelStartXp: levelStartXp,
        nextLevelStartXp: levelStartXp + cost,
        xpIntoLevel: xp - levelStartXp,
        xpToNextLevel: levelStartXp + cost - xp,
      };
    }
    levelStartXp += cost;
    level += 1;
  }
}
