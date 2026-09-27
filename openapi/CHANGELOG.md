# API Changelog

Plain-English record of what changed in `openapi/openapi.json`, published via `/publish-contract`.

## 2026-09-27 — v1.0.0

Major bump: 15 new operations, but also a **breaking change** on 3 existing endpoints - the first
one this contract has ever published, so the leftmost version digit moves instead of the middle
one. Covers Phase 4 (trading engine: instruments, orders, mutual funds, SIPs, the market relay,
the Profile Trades tab) plus a post-Checkpoint-9 security-audit hardening pass.

**Breaking: V Money fields renamed and rescaled to paise (D37, `docs/ARCHITECTURE.md`)**
`vmoney_ledger` moved from whole V Money to exact paise (100 = 1 V Money) so a trade's cost/
proceeds never need rounding. Every response field derived from it is renamed with a `Paise`
suffix instead of keeping the old name with a silently-changed meaning:
- `GET /api/v1/me/stats/vmoney` — `balance` → `balancePaise`, `weeklyEarned` → `weeklyEarnedPaise`,
  `weeklySpent` → `weeklySpentPaise`. Values are now ×100 (e.g. a balance of 210 is now 21000).
- `GET /api/v1/me/wallet` — `balance` → `balancePaise`, `earnedThisMonth` → `earnedThisMonthPaise`,
  `earnedBySource[].amount` → `earnedBySource[].amountPaise`. Same ×100 rescale.
- `GET /api/v1/me/wallet/history` — each row's `amount` → `amountPaise`. Same ×100 rescale.

Any client consuming these three endpoints needs to switch to the new field names and divide by
100 for a whole-V-Money display value - this was never rounded server-side, and never will be.
Safe to do as a rename rather than a versioned/parallel field because no app has shipped against
the old names yet (pre-launch).

**Trading (Checkpoints 1-6, D40-D42)**
- `GET /api/v1/trade/instruments`, `GET /api/v1/trade/instruments/{symbol}`,
  `GET /api/v1/trade/instruments/{symbol}/candles` — the instrument catalog, live quote, and
  candle history (Twelve Data, cached).
- `GET /api/v1/trade/market-status` — LIVE / 15M DELAY / HALTED, driven by the Ops console's feed
  mode and per-symbol halts.
- `GET /api/v1/relay/config` — the market relay's only endpoint on this backend; authenticated by
  a shared secret, never a user session.
- `POST /api/v1/trade/orders` — place a MARKET or LIMIT stock order. Requires an Idempotency-Key
  header; the execution price always comes from the relay's live tick in Redis, never the client.
  A LIMIT order that isn't immediately marketable queues as `open` and is matched later by a
  scheduled job, or cancelled at day end if the market closes first.

**Mutual funds & SIPs (Checkpoints 7-8, D45-D46)**
- `GET /api/v1/trade/funds`, `GET /api/v1/trade/funds/{id}` — the fund catalog and one fund's
  detail, priced off the most recently ingested AMFI NAV.
- `POST /api/v1/trade/funds/orders` — buy (lump sum) or sell (redeem) fund units, same
  Idempotency-Key/no-client-price rules as stock orders.
- `GET /api/v1/trade/funds/sip`, `POST /api/v1/trade/funds/sip`,
  `PATCH /api/v1/trade/funds/sip/{id}` — list, create, and pause/resume/cancel a recurring SIP
  plan. A failed scheduled execution (insufficient balance, stale NAV) is always visible here,
  never silently skipped.

**Profile - Trades tab (Checkpoint 7, D43-D44)**
- `GET /api/v1/me/portfolio/summary` — cash balance, holdings market value, all-time trading P&L,
  and a 12-point equity sparkline built from a real chronological replay of every fill.
- `GET /api/v1/me/portfolio/stats` — closed-trade count, realized P&L, win/loss split, best/worst
  trade, open-positions count.
- `GET /api/v1/me/portfolio/trades` — the trade-history list, filterable All/Open/Closed,
  cursor-paginated through closed trades only (open positions are a snapshot, always on page one).

