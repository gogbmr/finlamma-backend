import { amfiNavIngestJob } from "./amfi-nav-ingest";
import { arenaWorldXpRollupJob } from "./arena-world-xp-rollup";
import { legalReapprovalEmailsJob } from "./legal-reapproval-emails";
import { limitOrderEodCancelJob } from "./limit-order-eod-cancel";
import { limitOrderMatchingJob } from "./limit-order-matching";
import { newsDraftJob } from "./news-draft";
import { newsIngestJob } from "./news-ingest";
import { sipExecutionJob } from "./sip-execution";
import { weeklyReportCardJob } from "./weekly-report-card";

// Every Inngest function the app registers, imported here so
// src/app/api/inngest/route.ts has one thing to spread into `serve()`.
export const functions = [
  weeklyReportCardJob,
  legalReapprovalEmailsJob,
  limitOrderMatchingJob,
  limitOrderEodCancelJob,
  amfiNavIngestJob,
  sipExecutionJob,
  newsIngestJob,
  newsDraftJob,
  arenaWorldXpRollupJob,
];
