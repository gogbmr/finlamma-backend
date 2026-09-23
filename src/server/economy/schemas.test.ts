import { describe, expect, it } from "vitest";
import {
  MAX_REWARD_AMOUNT,
  RewardRuleUpdateSchema,
  VM_ISSUANCE_MULTIPLIER_MAX,
  VmIssuanceMultiplierSchema,
} from "./schemas";

describe("VmIssuanceMultiplierSchema", () => {
  it.each([0, -1, -0.5])("rejects %s (must be greater than 0)", (value) => {
    expect(VmIssuanceMultiplierSchema.safeParse(value).success).toBe(false);
  });

  it.each([VM_ISSUANCE_MULTIPLIER_MAX + 0.01, VM_ISSUANCE_MULTIPLIER_MAX + 1, 100])(
    "rejects %s (above the max)",
    (value) => {
      expect(VmIssuanceMultiplierSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each([0.01, 1, 1.5, VM_ISSUANCE_MULTIPLIER_MAX])("accepts %s", (value) => {
    expect(VmIssuanceMultiplierSchema.safeParse(value).success).toBe(true);
  });
});

describe("RewardRuleUpdateSchema", () => {
  const base = { defaultXp: 20, defaultVm: 30, active: true };

  it.each([-1, -100])("rejects a negative defaultXp/defaultVm (%s)", (value) => {
    expect(RewardRuleUpdateSchema.safeParse({ ...base, defaultXp: value }).success).toBe(false);
    expect(RewardRuleUpdateSchema.safeParse({ ...base, defaultVm: value }).success).toBe(false);
  });

  it.each([MAX_REWARD_AMOUNT + 1, MAX_REWARD_AMOUNT * 10])(
    "rejects an amount above the max (%s)",
    (value) => {
      expect(RewardRuleUpdateSchema.safeParse({ ...base, defaultXp: value }).success).toBe(false);
      expect(RewardRuleUpdateSchema.safeParse({ ...base, defaultVm: value }).success).toBe(false);
    },
  );

  it("rejects a non-integer amount", () => {
    expect(RewardRuleUpdateSchema.safeParse({ ...base, defaultXp: 20.5 }).success).toBe(false);
  });

  it("accepts 0 and the max as boundary values", () => {
    expect(RewardRuleUpdateSchema.safeParse({ ...base, defaultXp: 0, defaultVm: 0 }).success).toBe(
      true,
    );
    expect(
      RewardRuleUpdateSchema.safeParse({
        ...base,
        defaultXp: MAX_REWARD_AMOUNT,
        defaultVm: MAX_REWARD_AMOUNT,
      }).success,
    ).toBe(true);
  });

  it("accepts the seeded docs/ECONOMY.md values", () => {
    expect(RewardRuleUpdateSchema.safeParse({ defaultXp: 120, defaultVm: 300, active: true }).success).toBe(
      true,
    );
  });
});
