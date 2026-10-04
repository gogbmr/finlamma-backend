import { amfiNavIngestJob } from "./amfi-nav-ingest";
import { arenaLeagueSettlementJob } from "./arena-league-settlement";
import { arenaWorldXpRollupJob } from "./arena-world-xp-rollup";
import { competitionSettlementJob } from "./competition-settlement";
import { legalReapprovalEmailsJob } from "./legal-reapproval-emails";
import { limitOrderEodCancelJob } from "./limit-order-eod-cancel";
import { limitOrderMatchingJob } from "./limit-order-matching";
import { newsDraftJob } from "./news-draft";
import { newsIngestJob } from "./news-ingest";
import { newsNotificationBroadcastJob } from "./news-notification-broadcast";
import { notificationsRetentionJob } from "./notifications-retention";
import { revenuecatEntitlementReconciliationJob } from "./revenuecat-entitlement-reconciliation";
import { sessionGoalNotificationsJob } from "./session-goal-notifications";
import { sipExecutionJob } from "./sip-execution";
import { streakRiskNotificationsJob } from "./streak-risk-notifications";
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
  arenaLeagueSettlementJob,
  competitionSettlementJob,
  newsNotificationBroadcastJob,
  streakRiskNotificationsJob,
  sessionGoalNotificationsJob,
  notificationsRetentionJob,
  revenuecatEntitlementReconciliationJob,
];
