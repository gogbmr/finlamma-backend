// Originated as diagnostic instrumentation during a production incident
// (2026-10-06/07, see docs/STATUS.md and docs/ARCHITECTURE.md D72 for the
// full account) where an authenticated /admin/(dashboard) page hung ~300s
// (Vercel's function timeout). The root cause is fixed; this wrapper is
// KEPT deliberately, narrowed to the admin shell's own two unavoidable DB
// calls (src/app/admin/(dashboard)/layout.tsx) - a 300s hang is a bad
// failure mode regardless of cause, so that one high-leverage path (every
// admin page load runs through it) fails fast and loud instead, whatever
// breaks it next. The per-page/per-row instrumentation this helper also
// used to back (worlds page, world/mentor editor data) was investigation-
// specific and has been removed now that the question it was answering is
// answered - see docs/STATUS.md for what it found.
//
// `timeoutMs` is a required, explicit argument (no shared default) because
// different calls can have genuinely different "too slow" thresholds.
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
        console.warn(
          `[admin-shell] "${label}" actually resolved ${Date.now() - start}ms after its timeout fired`,
        );
      }
    },
    (err) => {
      if (timedOut) {
        console.warn(
          `[admin-shell] "${label}" actually rejected ${Date.now() - start}ms after its timeout fired:`,
          err,
        );
      }
    },
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          `[admin-shell] "${label}" did not resolve within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    console.log(`[admin-shell] "${label}" resolved in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(
      `[admin-shell] "${label}" failed after ${Date.now() - start}ms`,
      err,
    );
    throw err;
  }
}
