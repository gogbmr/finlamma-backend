import { logInternalError } from "@/lib/http";
import { inngest } from "@/lib/inngest";
import { fetchAmfiNavAll } from "@/server/funds/amfi-client";
import { parseAmfiNavAll } from "@/server/funds/amfi-parser";
import { insertNavIfNew, listFundsWithSchemeCodes } from "@/server/funds/repo";

// Phase 4 Checkpoint 8 (docs/ARCHITECTURE.md D46). Runs once daily, after
// AMFI has typically published the day's NAVs (~21:30 IST). "Parsed
// defensively... never write partial/garbage NAVs... log and alert on a
// failed or unparseable fetch" (founder's requirement):
// - If the fetch itself fails (AMFI unreachable, empty body), the whole
//   step throws (fetchAmfiNavAll already logs it) - Inngest retries a
//   failed step a few times on its own, and if every retry fails the run
//   itself shows as failed in the Inngest dashboard, which is this
//   codebase's actual "alert" today (see the pre-launch checklist item
//   about wiring real alerting).
// - If the fetch succeeds but one fund's scheme code is missing or its row
//   doesn't parse, that ONE fund is skipped (logged loudly) - every other
//   fund's ingestion for the day still proceeds. A skipped fund simply
//   keeps its previous day's NAV as "the most recent available" until a
//   later run succeeds - never a partial or fabricated NAV.
export const amfiNavIngestJob = inngest.createFunction(
  { id: "amfi-nav-ingest", triggers: [{ cron: "TZ=Asia/Kolkata 30 21 * * *" }] },
  async ({ step }) => {
    const targets = await step.run("list-funds", () => listFundsWithSchemeCodes());

    const rawText = await step.run("fetch-navall", () => fetchAmfiNavAll());

    const { successes, failures } = await step.run("parse", () =>
      parseAmfiNavAll(
        rawText,
        targets.map((t) => ({ fundId: t.id, amfiSchemeCode: t.amfiSchemeCode })),
      ),
    );

    for (const failure of failures) {
      logInternalError(
        `funds.amfi_ingest_failed.${failure.reason}`,
        new Error(`fundId=${failure.fundId} schemeCode=${failure.amfiSchemeCode}`),
      );
    }

    for (const success of successes) {
      await step.run(`insert-nav-${success.fundId}`, () =>
        insertNavIfNew(success.fundId, success.date, success.navPaise),
      );
    }

    return { ingested: successes.length, failed: failures.length };
  },
);
