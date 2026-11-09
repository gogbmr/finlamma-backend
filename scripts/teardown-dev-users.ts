// Removes exactly the synthetic learners scripts/seed-dev-users.ts created,
// and every row they own, from the shared dev/preview/production database
// (docs/STATUS.md 2026-09-23 entry, D27) - never anything else.
//
// SAFE BY DEFAULT: only WRITES when run with `--apply`. Without it, this
// prints the same per-table row counts a real run would delete and touches
// nothing - same convention as seed-dev-users.ts itself.
//
// Scope, by construction, not just by WHERE clause: the only rows this
// script ever looks at are users whose clerk_user_id starts with
// "seed_clerk_" - the exact prefix seed-dev-users.ts's own header comment
// says nothing else in this codebase ever generates. Every id this script
// deletes by is first read back and re-checked in JS against that prefix
// (seedUsers.every(...) below) before any DELETE runs, so a future change to
// the WHERE clause (or a LIKE pattern typo) can never widen the blast radius
// to a real account.
//
// Mechanism: every table seed-dev-users.ts writes to has its user-owned rows
// FK'd to users.id with onDelete: "cascade" (verified against
// src/db/schema/* before writing this script) - so the actual deletion is
// one statement, `DELETE FROM users WHERE id = ANY(seedIds)`, inside a
// transaction. Postgres does the rest. Two kinds of rows are deliberately
// left untouched, because they are NOT owned by a single user:
//   - `leagues` / `coach_note_templates`: shared reference-ish rows
//     seed-dev-users.ts dedupes by id (its own comment calls them exactly
//     that) - a real learner could join the same global league or have a
//     report snapshot point at the same published coach-note template.
//     Deleting them could break a real user's data even though no FK forces
//     Postgres to stop you. This script only ever reports whether the
//     global league ends up with zero members after the delete (FYI only).
//   - `activity_logs`: actor_id is deliberately NOT a foreign key (see
//     src/db/schema/activity_logs.ts's own comment) specifically so this
//     table can never be touched by any cascade, ever (CLAUDE.md rule 5 -
//     append-only, no delete path, for anyone, including this script).
//     Nothing here queries or deletes from it.
//
// This is a genuinely new kind of operation for this codebase: every
// existing account-deletion path (src/server/users/service.ts
// reconcileAccountDeletion) ANONYMIZES a user row and scrubs specific PII,
// but never deletes xp_events/vmoney_ledger/orders/etc. - D27's recorded
// position is that real ledger history "cannot be cleaned up, only
// reversed." This script's hard DELETE is deliberately scoped to rows that
// can only ever belong to synthetic seed_clerk_ accounts, never a real
// learner, which is a different situation to the one D27 was written about -
// but it is still the first hard-delete-by-cascade path in this codebase, so
// treat `--apply` with the same weight as any other destructive DB change
// (CLAUDE.md "Always STOP and ask before... destructive DB changes").
//
// Run via `tsx scripts/teardown-dev-users.ts` (dry run) or
// `tsx scripts/teardown-dev-users.ts --apply` (real delete).
import "../envConfig";
import { inArray, like, or } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  certificates,
  cheers,
  competitionEntries,
  competitionTrades,
  consentRecords,
  doubtMessages,
  doubtThreads,
  entitlements,
  fundHoldings,
  fundOrders,
  holdings,
  leagueMembers,
  leagues,
  legalAcceptances,
  lessonProgress,
  newsReads,
  notifications,
  orders,
  parentContacts,
  pulseCheckAnswers,
  pulseCheckAttempts,
  questionAnswers,
  quizAttempts,
  rewardClaims,
  reportSnapshots,
  sessionTimeDaily,
  sipPlans,
  streaks,
  userAboutMeChips,
  userBadges,
  users,
  vmoneyLedger,
  xpEvents,
} from "../src/db/schema";

const APPLY = process.argv.includes("--apply");
const SEED_PREFIX = "seed_clerk_";

