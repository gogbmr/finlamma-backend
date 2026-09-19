# Data model (starting point — refine in each phase)

All tables: `id` (uuid v7 or bigserial), `created_at`, `updated_at` (timestamptz, UTC).
Money columns are `bigint` integers. Translatable text uses a `jsonb` `{ en, hi, hx }`.

**Identity & staff**
- `users` — clerk_user_id (unique), first_name, last_initial (nullable until onboarding),
  email, phone (both nullable/unique - Clerk allows email, phone, Google, Apple or username
  sign-in, so a user may have either, both, or briefly neither), language, theme,
  clerk_updated_at (Clerk's own updated_at for the last change we applied, so the webhook can
  ignore stale/out-of-order redeliveries), deleted_at. On `user.deleted` from Clerk, the row is
  soft-deleted and anonymized in place (personal fields cleared) rather than removed, so ledger/
  trading/leaderboard history stays intact. `level`, `total_xp`, `current_world_id` are added in
  Phase 3 (progress economy) once `worlds` exists.
- `staff_members` — clerk_user_id (own Clerk application, separate from the consumer app's
  `users` - staff never has a row in `users`), role_id, active
- `roles`, `permissions` (key like `quiz.create`), `role_permissions`
- `activity_logs` — actor_type (user|staff|system), actor_id, action, target_type, target_id,
  metadata jsonb, ip, user_agent, created_at. Append-only; partition by month later.

**Learning**
- `worlds` (order, title, unlock_xp, theme), `lessons` (world_id, order, kind, content jsonb, status)
- `quizzes` (lesson_id or news_edition_id, settings), `questions` (quiz_id, format, payload jsonb, answer jsonb)
- `lesson_progress`, `quiz_attempts`, `question_answers`
- `certificates` (user_id, world_id, code, file_key)

**Economy**
- `xp_events` (user_id, source, amount, ref)
- `vmoney_ledger` (user_id, amount (+/-), reason, ref_type, ref_id, idempotency_key,
  multiplier_applied — the `vm_issuance_multiplier` in effect when this entry was written, so a
  balance stays explainable even after the multiplier later changes)
- `reward_rules` (activity_kind — video|story|ai_chat|role_play|quiz|boss_quiz|pulse_check|..,
  default_xp, default_vm, active) — admin-editable; XP and VM are earned independently (no
  conversion rate between them), and an individual lesson/quiz's content can override its kind's
  default. See `docs/ECONOMY.md` for the seeded starting values and the simulation behind them.
- `streaks` (user_id, current, longest, last_active_date_ist, freezes_left, freezes_reset_on)
- `badges`, `user_badges`, `rewards`, `reward_claims`
- `mentors` (order, name, bio jsonb {en,hi,hx}, world_range, art_key) — admin-editable content
  type (not hardcoded in the app)
- `settings_kv` (e.g. `vm_issuance_multiplier` default 1.0, `trade_unlock_world_order` default 4 —
  see Trading below)

**Reporting**
- `report_snapshots` (user_id, week_start_date IST, efficiency_score 0-100, sub_metrics jsonb
  {retention, watchSpeed, quizAccuracy, consistency}, module_breakdown jsonb, topic_mastery jsonb,
  strength_note_id, gap_note_id, opportunity_note_id, habit_note_id) — written by a weekly Inngest
  job; powers Profile's report card and 8-week trend
- `coach_note_templates` (category strength|gap|opportunity|habit, template jsonb {en,hi,hx} with
  placeholders, status draft|published) — admin-editable, no AI in v1

**Trading**
- `instruments` (symbol, exchange, name, sector, about jsonb, active, halted). Order pad access is
  gated by `settings_kv.trade_unlock_world_order` (default: Market Maidan, world order 4) —
  quotes/charts/watchlist stay visible to everyone regardless ("explore mode"); no starting
  balance or unlock grant is ever issued (see `docs/ECONOMY.md`). Orders are whole-share only.
- `market_holidays` (date, name), `market_controls` (feed_mode, global_halt)
- `orders` (user_id, instrument_id, side, type, qty, limit_price_paise, status, fill_price_paise,
  reject_reason, idempotency_key, filled_at)
- `holdings` (user_id, instrument_id, qty, avg_price_paise)
- `funds` (name, category, risk, nav, aum, expense_ratio, min_sip_paise — tiered: ₹100 for index
  funds, ₹500 for equity/hybrid/debt/ELSS, star_rating, description jsonb), `fund_navs`,
  `sip_plans`, `fund_holdings`
- `competitions` (name, instrument_id, virtual_capital_vm, window_start, window_end, prizes jsonb
  — V Money / badge / coupon only, **never real currency**, admin-set per competition — and rules
  jsonb), `competition_entries`/`competition_trades` (isolated from the user's main paper-trading
  portfolio)

**News**
- `news_raw` (source, external_id, url, headline, summary, published_at, payload)
- `news_stories` (raw_id, category, tag good|bad|neutral, content jsonb {en,hi,hx}, jargon jsonb, status)
- `news_editions` (date, published), `bookmarks`

**Social & notifications**
- `leaderboard_snapshots` (week, scope, rankings jsonb), `leagues`, `league_members`, `cheers`
- `push_tokens`, `notification_prefs`, `notifications`
- `doubt_threads`, `doubt_messages`

**Monetisation**
- `entitlements` (user_id, entitlement, source revenuecat|razorpay, expires_at, raw)
