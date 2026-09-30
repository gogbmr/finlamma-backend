import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - must run
// before any .openapi() call in this file (see src/lib/openapi.ts).
import "@/lib/openapi";
import { MAX_REWARD_AMOUNT } from "@/server/economy/schemas";
import { LocalizedTextSchema } from "@/server/shared/schemas";

const PrizeBandSchema = z.object({
  rankFrom: z.number().int().positive(),
  rankTo: z.number().int().positive(),
  // Same sanity ceiling every other admin-set VM figure in this codebase
  // uses (badges' MAX_BADGE_VM_REWARD, Arena's MAX_ARENA_VM_AMOUNT) - a
  // typo'd prize amount would otherwise auto-pay every qualifying entrant
  // at the next daily settlement sweep with no second check.
  vmAmount: z.number().int().nonnegative().max(MAX_REWARD_AMOUNT),
  badgeId: z.uuid().nullable(),
});

export const CurrentCompetitionResponseSchema = z.object({
  data: z
    .object({
      id: z.uuid(),
      name: LocalizedTextSchema,
      instrumentId: z.uuid(),
      virtualCapitalPaise: z.number().int().positive().openapi({
        example: 10000000,
        description: "₹1,00,000 in paise - a sandbox balance, never V Money (docs/ARCHITECTURE.md D57).",
      }),
      windowStart: z.string().datetime(),
      windowEnd: z.string().datetime(),
      daysLeft: z.number().int().nonnegative().openapi({ example: 12 }),
      prizes: z.array(PrizeBandSchema),
      rules: LocalizedTextSchema,
      playersCount: z.number().int().nonnegative().openapi({ example: 340 }),
    })
    .nullable()
    .openapi({ description: "Null when no competition is currently published and within its window." }),
});

export const EnterCompetitionResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    competitionId: z.uuid(),
    cashPaise: z.number().int().nonnegative(),
    qtyHeld: z.number().int().nonnegative(),
    enteredAt: z.string().datetime(),
  }),
});

export const PlaceCompetitionTradeRequestSchema = z.object({
  side: z.enum(["buy", "sell"]),
  qty: z.number().int().positive().openapi({ example: 5, description: "Whole shares only." }),
});

export const CompetitionTradeResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    side: z.enum(["buy", "sell"]),
    qty: z.number().int().positive(),
    fillPricePaise: z.number().int().positive(),
    realizedPnlPaise: z.number().int().nullable(),
    filledAt: z.string().datetime(),
    replayed: z.boolean(),
  }),
});

export const MyCompetitionStatusResponseSchema = z.object({
  data: z
    .discriminatedUnion("entered", [
      z.object({ entered: z.literal(false) }),
      z.object({
        entered: z.literal(true),
        rank: z.number().int().positive().openapi({ example: 42 }),
        poolSize: z.number().int().positive().openapi({ example: 340 }),
        roiPctBasisPoints: z.number().int().openapi({
          example: 823,
          description: "ROI% x 100 (823 = 8.23%). Computed against the FULL starting capital, never just the deployed cost basis.",
        }),
        tradeCount: z.number().int().nonnegative(),
        cashPaise: z.number().int().nonnegative(),
        qtyHeld: z.number().int().nonnegative(),
      }),
    ])
    .nullable()
    .openapi({ description: "Null when there's no active competition at all right now." }),
});

const CompetitionLeaderboardRowSchema = z.object({
  rank: z.number().int().positive(),
  userId: z.uuid(),
  firstName: z.string().nullable(),
  lastInitial: z.string().nullable(),
  roiPctBasisPoints: z.number().int(),
  isSelf: z.boolean(),
});

export const CompetitionLeaderboardResponseSchema = z.object({
  data: z.object({
    rows: z.array(CompetitionLeaderboardRowSchema),
    poolSize: z.number().int().nonnegative(),
  }).nullable(),
});

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16) ---

export const CompetitionDraftInputSchema = z.object({
  name: LocalizedTextSchema,
  instrumentId: z.uuid(),
  virtualCapitalPaise: z.number().int().positive(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  prizes: z.array(PrizeBandSchema).min(1),
  rules: LocalizedTextSchema,
}).refine((v) => v.windowEnd > v.windowStart, { message: "windowEnd must be after windowStart" });
export type CompetitionDraftInputParsed = z.infer<typeof CompetitionDraftInputSchema>;

export const CompetitionSettingsInputSchema = z.object({
  minQualifyingTrades: z.number().int().positive(),
  maxTrades: z.number().int().positive(),
  entryWindowPct: z.number().int().min(1).max(100),
}).refine((v) => v.maxTrades >= v.minQualifyingTrades, {
  message: "maxTrades must be at least minQualifyingTrades",
});
