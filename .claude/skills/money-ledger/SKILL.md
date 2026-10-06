---
name: money-ledger
description: How V Money, XP and balances work — ledger entries, derived balances, conversions and rewards. Use for anything that credits or debits V Money or XP.
paths: "src/server/ledger/**, src/server/xp/**, src/server/trading/**, src/server/rewards/**"
---

- **XP and V Money are earned independently - there is no conversion rate between them**
  (`docs/PRODUCT_SPEC.md` §2, decided). Never introduce an "XP → VM" setting or a `XP_CONVERSION`
  reason - both currencies are credited separately by `reward_rules`, each activity kind has its
  own default XP and VM amount.
- V Money is only ever changed by inserting a row into `vmoney_ledger`
  (`userId, amount (+credit / -debit, bigint - see CLAUDE.md rule 2, never a float), sourceType,
  sourceId, ruleId, multiplierApplied, reason`). No UPDATE of balances anywhere - append-only.
- XP works the same way through `xp_events` (`userId, amount, sourceType, sourceId, ruleId,
  reason`) - level and world unlocks are derived from total XP, XP is never spent or converted.
- Balance = `SUM(amount)` for the user (the DB sum is the truth - no cached/stored balance column
  anywhere). A Redis-cached balance is a possible later optimization, not required until a real
  read-heavy endpoint needs it.
- **Idempotency is a DB unique constraint on `(userId, sourceType, sourceId)`** on both tables -
  not a separate idempotency-key column. A crediting call simply attempts the insert and treats a
  conflict as "already credited, do nothing" (`onConflictDoNothing`), which is what makes
  "credit once per user per lesson, first successful completion only" correct even when multiple
  attempts exist - see docs/ECONOMY.md's per-lesson-kind "successful completion" definitions.
- Corrections are new rows with a NEGATIVE amount and their own distinct `sourceType`/`sourceId`
  (e.g. `sourceType: "reversal"`, `sourceId: <original ledger entry's id>`) - never an UPDATE or
  DELETE of the original row, and never reusing the original row's `(sourceType, sourceId)` (that
  would collide with its own unique constraint). Every reversal is logged to `activity_logs` with
  the staff member's id and the original entry's id in `metadata`.
- Every `reward_rules`-driven entry stores `ruleId` (which `reward_rules` row it came from) and,
  for `vmoney_ledger` only, `multiplierApplied` (the `vm_issuance_multiplier` in effect when the
  entry was written) - so a balance stays explainable even after rules or the multiplier change
  later. `ruleId`/`multiplierApplied` are null for a non-rule-based entry (e.g. a reversal or a
  manual admin adjustment).
- There is no "add V Money" purchase, and no V Money is ever created except through a
  `reward_rules`-driven credit (or a documented reversal/adjustment of one). V Money is earned
  only - no starting balance, no unlock grant (`docs/ECONOMY.md`).
- Stock prices (Phase 4) are stored in paise, per CLAUDE.md rule 2. V Money itself is a whole-unit
  virtual currency (not paise-scaled) - confirm the paise-per-VM conversion for trading capital
  with the user before Phase 4 and record it in `docs/ARCHITECTURE.md`.
- All arithmetic on integers; use `decimal.js` only for display-side division/percentages.
- **Every function called from inside a `db.transaction(async (tx) => ...)` callback must accept
  a `DbOrTx` parameter, and the call site must pass `tx` - never let it silently default to the
  module-level `db`.** A stray `db` call inside an open transaction isn't just a style slip: it
  reads/writes outside whatever row lock that transaction took, so the invariant the lock exists
  to serialize (a balance check, a max-trades cap, ...) ends up enforced by accident, not by the
  guarantee the lock is supposed to provide. Under PGlite (tests) this class of bug self-deadlocks
  outright - see D46 (`getLatestNav`) and D60 (`countTradesForEntry`) in `docs/ARCHITECTURE.md`,
  the same bug caught twice in two different domains. Before adding a new read/write function that
  will ever be called from inside a money-moving transaction, give it the `txDb: DbOrTx = db`
  shape every other such function in this codebase already uses, and pass `tx` at every call site
  inside that transaction.
- **A settlement/reconciliation job that reads several settings/rates concurrently before writing
  (e.g. `settleArenaLeaguesForWeek`'s reward amounts/caps/multiplier) must use
  `runWithConcurrencyLimit` (`src/lib/concurrency-limit.ts`, `DB_CONCURRENCY_LIMIT`), never a bare
  `Promise.all` of 3+ DB-querying calls.** This is exactly the pattern that caused a real
  production incident (`docs/ARCHITECTURE.md` D13/D72) - and on a weekly payout job specifically,
  a wedged connection means a silently-failed settlement, not just a slow page load.