**Post-Checkpoint-9 security audit - additive only**
- `GET /api/v1/health` gained `relaySecret` (whether `RELAY_SHARED_SECRET` is configured),
  `tradingHalt` (`"ok" | "active"`, so an accidentally-left-on global halt shows up in uptime
  monitoring, not just `/admin`), and `market` fields.
- `POST /api/v1/trade/orders`, `POST /api/v1/trade/funds/orders`, `POST /api/v1/trade/funds/sip`
  each gained a documented `429 RATE_LIMITED` response (rate limiting was added server-side but
  the endpoints' request/response shapes are unchanged).

Not yet in the contract: Arena and news (`docs/ROADMAP.md` Phase 5+). TR-13 (orders list),
TR-35 (fund portfolio summary), TR-02/TR-36 (instrument/fund search-filter params), and TR-50/
TR-54 (Ops console tick-age indicator, SANDBOX label) are deferred to a future Trade tab build -
see `docs/FEATURE_MAP.md`.

## 2026-09-25 — v0.3.0

Minor bump: purely additive, 11 new operations plus new fields on 3 existing endpoints, nothing
removed and nothing changed incompatibly since v0.2.0. Covers Phase 3b (badges & rewards,
certificates, the weekly report card, daily goals, session time, `users.bio`/`preferences`).

**Badges & rewards**
- `GET /api/v1/me/badges` — every published badge with the caller's own unlock state and real
  progress toward a locked badge's threshold (not just 0).
- `GET /api/v1/me/rewards` — the reward catalog with the caller's own claim state; a reward's price
  is fixed and admin-set, never computed from the caller's own balance.
- `POST /api/v1/me/rewards/{id}/claim` — claim a reward. Idempotent against a double-tap, debits
  inside a row-locked transaction so a balance can never go negative under concurrency, and freezes
  the price paid on the claim row so a later price change never affects it. A reward can be claimed
  at most once per learner.
- `GET /api/v1/me/wallet` — V Money balance, earned this month, and an earn-source breakdown.
- `GET /api/v1/me/wallet/history` — the caller's full V Money ledger, cursor-paginated.

**Certificates**
- `GET /api/v1/me/certificates` — every certificate the caller has earned.
- `GET /api/v1/me/certificates/{worldId}` — one certificate's detail (issued idempotently on
  passing that world's Boss Quiz).
- `GET /api/v1/me/certificates/{worldId}/pdf` — a signed URL to the certificate's PDF.

**Weekly report card & daily goals**
- `GET /api/v1/me/report-card` — the current IST week's efficiency snapshot (retention, watch
  speed, quiz accuracy, consistency), an 8-week trend, and whether the report is currently shared
  with a verified parent (masked email + whether the weekly email is on) - progress-only, never a
  ranking or a comparison to other learners.
- `GET /api/v1/me/daily-goals` — today's progress toward each active daily goal (study minutes,
  a lesson completed); which goals are active and their targets are admin-editable data, not
  hardcoded. Never awards XP or V Money by itself.
- `POST /api/v1/me/session-time` — records a client-reported session-end ping toward today's
  study-minutes goal, capped at 60 minutes/day.

**Existing endpoints, additive changes only**
- `GET`/`PATCH /api/v1/me` — the `Me` schema gained `bio` (free-text, self-editable, up to 280
  characters, **private to the owner - never shown to any other learner, `docs/ARCHITECTURE.md`
  D36**) and `preferences` (sound/haptics/data-saver toggles).
- `GET /api/v1/health` — gained an `inngest` field (whether the background-jobs signing key is
  configured on a real deployment; always `"ok"` in local dev).

Not yet in the contract: everything from `docs/ROADMAP.md` Phase 4 onward (trading, Arena, news).
The weekly report card's PDF/story-card export is deferred, not built this phase.

## 2026-09-23 — v0.2.0

Minor bump: purely additive, 6 new operations, nothing removed or changed on any endpoint that
was already in v0.1.0. Covers Phase 3a (progress economy: rate limiting, the XP/V Money ledger,
Story/Doubt Zone completion, streaks, stat endpoints).

