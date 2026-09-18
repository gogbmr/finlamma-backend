---
name: money-ledger
description: How V Money, XP and balances work — ledger entries, derived balances, conversions and rewards. Use for anything that credits or debits V Money or XP.
paths: "src/server/ledger/**, src/server/xp/**, src/server/trading/**, src/server/rewards/**"
---

- V Money is only ever changed by inserting a row into `vmoney_ledger`
  (`userId, amount (+credit / -debit), reason, refType, refId, idempotencyKey`). No UPDATE of
  balances anywhere.
- Balance = `SUM(amount)` for the user. Cache it in Redis (`bal:<userId>`) and invalidate on write;
  the DB sum is the truth.
- Reasons are an enum: LESSON_REWARD, QUIZ_REWARD, BOSS_REWARD, XP_CONVERSION, ORDER_BUY,
  ORDER_SELL, SIP_DEBIT, REWARD_CLAIM, CHEER_BONUS, ADMIN_ADJUSTMENT, REVERSAL.
- Corrections are new REVERSAL/ADMIN_ADJUSTMENT rows with a reason in metadata, logged to
  `activity_logs` with the staff member's id. Never delete ledger rows.
- XP works the same way through `xp_events`; level and world unlocks are derived from total XP.
- XP → V Money conversion rate is read from `settings_kv.xp_to_vmoney_rate` (e.g. 100 XP = 250 VM).
- Stock prices are stored in paise. Proposed rule: 1 V Money = ₹1 of practice value = 100 paise.
  Confirm this with the user before the trading phase and record it in `docs/ARCHITECTURE.md`.
- There is no "add V Money" purchase. V Money is earned only.
- All arithmetic on integers; use `decimal.js` only for display-side division/percentages.
