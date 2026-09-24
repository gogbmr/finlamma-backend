import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// v1 launches Finlamma-only (badges/titles/cosmetic themes) - brand_partner
// exists so a real partner reward can be added later via admin CRUD, with
// no schema change, once partnerships exist (PRODUCT_SPEC.md §6).
export const RewardCategoryEnum = z.enum(["finlamma", "brand_partner"]);

// A reward's price is a much larger scale than a single activity's reward
// (a learner accumulates VM over many lessons before affording one) - a
// generous but real ceiling against a fat-fingered admin entry, not a tight
// per-activity bound like MAX_REWARD_AMOUNT.
export const MAX_REWARD_PRICE_VM = 100_000;

export const RewardSchema = registry.register(
  "Reward",
  z.object({
    id: z.uuid(),
    name: LocalizedTextSchema,
    description: LocalizedTextSchema,
    category: RewardCategoryEnum,
    priceVm: z.number().int().positive().openapi({
      example: 500,
      description: "Fixed, admin-set - never computed from the viewing learner's own balance.",
    }),
    iconKey: z.string().nullable(),
    claimed: z.boolean().openapi({
      description: "Whether the caller has already claimed this reward - a reward can be claimed at most once.",
    }),
  }),
);

export const RewardListResponseSchema = registry.register(
  "RewardListResponse",
  z.object({ data: z.array(RewardSchema) }),
);

export const ClaimRewardResponseSchema = registry.register(
  "ClaimRewardResponse",
  z.object({
    data: z.object({
      rewardId: z.uuid(),
      pricePaid: z.number().int().positive().openapi({
        description: "Snapshotted at claim time - unaffected by any later price change.",
      }),
      alreadyClaimed: z.boolean().openapi({
        description: "True if this reward was already claimed before this call (idempotent replay, no second debit).",
      }),
      claimedAt: z.string().datetime(),
    }),
  }),
);

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16) ---

export const CreateRewardDraftSchema = z.object({
  name: LocalizedTextSchema,
  description: LocalizedTextSchema,
  category: RewardCategoryEnum,
  priceVm: z.number().int().positive().max(MAX_REWARD_PRICE_VM),
  iconKey: z.string().nullable().optional(),
});
export type CreateRewardDraftInput = z.infer<typeof CreateRewardDraftSchema>;

export const UpdateRewardDraftSchema = CreateRewardDraftSchema.extend({
  id: z.string().uuid(),
});
export type UpdateRewardDraftInput = z.infer<typeof UpdateRewardDraftSchema>;

export const RewardIdSchema = z.object({ id: z.string().uuid() });
export type RewardIdInput = z.infer<typeof RewardIdSchema>;

export const RefundRewardClaimSchema = z.object({
  claimId: z.string().uuid(),
  reason: z.string().min(1, "A reason is required"),
});
export type RefundRewardClaimInput = z.infer<typeof RefundRewardClaimSchema>;
