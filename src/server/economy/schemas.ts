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

// D37 (docs/ARCHITECTURE.md): every admin-authored "how many VM" figure
// (reward_rules.defaultVm, rewards.priceVm, badges.vmReward, ...) stays
// whole VM, unchanged - this is the one conversion factor used at the exact
// moment one of those becomes a vmoney_ledger row (which is paise-scaled,
// pegged 1:1 with rupees: 100 = 1 V Money). Never used for trading, which
// computes exact paise directly from real prices and needs no conversion at
// all - that's the whole point of the migration.
export const VM_TO_LEDGER_PAISE = 100;

export const RewardRuleUpdateSchema = z.object({
  defaultXp: z.number().int().nonnegative().max(MAX_REWARD_AMOUNT),
  defaultVm: z.number().int().nonnegative().max(MAX_REWARD_AMOUNT),
  active: z.boolean(),
});
export type RewardRuleUpdateInput = z.infer<typeof RewardRuleUpdateSchema>;

// WH-03's V Money tile. `balancePaise` is always summed live from
// vmoney_ledger (CLAUDE.md rule 2 - never a stored balance column). V Money
// is pegged 1:1 with rupees and stored in the ledger as exact paise (D37,
// docs/ARCHITECTURE.md) - every amount here is paise (100 = 1 V Money); the
// app owns converting to a display value, the backend never rounds. There's
// no spend path yet in this phase (trading is Phase 4+), so weeklySpentPaise
// reads 0 for every learner today; "earned-from-trade" (also part of WH-03's
// FEATURE_MAP row) is omitted entirely until trading exists to produce it,
// same reasoning as deferring percentile/rank to Phase 6.
export const VmoneyStatsResponseSchema = z.object({
  data: z.object({
    balancePaise: z.number().int().openapi({
      description: "V Money balance, in paise (100 = 1 V Money). Never rounded by the backend.",
      example: 21000,
    }),
    weeklyEarnedPaise: z.number().int().nonnegative().openapi({
      description: "V Money earned in the trailing 7 days, in paise.",
      example: 9000,
    }),
    weeklySpentPaise: z.number().int().nonnegative().openapi({
      description: "V Money spent in the trailing 7 days, in paise. Always 0 until a spend path exists.",
      example: 0,
    }),
  }),
});

// PR-21 (Profile - Wallet): a monthly-scoped view distinct from WH-03's
// weekly tile above, plus an earn-source breakdown. All amounts in paise -
// see VmoneyStatsResponseSchema's comment.
export const WalletResponseSchema = z.object({
  data: z.object({
    balancePaise: z.number().int().openapi({ example: 125000 }),
    earnedThisMonthPaise: z.number().int().nonnegative().openapi({ example: 30000 }),
    earnedBySource: z
      .array(
        z.object({
          sourceType: z.string().openapi({ example: "lesson_completion" }),
          amountPaise: z.number().int().nonnegative().openapi({ example: 30000 }),
        }),
      )
      .openapi({
        description: "Only sourceTypes that actually have an earning this month appear here.",
      }),
  }),
});

const VmoneyLedgerEntrySchema = z.object({
  id: z.uuid(),
  amountPaise: z.number().int().openapi({
    example: -50000,
    description: "Positive = earned, negative = spent. In paise (100 = 1 V Money).",
  }),
  sourceType: z.string().openapi({ example: "reward_claim" }),
  reason: z.string().openapi({ example: "Reward claimed" }),
  createdAt: z.string().datetime(),
});

// PR-24 (Profile - Wallet): cursor-paginated, newest first - same shape as
// every other cursor-paginated list in this API (src/lib/http.ts's
// okList/encodeCursor/decodeCursor).
export const WalletHistoryResponseSchema = z.object({
  data: z.array(VmoneyLedgerEntrySchema),
  nextCursor: z.string().nullable(),
});
