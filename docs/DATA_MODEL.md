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
  language, theme, bio (text, nullable), preferences jsonb (sound, haptics, data_saver — small
  booleans, same jsonb pattern as translatable text), clerk_updated_at (Clerk's own updated_at for
  the last change we applied, so the webhook can ignore stale/out-of-order redeliveries),
  deleted_at. On `user.deleted` from Clerk, the row is soft-deleted and anonymized in place
  (personal fields cleared) rather than removed, so ledger/trading/leaderboard history stays
  intact. `level`, `total_xp`, `current_world_id` are added in Phase 3 (progress economy) once
  `worlds` exists.
- `staff_members` — clerk_user_id (own Clerk application, separate from the consumer app's
  `users` - staff never has a row in `users`), role_id, active
- `roles`, `permissions` (key like `quiz.create`), `role_permissions`
- `activity_logs` — actor_type (user|staff|system), actor_id, action, target_type, target_id,
  metadata jsonb, ip, user_agent, created_at. Append-only; partition by month later.

**Compliance (parental consent & legal documents) — real, v1 scope, see PRODUCT_SPEC.md's
Onboarding & parental consent section, decided at Phase 2a kickoff**
- `parent_contacts` (user_id, name, email, verified_at) — **email only in v1, no phone.** The
  email cannot equal the child's own `users.email`; one parent email can back at most
  `settings_kv.parent_email_max_children` (default 5) different `user_id`s, to limit one inbox
  farming consent for many accounts.
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
- `worlds` (order, title, theme, display_xp_target — cosmetic progress indicator only; the real
  unlock rule is sequential (see `lesson_progress`: the previous world's Boss Quiz is complete),
  not an XP/level gate), `lessons` (world_id, order, kind, content jsonb, status). Boss Quiz and
  Role Play are `lessons.kind` values, not separate tables or engines — both render through the
  same lesson-flow content shape as a Quiz step, with different settings.
- `quizzes` (lesson_id or news_edition_id, settings), `questions` (quiz_id, format, payload jsonb, answer jsonb)
- `lesson_progress`, `quiz_attempts`, `question_answers`
- `certificates` (user_id, world_id, code, file_key) — PDFs are rendered server-side with a
  browser-free library (e.g. `@react-pdf/renderer`, not a headless browser — Vercel-compatible)
  and stored via `src/lib/s3.ts`; sharing is a signed URL the student sends themselves, never a
  message sent on their behalf

**Economy**
- `xp_events` (user_id, source, amount, ref)
- `vmoney_ledger` (user_id, amount (+/-), reason, ref_type, ref_id, idempotency_key,
  multiplier_applied — the `vm_issuance_multiplier` in effect when this entry was written, so a
  balance stays explainable even after the multiplier later changes)
- `reward_rules` (activity_kind — video|story|ai_chat|role_play|quiz|boss_quiz|pulse_check|..,
  default_xp, default_vm, active) — admin-editable; XP and VM are earned independently (no
  conversion rate between them), and an individual lesson/quiz's content can override its kind's
  default. See `docs/ECONOMY.md` for the seeded starting values and the simulation behind them.
- `streaks` (user_id, scope `learning`|`pulse_check` — two independent habit loops, same shape,
  current, longest, last_active_date_ist, freezes_left, freezes_reset_on)
- `badges`, `user_badges`
- `rewards` (name, category `finlamma`|`brand_partner` — v1 launches with `finlamma` only:
  badges/titles/cosmetic themes, no coupons, no fictional brands — price_vm **fixed, admin-set**,
  never computed from the viewing user's own balance), `reward_claims`
- `mentors` (order, name, bio jsonb {en,hi,hx}, world_range, art_key) — admin-editable content
  type (not hardcoded in the app)
- `settings_kv` (generic key/value store, introduced in Phase 2a for
  `parent_email_max_children` default 5 and `consent_resend_daily_cap` — see Compliance above;
  e.g. `vm_issuance_multiplier` default 1.0, `trade_unlock_world_order` default 4
  — see Trading below; scoring constants `speed_bonus_threshold_pct` = 45,
  `fever_combo_threshold` = 3, `fever_multiplier` = 2.0, `combo_bonus_per_step`, `speed_bonus_xp`,
  `all_correct_bonus_vm` — all admin-editable, seeded from the prototype's exact values)

**Reporting**
- `report_snapshots` (user_id, week_start_date IST, efficiency_score 0-100, sub_metrics jsonb
  {retention, watchSpeed, quizAccuracy, consistency}, module_breakdown jsonb, topic_mastery jsonb,
  strength_note_id, gap_note_id, opportunity_note_id, habit_note_id) — written by a weekly Inngest
  job; powers Profile's report card and 8-week trend
- `coach_note_templates` (category strength|gap|opportunity|habit, template jsonb {en,hi,hx} with
  placeholders, status draft|published) — admin-editable, no AI in v1

**Trading**
- `instruments` (symbol, exchange, name, sector, about jsonb, tip jsonb {en,hi,hx}, tags text[],
  mcap, pe, lot_size, active, halted). Order pad access is gated by
  `settings_kv.trade_unlock_world_order` (default: Market Maidan, world order 4) —
  quotes/charts/watchlist stay visible to everyone regardless ("explore mode"); no starting
  balance or unlock grant is ever issued (see `docs/ECONOMY.md`). Orders are whole-share only. No
  per-user watchlist table — "Watchlist" in the app is simply the full active `instruments` list
  (matches the prototype, which has no add/remove control).
- `instrument_daily_bars` (instrument_id, date, open/high/low/close/volume, all paise) — daily
  candle history for chart timeframes beyond what the relay's Redis cache retains; today's/live
  candle still comes from Redis per ARCHITECTURE.md. NIFTY 50 / BANK NIFTY / SENSEX indices reuse
  the same Twelve Data source and caching, no separate table.
- `market_holidays` (date, name), `market_controls` (feed_mode, global_halt) — **no volatility
  control.** When the market is closed, every screen shows the last real close; nothing ever
  simulates price movement near a real trade.
- `orders` (user_id, instrument_id, side, type, qty, limit_price_paise, status, fill_price_paise,
  reject_reason, idempotency_key, filled_at)
- `holdings` (user_id, instrument_id, qty, avg_price_paise)
- `funds` (name, category, risk, nav, aum, expense_ratio, min_sip_paise — tiered: ₹100 for index
  funds, ₹500 for equity/hybrid/debt/ELSS, return_1y/3y/5y, star_rating, description jsonb),
  `fund_navs`, `sip_plans`, `fund_holdings`
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
