import { z } from "zod";

// docs/PRODUCT_SPEC.md §2: a separate, admin-controlled multiplier that
// scales every VM award at the moment it's issued, without touching the
// seeded reward_rules values themselves. Stays at 1.0 out of the box
// (docs/ECONOMY.md's decision 3) - the 3x reward_rules values are already
// the intended starting balance, this multiplier is a later-tuning lever.
export const VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY = "vm_issuance_multiplier";
export const DEFAULT_VM_ISSUANCE_MULTIPLIER = 1.0;

export const VmIssuanceMultiplierSchema = z.number().positive();

export const RewardRuleUpdateSchema = z.object({
  defaultXp: z.number().int().nonnegative(),
  defaultVm: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type RewardRuleUpdateInput = z.infer<typeof RewardRuleUpdateSchema>;
