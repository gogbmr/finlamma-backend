// The concurrency limit every call site below should pass to
// runWithConcurrencyLimit when batching DB-querying calls together. Must
// stay equal to src/db/client.ts's pool `max` - deliberately NOT imported
// from there (this module has zero dependencies on purpose, so importing
// it doesn't drag in `db` and force every test that uses this constant to
// also mock @/db/client). src/db/client.test.ts cross-checks the two
// numbers stay equal instead, so they can't silently drift apart.
export const DB_CONCURRENCY_LIMIT = 4;

// Bounds how many of a batch of async tasks run concurrently - the
// prevention mechanism for docs/ARCHITECTURE.md decisions D13/D72: a
// Promise.all over 3+ Postgres-querying calls can exceed src/db/client.ts's
// pool `max` and wedge a connection forever against Supabase's transaction
// pooler (confirmed: neither idle_timeout nor max_lifetime can ever reclaim
// a connection stuck that way - see D72's full account). Use this instead
// of Promise.all/Promise.allSettled whenever running more than `max` - 1
// DB-querying calls together - see the db-concurrency skill and
// scripts/check-promise-all-db-concurrency.test.ts, which flags call sites
// that should be using this but aren't.
//
// Deliberately hand-written rather than a dependency (e.g. p-limit): the
// semantics needed here are small and exact (fixed worker pool pulling from
// a shared cursor, first-error-wins like Promise.all, no cancellation of
// in-flight tasks on error since abandoning a started DB query is its own
// risk) and are fully covered by concurrency-limit.test.ts.
//
// Two overloads, same reason Promise.all itself has them: a literal array
// of differently-typed thunks (e.g. 22 roleHasPermission() booleans plus
// one getRoleById() object) needs its per-element types preserved as a
// tuple, exactly like `const [a, b] = await Promise.all([p1, p2])` does -
// collapsing everything to one T would make every element the same type
// and break every call site with mixed return types.
export async function runWithConcurrencyLimit<T extends readonly unknown[]>(
  tasks: readonly [...{ [K in keyof T]: () => Promise<T[K]> }],
  limit: number,
): Promise<T>;
export async function runWithConcurrencyLimit<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<T[]>;
export async function runWithConcurrencyLimit(
  tasks: ReadonlyArray<() => Promise<unknown>>,
  limit: number,
): Promise<unknown[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(
      `runWithConcurrencyLimit: limit must be a positive integer, got ${limit}`,
    );
  }

  const results: unknown[] = new Array(tasks.length);
  let nextIndex = 0;
  let hasError = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!hasError) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        // Matches Promise.all's own behaviour: reject with the first error
        // seen, don't try to cancel tasks already in flight elsewhere - an
        // abandoned DB query is a worse outcome than letting it finish.
        if (!hasError) {
          hasError = true;
          firstError = err;
        }
        return;
      }
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (hasError) throw firstError;
  return results;
}
