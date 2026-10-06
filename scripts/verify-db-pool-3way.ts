// Ad-hoc, throwaway diagnostic - NOT a permanent script, not referenced by
// package.json. Reproduces the worlds-page's actual concurrency shape (one
// query running alongside a Promise.all of two more - three total
// concurrent queries against the real max:2 pool) to test whether D13's
// pipelining hang reproduces beyond the two-query case the existing
// scripts/verify-db-pool.ts and src/db/client.test.ts only ever verified.
import "../envConfig";
import { db } from "../src/db/client";
import { staffMembers, mentors, worlds } from "../src/db/schema";

const HANG_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const start = Date.now();
  return Promise.race([
    promise.then((v) => {
      console.log(`  "${label}" resolved in ${Date.now() - start}ms`);
      return v;
    }),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`"${label}" did not resolve within ${ms}ms - HUNG`)), ms),
    ),
  ]);
}

async function main() {
  console.log("Warming up with a few sequential queries...");
  for (let i = 0; i < 3; i++) {
    await db.select().from(staffMembers).limit(1);
  }

  console.log("\nReproducing the worlds-page shape: 1 query alongside a Promise.all of 2 more (3 total)...");
  const overallStart = Date.now();
  try {
    await Promise.all([
      withTimeout(db.select().from(worlds), HANG_TIMEOUT_MS, "query A (listAllWorlds-shaped)"),
      withTimeout(
        Promise.all([
          withTimeout(db.select().from(mentors), HANG_TIMEOUT_MS, "query B (listAllMentors-shaped)"),
          withTimeout(db.select().from(worlds), HANG_TIMEOUT_MS, "query C (listAllWorlds-shaped, 2nd)"),
        ]),
        HANG_TIMEOUT_MS,
        "inner Promise.all (B+C)",
      ),
    ]);
    console.log(`\nALL RESOLVED in ${Date.now() - overallStart}ms total - 3-way concurrency did NOT reproduce a hang.`);
  } catch (err) {
    console.error(`\nFAILED after ${Date.now() - overallStart}ms:`, err instanceof Error ? err.message : err);
    console.error("This reproduces the hang with 3 concurrent queries against max: 2 - D13's fix only covers a pair.");
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Setup error:", err);
    process.exit(1);
  });