**Story/Doubt Zone completion (Checkpoint 3)**
- `POST /api/v1/lessons/{id}/serve` — starts the server-stamped timer for a Story/Doubt Zone
  lesson (the two lesson kinds with no graded quiz steps).
- `POST /api/v1/lessons/{id}/complete` — completes it once the admin-configured minimum time has
  genuinely elapsed since `serve` (server-enforced, not a client-reported duration).

**Stats (Checkpoint 4/5, World Home header tiles + Profile Overview)**
- `GET /api/v1/me/stats/streak` — current/longest streak and freezes left, for both the
  `learning` and `pulseCheck` habit loops.
- `GET /api/v1/me/stats/xp` — total XP, level, XP progress to the next level, and XP earned in
  the trailing 7 days. Level is always computed from total XP on the fly, never stored.
- `GET /api/v1/me/stats/vmoney` — V Money balance (summed live from the ledger, never a stored
  balance), plus V Money earned/spent in the trailing 7 days.
- `GET /api/v1/me/profile/overview` — the Profile screen's ID card: kid-safe name (first name +
  last initial only — never a photo or full name), joined date, level, XP progress, and the
  learner's current rank title (from a new admin-editable rank-title ladder). Percentile/rank is
  intentionally left out of all three stat endpoints above — that's Phase 6 (Arena's leaderboard),
  not this phase.

All four `stats`/`profile` endpoints require a signed-in, fully onboarded user and only ever
return the caller's own data — there is no way to pass another user's id to any of them.

Not yet in the contract: everything from `docs/ROADMAP.md` Phase 3b onward (badges, rewards,
certificates, weekly report card) and Phase 4+ (trading, Arena, news).

## 2026-09-22 — v0.1.0 (initial publish)

First formal publish of the contract — no prior version was ever published through this process,
so this establishes the `0.1.0` baseline rather than describing a bump. Covers everything built
through Phase 1, Phase 2a (onboarding, parental consent, legal documents) and Phase 2b (learning
content: mentors, worlds, lessons, quizzes).

**Identity, account & onboarding**
- `GET /api/v1/me`, `PATCH /api/v1/me`, `DELETE /api/v1/me` — profile, update, account deletion.
- `PATCH /api/v1/me/date-of-birth` — set-once, determines under-18 status.
- `PATCH /api/v1/me/onboarding-complete` — marks the first-open mentor-intro modal as seen.

**Legal documents & parental consent**
- `GET /api/v1/legal/{type}` — published Terms/Privacy/Risk-disclosure text.
- `GET /api/v1/me/legal-status` — this user's acceptance status per document.
- `POST /api/v1/me/legal/accept` — record self-acceptance.
- `POST /api/v1/me/legal/reapproval/resend` — resend a parent re-approval link after a legal
  document changes.
- `POST /api/v1/me/parent-consent/request` — start the parental consent flow for a minor.

**Learning content**
- `GET /api/v1/mentors`, `GET /api/v1/mentors/{key}` — published Lamma mentors.
- `GET /api/v1/worlds` — published worlds, ordered, with this user's own sequential unlock state.
- `GET /api/v1/worlds/{id}/lessons` — a world's lesson list.
- `GET /api/v1/lessons/{id}` — lesson detail.
- `GET /api/v1/me/current-lesson` — resume-banner pointer to the learner's in-progress lesson.
- `POST /api/v1/lessons/{id}/steps/{n}/serve` — serve the next quiz step (server-stamped timer
  start).
- `POST /api/v1/lessons/{id}/steps/{n}/answer` — submit and server-grade an answer (server-timed,
  idempotent, no answer/explanation leak before grading).

**System**
- `GET /api/v1/health` — service health, migration drift, legal-document and content-completeness
  warnings.
- `POST /api/webhooks/clerk`, `POST /api/webhooks/clerk-staff` — Clerk identity sync (consumer and
  staff apps), signature-verified.

Not yet in the contract: worlds/mentors/lessons/questions admin CRUD (Server Actions, not REST
per `docs/ARCHITECTURE.md` D16, so intentionally outside this contract) and everything in
`docs/ROADMAP.md` Phase 3 onward (XP/V Money, trading, Arena, news).