// Tables whose rows are directly owned by one user (a userId column, cascade
// on delete) - counted with a plain `userId IN (seedIds)`.
const DIRECT_TABLES = [
  { name: "parentContacts", table: parentContacts, col: parentContacts.userId },
  { name: "consentRecords", table: consentRecords, col: consentRecords.userId },
  { name: "legalAcceptances", table: legalAcceptances, col: legalAcceptances.userId },
  { name: "streaks", table: streaks, col: streaks.userId },
  { name: "lessonProgress", table: lessonProgress, col: lessonProgress.userId },
  { name: "quizAttempts", table: quizAttempts, col: quizAttempts.userId },
  { name: "xpEvents", table: xpEvents, col: xpEvents.userId },
  { name: "vmoneyLedger", table: vmoneyLedger, col: vmoneyLedger.userId },
  { name: "userBadges", table: userBadges, col: userBadges.userId },
  { name: "rewardClaims", table: rewardClaims, col: rewardClaims.userId },
  { name: "certificates", table: certificates, col: certificates.userId },
  { name: "orders", table: orders, col: orders.userId },
  { name: "holdings", table: holdings, col: holdings.userId },
  { name: "sipPlans", table: sipPlans, col: sipPlans.userId },
  { name: "fundOrders", table: fundOrders, col: fundOrders.userId },
  { name: "fundHoldings", table: fundHoldings, col: fundHoldings.userId },
  { name: "leagueMembers", table: leagueMembers, col: leagueMembers.userId },
  { name: "userAboutMeChips", table: userAboutMeChips, col: userAboutMeChips.userId },
  { name: "notifications", table: notifications, col: notifications.userId },
  { name: "doubtThreads", table: doubtThreads, col: doubtThreads.userId },
  { name: "sessionTimeDaily", table: sessionTimeDaily, col: sessionTimeDaily.userId },
  { name: "reportSnapshots", table: reportSnapshots, col: reportSnapshots.userId },
  { name: "entitlements", table: entitlements, col: entitlements.userId },
  { name: "newsReads", table: newsReads, col: newsReads.userId },
  { name: "pulseCheckAttempts", table: pulseCheckAttempts, col: pulseCheckAttempts.userId },
  { name: "competitionEntries", table: competitionEntries, col: competitionEntries.userId },
] as const;

async function countDirect(table: (typeof DIRECT_TABLES)[number], seedIds: string[]): Promise<number> {
  const rows = await db.select({ id: table.table.id }).from(table.table).where(inArray(table.col, seedIds));
  return rows.length;
}

// questionAnswers is keyed off quizAttempts.id, not userId directly.
async function countQuestionAnswers(seedIds: string[]): Promise<number> {
  const attempts = await db.select({ id: quizAttempts.id }).from(quizAttempts).where(inArray(quizAttempts.userId, seedIds));
  if (attempts.length === 0) return 0;
  const rows = await db
    .select({ id: questionAnswers.id })
    .from(questionAnswers)
    .where(inArray(questionAnswers.attemptId, attempts.map((a) => a.id)));
  return rows.length;
}

async function countDoubtMessages(seedIds: string[]): Promise<number> {
  const threads = await db.select({ id: doubtThreads.id }).from(doubtThreads).where(inArray(doubtThreads.userId, seedIds));
  if (threads.length === 0) return 0;
  const rows = await db
    .select({ id: doubtMessages.id })
    .from(doubtMessages)
    .where(inArray(doubtMessages.threadId, threads.map((t) => t.id)));
  return rows.length;
}

async function countPulseCheckAnswers(seedIds: string[]): Promise<number> {
  const attempts = await db
    .select({ id: pulseCheckAttempts.id })
    .from(pulseCheckAttempts)
    .where(inArray(pulseCheckAttempts.userId, seedIds));
  if (attempts.length === 0) return 0;
  const rows = await db
    .select({ id: pulseCheckAnswers.id })
    .from(pulseCheckAnswers)
    .where(inArray(pulseCheckAnswers.attemptId, attempts.map((a) => a.id)));
  return rows.length;
}

