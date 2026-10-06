// Diagnostic instrumentation added while investigating a production incident
// (2026-10-06, see docs/STATUS.md): an authenticated /admin/(dashboard) page
// was hanging ~300s (Vercel's function timeout) then showing the error
// boundary, reproduced with a fresh incognito sign-in (so not a stale
// cookie). The admin shell itself (getStaffMember()/auth(), the permission
// Promise.all) was instrumented first and confirmed fast (~6s total) - the
// hang is somewhere after the shell resolves, in a page's own data fetches.
// This wrapper doesn't fix anything; it turns an indefinite hang into a
// fast, clearly-logged failure (and a slow-but-not-hanging call into a
// visible timing line) so the next occurrence tells us exactly where the
// time goes. Remove once the root cause is found and fixed - see
// docs/STATUS.md for the running account of this investigation.
//
// `timeoutMs` is a required, explicit argument (no shared default) because
// call sites differ a lot in what "too slow" means - a single-row
// permission check and an N-world fan-out over signed-URL generation and
// per-world lesson queries don't share a sensible timeout.
export async function withTimingAndTimeout<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const start = Date.now();
  let timedOut = false;

  // The underlying call isn't cancelled just because we stop waiting for it
  // below - if it eventually settles after its own timeout already fired,
  // this logs how late, which is exactly the number we need to confirm
  // whether it's genuinely hanging forever or just very slow.
  promise.then(
    () => {
      if (timedOut) {
        console.warn(`[admin-shell] "${label}" actually resolved ${Date.now() - start}ms after its timeout fired`);
      }
    },
    (err) => {
      if (timedOut) {
        console.warn(`[admin-shell] "${label}" actually rejected ${Date.now() - start}ms after its timeout fired:`, err);
      }
    },
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(`[admin-shell] "${label}" did not resolve within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    console.log(`[admin-shell] "${label}" resolved in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[admin-shell] "${label}" failed after ${Date.now() - start}ms`, err);
    throw err;
  }
}
