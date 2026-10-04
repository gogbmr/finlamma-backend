import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS,
  DoubtZoneSafetySettingsSchema,
  SafetyClassificationSchema,
} from "./schemas";

describe("DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS", () => {
  it("matches its own schema", () => {
    expect(DoubtZoneSafetySettingsSchema.safeParse(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS).success).toBe(true);
  });

  it("flags on any signal by default - biased toward false positives", () => {
    expect(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.flagOnAnySignal).toBe(true);
  });

  it("every localized message has all three languages filled in", () => {
    for (const field of [
      DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.safetyRedirectMessage,
      DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.adviceLanguageFallbackMessage,
      DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.threadDisclosureMessage,
    ]) {
      expect(field.en.trim()).not.toBe("");
      expect(field.hi.trim()).not.toBe("");
      expect(field.hx.trim()).not.toBe("");
    }
  });

  it("has positive integer daily message caps", () => {
    expect(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.perLearnerDailyMessageCap).toBeGreaterThan(0);
    expect(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS.globalDailyMessageCap).toBeGreaterThan(0);
  });
});

describe("SafetyClassificationSchema", () => {
  it("accepts a valid classification", () => {
    expect(SafetyClassificationSchema.safeParse({ category: "none", reason: "ordinary question" }).success).toBe(
      true,
    );
  });

  it("rejects an unknown category", () => {
    expect(SafetyClassificationSchema.safeParse({ category: "bogus", reason: "x" }).success).toBe(false);
  });

  it("rejects a missing reason", () => {
    expect(SafetyClassificationSchema.safeParse({ category: "none" }).success).toBe(false);
  });
});
