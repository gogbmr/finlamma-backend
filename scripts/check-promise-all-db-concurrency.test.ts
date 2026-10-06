// Guards against the exact gap docs/ARCHITECTURE.md D72 was: a Promise.all
// over more Postgres-querying calls than src/db/client.ts's pool `max` can
// give separate connections to, which wedges a connection against
// Supabase's transaction pooler forever (see D72's full account - neither
// idle_timeout nor max_lifetime can ever reclaim it). "Don't write a bare
// Promise.all with 3+ DB calls" is a rule that decays the moment someone
// who doesn't know this history writes the next admin page - this makes it
// mechanical instead. See scripts/check-promise-all-db-concurrency.ts for
// the scan itself and its documented heuristics/limitations, and the
// db-concurrency skill for how to fix a real finding.
import { describe, expect, it } from "vitest";
import {
  findConcurrencyFindings,
  readConfiguredMax,
} from "./check-promise-all-db-concurrency";

describe("no Promise.all/allSettled exceeds the DB pool's safe concurrency", () => {
  it("has no un-suppressed finding above src/db/client.ts's configured max", () => {
    const max = readConfiguredMax();
    expect(max).toBeGreaterThan(0); // sanity check the scan itself isn't broken

    const findings = findConcurrencyFindings(max);
    const formatted = findings.map(
      (f) =>
        `${f.file}:${f.line} - estimated ${f.estimatedConcurrency} concurrent queries (max: ${f.maxAllowed})`,
    );

    expect(formatted).toEqual([]);
  });
});
