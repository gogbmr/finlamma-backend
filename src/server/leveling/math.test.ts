import { describe, expect, it } from "vitest";
import { levelForTotalXp, xpToAdvanceFromLevel } from "./math";

const SETTINGS = { baseXp: 300, stepXp: 100 }; // base=300, step=100 - the agreed defaults

describe("xpToAdvanceFromLevel", () => {
  it("level 1 costs exactly baseXp", () => {
    expect(xpToAdvanceFromLevel(1, SETTINGS)).toBe(300);
  });

  it("rises by stepXp per level", () => {
    expect(xpToAdvanceFromLevel(2, SETTINGS)).toBe(400);
    expect(xpToAdvanceFromLevel(3, SETTINGS)).toBe(500);
  });

  it("is flat when stepXp is 0", () => {
    expect(xpToAdvanceFromLevel(5, { baseXp: 300, stepXp: 0 })).toBe(300);
  });
});

describe("levelForTotalXp", () => {
  it("a zero-activity user is level 1 with the full level-1 cost still to go", () => {
    const info = levelForTotalXp(0, SETTINGS);
    expect(info).toEqual({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
  });

  it("stays level 1 with XP short of the level-1 threshold", () => {
    const info = levelForTotalXp(299, SETTINGS);
    expect(info.level).toBe(1);
    expect(info.xpToNextLevel).toBe(1);
  });

  it("advances to level 2 exactly at the threshold", () => {
    const info = levelForTotalXp(300, SETTINGS);
    expect(info.level).toBe(2);
    expect(info.currentLevelStartXp).toBe(300);
    expect(info.nextLevelStartXp).toBe(700); // level 2 costs 300+100*1=400
    expect(info.xpIntoLevel).toBe(0);
    expect(info.xpToNextLevel).toBe(400);
  });

  it("advances through several levels for a larger XP total", () => {
    // L1->L2 costs 300 (total 300), L2->L3 costs 400 (total 700),
    // L3->L4 costs 500 (total 1200). 1000 total XP lands mid-level-3.
    const info = levelForTotalXp(1000, SETTINGS);
    expect(info.level).toBe(3);
    expect(info.currentLevelStartXp).toBe(700);
    expect(info.nextLevelStartXp).toBe(1200);
    expect(info.xpIntoLevel).toBe(300);
    expect(info.xpToNextLevel).toBe(200);
  });

  it("clamps a negative totalXp to 0 rather than looping forever or going negative", () => {
    const info = levelForTotalXp(-50, SETTINGS);
    expect(info.level).toBe(1);
    expect(info.totalXp).toBe(0);
  });

  it("truncates a fractional totalXp", () => {
    const info = levelForTotalXp(299.9, SETTINGS);
    expect(info.totalXp).toBe(299);
    expect(info.level).toBe(1);
  });
});
