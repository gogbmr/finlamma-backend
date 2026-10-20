# API Changelog

Plain-English record of what changed in `openapi/openapi.json`, published via `/publish-contract`.

## 2026-10-20 — v2.2.0

Minor bump: 2 new operations, new fields on seven existing response schemas, one new error
response, and one **behaviour change** on an existing endpoint (below) since v2.1.0. Confirmed
with the app team before publishing that nothing live calls that endpoint yet, so it ships as a
minor bump rather than a major one. Covers order history, order cancellation, fund holdings and
trade-side localization. Branch `phase-4-trade-asks`.

**Order history & cancellation**
- **New endpoint**: `GET /api/v1/trade/orders` — the caller's own orders, cursor-paginated,
  filterable by `status` and by the `Idempotency-Key` used to place one.
- **New endpoint**: `POST /api/v1/trade/orders/{id}/cancel` — cancels the caller's own pending
  order. No ledger write (nothing is reserved against an open order, so there's nothing to
  release). Scoped by order id *and* caller together, so a wrong-owner or nonexistent id both
  return a plain `404 NOT_FOUND`, never `403` — an id can't be probed for existence. Idempotent: an
  already-cancelled order just returns its current state; an already-filled or already-expired one
  gets the new `409 ORDER_NOT_CANCELLABLE`, naming its actual status.
- `PlaceOrderResponse`/`OrderListResponse` gained `cancelReason` (`user_requested` | `eod_expired`
  | `null`) on each order.

**Fund holdings & localized disclaimers**
- `GET /api/v1/trade/funds`, `GET /api/v1/trade/funds/{id}` — each fund now also reports the
  caller's own `heldUnitsMilli` and `holdingValuePaise` (0 when not held), and the list/detail
  responses gained `disclaimerLocalized: { en, hi, hx }` (mutual-fund risk disclosure, three
  languages).
- `GET /api/v1/trade/instruments`, `GET /api/v1/trade/instruments/{symbol}`,
  `GET /api/v1/trade/instruments/{symbol}/candles` — same `disclaimerLocalized` addition for stock
  trading.
- `GET /api/v1/trade/market-status` — gained `recommendedPollIntervalMs`, so the app's polling
  cadence is server-driven rather than a hardcoded client constant.
- `GET /api/v1/me/wallet/history` — each row gained `reasonLocalized: { en, hi, hx } | null` —
  localized only for `trade`/`fund_trade` ledger entries; every other ledger source stays
  English-only for now, a known follow-up, not an oversight.
- `GET /api/v1/me/report-card` — `moduleBreakdown[]` rows gained `worldTitleLocalized`.

**Behaviour change: `POST /api/v1/trade/funds/sip` now requires an Idempotency-Key**
- This endpoint already shipped in v1.0.0 without this requirement. A request that omits the
  header now gets `400 VALIDATION_FAILED` where it previously succeeded — this is not additive,
  it will break any existing caller that doesn't send the header. Confirmed with the app team
  before publishing that nothing live calls this endpoint yet, which is the only reason this ships
  as a minor bump rather than a major one.
- Same `409 IDEMPOTENCY_REPLAY` semantics as `POST /trade/orders`/`POST /trade/funds/orders`:
  replaying the same key returns the original result rather than creating a second plan.

**Not a shape change, but worth recording here**: three unrelated `Promise.all`-based concurrent
DB-read call sites flagged by `scripts/check-promise-all-db-concurrency.ts` (an admin worlds page,
certificate issuance, and the rewards admin claims list) were switched to
`runWithConcurrencyLimit`. All three were display-only reads, not reachable from this contract at
all — no request/response shape changed.

## 2026-10-14 — v2.1.0

Minor bump: purely additive, 1 new operation, new fields on two existing response schemas, and
one new error response documented on 4 existing routes - nothing removed and nothing changed
incompatibly since v2.0.0. World Home data pass, branch `world-home-data`
(`docs/ARCHITECTURE.md` D76/D77).

