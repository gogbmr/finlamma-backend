// Manual, opt-in check against the REAL Supabase transaction pooler - never
// run as part of `pnpm test` (rule: tests never touch the real database).
// Run this by hand after changing src/db/client.ts's pool settings, or
// after any Supabase/Supavisor infrastructure change, to confirm concurrent
// queries still resolve instead of hanging. See docs/ARCHITECTURE.md
// decisions D13 and D72 for the two incidents this guards against.
//
// Usage: pnpm tsx scripts/verify-db-pool.ts
//
// Tests TWO concurrency levels, not just one:
//   - A PAIR of concurrent queries (D13's original incident, max: 1 hung
//     forever; fixed by max: 2).
//   - THREE concurrent queries (D72's incident, 2026-10-06: max: 2 only
//     ever covered a pair - a real page running a 1-query call alongside a
//     2-query Promise.all, three total, hung forever at max: 2 too).
// This is deliberately the real reproduction, not a unit test with a mock:
// D13 and D72 are both protocol-level mismatches between postgres.js and
// Supabase's Supavisor transaction pooler that only manifest against the
// genuine pooler - a mocked/local Postgres instance would never show this.
import "../envConfig";
import { db } from "../src/db/client";
import { permissions, roles, staffMembers } from "../src/db/schema";

const HANG_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const start = Date.now();
  return Promise.race([
    promise.then((v) => {
      console.log(`    "${label}" resolved in ${Date.now() - start}ms`);
      return v;
    }),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`"${label}" did not resolve within ${ms}ms - HUNG`)), ms),
    ),
  ]);
}

async function testPair() {
  console.log("\n[1/2] Two concurrent queries (D13's original case)...");
  const start = Date.now();
  const [allRoles, allPermissions] = await withTimeout(
    Promise.all([
      withTimeout(db.select().from(roles), HANG_TIMEOUT_MS, "query A (roles)"),
      withTimeout(db.select().from(permissions), HANG_TIMEOUT_MS, "query B (permissions)"),
    ]),
    HANG_TIMEOUT_MS,
    "pair",
  );
  console.log(
    `  OK: resolved in ${Date.now() - start}ms (${allRoles.length} roles, ${allPermissions.length} permissions).`,
  );
}

async function testTriple() {
  console.log("\n[2/2] Three concurrent queries - one alongside a Promise.all of two more (D72's case)...");
  const start = Date.now();
  await withTimeout(
    Promise.all([
      withTimeout(db.select().from(roles), HANG_TIMEOUT_MS, "query A (standalone)"),
      withTimeout(
        Promise.all([
          withTimeout(db.select().from(permissions), HANG_TIMEOUT_MS, "query B (inner pair, 1st)"),
          withTimeout(db.select().from(staffMembers), HANG_TIMEOUT_MS, "query C (inner pair, 2nd)"),
        ]),
        HANG_TIMEOUT_MS,
        "inner pair (B+C)",
      ),
    ]),
    HANG_TIMEOUT_MS,
    "triple",
  );
  console.log(`  OK: resolved in ${Date.now() - start}ms.`);
}

async function main() {
  console.log("Warming up the pooled connection with a few sequential queries...");
  for (let i = 0; i < 5; i++) {
    await db.select().from(roles).limit(1);
  }

  await testPair();
  await testTriple();

  console.log("\nOK: pool configuration is safe against both the D13 (pair) and D72 (triple) hangs.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.message : err);
    console.error(
      "This is the transaction-pooler pipelining hang from docs/ARCHITECTURE.md decision D13/D72 - " +
        "check src/db/client.ts's `max` setting against how many queries can run concurrently in one request.",
    );
    process.exit(1);
  });
