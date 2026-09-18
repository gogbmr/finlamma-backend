# Data model (starting point — refine in each phase)

All tables: `id` (uuid v7 or bigserial), `created_at`, `updated_at` (timestamptz, UTC).
Money columns are `bigint` integers. Translatable text uses a `jsonb` `{ en, hi, hx }`.

**Identity & staff**
- `users` — clerk_user_id (unique), first_name, last_initial, email, phone, language, theme,
  level, total_xp, current_world_id, deleted_at
- `staff_members` — user_id, role_id, active
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
- `vmoney_ledger` (user_id, amount (+/-), reason, ref_type, ref_id, idempotency_key)
- `streaks` (user_id, current, longest, last_active_date_ist, freezes_left, freezes_reset_on)
- `badges`, `user_badges`, `rewards`, `reward_claims`
- `settings_kv` (e.g. xp_to_vmoney_rate)

**Trading**
- `instruments` (symbol, exchange, name, sector, about jsonb, active, halted)
- `market_holidays` (date, name), `market_controls` (feed_mode, global_halt)
- `orders` (user_id, instrument_id, side, type, qty, limit_price_paise, status, fill_price_paise,
  reject_reason, idempotency_key, filled_at)
- `holdings` (user_id, instrument_id, qty, avg_price_paise)
- `funds`, `fund_navs`, `sip_plans`, `fund_holdings`

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
