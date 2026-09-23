import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method, used
// below. Must be imported before any .openapi() call in this file runs -
// see src/lib/openapi.ts.
import "@/lib/openapi";

// docs/PRODUCT_SPEC.md §2: a separate, admin-controlled multiplier that
// scales every VM award at the moment it's issued, without touching the
// seeded reward_rules values themselves. Stays at 1.0 out of the box
// (docs/ECONOMY.md's decision 3) - the 3x reward_rules values are already
// the intended starting balance, this multiplier is a later-tuning lever.
export const VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY = "vm_issuance_multiplier";
export const DEFAULT_VM_ISSUANCE_MULTIPLIER = 1.0;

// Bounds are a fat-finger guard, not a product limit - the multiplier
// scales every VM award for every learner immediately, so 0 (nothing pays
// out) and an unbounded value (a stray extra digit paying out 100x) are
// both plausible typos worth catching at the schema, not just trusting the
// admin UI's number input. 3x is well above any currently-planned tuning
// (docs/ECONOMY.md's 3x reward_rules values are already the intended
// starting balance - this multiplier is a smaller, later lever on top of
// that, not a second multiplication of the same size).
export const VM_ISSUANCE_MULTIPLIER_MIN = 0; // exclusive - must be > 0
export const VM_ISSUANCE_MULTIPLIER_MAX = 3; // inclusive

export const VmIssuanceMultiplierSchema = z
  .number()
  .gt(VM_ISSUANCE_MULTIPLIER_MIN, "Multiplier must be greater than 0")
  .lte(VM_ISSUANCE_MULTIPLIER_MAX, `Multiplier must be at most ${VM_ISSUANCE_MULTIPLIER_MAX}`);

// Same reasoning as the multiplier bounds above: a fat-finger guard, not a
// product limit. The largest seeded value today is Boss Quiz's 300 VM /
// 120 XP (docs/ECONOMY.md) - 5,000 leaves generous headroom for future
// tuning while still catching a stray extra digit (e.g. 50,000 typed for
// 5,000).
export const MAX_REWARD_AMOUNT = 5000;

export const RewardRuleUpdateSchema = z.object({
  defaultXp: z.number().int().nonnegative().max(MAX_REWARD_AMOUNT),
  defaultVm: z.number().int().nonnegative().max(MAX_REWARD_AMOUNT),
  active: z.boolean(),
});
export type RewardRuleUpdateInput = z.infer<typeof RewardRuleUpdateSchema>;

// WH-03's V Money tile. `balance` is always summed live from vmoney_ledger
// (CLAUDE.md rule 2 - never a stored balance column). There's no spend path
// yet in this phase (trading is Phase 4+), so weeklySpent reads 0 for every
// learner today; "earned-from-trade" (also part of WH-03's FEATURE_MAP row)
// is omitted entirely until trading exists to produce it, same reasoning as
// deferring percentile/rank to Phase 6.
export const VmoneyStatsResponseSchema = z.object({
  data: z.object({
    balance: z.number().int().openapi({ example: 210 }),
    weeklyEarned: z.number().int().nonnegative().openapi({
      description: "V Money earned in the trailing 7 days.",
      example: 90,
    }),
    weeklySpent: z.number().int().nonnegative().openapi({
      description: "V Money spent in the trailing 7 days. Always 0 until a spend path exists.",
      example: 0,
    }),
  }),
});
