// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves claimRewardTx's money-safety guarantees actually hold
// at the database level: idempotent double-claim, insufficient balance,
// exact-balance claim, a later price change never affecting an already-paid
// claim, and refund idempotency. Never touches the real Supabase database
// (see @/db/client's NODE_ENV=test guard).
//
// PGlite is a single-connection embedded Postgres (see docs/ROADMAP.md's
// pre-launch checklist note on the worlds-reorder concurrency test), so the
// "concurrent" claim test below can't prove genuine cross-connection
// interleaving - it proves the LOGICAL correctness the row lock + unique
// constraint are meant to guarantee (exactly one claim, exactly one debit),
// which is what's actually being relied on in production.
//
// D37 (docs/ARCHITECTURE.md): the ledger is paise-scaled - `rewards.priceVm`/
// `claimRewardTx`'s `priceVm` param stay whole VM (unchanged, admin-authored
// catalog prices), but every balance this file asserts against is in paise
// (100 = 1 V Money), since that's the ledger's real unit from here on.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { rewardClaims, rewards, users, vmoneyLedger } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { claimRewardTx, getRewardClaim } = await import("./repo");
const { sumVmoneyBalance } = await import("@/server/economy/repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

type ClaimRewardResult = Awaited<ReturnType<typeof claimRewardTx>>;

afterAll(async () => {
  await db.$client.close();
});

// Narrows a ClaimRewardResult down to its "claim"-bearing variants for tests
// that need to inspect the claim row - throws (failing the test loudly) if
// the result was actually "insufficient_balance", which every call site
// below has already ruled out via its own balance setup.
function expectClaim(result: ClaimRewardResult) {
  if (result.status === "insufficient_balance") {
    throw new Error(`Expected a claim result, got insufficient_balance (balancePaise ${result.balancePaise})`);
  }
  return result;
}

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("rewards-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeReward(priceVm: number) {
  const [reward] = await db
    .insert(rewards)
    .values({
      name: { en: "Dark Theme", hi: "x", hx: "x" },
      description: { en: "x", hi: "x", hx: "x" },
      category: "finlamma",
      priceVm,
      status: "published",
    })
    .returning();
  return reward;
}

// Inserted directly (not via a repo function) - a plain test fixture for
// "this user starts with N paise of V Money", same as other repo tests seed
// their own rows directly rather than going through a sibling domain's repo.
async function grantVmoneyPaise(userId: string, amountPaise: number) {
  await db.insert(vmoneyLedger).values({
    userId,
    sourceType: "test_grant",
    sourceId: randomUUID(),
    ruleId: null,
    reason: "test setup",
    amountPaise,
    multiplierApplied: 1,
  });
}

describe("claimRewardTx", () => {
  it("claims successfully when the balance is sufficient, debiting the exact price", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 100_000); // 1000 VM
    const reward = await makeReward(500);

    const result = await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 });

    expect(result.status).toBe("claimed");
    expect(await sumVmoneyBalance(user.id)).toBe(50_000); // 500 VM left, in paise
  });

  it("succeeds on an exact-balance claim, leaving a zero balance", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 50_000); // 500 VM
    const reward = await makeReward(500);

    const result = await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 });

    expect(result.status).toBe("claimed");
    expect(await sumVmoneyBalance(user.id)).toBe(0);
  });

  it("refuses when the balance is insufficient, without touching the ledger", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 10_000); // 100 VM
    const reward = await makeReward(500);

    const result = await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 });

    expect(result).toEqual({ status: "insufficient_balance", balancePaise: 10_000 });
    expect(await sumVmoneyBalance(user.id)).toBe(10_000);
    expect(await getRewardClaim(user.id, reward.id)).toBeNull();
  });

  it("is idempotent against a double-tap: the second call returns the same claim, no second debit", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 100_000); // 1000 VM
    const reward = await makeReward(500);

    const first = expectClaim(await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 }));
    const second = expectClaim(await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 }));

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("already_claimed");
    expect(second.claim.id).toBe(first.claim.id);
    expect(await sumVmoneyBalance(user.id)).toBe(50_000); // debited exactly once
    const debits = await db.select().from(vmoneyLedger).where(eq(vmoneyLedger.userId, user.id));
    expect(debits.filter((d) => d.sourceType === "reward_claim")).toHaveLength(1);
  });

  it("a later price change never affects what an already-claimed row shows", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 100_000); // 1000 VM
    const reward = await makeReward(500);

    await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 });
    // Admin raises the price after the claim - the claim call now passes a
    // DIFFERENT priceVm (simulating a fresh read of the updated reward row),
    // but the already-claimed idempotency path must still win, keeping the
    // original pricePaid intact.
    const replay = expectClaim(await claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 900 }));

    expect(replay.status).toBe("already_claimed");
    expect(replay.claim.pricePaid).toBe(500);
    expect(await sumVmoneyBalance(user.id)).toBe(50_000);
  });

  it("stays correct under two concurrent claim attempts for the same reward - exactly one debit ever happens", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 100_000); // 1000 VM
    const reward = await makeReward(500);

    const [a, b] = (
      await Promise.all([
        claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 }),
        claimRewardTx({ userId: user.id, rewardId: reward.id, priceVm: 500 }),
      ])
    ).map(expectClaim);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["already_claimed", "claimed"]);
    expect(a.claim.id).toBe(b.claim.id);
    expect(await sumVmoneyBalance(user.id)).toBe(50_000);
    const claims = await db.select().from(rewardClaims).where(eq(rewardClaims.userId, user.id));
    expect(claims).toHaveLength(1);
  });

  it("stays correct under two concurrent claims for DIFFERENT rewards that together exceed the balance - the balance never goes negative", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 50_000); // 500 VM - enough for exactly one of the two
    const rewardA = await makeReward(500);
    const rewardB = await makeReward(500);

    const [a, b] = await Promise.all([
      claimRewardTx({ userId: user.id, rewardId: rewardA.id, priceVm: 500 }),
      claimRewardTx({ userId: user.id, rewardId: rewardB.id, priceVm: 500 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["claimed", "insufficient_balance"]);
    expect(await sumVmoneyBalance(user.id)).toBe(0);
  });
});
