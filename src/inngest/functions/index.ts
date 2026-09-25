import { legalReapprovalEmailsJob } from "./legal-reapproval-emails";
import { weeklyReportCardJob } from "./weekly-report-card";

// Every Inngest function the app registers, imported here so
// src/app/api/inngest/route.ts has one thing to spread into `serve()`.
export const functions = [weeklyReportCardJob, legalReapprovalEmailsJob];
