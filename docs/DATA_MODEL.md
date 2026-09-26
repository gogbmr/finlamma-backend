# Data model (starting point — refine in each phase)

All tables: `id` (uuid v7 or bigserial), `created_at`, `updated_at` (timestamptz, UTC).
Money columns are `bigint` integers. Translatable text uses a `jsonb` `{ en, hi, hx }`.

**Identity & staff**
- `users` — clerk_user_id (unique), first_name, last_initial (nullable until onboarding),
  email, phone (both nullable/unique - Clerk allows email, phone, Google, Apple or username
  sign-in, so a user may have either, both, or briefly neither), date_of_birth (collected once at
  onboarding, drives the parental-consent gate below — **set-once from the app**: the user can
  never change their own date of birth again; only staff can correct it, with a required reason,
  logged via `activity_logs`), state (nullable, optional, shown with an explanation at collection
  time, used only for the Arena state leaderboard scope, never exposed on any public profile),
  language, theme, bio (text, nullable — **D36, `docs/ARCHITECTURE.md`: private to the owner
  forever, never rendered to any other learner, including Arena's Phase 6 public player profile**),
  preferences jsonb (sound, haptics, data_saver — small
  booleans, same jsonb pattern as translatable text), clerk_updated_at (Clerk's own updated_at for
  the last change we applied, so the webhook can ignore stale/out-of-order redeliveries),
  deleted_at. On `user.deleted` from Clerk, the row is soft-deleted and anonymized in place
  (personal fields cleared) rather than removed, so ledger/trading/leaderboard history stays
  intact. **Not added in Phase 3, despite this section's original plan**: `level` and `total_xp`
  are never stored columns — level is always derived from `xp_events`/`vmoney_ledger` sums at
  read time (`src/server/leveling`, Phase 3 Checkpoint 5), so it re-derives instantly if the
  level curve settings change, with no backfill. `current_world_id` was likewise never needed —
  "current lesson" (`GET /api/v1/me/current-lesson`, Phase 2b) is derived from `lesson_progress`,
  not a stored pointer on `users`.
- `staff_members` — clerk_user_id (own Clerk application, separate from the consumer app's
  `users` - staff never has a row in `users`), role_id, active
- `roles`, `permissions` (key like `quiz.create`), `role_permissions`
- `activity_logs` — actor_type (user|staff|system), actor_id, action, target_type, target_id,
  metadata jsonb, ip, user_agent, created_at. Append-only; partition by month later.

**Compliance (parental consent & legal documents) — real, v1 scope, see PRODUCT_SPEC.md's
Onboarding & parental consent section, decided at Phase 2a kickoff**
- `parent_contacts` (user_id, name, email, verified_at, weekly_report_opt_in,
  weekly_report_unsubscribe_token_hash) — **email only in v1, no phone.** The email cannot equal
  the child's own `users.email`; one parent email can back at most
  `settings_kv.parent_email_max_children` (default 5) different `user_id`s, to limit one inbox
  farming consent for many accounts. `weekly_report_opt_in` (Phase 3b, default false) is the
  parent's separate opt-in for the weekly report-card email (D33/D35, `docs/ARCHITECTURE.md`) —
  settable only from the parent-facing consent/reapproval pages, additive-only on reapprove, always
  cleared by declining or withdrawing consent. `weekly_report_unsubscribe_token_hash` backs a
  separate, never-expiring, idempotent link (every weekly email carries it alongside the required
  withdraw-consent link) that clears only this opt-in, never `consent_records`.
- `consent_records` (user_id, parent_contact_id, method email_link — the only method in v1, kept
  as an enum for a future SMS method rather than hardcoded, status
  pending|consented|refused|withdrawn, legal_document_versions, token_hash, token_expires_at,
  used_at, withdraw_token_hash, acted_at, last_requested_at, request_count, request_count_date,
  parent_email_hmac) — token is single-use (rejected on a second `used_at`), stored **hashed**,
  valid **7 days**. Resending is rate-limited **in the DB, no Redis yet**: `last_requested_at`
  backs a 60s cooldown, `request_count`/`request_count_date` back a daily cap
  (`settings_kv.consent_resend_daily_cap`) that resets on a new UTC day; the same cap applies
  per `user_id` and, summed across every user sharing one parent email, per parent email too
  (both caps exclude deleted accounts). `withdraw_token_hash` is a **separate**, longer-lived
  token included in every email sent to an already-verified parent; withdrawing sets status
  `withdrawn` and immediately drops the account back to limited access. A minor (under 18 by
  `users.date_of_birth`) has limited app access until status is `consented` **and** a matching
  self-acceptance exists in `legal_acceptances` (see below) — parent consent alone is not
  enough. `parent_email_hmac` is set only at account-deletion time (see below) - null otherwise.
- `legal_documents` (type terms|privacy|risk_disclosure, version, content jsonb {en,hi,hx},
  status draft|published, published_by staff_id, published_at, is_placeholder,
  requires_parent_reapproval) — only `super_admin` publishes (permission `legal.manage`). **v1
  seeds placeholder documents (`is_placeholder = true`) clearly marked DRAFT**; real text is
  written after the outside legal review in `docs/ROADMAP.md`'s pre-launch checklist, and
  published as a version with `is_placeholder = false`. `requires_parent_reapproval` is staff's
  explicit choice at publish time (no default, forced `false` for a placeholder regardless of
  what's passed) — `true` means every already-consented minor's parent must re-approve this
  specific version (see `legal_reapproval_requests` below) before `requireFullAccess` passes
  again for that minor.
- `legal_acceptances` (user_id, legal_document_id, accepted_by self|parent, accepted_at) — a new
  published version prompts re-acceptance from anyone who hasn't accepted it yet. For a minor,
  **both** an `accepted_by: 'parent'` row (written when the parent presses "I consent" on the
  public consent page, or re-approves a later material change) **and** an `accepted_by: 'self'`
  row (the minor's own in-app "I accept", done once, after parent consent) are required before
  `requireFullAccess` passes; an adult only ever needs the `self` row.
- `legal_reapproval_requests` (user_id, legal_document_id, parent_contact_id, status
  pending|approved|declined, token_hash, token_expires_at, used_at, acted_at, actor_ip,
  actor_user_agent, last_requested_at, request_count, request_count_date) — one row per (minor,
  specific new `legal_documents` version that needs re-approval), created when staff publish a
  version with `requires_parent_reapproval = true`, for every already-consented, non-deleted
  minor. Unique on `(user_id, legal_document_id)`. Deliberately separate from `consent_records`
  (the one-time blanket "may this minor use Finlamma at all" consent, one row per user) — a minor
  can accumulate several re-approval rows over time as documents change, and approving/declining
  one never touches the others. Same single-use/hashed-token/7-day-expiry/rate-limited-resend
  shape as `consent_records`' original request/confirm flow. Approving writes a fresh
  `legal_acceptances` row and folds the version into `consent_records.legal_document_versions`;
  declining flips `consent_records.status` to `refused` (the parent's *entire* original consent
  is revoked, not just this one document) — both the status flip on this table and the follow-up
  write happen in one transaction, so a crash mid-request can't burn the token without actually
  recording the outcome.
- Staff access to this data is itself audited: the `consent.view` permission (read-only, granted
  to `user_manager`) lets staff see consent/legal-acceptance status without being able to bypass
  it, and every view of a parent's contact details is written to `activity_logs`. Deleted accounts
  are hidden from the admin review view by default and never staff-revealable, even if shown via
  the "show deleted" filter.
- **Account deletion scrub** (`scrubConsentDataForDeletedUser`, called from both self-deletion and
  the Clerk `user.deleted` webhook): `users.date_of_birth` is cleared; `consent_records` itself is
  **kept** as durable proof of consent (status, timestamps, accepted legal-document versions), but
  `parent_email_hmac` (HMAC-SHA256 of the normalized parent email, keyed by `CONSENT_PII_HMAC_KEY`)
  is stored so "was it this parent email?" stays verifiable without retaining the raw address; the
  `parent_contacts` row's name/email are anonymized in place **only if no other non-deleted
  account currently shares that parent email** (a still-active sibling's own separate row already
  holds the same information, so erasing this one would achieve nothing) - the row itself is never
  deleted, since `consent_records.parent_contact_id` (`onDelete: cascade`) would take the
  consent_records row down with it. The scrub is itself logged (`consent.data_scrubbed_on_deletion`,
  no PII in the log).

**Learning**
- `worlds` (order, title, theme — a staff-chosen, validated hex color, not an enum of fixed
  themes, display_xp_target — cosmetic progress indicator only; the real unlock rule is
  sequential (see `lesson_progress`: the previous world's Boss Quiz is complete), not an
  XP/level gate). Fully data-driven and unbounded (D25, `docs/ARCHITECTURE.md`) — no fixed
  world count anywhere in code; `mentor_id` is the only link to a mentor (a real FK, never a
  computed range). `lessons` (world_id, order, kind, content jsonb, status). Boss Quiz and
  Role Play are `lessons.kind` values, not separate tables or engines — both render through the
  same lesson-flow content shape as a Quiz step, with different settings.
- `quizzes` (lesson_id or news_edition_id, settings), `questions` (quiz_id, format, payload jsonb,
  answer jsonb). **Single source of truth: every question — including an in-video pop-quiz's —
  is a row in `questions`, never inlined into `lessons.content`.** A video lesson's `content` cues
  reference the question by id/order at a timestamp (presentation/timing only); the question's
  actual prompt, options and correct answer live only in `questions`. Text fields inside
  `questions.payload` are leaf-localized `{en,hi,hx}`; `questions.answer` (the correct index/value)
  is language-independent — one shared answer per question, not one per language. A learner-facing
  response never includes `questions.answer` or its explanation text until that specific question
  has been graded server-side (see `docs/ARCHITECTURE.md` D17 and Phase 2b's answer-leakage tests).
- `lesson_progress` (user_id, lesson_id, status `in_progress`|`completed`, started_at, completed_at)
  — one row per (user, lesson). For a graded kind (video/quiz/boss_quiz/role_play), it's written
  entirely as a byproduct of the quiz-attempts flow below (`serveStep` starts it, `submitAnswer`
  completes it). For Story/Doubt Zone — which have no graded questions at all — `POST
  /api/v1/lessons/{id}/serve` and `.../complete` (Phase 3 Checkpoint 3, closing D23's original
  gap) write it directly: `serve` stamps `started_at` server-side (the anti-farming anchor
  `complete` measures elapsed time from, never a client-reported duration), and `complete` only
  succeeds once `settings_kv.lesson_flow_scoring.storyMinCompletionSeconds`/
  `doubtZoneMinCompletionSeconds` have genuinely elapsed since then — see `docs/ARCHITECTURE.md`
  D29. Drives the admin unpublish-warning (in-progress learner counts) — see D23. World unlock
  itself is judged on `quiz_attempts.accuracy_pct` (below), not this table — see D24.
- `quiz_attempts` (user_id, lesson_id, attempt_number, is_first_pass, status `in_progress`|
  `completed`, started_at, completed_at, total_xp_preview, accuracy_pct — correct steps / total
  steps, 0-100, computed once at completion; a Boss Quiz's pass/fail is judged against this vs.
  the admin-editable `settings_kv.lesson_flow_scoring.bossQuizPassMarkPct`, default 60% — see
  `docs/ARCHITECTURE.md` D24) and `question_answers` (attempt_id,
  question_id, step_index, served_at, timer_seconds, served_revision — the exact `questions`
  revision served, captured at serve time, never re-derived — answered_at, submitted_answer,
  is_correct, timed_out, speed_bonus_awarded, fever_active, xp_awarded_preview, combo_after) —
  Checkpoint 5b's server-timed, idempotent quiz answering; see `docs/ARCHITECTURE.md` D21 for the
  full anti-cheat design
- `question_revisions` (question_id, revision, prompt, explanation, payload, answer) — a full
  content snapshot written every time a question's live content changes (every publish and every
  D20 hotfix), never on a draft edit. This is what makes `question_answers.served_revision`
  actually recoverable, and what grading reads instead of the live `questions` row, so a hotfix
  landing between serve and answer never affects an in-flight answer — see `docs/ARCHITECTURE.md`
  D22.
- `certificates` (user_id, world_id, code, file_key) — PDFs are rendered server-side with a
  browser-free library (e.g. `@react-pdf/renderer`, not a headless browser — Vercel-compatible)
  and stored via `src/lib/s3.ts`; sharing is a signed URL the student sends themselves, never a
  message sent on their behalf

**Economy** (Phase 3 Checkpoint 2 — built; see `docs/ARCHITECTURE.md` D26 and the `money-ledger`
skill for the full idempotency/reversal design)
- `xp_events` (user_id, amount, source_type, source_id, rule_id → `reward_rules.id` nullable,
  reason) — append-only, no update/delete path anywhere in the codebase (same convention as
  `activity_logs`). Unique index on `(user_id, source_type, source_id)` is the idempotency
  mechanism: a crediting insert conflicts (no-ops) if this exact `(user, source)` was already
  credited. `rule_id` is null for a non-rule-based entry (a reversal, or a future manual
  adjustment).
- `vmoney_ledger` — same shape as `xp_events` plus `multiplier_applied` (the
  `vm_issuance_multiplier` in effect when this entry was written, so a balance stays explainable
  even after the multiplier later changes). `amount` is `bigint({ mode: "number" })` per CLAUDE.md
  rule 2 (`xp_events.amount` is a plain `integer` — XP isn't money). A reversal is a new row with
  a negative amount and its own distinct `source_type`/`source_id` (e.g. `source_type:
  "reversal"`, `source_id: <original row's id>`) — never an UPDATE/DELETE of the original, and
  never reusing the original's `(source_type, source_id)`, which would collide with its own
  unique index.
- `reward_rules` (activity_kind — video|story|ai_chat|role_play|quiz|boss_quiz, unique —
  default_xp, default_vm, active) — admin-editable (`/admin/settings`, `economy.manage`); XP and
  VM are earned independently (no conversion rate between them), seeded from
  `docs/ECONOMY.md`'s decided 3× values (`pnpm seed:reward-rules`). `lessons.xp_override`/
  `vm_override` (nullable integer columns, null = use the kind's `reward_rules` default) let an
  individual lesson pay a different amount — no admin UI for setting them yet, see D26. Already
  trusted unconditionally by `creditLessonCompletion` (`src/server/economy/service.ts`) once set,
  so whoever builds that editor must route it through the same bounds-checked, staff-only pattern
  `RewardRuleUpdateSchema` already uses (`MAX_REWARD_AMOUNT` = 5000, `economy.manage`-gated,
  logged) — see the `admin-page` skill's note on this.
  `activity_kind` names differ from `lessons.kind` in one place ("ai_chat" here is the
  "doubt_zone" lesson kind) — `src/server/economy/service.ts`'s `activityKindForLessonKind` maps
  between them. Crediting happens once per user per lesson, on the first *successful* completion
  (`docs/ECONOMY.md` decision 4 defines "successful" per lesson kind) — wired into
  `quiz-attempts/service.ts`'s attempt-completion path for video/quiz/role_play/boss_quiz;
  story/doubt_zone credit from Checkpoint 3's own completion endpoint (no `quiz_attempts` row
  exists for those kinds, D23).
- `streaks` (Phase 3 Checkpoint 4 — built; unique on (user_id, scope)) — user_id, scope
  `learning`|`pulse_check` (two independent habit loops, same shape; `pulse_check` rows don't
  exist until Phase 5's Pulse Check triggers one), current, longest, last_active_date_ist (a bare
  `date`, already an IST calendar date computed server-side by `src/lib/ist-date.ts` before it
  reaches this column — never re-derived from a stored timestamp), freezes_left, freezes_reset_month
  (`YYYY-MM` IST — the freeze allowance's lazy monthly reset point). See `docs/ARCHITECTURE.md` D30
  for the day-boundary/freeze/idempotency design and `docs/ECONOMY.md` decision 5 for exactly which
  events extend the `learning` streak. A learner's displayed streak is also re-checked at *read*
  time (not just at the next write) against today's IST date, so a long-silent learner doesn't see
  a stale, already-broken streak number until their next activity happens to recompute it.
- `rank_titles` (Phase 3 Checkpoint 5 — built; unique on min_level) — min_level (integer),
  title jsonb `{en,hi,hx}`. Admin-editable (`/admin/settings`, `settings.manage`) — no `order`
  column, since `min_level` itself is the ladder's order. A learner's displayed rank title
  (Profile Overview, PR-01) is the row with the highest `min_level` still ≤ their derived level;
  `null` (no title shown) if the table is empty or every row's `min_level` is above their level.
- `session_time_daily` (Phase 3b Checkpoint 4 — built; unique on (user_id, date_ist)) — user_id,
  date_ist (a bare `date`, IST calendar day, same pattern as `streaks.last_active_date_ist`),
  seconds (upsert-incremented per client-reported session-end ping, capped at 3600/day). Low-stakes,
  never reward-bearing on its own — backs the daily goal meter's `study_minutes` type
  (`src/server/daily-goals/evaluators.ts`) and Profile's "today's study time" quick stat (PR-04).
- `badges`, `user_badges`
- `rewards` (name, category `finlamma`|`brand_partner` — v1 launches with `finlamma` only:
  badges/titles/cosmetic themes, no coupons, no fictional brands — price_vm **fixed, admin-set**,
  never computed from the viewing user's own balance), `reward_claims`
- `mentors` (order, name, bio jsonb {en,hi,hx}, persona — free-text voice/tone notes for the
  Doubt Zone AI chat, art_key) — admin-editable content type, fully data-driven and unbounded
  (D25, `docs/ARCHITECTURE.md`). No world-range column: which world(s) a mentor covers lives
  entirely on `worlds.mentor_id`, so one mentor can cover any number of worlds
- `settings_kv` (generic key/value store, introduced in Phase 2a for
  `parent_email_max_children` default 5 and `consent_resend_daily_cap` — see Compliance above;
  e.g. `vm_issuance_multiplier` default 1.0, `lesson_flow_scoring.tradingUnlockAfterWorldPosition`
  default 3 (position, not a world id/name — D25, `docs/ARCHITECTURE.md`)
  — see Trading below; scoring constants `speed_bonus_threshold_pct` = 45,
  `fever_combo_threshold` = 3, `fever_multiplier` = 2.0, `combo_bonus_per_step`, `speed_bonus_xp`,
  `all_correct_bonus_vm` — all admin-editable, seeded from the prototype's exact values;
  `level_curve` — `{baseXp: 300, stepXp: 100}` (Phase 3 Checkpoint 5) — XP to advance from level L
  to L+1 = baseXp + stepXp×(L−1); admin-editable, `src/server/leveling`)

**Reporting**
- `report_snapshots` (user_id, week_start_date IST, efficiency_score 0-100, sub_metrics jsonb
  {retention, watchSpeed, quizAccuracy, consistency}, module_breakdown jsonb, topic_mastery jsonb,
  strength_note_id, gap_note_id, opportunity_note_id, habit_note_id) — written by a weekly Inngest
  job; powers Profile's report card and 8-week trend
- `coach_note_templates` (category strength|gap|opportunity|habit, template jsonb {en,hi,hx} with
  placeholders, status draft|published) — admin-editable, no AI in v1

**Trading** (Phase 4 Checkpoint 1 — `instruments`/`market_holidays`/`market_controls` built)
- `instruments` (symbol, exchange, name, sector, about jsonb, tip jsonb {en,hi,hx}, tags text[],
  mcap, pe, lot_size, active, halted) — `about`/`tip`/`mcap`/`pe` are all admin-curated static
  text/figures (`docs/FEATURE_MAP.md` Gaps → Trade #5/#8), never live-fetched; live OHLC/volume/LTP
  come from Twelve Data at request time (Checkpoint 2), never stored here. `tip` must stay purely
  educational (what the company does / a finance concept it illustrates) — never phrased as a
  buy/sell signal, per CLAUDE.md's "never investment advice" rule. Order pad access is gated by
  `settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition` (default: the 3rd published
  world, by position - never a specific world id/name, D25 `docs/ARCHITECTURE.md`) -
  `src/server/worlds/service.ts`'s `isTradingUnlocked()` implements the check now, ready for
  Phase 4's trading domain to call; quotes/charts/watchlist stay visible to everyone regardless
  ("explore mode"); no starting balance or unlock grant is ever issued (see `docs/ECONOMY.md`).
  Orders are whole-share only. No
  per-user watchlist table — "Watchlist" in the app is simply the full active `instruments` list
  (matches the prototype, which has no add/remove control).
- `instrument_daily_bars` (instrument_id, date, open/high/low/close/volume, all paise) — daily
  candle history for chart timeframes beyond what the relay's Redis cache retains; today's/live
  candle still comes from Redis per ARCHITECTURE.md. NIFTY 50 / BANK NIFTY / SENSEX indices reuse
  the same Twelve Data source and caching, no separate table.
- `market_holidays` (date, name) — the NSE trading holiday calendar, admin-editable.
  `market_controls` (id, feed_mode live\|delayed_15m\|paused, global_halt) — a single singleton
  row (`id = 'singleton'`), not per-symbol (that's `instruments.halted`); the Ops console's global
  feed-mode/halt switch. **No volatility control.** When the market is closed, every screen shows
  the last real close; nothing ever simulates price movement near a real trade.
- `orders` (user_id, instrument_id, side, type, qty, limit_price_paise, status, fill_price_paise,
  realized_pnl_paise — SELL fills only, D43, idempotency_key, filled_at, cancelled_at). No
  `reject_reason`/"rejected" status by design (D41) — a rejected order is a thrown error with zero
  DB write, never a persisted row.
- `holdings` (user_id, instrument_id, qty, avg_price_paise, position_opened_at — reset on a 0→positive
  re-entry, D43, powers the Trades tab's hold-days stat)
- `funds` (name — always a fictional Finlamma-branded name, never a real AMC's fund name, D45;
  category, risk, description jsonb, amfi_scheme_code — internal-only, never in any API response,
  expense_ratio_bps — illustrative/category-typical, not the real scheme's own rate,
  min_lump_sum_paise, min_sip_paise — tiered: ₹100 index / ₹500 other, admin-editable, active). No
  star_rating, no aum (dropped per D45 — a third-party opinion and an identifying claim about a
  real company, neither honestly attachable to a fictional wrapper).
- `fund_navs` (fund_id, date, nav_paise — real AMFI NAV rounded to the nearest paise, append-only,
  unique on (fund_id, date), D45/D46)
- `fund_holdings` (user_id, fund_id, units_milli — units × 1000 for fractional-unit precision, D45,
  avg_nav_paise)
- `fund_orders` (user_id, fund_id, side, status — filled/failed, no "open"/"cancelled" (no LIMIT
  concept for a once-a-day NAV), amount_paise, units_milli, nav_paise, nav_date — always shown back,
  no hidden pricing, realized_pnl_paise, idempotency_key, sip_plan_id + due_date — unique together,
  the SIP idempotency mechanism, D46, failure_reason — SIP-triggered failures only)
- `sip_plans` (user_id, fund_id, amount_paise, day_of_month — 1-28 only, status — active/paused/
  cancelled, paused_at, cancelled_at)
- `competitions` (name, instrument_id, virtual_capital_vm, window_start, window_end, prizes jsonb
  — V Money / badge / coupon only, **never real currency**, admin-set per competition — and rules
  jsonb), `competition_entries`/`competition_trades` (isolated from the user's main paper-trading
  portfolio)

**News**
- `news_raw` (source, external_id, url, headline, summary, published_at, payload)
- `news_stories` (raw_id, category, topic — fixed admin-extensible enum: RBI & Rates, Inflation,
  Stock Market Basics, IPOs & New Listings, Mutual Funds, Banking, Scams & Fraud, Government &
  Budget, Global Markets, Currency — tag good|bad|neutral, content jsonb {en,hi,hx}, jargon jsonb,
  quality_grade A|B|C (auto-heuristic, staff-overridable), status)
- `news_editions` (date, published), `bookmarks`
- `news_reads` (user_id, story_id, read_at, dwell_seconds) — backs the "read" badge and any
  read-gating on Pulse Check
- `news_desk_picks` (kind desk_pick|exam_alert|scam_watch, story_id or standalone content jsonb,
  attribution `by`, status) — staff-curated highlights shown separately from the algorithmic feed

**Social & notifications**
- `leaderboard_snapshots` (week, scope, rankings jsonb), `leagues`, `league_members`
- `cheers` (sender_id, receiver_id, created_at, unique on (sender_id, receiver_id, date) — one
  cheer per recipient per sender per day; XP awarded is also capped per receiver per day via
  `settings_kv.cheer_daily_xp_cap`; un-cheer/re-cheer never re-awards XP)
- `push_tokens`, `notification_prefs`, `notifications`
- `doubt_threads`, `doubt_messages` — Phase 7's live AI mentor; the in-lesson "Doubt Zone" node in
  Phase 2b is scripted content (`lessons.content`), not these tables (see PRODUCT_SPEC.md §1)

**Monetisation**
- `entitlements` (user_id, entitlement, source revenuecat|razorpay, expires_at, raw)
