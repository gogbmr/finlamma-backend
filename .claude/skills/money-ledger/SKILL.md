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