async function countCompetitionTrades(seedIds: string[]): Promise<number> {
  const entries = await db
    .select({ id: competitionEntries.id })
    .from(competitionEntries)
    .where(inArray(competitionEntries.userId, seedIds));
  if (entries.length === 0) return 0;
  const rows = await db
    .select({ id: competitionTrades.id })
    .from(competitionTrades)
    .where(inArray(competitionTrades.entryId, entries.map((e) => e.id)));
  return rows.length;
}

async function countCheers(seedIds: string[]): Promise<number> {
  const rows = await db
    .select({ id: cheers.id })
    .from(cheers)
    .where(or(inArray(cheers.senderId, seedIds), inArray(cheers.receiverId, seedIds)));
  return rows.length;
}

async function buildReport(seedIds: string[]): Promise<Record<string, number>> {
  const report: Record<string, number> = {};
  // Sequential, never a bare Promise.all of 3+ DB calls (CLAUDE.md rule 15 -
  // src/db/client.ts's pool wedges past that many truly concurrent queries).
  for (const t of DIRECT_TABLES) {
    report[t.name] = await countDirect(t, seedIds);
  }
  report.questionAnswers = await countQuestionAnswers(seedIds);
  report.doubtMessages = await countDoubtMessages(seedIds);
  report.pulseCheckAnswers = await countPulseCheckAnswers(seedIds);
  report.competitionTrades = await countCompetitionTrades(seedIds);
  report.cheers = await countCheers(seedIds);
  return report;
}

async function main() {
  const seedUsers = await db
    .select({ id: users.id, clerkUserId: users.clerkUserId })
    .from(users)
    .where(like(users.clerkUserId, `${SEED_PREFIX}%`));

  if (seedUsers.length === 0) {
    console.log(`No users found with clerk_user_id LIKE '${SEED_PREFIX}%'. Nothing to do.`);
    return;
  }

  // Defensive re-check in JS, independent of the WHERE clause above - see
  // the file header. Throws rather than silently filtering, since a
  // mismatch here means something is wrong with the query, not the data.
  if (!seedUsers.every((u) => u.clerkUserId.startsWith(SEED_PREFIX))) {
    throw new Error(
      "Refusing to continue: a row returned by the seed-user query does not start with " +
        `'${SEED_PREFIX}'. This should be impossible given the WHERE clause - stopping before any delete.`,
    );
  }
  const seedIds = seedUsers.map((u) => u.id);

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN (pass --apply to delete for real)"}`);
  console.log(`Found ${seedIds.length} seed user(s) (clerk_user_id LIKE '${SEED_PREFIX}%').`);

  const report = await buildReport(seedIds);
  console.log("\nRows that will be removed via cascade from the users delete:");
  let total = 0;
  for (const [table, c] of Object.entries(report)) {
    console.log(`  ${table}: ${c}`);
    total += c;
  }
  console.log(`  users: ${seedIds.length}`);
  console.log(`  TOTAL (incl. users): ${total + seedIds.length}`);

  console.log(
    "\nNever touched: leagues, coach_note_templates (shared reference rows, " +
      "not owned by a single user - see file header), activity_logs (no FK to " +
      "users at all, append-only by construction).",
  );

  if (!APPLY) {
    console.log("\nDry run only - no rows were deleted.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(users).where(inArray(users.id, seedIds));
  });

  const after = await buildReport(seedIds);
  const leftover = Object.entries(after).filter(([, c]) => c > 0);
  if (leftover.length > 0) {
    throw new Error(
      `Delete completed but rows remain (should be impossible under cascade): ${JSON.stringify(leftover)}`,
    );
  }
  console.log(`\nDeleted ${seedIds.length} seed user(s) and all owned rows. Verified zero remaining.`);

  const allLeagueIds = (await db.select({ id: leagues.id }).from(leagues)).map((l) => l.id);
  const remainingMembers =
    allLeagueIds.length === 0
      ? []
      : await db.select({ id: leagueMembers.id }).from(leagueMembers).where(inArray(leagueMembers.leagueId, allLeagueIds));
  console.log(
    `\nFYI: ${remainingMembers.length} league_members row(s) remain across all leagues (not deleted - shared ` +
      "reference row; a non-zero count here just means a real user is also in a league).",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