**World Home: world navigation, per-world progress, per-lesson journey-map state**
- `GET /api/v1/worlds` — new fields on each world: `id` (needed to navigate into a world via
  `GET /api/v1/worlds/{id}/lessons` - the app couldn't do this before), `completedLessons` and
  `totalLessons` (this learner's own progress through the world's published lessons).
- `GET /api/v1/worlds/{id}/lessons` — each lesson node now includes `state`
  (`done` | `current` | `available` | `locked`) - this learner's own progress on that node,
  computed from `lesson_progress` and the same sequential world-unlock rule `GET /api/v1/worlds`
  uses.
- **New endpoint**: `GET /api/v1/me/stats/time` - today's (IST) time-studied-today stat
  (`todaySeconds`), mirroring the existing `stats/streak`/`stats/xp`/`stats/vmoney` pattern. A
  plain read of the same running total `POST /me/session-time` already returns as a write-path
  byproduct.
- No change needed for mentor data - `GET /api/v1/mentors`/`GET /api/v1/mentors/{key}` already
  cover everything the World Home mentor panel needs; look a world's mentor up by its existing
  `mentorKey`.

**`state: "locked"` is enforced, not just informational (D77, closed in the same branch)**
- `POST /api/v1/lessons/{id}/serve`, `.../complete`, `.../steps/{n}/serve`, `.../steps/{n}/answer`
  — all four now document a new `403 LESSON_LOCKED` response: the lesson's world isn't unlocked
  for this learner yet (sequential unlock, clear the previous world's Boss Quiz first). Merged
  into the existing `403` entry alongside the onboarding `FORBIDDEN` case - same response schema,
  just a second possible code/example. Covers every lesson kind (Video/Story/Quiz/Boss
  Quiz/Role Play/Doubt Zone) - shouldn't normally be reachable from a correctly-built UI (don't
  make a locked node tappable), but it's a real, server-enforced check now. `current`/`available`/
  `done` (a replay) are all still allowed - replays never re-credit XP/VM (`docs/ARCHITECTURE.md`
  D26). See `docs/MOBILE_INTEGRATION.md`'s error-code table.

## 2026-10-12 — v2.0.0

Major bump: **breaking** - `firstName`/`lastInitial` removed from every peer-visible response
schema. 1 new operation, 1 new field on an existing schema, 4 existing schemas lost two fields
each. From the handle rollout (`docs/ARCHITECTURE.md` D73), branch `handles`.

**Peer-visible identity is now a handle, never a real name (D73)**
- **Breaking**: `firstName`/`lastInitial` removed from `ArenaLeaderboardResponse`'s `rows[]`,
  `ArenaActivityResponse`'s `items[]`, `PublicProfileResponse`'s `data`, and
  `CompetitionLeaderboardResponse`'s `rows[]`. Each gains `handle: { en, hi, hx } | null` in their
  place - a staff-curated, auto-assigned identity, not learner-authored or learner-picked. Any app
  code reading `firstName`/`lastInitial` off another learner's row must switch to `handle`; those
  two fields no longer exist on these responses at all.
- `GET /api/v1/me` - **additive only**: still returns `firstName`/`lastInitial` (now documented as
  private to the owner, never shown to a peer) and gains a new `handle` field alongside them, so
  the app can read its own current handle without a dedicated endpoint.
- **New endpoint**: `POST /api/v1/me/handle/reroll` - rerolls the caller's own handle, excluding
  their current one where possible. Allowed once every 30 days; a second attempt inside the
  cooldown returns `429 RESEND_TOO_SOON` with `retryAfterSeconds`/`nextRerollAvailableAt` in the
  error `details`.
- Endpoint descriptions updated to describe the handle instead of "kid-safe display name (first
  name + last initial)": `GET /api/v1/users/{userId}/public-profile`, `GET /api/v1/arena/activity`,
  `GET /api/v1/arena/competitions/current/leaderboard`, `GET /api/v1/me/profile/overview`.

## 2026-10-11 — v1.6.0

Minor bump: purely additive, 0 new/removed operations, one new error response documented on 4
existing routes plus two updated endpoint descriptions, nothing changed incompatibly since
v1.5.0. From the 2026-10-11 full phase-audit's fix list, branch `audit-fixes`.

**Account deletion (`docs/ARCHITECTURE.md` D75)**
- `GET /api/v1/me`, `PATCH /api/v1/me`, `DELETE /api/v1/me`, `GET /api/v1/me/legal-status` — all
  four now document a new `403 ACCOUNT_DELETION_PENDING` response: "This account is being
  deleted." Returned by every authenticated endpoint once `DELETE /me` has been called, until
  account-deletion reconciliation finishes in the background (typically within seconds). The app
  should show a "your account is being deleted" screen and sign out - there's no path back from
  this state. See `docs/MOBILE_INTEGRATION.md`'s error-code table.
- `DELETE /api/v1/me` — description updated: this endpoint now returns success as soon as the
  deletion request is durably recorded, not once the deletion is fully complete - the deletion is
  guaranteed to finish (via a background Inngest job, idempotent and retried), it just may still
  be in progress when the response arrives. No change to the response shape (`{ deleted: true }`).

