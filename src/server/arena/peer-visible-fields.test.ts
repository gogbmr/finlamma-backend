import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CompetitionLeaderboardResponseSchema } from "@/server/competitions/schemas";
import {
  ArenaActivityResponseSchema,
  ArenaLeaderboardResponseSchema,
  ArenaWorldsResponseSchema,
  MyCheersSummaryResponseSchema,
  PublicProfileResponseSchema,
} from "./schemas";

// Collects every object key reachable from a Zod schema, unwrapping
// array/nullable/optional wrappers - used below to prove GET /me's private
// onboarding/consent fields (dobSet, isMinor, parentConsentStatus - see
// src/server/users/schemas.ts) never appear anywhere in a schema another
// learner's request can return.
function collectKeys(schema: unknown, seen = new Set<unknown>()): Set<string> {
  const keys = new Set<string>();
  if (seen.has(schema)) return keys;
  seen.add(schema);

  if (schema instanceof z.ZodObject) {
    for (const [key, value] of Object.entries(schema.shape)) {
      keys.add(key);
      for (const k of collectKeys(value, seen)) keys.add(k);
    }
  } else if (schema instanceof z.ZodArray) {
    for (const k of collectKeys(schema.element, seen)) keys.add(k);
  } else if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    for (const k of collectKeys(schema.unwrap(), seen)) keys.add(k);
  }

  return keys;
}

const PRIVATE_ONBOARDING_FIELDS = ["dobSet", "isMinor", "parentConsentStatus"];

describe("private onboarding/consent fields never leak into a peer-visible schema", () => {
  it.each([
    ["Arena leaderboard (AR-07)", ArenaLeaderboardResponseSchema],
    ["Arena worlds leaderboard", ArenaWorldsResponseSchema],
    ["Arena activity feed", ArenaActivityResponseSchema],
    ["Arena public profile (AR-20)", PublicProfileResponseSchema],
    ["Arena cheers summary", MyCheersSummaryResponseSchema],
    ["Competition leaderboard", CompetitionLeaderboardResponseSchema],
  ] as const)("%s never exposes dobSet/isMinor/parentConsentStatus", (_label, schema) => {
    const keys = collectKeys(schema);
    for (const field of PRIVATE_ONBOARDING_FIELDS) {
      expect(keys.has(field)).toBe(false);
    }
  });
});
