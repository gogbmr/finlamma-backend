import { createHash, randomBytes } from "node:crypto";
import { WeeklyReportCardEmail } from "@/emails/weekly-report-card";
import { sendEmailOrLog } from "@/lib/email";
import { env } from "@/lib/env";
import {
  getUserFirstName,
  setConsentRecordWithdrawTokenHash,
  setParentContactWeeklyReportUnsubscribeTokenHash,
} from "@/server/onboarding/repo";
import { getStreakStats } from "@/server/streaks/service";
import type { reportSnapshots } from "@/db/schema";

// Small, local, deliberately NOT shared with src/server/onboarding/service.ts's
// own generateToken/hashToken - see src/lib/email.ts's sendEmailOrLog comment
// for why: reusing them would mean exporting private helpers out of a
// minors-safety-critical, already-shipped file, for a code-reuse nicety this
// checkpoint doesn't need to risk.
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type ReportSnapshotRow = typeof reportSnapshots.$inferSelect;

// D33 (docs/ARCHITECTURE.md): mints a FRESH withdraw token on every send,
// same pattern src/server/onboarding/service.ts's own parent-facing emails
// already use (a parent's withdraw link always works off the most recently
// sent email - see D15's "confirming overwrites withdraw_token_hash
// unconditionally" reasoning). Never throws on a Redis/DB hiccup outside of
// what sendEmailOrLog itself already fails closed on - the weekly Inngest
// job's caller wraps this per-user so one parent's email failing never stops
// the rest of the run.
export async function sendWeeklyReportParentEmail(
  user: { id: string },
  parentEmail: string,
  snapshot: ReportSnapshotRow,
): Promise<void> {
  const [childFirstName, streakStats] = await Promise.all([
    getUserFirstName(user.id),
    getStreakStats(user.id),
  ]);

  const withdrawToken = generateToken();
  await setConsentRecordWithdrawTokenHash(user.id, hashToken(withdrawToken));
  const withdrawUrl = `${env.APP_URL}/consent/withdraw?token=${withdrawToken}`;

  // Rotated on every send too (same reasoning as the withdraw token above) -
  // separate link that stops ONLY this weekly email, never full consent
  // (docs/ARCHITECTURE.md D33, CLAUDE.md rule 13: every email to a verified
  // parent still carries the full withdraw link as well).
  const unsubscribeToken = generateToken();
  await setParentContactWeeklyReportUnsubscribeTokenHash(user.id, hashToken(unsubscribeToken));
  const unsubscribeUrl = `${env.APP_URL}/consent/weekly-report/unsubscribe?token=${unsubscribeToken}`;

  const totalLessonsThisWeek = snapshot.moduleBreakdown.reduce((sum, m) => sum + m.lessonsCompleted, 0);

  await sendEmailOrLog({
    to: parentEmail,
    subject: `${childFirstName ?? "Your child"}'s Finlamma progress this week`,
    react: WeeklyReportCardEmail({
      childFirstName: childFirstName ?? "Your child",
      weekLabel: `the week of ${snapshot.weekStartDate}`,
      efficiencyScore: snapshot.efficiencyScore,
      lessonsCompleted: totalLessonsThisWeek,
      streakDays: streakStats.learning.current,
      withdrawUrl,
      unsubscribeUrl,
    }),
    devLogLabel: `weekly report card for user ${user.id}`,
    devLogDetail: `withdraw: ${withdrawUrl} | unsubscribe (weekly only): ${unsubscribeUrl}`,
  });
}