**Not a shape change, but worth recording here**: `GET /api/v1/me/current-lesson` (WH-06) is now
actually progress-aware - its description no longer says "placeholder." No change to the request/
response shape, only to what lesson is actually selected.

## 2026-10-11 — v1.5.0

Minor bump: purely additive, 0 new operations, 3 new fields on an existing response schema plus an
updated endpoint description, nothing removed and nothing changed incompatibly since v1.4.0.
Requested by the mobile app (finlamma-app) on branch `mobile-onboarding-state`.

**Onboarding/consent state (`docs/ARCHITECTURE.md` D73/D74 context)**
- `GET /api/v1/me` — now also returns `dobSet` (boolean), `isMinor` (boolean, null until `dobSet`
  is true), and `parentConsentStatus` (`not_required` | `not_requested` | `pending` | `consented` |
  `refused` | `withdrawn`). Lets the app recover which onboarding step an account is on after a
  restart, reinstall or new device without caching anything sensitive on the device. These three
  fields are derived from the exact same logic `requireFullAccess` uses to gate access (a single
  shared function, `getOnboardingConsentState` in `src/server/onboarding/service.ts`), so they can
  never disagree with what the app can actually do — including the moment an account turns 18,
  where both independently resolve to "not required" regardless of any earlier parent decision.
  Private to the signed-in caller only; confirmed (by a dedicated schema test) never to appear on
  any Arena/competition/leaderboard/public-profile/cheers response another learner can see.

## 2026-10-04 — v1.4.0

Minor bump: purely additive, 1 new operation, nothing removed and nothing changed incompatibly
since v1.3.0. Covers Phase 9 (Analytics & homepage). As with earlier phases, this endpoint was
already built and committed via ad-hoc `pnpm contract` runs across Phase 9's checkpoints and its
post-merge audit fix — this is the first changelog record of it and the first version bump since
v1.3.0 (the merge itself landed without `/publish-contract` being run; this entry closes that gap).

**Analytics (`docs/ARCHITECTURE.md` D69)**
- `POST /api/track` — public, unauthenticated homepage analytics beacon. Forwards a fixed, closed
  set of marketing-homepage events (`homepage_viewed`, `app_store_link_clicked`) to PostHog
  server-side; no client ever holds a PostHog key. Rate-limited per IP. A post-merge audit fix
  (2026-10-04) added a validation rule rejecting `platform` on any event other than
  `app_store_link_clicked` — a 400, not a shape change.

**Not a shape change, but worth recording here**: `POST /api/v1/me/legal/accept`'s behavior gained
a `signup_completed` analytics event fired on the caller's actual limited→full-access transition
(never on a routine re-accept) - no change to its request/response shape.

## 2026-10-04 — v1.3.0

Minor bump: purely additive, 2 new operations plus 2 new schemas, nothing removed and nothing
changed incompatibly since v1.2.0. Covers Phase 8 (Monetisation). As with earlier phases, these
endpoints were already built and committed via ad-hoc `pnpm contract` runs across Phase 8's
checkpoints — this is the first changelog record of them and the first version bump since v1.2.0.

**Entitlements & RevenueCat (`docs/ARCHITECTURE.md` D10, D66-D68)**
- `POST /api/webhooks/revenuecat` — RevenueCat's subscription webhook. Keeps the `entitlements`
  table (`ad_free` status) in sync with purchase/renewal/cancellation/expiration/billing-issue
  events. Accepts either of RevenueCat's two independently-configured auth mechanisms (HMAC
  signature or a plain shared Authorization header — whichever one is enabled in the dashboard),
  deduped by RevenueCat's own event id so a retried delivery is a no-op.
- `GET /api/v1/me/entitlements` — the caller's current entitlements, plus two policy flags: ads
  only show after the configured World position is cleared and there's no active `ad_free`
  entitlement; `nonPersonalizedAdsRequired` and `canSubscribe` are both `false`-for-permissive,
  `true`/`false`-fails-closed for anyone under 18 *or* with no date of birth on file at all — age
  unknown is always treated as the stricter case, never the looser one.

**Not a shape change, but worth recording here since it changed what this endpoint actually
does**: a `/phase-audit 8` review found the webhook originally had no age check at all before
granting an entitlement — contradicting the "server-side blocked for a known-minor account"
guarantee this phase was built to deliver. Fixed same day (see `docs/STATUS.md`'s 2026-10-04
entry and `docs/ARCHITECTURE.md` D68): the webhook and the daily reconciliation job both now
refuse to grant/extend an entitlement for a known-or-unknown-age minor, recording the attempt for
staff follow-up instead. The webhook's stored `entitlements.raw` is now an explicit allowlist
(event id/type/timestamp/store) rather than the full RevenueCat payload, and a genuinely
out-of-order event delivery is now detected and ignored rather than silently applied. None of this
changed the request/response shape beyond two new optional request fields
(`event_timestamp_ms`, `store`) that already existed in RevenueCat's real payload and are now
just explicitly documented.

