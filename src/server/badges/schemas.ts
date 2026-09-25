import { z } from "zod";
import { MAX_REWARD_AMOUNT } from "@/server/economy/schemas";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

export const BadgeCategoryEnum = z.enum(["learning", "streak", "trading", "news"]);

// Fixed, code-defined set of criteria TYPES an evaluator exists for
// (src/server/badges/evaluators.ts) - same "evaluator in code, which one and
// its threshold in data" split as src/server/daily-goals/schemas.ts. Staff
// pick an existing type and a threshold; a genuinely new type needs a new
// evaluator (a code change).
export const BadgeCriteriaTypeEnum = z.enum(["lessons_completed", "streak_days", "quiz_accuracy_pct"]);
export const BadgeCriteriaSchema = z.object({
  type: BadgeCriteriaTypeEnum,
  threshold: z.number().int().positive(),
});
export type BadgeCriteria = z.infer<typeof BadgeCriteriaSchema>;

// Badges pay VM on unlock (confirmed against docs/FEATURE_MAP.md PR-19 -
// "Picked-badge detail card: description, progress, VM reward" - and Profile
// gap #5, "badge VM rewards/thresholds are admin-editable") - not purely
// honorific. Same bound as reward_rules' per-activity amounts
// (MAX_REWARD_AMOUNT, src/server/economy/schemas.ts) - a badge reward is the
// same order of magnitude as a single lesson's reward, not a separate scale.
export const MAX_BADGE_VM_REWARD = MAX_REWARD_AMOUNT;

export const BadgeSchema = registry.register(
  "Badge",
  z.object({
    id: z.uuid(),
    name: LocalizedTextSchema,
    description: LocalizedTextSchema,
    category: BadgeCategoryEnum,
    vmReward: z.number().int().nonnegative().openapi({ example: 100 }),
    iconKey: z.string().nullable(),
    target: z.number().int().positive().openapi({
      example: 10,
      description: "The criteria threshold - shown so the app can render \"7/10\" progress.",
    }),
    progress: z.number().int().nonnegative().openapi({ example: 7 }),
    unlocked: z.boolean(),
    unlockedAt: z.string().datetime().nullable(),
  }),
);

export const BadgeListResponseSchema = registry.register(
  "BadgeListResponse",
  z.object({ data: z.array(BadgeSchema) }),
);

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16) ---

export const CreateBadgeDraftSchema = z.object({
  name: LocalizedTextSchema,
  description: LocalizedTextSchema,
  category: BadgeCategoryEnum,
  criteria: BadgeCriteriaSchema,
  vmReward: z.number().int().nonnegative().max(MAX_BADGE_VM_REWARD),
  iconKey: z.string().nullable().optional(),
});
export type CreateBadgeDraftInput = z.infer<typeof CreateBadgeDraftSchema>;

export const UpdateBadgeDraftSchema = CreateBadgeDraftSchema.extend({
  id: z.string().uuid(),
});
export type UpdateBadgeDraftInput = z.infer<typeof UpdateBadgeDraftSchema>;

export const BadgeIdSchema = z.object({ id: z.string().uuid() });
export type BadgeIdInput = z.infer<typeof BadgeIdSchema>;
