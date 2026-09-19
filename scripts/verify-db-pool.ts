// Manual, opt-in check against the REAL Supabase transaction pooler - never
// run as part of `pnpm test` (rule: tests never touch the real database).
// Run this by hand after changing src/db/client.ts's pool settings, or
// after any Supabase/Supavisor infrastructure change, to confirm concurrent
// queries still resolve instead of hanging. See docs/ARCHITECTURE.md
// decision D13 for the incident this guards against.
//
// Usage: pnpm tsx scripts/verify-db-pool.ts
import "../envConfig";
import { db } from "../src/db/client";
import { permissions, roles } from "../src/db/schema";

const HANG_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not resolve within ${ms}ms - hung`)), ms),
    ),
  ]);
}

async function main() {
  console.log("Warming up the pooled connection with a few sequential queries...");
  for (let i = 0; i < 5; i++) {
    await db.select().from(roles).limit(1);
  }

  console.log("Issuing two queries concurrently (Promise.all) against the pooled connection...");
  const start = Date.now();
  const [allRoles, allPermissions] = await withTimeout(
    Promise.all([db.select().from(roles), db.select().from(permissions)]),
    HANG_TIMEOUT_MS,
    "Concurrent query pair",
  );

  console.log(
    `OK: resolved in ${Date.now() - start}ms (${allRoles.length} roles, ${allPermissions.length} permissions). ` +
      "Pool configuration is safe against the transaction-pooler pipelining hang.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    console.error(
      "This is the exact failure mode from docs/ARCHITECTURE.md decision D13 - " +
        "check src/db/client.ts's `max` setting (must be >= 2).",
    );
    process.exit(1);
  });