## 2026-10-04 — v1.2.0

Minor bump: purely additive, 8 new operations plus one new documented response on an existing
endpoint, nothing removed and nothing changed incompatibly since v1.1.0. Covers Phase 7
(notifications & Doubt Zone). As with the v1.1.0 entry, these endpoints were already built and
committed to `openapi.json`/`docs/API_ENDPOINTS.md` via ad-hoc `pnpm contract` runs across Phase
7's checkpoints — this is the first changelog record of them, and the first version bump since.

**Doubt Zone (Checkpoints 1-5, `docs/ARCHITECTURE.md` D62-D64)**
- `POST /api/v1/doubt-zone/threads` — start or resume the caller's one open thread with a mentor.
  Every new thread opens with a fixed, three-language disclosure: this is an AI, not a person, it
  can't give investment advice, and a flagged message may be reviewed by the Finlamma team.
- `GET /api/v1/doubt-zone/threads/{id}/messages` — paginated message history for a thread the
  caller owns.
- `POST /api/v1/doubt-zone/threads/{id}/messages` — send a message; streams the reply back as
  NDJSON (`delta` lines, then one `done` line). A dedicated safety classifier runs before the
  learner's message ever reaches the reply model, biased toward false positives and failing
  closed (never defaults to "safe" if the classifier call itself fails). A flagged message's
  response is replaced with a fixed, `settings_kv`-sourced redirect (never model-generated, so
  a helpline number is never at the mercy of a live model call) and the message is queued for
  staff review; the full thread itself is never staff-browsable, only a flagged message is.
- `POST /api/v1/doubt-zone/threads/{id}/messages/{messageId}/report` — a learner can report a bad
  reply to their own message, which also routes it into the same staff moderation queue.

**Notifications (Checkpoints 6-7, D65)**
- `POST /api/v1/me/push-token`, `DELETE /api/v1/me/push-token` — register/unregister an Expo push
  token for the calling device. Re-registering a token already tied to a different account
  reassigns it rather than duplicating it.
- `GET`/`PATCH /api/v1/me/notification-prefs` — the caller's own notification settings: master
  enabled toggle, per-category opt-out, and an optional quiet-hours window (IST).
- `GET /api/v1/me/notifications` — the caller's in-app notification feed, cursor-paginated.
- `POST /api/v1/me/notifications/mark-read` — mark one or more (or, with no ids, all) of the
  caller's own notifications read.
- `GET /api/v1/me/notifications/unread-count` — badge count for the caller.

Six notification kinds (streak risk, boss battle available, market news, session goal reached,
cheer received, league rank change) all funnel through one dispatcher that enforces the prefs
above uniformly; quiet hours suppress only the push send, never the in-app feed row. No
notification title or body ever includes a balance, a rank-shaming comparison, or anything about
health/consent status.

**Existing endpoint, additive change only**
- `DELETE /api/v1/me/push-token` gained a documented `403 FORBIDDEN` response (onboarding/consent/
  legal acceptance incomplete) — the handler already enforced this via `requireFullAccess`, the
  contract just didn't document it until now.

Not yet in the contract: the staff moderation queue and flagged-message reveal endpoints are
admin-only Server Actions per D16, intentionally outside this contract.

## 2026-09-30 — v1.1.0

Minor bump: purely additive, 25 new operations plus new fields on 2 existing endpoints, nothing
removed and nothing changed incompatibly since v1.0.0. **This entry covers two full phases at
once** - Phase 5 (news & Pulse Check) and Phase 6 (Arena & the Monthly Competition) were both
built and their endpoints added to `openapi.json`/`docs/API_ENDPOINTS.md` via ad-hoc `pnpm
contract` runs bundled into their own feature commits, but neither ever went through
`/publish-contract` or got a changelog entry until now - so this is the first record of either
phase's endpoints existing, even though they've been live in the committed contract for a while.

**News (Phase 5 Checkpoints 1-3, `docs/ARCHITECTURE.md` D50)**
- `GET /api/v1/news/feed` — the published news feed, AI-drafted then staff-published, never raw
  AI output shown to a learner.
- `GET /api/v1/news/{id}` — one story's full detail.
- `POST /api/v1/news/{id}/read` — marks a story read; the server validates dwell time against a
  real minimum computed from the story's own word count, never trusting a client-reported value.
- `GET /api/v1/news/desk-picks` — staff-curated highlights, entirely separate from the AI pipeline.

**Pulse Check (Phase 5 Checkpoint 4, D51)**
- `GET /api/v1/pulse-check/current`, `POST /api/v1/pulse-check/start` — today's meta and
  start/resume an attempt.
- `POST /api/v1/pulse-check/{attemptId}/steps/{n}/serve`, `.../answer` — server-timed, idempotent
  question serving and grading, same no-answer-leak-before-grading design as lesson quizzes.
- `POST /api/v1/pulse-check/{attemptId}/finish` — finishes the attempt and credits V Money only
  (never XP), bounded by a daily cap after the global VM multiplier is applied once.
- `GET /api/v1/pulse-check/{attemptId}/result` — a finished attempt's result.

**Arena (Phase 6 Checkpoints 1-6, D52-D56/D60/D61)**
- `GET /api/v1/arena/leaderboard` — the weekly leaderboard for a scope (World/State/India/Global).
  Kid-safe fields only (first name + last initial, never a full name, email, DOB or state on
  anyone else's row). Each row reports `rank`, `xp`, `zone` (promote/safe visible on any row,
  demote visible only on the viewer's own row, D54) and `rankDelta` (this week's move vs. last
  week's settled rank, null when there's nothing to compare). A thin scope transparently falls
  back to a broader one, or reports `notEnoughPlayers`, per the privacy floor (D52) - a scope
  below the floor never settles or pays out, not just hides from display.
- `GET /api/v1/arena/worlds` — the Worlds leaderboard (weekly XP, member count, 7-day sparkline).
- `GET /api/v1/arena/worlds/{worldId}/leaderboard` — one world's own leaderboard, same shape.
- `GET /api/v1/arena/activity` — a live-feeling recent-activity ticker.
- `POST /api/v1/arena/cheers`, `GET /api/v1/me/arena/cheers` — send a cheer (+XP, one per
  recipient per sender per day, a daily cap and a weekly per-sender-receiver cap, both enforced
  server-side under a row lock so concurrent cheers from different senders can never push a
  receiver's daily total past the cap - D53/D56/D61) and see your own aggregate weekly count
  (sender identity never shown to the receiver).
- `GET /api/v1/arena/chips`, `GET`/`PUT /api/v1/me/arena/chips` — the admin-managed "about me"
  chip catalog and a learner's own selection (capped at 3) - preset chips only, never free text.
- `GET /api/v1/users/{userId}/public-profile` — a learner's public Arena profile: name, level,
  rank title, badges, chips, week XP, streak, quiz accuracy, current world progress. No trading
  performance figure is shown here by design, not omission - a minor's ROI on a page other
  learners can open would invite unhealthy skill comparison rather than learning.

**Monthly Competition (Phase 6 Checkpoint 7, D57-D59)**
- `GET /api/v1/arena/competitions/current` — the current competition's metadata, virtual capital
  (a non-convertible sandbox balance, never V Money), prize bands and rules.
- `POST /api/v1/arena/competitions/current/enter` — enter it, seeded with the competition's own
  virtual capital.
- `POST /api/v1/arena/competitions/current/trades` — place a MARKET trade inside it. Same
  Idempotency-Key/no-client-price/rate-limit rules as a real stock order, but against an isolated
  sandbox table pair that never touches `vmoney_ledger` - only the prize at settlement ever
  creates real VM, and that's regression-tested directly against the database.
- `GET /api/v1/arena/competitions/current/me` — the caller's live rank/ROI in the competition.
- `GET /api/v1/arena/competitions/current/leaderboard` — the competition's ranked board, ROI%
  computed against the full starting capital (not just deployed capital), same kid-safe fields.

**Existing endpoints, additive changes only**
- `GET /api/v1/me/profile/overview` — gained `percentile` and `rankDeltaCells` (World /
  State-or-India / Global), read from the last weekly settlement; each cell is cleanly omitted
  (never a fabricated 0) when the scope never settled or the learner had no rank that week.
- `GET /api/v1/me/report-card` — gained `globalRank`, same settlement-backed source and the same
  clean-omission rule.

Not yet in the contract: Arena's admin-only endpoints (league settings, competition management)
are Server Actions per D16, intentionally outside this contract. Row expansion on the Players
ladder and the Competition leaderboard (best trade, win rate, avg hold time, quiz accuracy per
row) is a documented fast-follow, not built yet.

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
