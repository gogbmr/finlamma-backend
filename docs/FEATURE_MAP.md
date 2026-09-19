# Feature Map

Every feature, interaction, field, list, filter, setting, rule and number found in the prototype
at `D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI`, cross-referenced against
`docs/PRODUCT_SPEC.md`, `docs/ROADMAP.md` and `docs/DATA_MODEL.md`. See `docs/PROTOTYPE_INDEX.md`
for exactly where each screen lives in the prototype's source.

**Status** is always "Not built" unless a Phase 0/1 endpoint already covers part of it (noted
inline). **Phase** is a best guess at which `docs/ROADMAP.md` phase should own the work — many are
`TBD` because the feature isn't itemized in ROADMAP.md at all yet. Both should be finalized once
the founder has answered the Gaps & Questions section below (see step 4 of the audit this file was
built for).

**249 rows** across 7 screens: World Home (28), Arena (24), Trade + Ops console (56), News +
Pulse Check + News Desk (47), Profile + report card + certificates (38), Settings (20), Lesson
Flow + quizzes (36).

---

## World Home (WH) — incl. onboarding, notifications, world map, lessons

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| WH-01 | World Home | Header stat strip: TIME tile (today's screen time, weekly total, daily avg, best day, coach note) | per-user daily session-time aggregates | MISSING: `session_time_daily` (or derive from an app-analytics event stream) | `GET /api/v1/me/stats/time` | none — user-only | TBD | Not built |
| WH-02 | World Home | Header stat strip: STREAK tile (current, longest, freezes left, days to next reward) | streak state | `streaks` | `GET /api/v1/me/stats/streak` | none — user-only | 3 | Not built |
| WH-03 | World Home | Header stat strip: V MONEY tile (balance, weekly earned, spent, earned-from-trade) | ledger aggregates | `vmoney_ledger` | `GET /api/v1/me/stats/vmoney` | none — user-only | 3 | Not built |
| WH-04 | World Home | Header stat strip: XP tile (total XP, level, weekly XP, XP to next level, percentile rank) | xp/level state + a rank computation vs. other users | `xp_events`, `users.total_xp`/`level` | `GET /api/v1/me/stats/xp` | none — user-only | 3 | Not built |
| WH-05 | World Home | Tapping a stat tile expands an inline card with 3 quick breakdown numbers + a coach-style note | same as above, plus templated/generated note text | MISSING: note text needs a template or AI-generated copy rule | (covered by WH-01..04 endpoints) | none | TBD | Not built |
| WH-06 | World Home | "Resume" banner (continue current lesson) | user's current world + lesson-in-progress pointer | `lesson_progress`, `worlds`, `lessons` | `GET /api/v1/me/current-lesson` | none | 2 | Not built |
| WH-07 | World Home | World map: 7 world cards (title, tagline, art, lock state, progress %, mentor chip) | worlds list + per-user progress per world | `worlds`, `lesson_progress` (aggregated) | `GET /api/v1/worlds` (with per-user progress merged) | World/lesson content editor (create/edit/reorder worlds) | 2 | Not built |
| WH-08 | World Home | World unlock rule: locked worlds show a level/XP threshold, never a paywall (prototype uses level thresholds LVL 32/40/50 for worlds 5/6/7, inconsistent with a flat `unlock_xp` field) | world unlock rule (level vs XP) | `worlds.unlock_xp` (DATA_MODEL) vs. observed level-based thresholds | n/a | World content editor: set unlock threshold | 2 | Not built |
| WH-09 | World Home | Mentor evolution panel: 3 mentors (Baby/Father/Grandpa Lamma), each covering a fixed range of worlds, with active/locked visual state | mentor definitions + which one is "active" for the user's current world | MISSING: no `mentors` table in DATA_MODEL — mentor-to-world mapping is currently hardcoded in the prototype, not admin-editable | `GET /api/v1/mentors` | Mentor content editor (name, bio, world range, art) — not in current admin scope | TBD | Not built |
| WH-10 | World Home | Tapping a mentor opens an intro modal: bio, typed-dialogue animation (3 lines), and the list of worlds that mentor teaches | mentor bio + dialogue lines (per language) + world list | same MISSING `mentors` table as WH-09 | `GET /api/v1/mentors/{key}` | Mentor content editor | TBD | Not built |
| WH-11 | World Home – Onboarding | First-open onboarding: same mentor-intro modal, triggered automatically for a new user instead of by tap | "has user completed onboarding" flag | `users` (needs an `onboarding_completed_at`-style column — not currently in DATA_MODEL) | `PATCH /api/v1/me` (set onboarding flag) | none | 2 | Not built |
| WH-12 | World Home | Per-world "journey" map: 40 lesson nodes per world (8 chapters × 5 steps) laid out on an interactive drag-to-tilt 3D path, with a "you are here" mentor avatar that hops between nodes | full lesson list per world with per-node state (done/current/next/locked) | `worlds`, `lessons`, `lesson_progress` | `GET /api/v1/worlds/{id}/lessons` | World/lesson content editor | 2 | Not built |
| WH-13 | World Home | Lesson node kinds (6): Video, Story, AI Chat (Doubt Zone), Role Play, Quiz, Boss Quiz — each chapter's 5th step is one of the first 5 kinds; the last chapter's last step is always "Boss Quiz" | `lessons.kind` enum + per-kind copy (name + one-line description, localized) | `lessons` | (covered by WH-12) | World/lesson content editor | 2 | Not built |
| WH-14 | World Home | Per-lesson-kind fixed rewards: Video 4min/20XP/10VM, Story 6min/30XP/15VM, AI Chat 5min/25XP/20VM, Role Play 7min/40XP/25VM, Quiz 3min/50XP/30VM, Boss Quiz 10min/120XP/100VM (all hardcoded per kind, not derived from a single XP→VM conversion rate) | reward config per lesson (or per kind, admin-editable) | MISSING: DATA_MODEL has no explicit per-lesson reward fields — `lessons.content jsonb` would need to carry them, or a separate rewards config table | n/a (content authoring) | World/lesson content editor: set XP/VM reward per lesson | 2/3 | Not built |
| WH-15 | World Home | Tapping a lesson node opens a bottom sheet: kind, chapter, title, blurb, 4 quick stats (time/XP/VM/status), locked-reason note, Start/Review/Locked CTA | lesson detail + user's per-lesson state | `lessons`, `lesson_progress` | `GET /api/v1/lessons/{id}` | World/lesson content editor | 2 | Not built |
| WH-16 | World Home | World-complete reward card at the end of the path: "Boss reward: N V Money" before completion, "World cleared · certificate earned" after, with a pointer to the certificate in Profile | world completion state + certificate | `certificates` | `GET /api/v1/worlds/{id}` (completion status) | none | 2/3 | Not built |
| WH-17 | World Home | Drag-to-tilt 3D / flat 2D toggle for the journey map (pure UI preference, no backend) | none | n/a | n/a | n/a | n/a | Not built (client-only, no backend needed) |
| WH-18 | World Home – Notifications | Bell icon with unread badge count and shake animation when unread > 0 | unread notification count | `notifications` | `GET /api/v1/me/notifications?unread=true` (count) | none | 7 | Not built |
| WH-19 | World Home – Notifications | Notifications panel: "rich push" hero card (large image notification) + grouped list ("Today" / "Last 7 days") with per-item kind (news vs. in-app/Lamma), read/unread dot, mark-all-read | notification feed with `kind`, `title`, `body`, `time`, `read` | `notifications` | `GET /api/v1/me/notifications`, `POST /api/v1/me/notifications/mark-read` | none | 7 | Not built |
| WH-20 | World Home – Notifications | Hardcoded footer copy: "Notifications 30 din baad khud hat jaate hain" (notifications auto-expire after 30 days) | notification retention/expiry rule | `notifications` (needs a retention/cleanup job) | n/a | none | 7 | Not built |
| WH-21 | World Home – Notifications | Notification types observed: RBI/repo-rate news push, market-move news push, streak-about-to-break alert, session-goal-reached alert, rank-change ("Top 8%") celebration, economy news, session-timer-ended | notification trigger rules (streak, market news, arena rank, session goal) | `notifications` + trigger jobs (Inngest) | n/a (background jobs) | News Desk (for news-triggered pushes); none for others | 5/6/7 | Not built |
| WH-22 | World Home – Notifications | Tapping a news notification deep-links to the News tab / specific story | story id reference | `news_stories` | n/a (client nav) | n/a | 5 | Not built |
| WH-23 | World Home – Notifications | In-app "toast" push simulation for news (auto-appears top of screen, dismissible, auto-advances through a queue every ~8s) | live push delivery mechanism (in-app banner while app is foregrounded) | `push_tokens`, `notifications` | Expo push + a foreground in-app banner mechanism (client-side, but needs the same notification feed) | none | 7 | Not built |
| WH-24 | World Home – Notifications | In-app full-card "Lamma" alert simulation (streak warning with countdown meter + CTA "do a 2-min lesson"; session-timer alert with progress meter + CTA "open Pulse Check") | same notification feed, plus a countdown/progress meter computed from streak deadline / daily goal % | `notifications`, `streaks`, daily goal state | n/a (client-rendered from notification payload) | none | 7 | Not built |
| WH-25 | World Home | Help/settings flyout drawer: profile chip (name, level, streak) + 6 menu rows (How to use, Language, Theme, All settings, Contact us, Rate Finlamma) | user profile summary | `users` | `GET /api/v1/me` | none | 1 (me already exists) / — | Partially built (`GET /me` exists from Phase 1; the drawer UI itself is not) |
| WH-26 | World Home | Bottom tab nav (Home/Arena/Trade/News/Profile) with active-tab highlighting | none (pure navigation) | n/a | n/a | n/a | n/a | Not built (client-only) |
| WH-27 | World Home | App version pill hardcoded "v2.4.1" shown in Settings header | app version | n/a — client build metadata, not a backend concern | n/a | n/a | n/a | Not built (client-only) |
| WH-28 | World Home | Boot/splash progress animation on mount (cosmetic ~1.15s reveal) | none | n/a | n/a | n/a | n/a | Not built (client-only) |

## Arena (AR)

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| AR-01 | Arena | 3-way lens switch: Worlds / Players / Contest (Competitions) | current tab selection (client state only) | none | none | none | 6 | Not built |
| AR-02 | Arena | Season countdown timer (D/H/M/S to season end) | season end timestamp | `settings_kv` or new `arena_seasons` (season start/end) | `GET /api/v1/arena/season` | Season manager | 6 | Not built |
| AR-03 | Arena | Live activity ticker (marquee of recent XP/streak events) | recent XP events feed, streak milestones | `xp_events`, `streaks` | `GET /api/v1/arena/activity` | none | 6 | Not built |
| AR-04 | Arena – Worlds | World-battle strip: ranked world cards with 7-day XP sparkline, member count, weekly XP, delta % | per-world weekly XP total, member count, 7-day XP history | MISSING: `worlds` has no weekly-aggregate/member-count/history; needs `world_xp_snapshots` (world_id, day, xp) or Redis rollup | `GET /api/v1/arena/worlds` | none (derived) | 6 | Not built |
| AR-05 | Arena – Worlds | Full world leaderboard table (rank, name, weekly XP, XP-per-member, delta) | same as AR-04 + `xp / member_count` | same as AR-04 | `GET /api/v1/arena/worlds` | none | 6 | Not built |
| AR-06 | Arena – Worlds | Expand a world row → its top-10 players by weekly XP (rank, name, streak, time played, XP) + the current user's row/rank even if outside top 10 | per-world leaderboard ranking, per-user streak/time-today | MISSING: `leaderboard_snapshots` (DATA_MODEL) stores `rankings jsonb` — needs to be scoped by world; needs "time played today" which isn't modeled anywhere | `GET /api/v1/arena/worlds/{worldId}/leaderboard` | none | 6 | Not built |
| AR-07 | Arena – Players | Scope chips: My World / My State / India / Global | user's state (not in `users` table today) | `users` (needs `state` field — MISSING), `leaderboard_snapshots` | `GET /api/v1/arena/leaderboard?scope=` | none | 6 | Not built |
| AR-08 | Arena – Players | Promote/demote zone banner: "TOP N PROMOTE · BOTTOM N DEMOTE", N = round(pool size / 4) | pool size per scope | `leagues`, `league_members` | `GET /api/v1/arena/leaderboard?scope=` (include zone info) | none | 6 | Not built |
| AR-09 | Arena – Players | Top-3 podium (crown, avatar, name, XP, streak, weekly move ▲▼—) | rank, xp, streak, move-vs-last-week | `leaderboard_snapshots` (needs last week's rank stored for delta) | `GET /api/v1/arena/leaderboard?scope=` | none | 6 | Not built |
| AR-10 | Arena – Players | Full player ladder list, expandable per row → Lessons count, Quiz accuracy %, Sim P&L, a contextual note | lessons completed, quiz accuracy, trading P&L per user (aggregate) | MISSING: no per-user aggregate stats table; needs `user_stats` view/materialized rollup | `GET /api/v1/arena/leaderboard?scope=&expand=stats` | none | 6 | Not built |
| AR-11 | Arena – Players | "LIVE" tag on players currently active in-session | live/online presence | MISSING: no presence tracking (Redis TTL key per user) | n/a (websocket or short-poll) | none | 6 | Not built |
| AR-12 | Arena – Players | Cheer button per player → sends +5 XP to receiver + notification; disabled/relabelled "TUM" for the user's own row | cheer action, cooldown/limit (none specified) | `cheers` (DATA_MODEL has this table) | `POST /api/v1/arena/cheers` | Cheer abuse/audit view (optional) | 6 | Not built |
| AR-13 | Arena – Players | Season Rewards card: Promote → "next league promote + 500 V Money + gold crest"; Safe → "150 V Money"; Demote → "one league down · streak shield stays" | reward payout rules per zone | `settings_kv` (reward amounts, admin-editable) + `vmoney_ledger` (payout) | `POST /api/v1/arena/season/settle` (Inngest job, not user-facing) | Arena rewards config | 6 | Not built |
| AR-14 | Arena – Contest | Monthly single-stock trading Competition hero: sponsor logo, stock, sector, LTP, % change this month, players count, virtual capital (₹1L), prize pool, date window, days left, progress bar | competition metadata | MISSING: no `competitions` table in DATA_MODEL | `GET /api/v1/arena/competitions/current` | Competition manager (create/edit competition) | 6 | Not built |
| AR-15 | Arena – Contest | "You" rank card: user's rank (#N), trades made, ROI %, push line ("Top 10 needs +X% more ROI") | user's competition rank/ROI/trade count | MISSING: competition-scoped position table | `GET /api/v1/arena/competitions/current/me` | none | 6 | Not built |
| AR-16 | Arena – Contest | Top-3 ROI podium + full ranked board (expand → best trade, win rate, avg hold time, note) | per-contestant ROI, trade count, avg price, best trade, win rate, avg hold | MISSING: needs contest-scoped trade/position aggregation, separate from main paper-trading portfolio (contest uses isolated ₹1L virtual capital in one stock) | `GET /api/v1/arena/competitions/current/leaderboard` | Competition leaderboard view | 6 | Not built |
| AR-17 | Arena – Contest | Prize breakdown: 1st ₹10,000 scholarship + badge; 2nd-3rd ₹4,000 each + 5,000 V-coins; 4th-10th 1,000 V-coins + badge | prize schedule (real-money scholarship!) | `settings_kv` or `competitions.prizes jsonb` | admin-only, no app endpoint | Competition manager | 6 | Not built |
| AR-18 | Arena – Contest | Rules panel (5 rules: virtual ₹1,00,000 single-stock capital; max 10 trades/month, min 1 to qualify; ranked by ROI% not profit; square-off deadline (last price used after); disqualify copy-trading/circuit-hit entries) + "practice only, no real payouts" disclaimer | static rules text (admin-editable per competition) | `competitions.rules jsonb` | `GET /api/v1/arena/competitions/current` (rules field) | Competition manager | 6 | Not built |
| AR-19 | Arena | "Khelo" (Play) quick-action sheet: 2 shortcuts — Take a lesson (+250 XP, shows "N lessons pending"), Daily news quiz (+120 XP, "60 seconds") | pending lesson count, XP amounts (admin-controlled) | `lessons`/`lesson_progress`, `settings_kv` (xp amounts) | reuses World Home / News endpoints | none | 2/5/6 | Not built |
| AR-20 | Arena | Player profile bottom sheet (opened from any avatar/name): bio, week XP, streak, Arena ROI, quiz accuracy %, badge count + badge grid, current world + % complete | user's public profile stats | MISSING: needs a "public profile" projection (kid-safe: first name + last initial only per PRODUCT_SPEC — prototype's sample names already follow this convention) | `GET /api/v1/users/{id}/public-profile` | none | 6 | Not built |
| AR-21 | Arena | Sticky "you" bar (bottom): current rank, current line ("You are #N · X XP" or world share), push-to-improve message | user's current rank/XP + computed nudge text | `leaderboard_snapshots` | `GET /api/v1/arena/leaderboard?scope=` (self row) | none | 6 | Not built |
| AR-22 | Arena | Side panel "How this ranking works" — 5 static explainer cards (XP/TEAM/LADDER/CHEER/SAFE) | static copy | none (content, could be hardcoded client copy) | none | Content editor (optional) | 6 | Not built |
| AR-23 | Arena | Weekly reset of all leaderboards (Worlds + Players + Leagues) | scheduled job | `leaderboard_snapshots` | Inngest job, no endpoint | none | 6 | Not built |
| AR-24 | Arena | Kid-safe display: public name = first name + last initial only, mascot avatar (hue-rotated), no chat, no photos | — (policy, enforced at query/projection level) | `users` (first_name/last_initial already in DATA_MODEL) | all Arena endpoints above | none | 6 | Not built |

## Trade + Ops console (TR)

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| TR-01 | Trade | Market status pill: LIVE / 15M DELAY / HALTED, driven by Ops console feed mode | current feed mode | `market_controls` | `GET /api/v1/trade/market-status` | Ops console | 4 | Not built |
| TR-02 | Trade | Stock search by symbol/name/sector with live suggestions (top 6) | instrument list, live LTP/chg | `instruments` | `GET /api/v1/trade/instruments?q=` | none | 4 | Not built |
| TR-03 | Trade | Virtual balance card: cash + market value, intraday P&L (₹ and %) | cash balance, holdings mkt value, day P&L | `vmoney_ledger`, `holdings` | `GET /api/v1/trade/account` | none | 4 | Not built |
| TR-04 | Trade | Index strip: NIFTY 50, BANK NIFTY, SENSEX value + % change | index level, prev close | MISSING: no `indices`/`index_quotes` table in DATA_MODEL — indices are synthesized client-side from stock prices in the prototype | `GET /api/v1/trade/indices` | none | 4 | Not built |
| TR-05 | Trade | Index candlestick chart with timeframe chips (1D/1W/1M/3M/1Y) | OHLC candle series per timeframe | MISSING: no candle/OHLC history table | `GET /api/v1/trade/indices/{symbol}/candles?tf=` | none | 4 | Not built |
| TR-06 | Trade | Full-screen "zoom" chart view (index or stock), same timeframe chips | same as TR-05/TR-11 | (reuses above) | (reuses above) | none | 4 | Not built |
| TR-07 | Trade | Tab bar: Watchlist / Positions / Orders / Funds (MF/SIP) | active tab | — (client state) | — | none | 4 | Not built |
| TR-08 | Trade | Watchlist rows: logo, symbol, exchange+sector, mini sparkline, LTP, % change (flash green/red on tick) | instrument, live price/candles | `instruments` | `GET /api/v1/trade/watchlist`, `GET /api/v1/trade/quotes?symbols=` | none | 4 | Not built |
| TR-09 | Trade | Watchlist add/remove (tap row navigates to detail; no explicit add/remove control seen in this build) | user's watchlist membership | MISSING: no `watchlists`/`watchlist_items` table — DATA_MODEL has no watchlist table at all | `GET/POST/DELETE /api/v1/trade/watchlist` | none | 4 | Not built |
| TR-10 | Trade | Positions tab: total P&L + invested summary card | positions, live price | `holdings` | `GET /api/v1/trade/positions` | none | 4 | Not built |
| TR-11 | Trade | Position row: symbol, qty tag, avg price, LTP, P&L ₹ and % | `holdings.qty`, `avg_price_paise`, live price | `holdings` | (reuses TR-10) | none | 4 | Not built |
| TR-12 | Trade | Empty positions state copy ("Koi open position nahi...") | — | — | — | none | 4 | Not built |
| TR-13 | Trade | Orders tab: order list — side tag, symbol, type+timestamp+order id, qty@price, status | order history | `orders` | `GET /api/v1/trade/orders` | none | 4 | Not built |
| TR-14 | Trade | Empty orders state copy ("Aaj koi order nahi...") | — | — | — | none | 4 | Not built |
| TR-15 | Trade | Stock detail header: symbol, sector, exchange tag NSE, LTP, change abs+% | instrument, live price | `instruments` | `GET /api/v1/trade/instruments/{symbol}` | none | 4 | Not built |
| TR-16 | Trade | Stock detail candlestick chart w/ dashed last-price line + timeframe chips | OHLC history | MISSING: candle history table (see TR-05) | `GET /api/v1/trade/instruments/{symbol}/candles?tf=` | none | 4 | Not built |
| TR-17 | Trade | Stock stat grid: Open, High, Low, Prev. Close, Volume, Mkt Cap, P/E Ratio, Lot Size, Sector | instrument fundamentals + today's OHLC | `instruments` (needs mcap/pe/vol/lot_size fields — not all present in current schema) | (reuses TR-15) | none | 4 | Not built |
| TR-18 | Trade | "Your position" box on detail screen: qty, avg, P&L (only if held) | `holdings` row for symbol | `holdings` | (reuses TR-15) | none | 4 | Not built |
| TR-19 | Trade | "About the company" text + tag chips (e.g. NIFTY 50, Large cap, Sector) | instrument about text + tags | `instruments.about` (jsonb, present); tags — MISSING: no tags field | (reuses TR-15) | none | 4 | Not built |
| TR-20 | Trade | Lamma educational tip per stock ("Ek hi company mein oil, retail aur telecom...") | per-instrument tip copy, translated | MISSING: no per-instrument "tip" field in `instruments` | (reuses TR-15) | none | 4 | Not built |
| TR-21 | Trade | BUY / SELL action buttons (SELL dimmed if no holding) | holding qty for symbol | `holdings` | — (opens ticket, no separate call) | none | 4 | Not built |
| TR-22 | Trade | Order ticket: MARKET / LIMIT type toggle | — | — | part of order create payload | none | 4 | Not built |
| TR-23 | Trade | Order ticket: qty stepper +/− | — | — | client state only | none | 4 | Not built |
| TR-24 | Trade | Order ticket: qty quick presets — BUY: 1/5/10/MAX; SELL: 1/5/HALF/ALL | cash (for MAX), held qty (for HALF/ALL) | `vmoney_ledger`, `holdings` | — | none | 4 | Not built |
| TR-25 | Trade | Order ticket: price field — MARKET shows live LTP (read-only), LIMIT shows editable limit price | live price | — | order create payload `limitPricePaise` | none | 4 | Not built |
| TR-26 | Trade | Order ticket summary: order value, available margin (BUY) / balance after sell (SELL), brokerage + charges | cash, order value | `vmoney_ledger` | — | none | 4 | Not built |
| TR-27 | Trade | Brokerage hardcoded ₹0.00 | — | — | — | none | 4 | Not built |
| TR-28 | Trade | Order rejection reasons shown inline: (a) "Exchange ops ne trading halt kar di hai" when halted, (b) "Margin kam hai" for BUY over cash, (c) "Itni quantity tumhare holdings mein nahi hai" for SELL over held qty | halt state, cash, held qty | `market_controls`, `vmoney_ledger`, `holdings` | order create validation | none | 4 | Not built |
| TR-29 | Trade | "Add V Money" is explicitly refused — toast "V Money sirf lessons aur arena se milte hain" | — | — | — (no endpoint; intentionally absent) | none | 4 | Not built |
| TR-30 | Trade | Place order → success toast "Order {id} COMPLETE", order appended, cash debited/credited, tab switches to Orders | order execution | `orders`, `vmoney_ledger` | `POST /api/v1/trade/orders` (needs `Idempotency-Key` header per CLAUDE.md trading rules) | none | 4 | Not built |
| TR-31 | Trade | Order fills execute at the current simulated price — server-side price must replace this per CLAUDE.md (never trust client price) | Redis-cached price from relay | `orders` | (reuses TR-30) | none | 4 | Not built |
| TR-32 | Trade | Footer disclaimer: "VIRTUAL ORDER · V MONEY · NO REAL MONEY" | — | — | — | none | 4 | Not built |
| TR-33 | Trade | Order fill toast (auto-dismiss ~2.6s) | — | — | — | none | 4 | Not built |
| TR-34 | Trade | Global "TRADING HALTED BY EXCHANGE OPS" banner when `market_controls.global_halt` is on | halt flag | `market_controls` | `GET /api/v1/trade/market-status` | none | 4 | Not built |
| TR-35 | Trade | Funds tab: "My fund folio" card — total value, holdings count, invested amount, active SIP monthly amount | fund holdings, SIP | `fund_holdings`, `sip_plans` | `GET /api/v1/trade/funds/portfolio` | none | 4 | Not built |
| TR-36 | Trade | Fund category filter chips: ALL / INDEX / EQUITY / HYBRID / DEBT / ELSS | — | `funds.category` | `GET /api/v1/trade/funds?category=` | none | 4 | Not built |
| TR-37 | Trade | Active SIP card: amount/month, target fund, "NEXT · 5 SEP" date, 1Y estimated projection, amount slider ₹500–₹10,000 step 500 | `sip_plans` row | `sip_plans` | `GET /api/v1/trade/funds/sip` | none | 4 | Not built |
| TR-38 | Trade | Fund list rows: logo, name, risk tag (LOW/MODERATE/HIGH/VERY HIGH/VERY LOW), star rating (1–5), "held" tag with invested amount, 3Y CAGR, category+expense ratio+min SIP meta | fund master + user's fund_holdings | `funds`, `fund_holdings` | `GET /api/v1/trade/funds` | none | 4 | Not built |
| TR-39 | Trade | Fund row expand: 1Y/3Y/5Y returns, NAV, AUM, lock-in note ("3-year lock-in" for ELSS else "Exit anytime"), description ("what") | `funds` extended fields | `funds` (needs r1/r3/r5/nav/aum/exp/minSip/stars/what — not all in current DATA_MODEL `funds` stub) | `GET /api/v1/trade/funds/{id}` | none | 4 | Not built |
| TR-40 | Trade | Fund: one-time lumpsum amount stepper ₹1,000–₹100,000 step 1,000, "INVEST ONCE" button | cash | `vmoney_ledger`, `fund_holdings` | `POST /api/v1/trade/funds/{id}/lumpsum` (needs Idempotency-Key) | none | 4 | Not built |
| TR-41 | Trade | Fund: "START SIP" / "SIP ACTIVE" toggle button, sets/replaces the single active SIP | — | `sip_plans` | `POST /api/v1/trade/funds/{id}/sip` (needs Idempotency-Key) | none | 4 | Not built |
| TR-42 | Trade | SIP/lumpsum insufficient-funds toast ("V Money kam hai") | cash vs lump amount | `vmoney_ledger` | validation on TR-40 | none | 4 | Not built |
| TR-43 | Trade | NSE market hours reference implied by "9:15"–"15:30" axis labels on 1D timeframe | market hours config | `market_holidays`/market hours constant | — | none | 4 | Not built |
| TR-44 | Trade – Ops console | Panel tab switch: OPS CONSOLE / DESIGN NOTES | — | — | — | Ops console | 4 | Not built |
| TR-45 | Trade – Ops console | KPI tiles: Active traders, Orders today, V Money in play, Risk flags count | aggregate stats (currently hardcoded fake numbers in prototype, not computed) | `orders`, `vmoney_ledger`, risk-flag source (see gap) | `GET /api/v1/admin/trade/ops/summary` | Ops console | 4 | Not built |
| TR-46 | Trade – Ops console | Price Feed Control: mode buttons LIVE / DELAYED / PAUSED | `market_controls.feed_mode` | `market_controls` | `PATCH /api/v1/admin/trade/ops/feed-mode` | Ops console | 4 | Not built |
| TR-47 | Trade – Ops console | Volatility slider 0–3× for simulated price feed | `market_controls`(-like) volatility setting | MISSING: DATA_MODEL's `market_controls` only has `feed_mode`/`global_halt`; no volatility field — and once real Twelve Data prices are wired in, it's unclear what "volatility" would control (see gap question) | `PATCH /api/v1/admin/trade/ops/volatility` (proposed, pending answer) | Ops console | 4 | Not built |
| TR-48 | Trade – Ops console | Global trading halt toggle | `market_controls.global_halt` | `market_controls` | `PATCH /api/v1/admin/trade/ops/halt` | Ops console | 4 | Not built |
| TR-49 | Trade – Ops console | Symbol Master table: per-symbol LTP, sector, change %, LIVE/HALT flag toggle | `instruments.halted` | `instruments` | `GET /api/v1/admin/trade/instruments`, `PATCH /api/v1/admin/trade/instruments/{symbol}/halt` | Ops console | 4 | Not built |
| TR-50 | Trade – Ops console | Live "TICK {n}s" age indicator for symbol feed | last tick timestamp | Redis price cache (per ARCHITECTURE.md `px:<SYMBOL>:NSE`) | `GET /api/v1/admin/trade/ops/summary` (reuses TR-45) | Ops console | 4 | Not built |
| TR-51 | Trade – Ops console | User Trading Ledger table: name, class+world meta, V Money balance, P&L %, risk flag (OK/WATCH/NEW) | user progress + vmoney balance + risk classification | `users`, `vmoney_ledger` + MISSING: no risk-flag field/logic anywhere in DATA_MODEL | `GET /api/v1/admin/trade/ops/users` | Ops console | 4 | Not built |
| TR-52 | Trade – Ops console | XP → V Money issuance rate presets: 100XP=100VM / 250VM / 500VM | rate setting | `settings_kv` (`xp_to_vmoney_rate`) | `PATCH /api/v1/admin/economy/xp-rate` (also relevant to XP economy, Phase 3) | 3 or 4 (cross-cutting) | Not built |
| TR-53 | Trade – Ops console | Audit log: timestamped kind-tagged events (FEED/COIN/ORDER/RISK/SIP/HALT) with free text | ops action history | `activity_logs` (append-only, per CLAUDE.md rule 5) | `GET /api/v1/admin/trade/ops/audit-log` (or reuse general activity log viewer) | Ops console | 4 | Not built |
| TR-54 | Trade – Ops console | "SANDBOX" environment tag on the console header | — | — | — | Ops console | 4 | Not built |
| TR-55 | Trade – Design Notes panel | Static internal design-rationale cards (not a real feature — prototype-only documentation aid) | — | — | — | none (prototype-only, likely dropped from real admin) | N/A | N/A |
| TR-56 | Trade | Footer legal/safety note: "Prices, charts and fundamentals here are simulated for practice... nothing on this screen is investment advice or live exchange data" — should appear somewhere in the real app per CLAUDE.md rule 11 (AI/educational-only framing) | — | — | — | none | 4 | Not built |

## News + Pulse Check + News Desk (NW)

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| NW-01 | News | Theme (light/dark) switch tab, in-screen | user theme pref | `users.theme` | `PATCH /me` | none | 5 | Not built |
| NW-02 | News | Scrolling ticker strip at top of screen (index prices) | live index quotes | `instruments` (Trade domain) | reuse Trade's quote endpoint | none | 5 | Not built |
| NW-03 | News | Pulse Check CTA card: question count, est. minutes, max VM payout, "N people playing now" live counter | today's quiz settings + live player count | `news_editions`, `quizzes` + Redis counter | `GET /v1/news/pulse-check` (today's quiz meta) | none | 5 | Not built |
| NW-04 | News | Category filter chips (e.g. RBI, Stocks, Company, Global, IPO, Economy) | distinct categories for today's edition | `news_stories.category` | `GET /v1/news/feed?category=` | News Desk | 5 | Not built |
| NW-05 | News | "FinLamma Desk" admin-picked stories section (kind tag Desk Pick / Exam Alert / Scam Watch, note, attribution) | staff-curated highlight cards, separate from auto-ingested news | MISSING: no table for staff-authored/pinned "desk pick" cards distinct from `news_stories` | `GET /v1/news/desk-picks`, admin: `POST/PATCH/DELETE /admin/news/desk-picks` | News Desk | 5 | Not built |
| NW-06 | News | Hero/"big story" card: category tag, live dot, time, title, simplified summary, impact tag, "read more" | top story of the day flag | `news_stories` (+ a `featured` flag) | `GET /v1/news/feed` | News Desk | 5 | Not built |
| NW-07 | News | News row list: headline, simplified summary, category art, time+read duration, "PADH LIYA" (read) badge, impact tag (good/bad/neutral), source, jargon-term label | per-story fields + per-user read state | `news_stories`, `news_editions` + per-user read tracking (MISSING: `news_reads` or reuse `bookmarks`-style table) | `GET /v1/news/feed`, `POST /v1/news/{id}/read` | News Desk | 5 | Not built |
| NW-08 | News – Story | Full story reading view: hero art, category tag, time/read-length, title, impact tag, source attribution, 3–4 body paragraphs, "AAJ KA TERM" jargon box (term explained, links to Pulse Check) | story detail fields incl. paragraph array and one jargon term per story | `news_stories.content` jsonb, `news_stories.jargon` jsonb | `GET /v1/news/{id}` | News Desk | 5 | Not built |
| NW-09 | News – Story | Dwell-time read tracking: story only marked "read" after user stays on it for its stated read-duration (e.g. 35–45s) | client dwell timer + server confirm | `news_reads`/read-state field | `POST /v1/news/{id}/read` (server should also validate min dwell, not trust client alone) | none | 5 | Not built |
| NW-10 | News – Story | "Read original source" opens in-app webview (source outlet URL), with copy-link/back fallback if it fails to load | per-story canonical source `url`, `outlet` name | `news_raw.url`, `news_stories` outlet field | n/a (client-only webview) | News Desk | 5 | Not built |
| NW-11 | News – Story | Source attribution required on every story ("we simplify and attribute, never republish") | outlet name shown on every card/detail | `news_stories.outlet` (or via `news_raw`) | — | News Desk | 5 | Not built |
| NW-12 | Pulse Check | Timed quiz built from today's ingested stories, launched from News feed CTA | today's `quizzes` row scoped to the news edition | `quizzes` (news_edition_id), `questions` | `POST /v1/pulse-check/start`, `GET /v1/pulse-check/current` | none | 5 | Not built |
| NW-13 | Pulse Check | Every question shows its source headline + topic label ("aaj ki edition se") | `src` headline reference per question | `questions.payload` includes `source_story_id` | (part of question payload) | News Desk | 5 | Not built |
| NW-14 | Pulse Check | Per-question countdown timer (admin-set seconds/question), progress pips (green=correct, red=wrong, purple=current), timer bar that turns red near expiry | timer config + per-question elapsed | client timer, server validates on submit | `POST /v1/pulse-check/{quizId}/answer` (server checks elapsed) | News Desk (timer/Q setting) | 5 | Not built |
| NW-15 | Pulse Check – MCQ | "Quick Check" — pick 1 of 3 options | question payload: options[], correct index | `questions.payload`/`answer` | shared answer endpoint | News Desk | 5 | Not built |
| NW-16 | Pulse Check – Binary | "Sach ya Afwah" (true/rumour) — 2 big option buttons | question payload: 2 options, correct index | same | same | News Desk | 5 | Not built |
| NW-17 | Pulse Check – Slider | "Number Pakdo" — drag/tap slider to guess a number (e.g. CPI %), min/max/step, tolerance band for "correct" | min, max, step, unit, answer, tolerance | `questions.payload` | same | News Desk | 5 | Not built |
| NW-18 | Pulse Check – Grid | "Odd One Out" — 2×2 tile grid, pick the outlier | 4 tiles (label, sub, mark), correct index | same | same | News Desk | 5 | Not built |
| NW-19 | Pulse Check – Sort | "Achhi ya Buri Khabar" — tap chips into good/bad buckets | items[] with bucket assignment, 2 bucket defs | same | same | News Desk | 5 | Not built |
| NW-20 | Pulse Check – Fill | "Khaali Bharo" — fill-in-the-blank sentence from a word pool | sentence parts array + word pool + answer sequence | same | same | News Desk | 5 | Not built |
| NW-21 | Pulse Check – Match | "Jodi Banao" — match term ↔ meaning pairs (tap left then right) | pairs[], reverse-map for grading | same | same | News Desk | 5 | Not built |
| NW-22 | Pulse Check – Order | "Sabse Bada Asar" — rank 3 items by impact | pool[], correct ranking order | same | same | News Desk | 5 | Not built |
| NW-23 | Pulse Check – Spot | "Fake Pakdo" — pick the one headline among 4 that wasn't really reported | lines[] with source tag + text, correct (fake) index | same | same | News Desk | 5 | Not built |
| NW-24 | Pulse Check | "PREDICT" format exists as a toggle in News Desk's quiz generator but has no visible question implementation in the prototype (off by default) | — | — | — | News Desk | TBD | Not built |
| NW-25 | Pulse Check | Grading + scoring: correct → `baseCoins` VM (admin preset 20/30/50); +15 VM speed bonus if answered in <45% of allotted time; + combo bonus = min(streak,5)×5 VM; combo/streak resets on a wrong answer; host mascot reacts and speaks a Hinglish line | server-side scoring must replicate this exactly (never trust client-reported correctness/time) | `xp_events`/`vmoney_ledger`, `quiz_attempts`, `question_answers` | `POST /v1/pulse-check/{quizId}/answer` (server-scored, server-timed) | News Desk (base VM per format) | 5 | Not built |
| NW-26 | Pulse Check | All-correct bonus: +100 VM if every question in the session is answered correctly | session-level check | `quiz_attempts` | part of `POST /v1/pulse-check/{quizId}/finish` | none | 5 | Not built |
| NW-27 | Pulse Check – Result | Payout hero: coins won this session, new V Money balance | session total, updated balance | `vmoney_ledger` | `GET /v1/pulse-check/{quizId}/result` | none | 5 | Not built |
| NW-28 | Pulse Check – Result | Result grade stamp (letter grade) + headline/sub copy | derived from accuracy | computed | same | none | 5 | Not built |
| NW-29 | Pulse Check – Result | KPI row: accuracy %, best combo, avg speed (seconds/question) | per-attempt stats | `quiz_attempts` | same | none | 5 | Not built |
| NW-30 | Pulse Check – Result | V Money breakdown bar chart: base / speed bonus / combo bonus / all-correct bonus, as proportional segments | breakdown per session | `question_answers` aggregated | same | none | 5 | Not built |
| NW-31 | Pulse Check – Result | Per-question speed bar chart (seconds per question, colored by correct/wrong) | per-question timing | `question_answers` | same | none | 5 | Not built |
| NW-32 | Pulse Check – Result | Topic-wise mastery bars (e.g. RBI & rates, Afwah pehchano, Inflation...), % correct per topic, color-coded | topic tagging on questions + per-user rollup | `questions.topic`? MISSING: topic taxonomy field | same | News Desk | 5 | Not built |
| NW-33 | Pulse Check – Result | 7-day Pulse Check streak tracker with a "7 days = 500 VM bonus" callout, next-edition countdown timer | separate streak counter scoped to Pulse Check (distinct from the main learning streak in PRODUCT_SPEC §2) | MISSING: is Pulse Check streak the same `streaks` table as learning streak, or a separate counter? | — | none | 5 | Not built (needs decision) |
| NW-34 | Pulse Check – Result | "Re-read news" and "Go trade" CTA buttons | — | — | client nav only | none | 5 | Not built |
| NW-35 | News Desk (admin) | Console header: "ingest → simplify → quiz → publish" pipeline label, publish state badge (PUBLISHED/PARTIAL) | derived from whether any story is hidden | `news_editions.published`, `news_stories.status` | admin-only, reuses feed data | News Desk | 5 | Not built |
| NW-36 | News Desk (admin) | KPI tiles: Ingested count, Published count, Quiz pool size, Coins paid to date (+ user count) | daily ingestion/publish/payout aggregates | `news_raw` count, `news_stories` count, `questions` count, `vmoney_ledger` sum | `GET /admin/news/kpis` | News Desk | 5 | Not built |
| NW-37 | News Desk (admin) | "Today's Pipeline" table: story title, source, auto-assigned quality grade (A/B/C), question count, publish/hidden toggle (instant) | per-story pipeline row + grade + live toggle | `news_stories.status`, quality grade field (MISSING: grading rubric undefined) | `GET /admin/news/pipeline`, `PATCH /admin/news/stories/{id}` (toggle publish) | News Desk | 5 | Not built |
| NW-38 | News Desk (admin) | Quiz generator: question-count slider (4..quiz-pool-size) | per-edition setting | `settings_kv` or `news_editions` config | `PATCH /admin/news/quiz-settings` | News Desk | 5 | Not built |
| NW-39 | News Desk (admin) | Quiz generator: per-question timer slider (10–35s, step 5) | per-edition setting | same | same | News Desk | 5 | Not built |
| NW-40 | News Desk (admin) | Quiz generator: base V Money per question, preset chips 20/30/50 | per-edition setting | same | same | News Desk | 5 | Not built |
| NW-41 | News Desk (admin) | Quiz generator: format on/off toggles (9 formats + unused "PREDICT") | per-edition enabled-format set | same | same | News Desk | 5 | Not built |
| NW-42 | News Desk (admin) | Quiz generator summary note (live-computed: formats on, question count, per-Q timer, max payout) | derived, no separate storage | computed | — | News Desk | 5 | Not built |
| NW-43 | News Desk (admin) | 7-day engagement bar chart (% of users who did Pulse Check each day) + average % | daily engagement rollup | analytics rollup (MISSING table, likely `news_editions` + daily aggregation job) | `GET /admin/news/engagement?days=7` | News Desk | 9 (analytics) or 5 | Not built |
| NW-44 | News Desk (admin) | Audit log: timestamped events (INGEST, SIMPLIFY, QUIZ, PUBLISH) with counts, e.g. "31 headlines pulled from 7 partner feeds" | append-only log of desk actions | `activity_logs` (reuse, per non-negotiable rule #5) | derived from `activity_logs` filtered to News Desk actions | News Desk | 5 | Not built |
| NW-45 | News Desk (admin) | Ingestion pipeline numbers shown as fixed sample: "31 ingested (7 partner feeds) → 8 simplified/published" | real ingestion job output | Inngest job writing to `news_raw`/`news_stories` | — | News Desk | 5 | Not built |
| NW-46 | News – global rule | Scam-awareness stories are a distinct content type surfaced via admin "Scam Watch" picks (e.g. Telegram "guaranteed return" groups, referencing real SEBI action) | needs a way for admin to author/update these outside the automated news pipeline | ties to NW-05 (desk picks) | admin: `POST /admin/news/desk-picks` | News Desk | 5 | Not built |
| NW-47 | News – global rule | Every AI-simplified story/quiz question is a draft until a staff member publishes it (per CLAUDE.md rule 11) | draft/published status per story and per quiz | `news_stories.status`, `quizzes` status | admin publish action | News Desk | 5 | Not built |

## Profile + report card + certificates (PR)

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| PR-01 | Profile – Overview | ID card: avatar, display name, handle, joined date, level ring, rank title, percentile | user name/level/xp, join date, rank title thresholds, percentile vs cohort | `users`, `xp_events` | `GET /me/profile/overview` | none | 3 | Not built |
| PR-02 | Profile – Overview | XP progress bar to next level + "X XP to go" | xp, level thresholds | `users`, `xp_events` | (same as PR-01) | none | 3 | Not built |
| PR-03 | Profile – Overview | 3 rank-delta cells (e.g. rank change vs last period) | historical rank snapshots | MISSING: no rank-history table (leaderboard is weekly-snapshot only per DATA_MODEL) | (same) | none | 6 | Not built |
| PR-04 | Profile – Overview | Quick stat: today's study time vs 60-min goal | daily time-on-task | MISSING: no session/time-tracking table | `GET /me/profile/overview` | none | 3 | Not built |
| PR-05 | Profile – Overview | Quick stat: streak days + freezes left | streak, freezes_left | `streaks` | (same) | none | 3 | Not built |
| PR-06 | Profile – Overview | Quick stat: lectures completed / total + % | lesson completion count | `lesson_progress` | (same) | none | 3 | Not built |
| PR-07 | Profile – Overview | Quick stat: quiz accuracy % | correct/total answers | `quiz_attempts`, `question_answers` | (same) | none | 3 | Not built |
| PR-08 | Profile – Overview | Streak card: current/best streak, 7-day dot calendar, freeze chip, streak note text | streak history per day (IST) | `streaks` (needs daily history, not just counters — see gap) | (same) | none | 3 | Not built |
| PR-09 | Profile – Overview | "Aaj ke 3 target" daily goal checklist w/ per-goal progress ring | daily goal defs + progress (study minutes, 1 lecture, Pulse Check) | MISSING: no daily-goals table | `GET/PATCH /me/daily-goals` | none | 3 | Not built |
| PR-10 | Profile – Overview | Worlds-cleared list: stars per world, progress bar, tap a cleared world to open its certificate | world completion %, stars per world | `worlds`, `lesson_progress`, `certificates` | `GET /me/worlds-progress` | none | 3 | Not built |
| PR-11 | Profile – Stats | Time-spent bar chart w/ Today/Week/Month scope toggle, 3 KPIs, insight text | time-on-task by day, best slot | MISSING: no session/time-tracking table | `GET /me/profile/stats?scope=` | none | 3 (blocked on MISSING table) | Not built |
| PR-12 | Profile – Stats | Efficiency score ring (0–100) = avg of 4 named sub-metrics (retention, watch speed, quiz accuracy, consistency) + insight text | per-metric computed %, insight copy | MISSING: no stored "efficiency score" concept anywhere in DATA_MODEL | `GET /me/profile/stats` | none | TBD | Not built |
| PR-13 | Profile – Stats | Lifetime report: 6 stat tiles (total time, lectures, quizzes, news read, paper trades, VM earned) | aggregates across lessons/quizzes/news/trading/ledger | `lesson_progress`, `quiz_attempts`, `bookmarks`/news read log, `orders`, `vmoney_ledger` | `GET /me/profile/stats` | none | 3/4/5 (aggregate) | Not built |
| PR-14 | Profile – Stats | Topic-wise mastery bars (5 topics) w/ tag (MASTER/STRONG/BADH RAHA/KAMZOR) + insight | per-topic accuracy rollup | MISSING: no "topic" taxonomy or mastery table | `GET /me/profile/stats` | none | TBD | Not built |
| PR-15 | Profile – Stats | 5-week × 7-day consistency heatmap + insight | daily activity flag, 35-day window | MISSING: no daily-activity table (streaks only stores counters) | `GET /me/profile/stats` | none | TBD | Not built |
| PR-16 | Profile – Badges | Badge summary ring (count unlocked/total) + headline copy | badge unlock count | `user_badges`, `badges` | `GET /me/badges` | Badge manager (create/edit badge defs, icon, criteria, VM reward) | 3 | Not built |
| PR-17 | Profile – Badges | Badge category filter chips (Learning/Streak/Trading/News + "Sab") | badge category enum | `badges` | (same) | Badge manager | 3 | Not built |
| PR-18 | Profile – Badges | Badge grid: per-badge progress ring, locked/unlocked art state | badge progress numerator/denominator | `badges`, `user_badges` | (same) | Badge manager | 3 | Not built |
| PR-19 | Profile – Badges | Picked-badge detail card: description, progress, VM reward, "X rank away" lock note | badge detail + user progress | `badges`, `user_badges` | (same) | Badge manager | 3 | Not built |
| PR-20 | Profile – Badges | "Next 3 badges" nearly-there list | badges sorted by % complete, top 3 not-yet-earned | `badges`, `user_badges` | (same) | none | 3 | Not built |
| PR-21 | Profile – Rewards | Wallet balance (VM), "earned this month", earn-source breakdown (lectures/quiz/news/streak %) | vmoney_ledger grouped by reason, monthly window | `vmoney_ledger` | `GET /me/wallet` | none | 3 | Not built |
| PR-22 | Profile – Rewards | Coupons list: brand, offer, "how earned", reveal/copy code, READY/USED/COPIED states | reward catalog + per-user claim state | `rewards`, `reward_claims` | `GET /me/rewards`, `POST /me/rewards/:id/claim` | Reward/coupon catalog manager (brand, offer text, code pool, earn criteria) | 3 | Not built |
| PR-23 | Profile – Rewards | Locked (VM-gated) rewards list: cost, progress, "X VM more" | reward VM price, user balance | `rewards` | `GET /me/rewards` | Reward/coupon catalog manager | 3 | Not built |
| PR-24 | Profile – Rewards | Redeem history ledger (date, description, ± VM) | vmoney_ledger filtered to reward-related entries | `vmoney_ledger` | `GET /me/wallet/history` | none | 3 | Not built |
| PR-25 | Profile – Trades | Portfolio value hero + equity sparkline (12 bars) | holdings valuation over time | `holdings`, `orders` | `GET /me/portfolio/summary` | none | 4 | Not built |
| PR-26 | Profile – Trades | Trading-stats grid (6 stats: e.g. win rate, avg hold) | derived from closed orders | `orders` | `GET /me/portfolio/stats` | none | 4 | Not built |
| PR-27 | Profile – Trades | Win/loss bar + breakdown rows | win/loss counts | `orders` | `GET /me/portfolio/stats` | none | 4 | Not built |
| PR-28 | Profile – Trades | Trade history list w/ filter (All/Open/Closed) | order history, P&L per trade | `orders` | `GET /me/portfolio/trades?status=` | none | 4 | Not built |
| PR-29 | Profile – Notifications | Notification panel: grouped list (Today / Past 7 days), mark-all-read, 30-day auto-expiry | user notifications | `notifications` | `GET /me/notifications`, `POST /me/notifications/read-all` | none | 7 | Not built |
| PR-30 | Profile – Report Card | Full report card panel: 6 KPI tiles (syllabus %, watch time, quiz acc, avg session, trade win %, global rank) | cross-domain aggregate snapshot | MISSING: no report-card table/job | `GET /me/report-card?period=week` | none | TBD | Not built |
| PR-31 | Profile – Report Card | Module-wise breakdown table: done, time, accuracy, letter grade (S/A/B/C) per module | per-module rollup + grade thresholds | MISSING: no "module" grading concept or thresholds defined | (same) | Grade-threshold settings (if admin-tunable) | TBD | Not built |
| PR-32 | Profile – Report Card | 8-week speed-vs-accuracy trend chart | weekly speed/accuracy history | MISSING: no weekly-snapshot table | (same) | none | TBD | Not built |
| PR-33 | Profile – Report Card | Coach notes: 4 categories (TAAKAT/strength, GAP, MAUKA/opportunity, AADAT/habit) | either templated-from-stats or AI-generated text | MISSING: no coach-notes table; unclear if AI or template | (same) | none (or a review/approve step if AI-generated) | TBD | Not built |
| PR-34 | Profile – Report Card | Reward ledger (earn/spend log with running totals) | vmoney_ledger, filtered/summed for the period | `vmoney_ledger` | `GET /me/report-card` | none | 3 | Not built |
| PR-35 | Profile – Report Card | Export/share sheet: 3 actions — download PDF report card, generate 1080×1920 "story card" image, "send to mentor" weekly summary letter | PDF/image generation; mentor contact info + delivery | MISSING: PDF/image generation pipeline; MISSING: any concept of a parent/mentor contact anywhere in DATA_MODEL | `POST /me/report-card/export` (`format: pdf\|story\|mentor-letter`) | none | TBD | Not built |
| PR-36 | Profile – Certificates | Certificate view per cleared world: name, world, stars, issued date, XP, score, certificate ID | certificate record | `certificates` | `GET /me/certificates/:worldId` | none | 3 | Not built |
| PR-37 | Profile – Certificates | Certificate download as PDF (A4 landscape, browser print) | certificate render data + generated file | `certificates` (needs `file_key` populated) | `GET /me/certificates/:worldId/pdf` | none | 3 | Not built |
| PR-38 | Profile – Certificates | Certificate share sheet (WhatsApp/Instagram/LinkedIn/copy link) | shareable link or re-generated PDF | `certificates` | (same as PR-37, or a share-link endpoint) | none | 3 | Not built |

## Settings (SET)

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| SET-01 | Settings | Root menu: profile card (name, email, level, streak badge) with tap-through to Account | user name, email, level, current streak | `users` | `GET /me` | none | 3 (level/streak need progress economy) | Partially built (see /me) |
| SET-02 | Settings | "How to use Finlamma" entry row → opens 6-step tutorial | none (static copy) | none (static content) | none needed | none | TBD | Not built |
| SET-03 | Settings | 6-step onboarding/how-to-use walkthrough (title, body, 3 bullets, art, per-language) | static copy (en/hi/hx), current step index (client-only) | none | none needed (ships as static app content) | none, unless staff should be able to edit copy — see Gaps | TBD | Not built |
| SET-04 | Settings | Language switch (English / हिंदी / Hinglish) with live text preview | selected language | `users.language` | `PATCH /me` | none | 1 (`users.language` exists) | Partially built (see /me) |
| SET-05 | Settings | Theme switch (Dark / Light) with mock preview cards | selected theme | `users.theme` | `PATCH /me` | none | 1 (`users.theme` exists) | Partially built (see /me) |
| SET-06 | Settings | "Match my phone" system-theme option | theme preference = system | `users.theme` (needs a `system` value or separate flag) | `PATCH /me` | none | TBD | Not built (also inert/unwired in the prototype itself) |
| SET-07 | Settings | Notifications on/off toggle (root menu row) | notification opt-in flag | `notification_prefs` (per DATA_MODEL) | `GET/PATCH /me/notification-prefs` | none | 7 | Not built |
| SET-08 | Settings | Sound & haptics on/off toggle | sound pref | MISSING: no column for this in `users` or elsewhere in DATA_MODEL.md | `PATCH /me` (extend) or new `preferences` jsonb | none | TBD | Not built |
| SET-09 | Settings | Data saver on/off toggle (lower-res lesson videos) | data-saver pref | MISSING: not in DATA_MODEL.md | `PATCH /me` (extend) or new `preferences` jsonb | none | TBD | Not built |
| SET-10 | Settings | Account fields: Full name, Email, Mobile (masked), Bio — view + "Edit" affordance (no actual edit flow drawn) | first_name, email, phone, bio | `users` (first_name, email, phone exist); MISSING: no `bio` field in DATA_MODEL.md | `PATCH /me` (bio needs schema addition) | none | 1 for name/email/phone; TBD for bio | Partially built (see /me), bio missing |
| SET-11 | Settings | Login methods list: Google (linked), Password (change), Login PIN (off) | auth method status | Clerk-managed, not our DB | none — this is Clerk account-management UI, not our API | none | TBD | Not built — needs a decision, see Gaps |
| SET-12 | Settings | Log out (confirm sheet, "progress/streak/coins stay safe") | none (client-side session clear) | none | none (Clerk client SDK) | none | 1 | Not built (client-only, no server dependency) |
| SET-13 | Settings | "Delete my account permanently" | account deletion | `users` (soft-delete/anonymize, per DATA_MODEL) | `DELETE /me` | none | 1 (already built per ROADMAP) | Built server-side per ROADMAP — **the prototype's button itself has no onClick handler**, i.e. the mockup never wires this UI to anything |
| SET-14 | Settings | Contact channels: Ask Lamma AI (24×7), email (help@finlamma.in), WhatsApp support (hours shown), School partnerships | static contact info + optional AI entry point | none (static) for channel list; Doubt Zone AI itself needs `doubt_threads`/`doubt_messages` | none for static list; AI chat uses Doubt Zone endpoints | none | TBD (static list) / 7 (AI entry) | Not built |
| SET-15 | Settings | "Write to us" form: topic chips + message textarea + Send | topic, free-text message | MISSING: no support-ticket table in DATA_MODEL.md | `POST /support/messages` (new) or route to Resend email — proposal | possibly a "Support inbox" admin page (not in prototype) | TBD | Not built — decorative/non-functional in prototype too |
| SET-16 | Settings | Terms & Conditions: legal tabs (Terms of use / Privacy / Risk disclosure) + clause list | legal copy | none (static content), unless staff-editable — see Gaps | none needed if static | none, unless CMS-editable — see Gaps | TBD | Not built. **Note: in the prototype the tabs don't filter content — all 6 clauses always show regardless of selected tab** |
| SET-17 | Settings | Risk disclosure banner ("not a SEBI-registered investment adviser...") | static copy | none | none | none | TBD | Not built (copy exists, needs to ship as static app content) |
| SET-18 | Settings | Rate Finlamma: 1–5 star rating + verdict word + "what did you love" tag chips + feedback textarea + "Rate on Play Store" CTA | rating value, selected tags, free text | MISSING: no ratings/feedback table in DATA_MODEL.md | `POST /feedback/rating` (new, proposal) | possibly a feedback-review admin page (not in prototype) | TBD | Not built |
| SET-19 | Settings | App version/build footer (`v2.4.1 (build 318)`) | app version string | none | none (client constant) | none | N/A | N/A |
| SET-20 | Settings | Settings reachable both from Home (bell/profile area) and from Profile tab — same component, two entry points | none | none | none | none | N/A | N/A (UX note, not a distinct backend feature) |

## Lesson Flow + quizzes (LF)

| ID | Screen | Feature | Data needed | Tables | API endpoints | Admin page | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| LF-01 | Lesson Flow | Progress chunks bar — one segment per step, filled/current/upcoming | lesson's step list, current step index | `lessons` (content jsonb defines steps) | `GET /api/v1/lessons/{id}` | Content editor | 2 | Not built |
| LF-02 | Lesson Flow | Live XP counter, running accuracy (`score/asked`), streak-days chip shown during the lesson | running xp/score/asked, user's current streak | `xp_events`, `streaks` | `GET /api/v1/lessons/{id}`, `POST /api/v1/lessons/{id}/progress` | none | 2/3 | Not built |
| LF-03 | Lesson Flow | Combo meter (fills toward 3) + "FEVER MODE · 2× XP" state at combo ≥ 3 | current combo streak | `quiz_attempts`/`question_answers` (server tracks combo) | `POST /api/v1/lessons/{id}/steps/{n}/answer` (server-scored) | none | 2 | Not built |
| LF-04 | Lesson Flow | Video lesson (48s "Lamma-hosted live" format): play/pause, seek scrubber with cue-tick markers, 1×/1.5×/2× speed toggle, captions on/off (CC) | video asset URL, per-scene timestamps/captions, cue timestamps | `lessons` (content jsonb: scenes, cue times) | `GET /api/v1/lessons/{id}` | Content editor | 2 | Not built |
| LF-05 | Lesson Flow | Scene overlays synced to video timestamp: trade-barter animation, coin-value animation, money-timeline animation (3 distinct visual "kinds": trade/coins/timeline) | per-scene `kind`, `at`, `len`, `title`, `cap`, mascot `line` | `lessons` content jsonb | — (client-side render only) | Content editor | 2 | Not built |
| LF-06 | Lesson Flow | "2s warning" cue chip before an in-video question fires | next question's `at` vs current time | derived client-side from lesson content | — | — | 2 | Not built |
| LF-07 | Lesson Flow | In-video pop quiz sheet, triggered at fixed timestamps, pauses video | question bank per lesson with `at`, `type`, `timer`, options/tiles/pool, `answer`, explanatory `note` | `questions` (payload jsonb), `question_answers` | `POST /api/v1/lessons/{id}/steps/{n}/answer` | Content editor / quiz-maker | 2 | Not built |
| LF-08 | Lesson Flow | Pop-quiz format: MCQ/list-style tap (also reused for "predict" and "tapfast" speed-round subtypes) | question options | `questions` | same as LF-07 | Content editor | 2 | Not built |
| LF-09 | Lesson Flow | Pop-quiz format: 2×2 tile grid ("odd one out" style, glyph + label tiles) | question tiles (glyph+label pairs) | `questions` | same as LF-07 | Content editor | 2 | Not built |
| LF-10 | Lesson Flow | Pop-quiz format: tap-to-order word pool into numbered slots | `pool` array, correct `answer` order | `questions` | same as LF-07 | Content editor | 2 | Not built |
| LF-11 | Lesson Flow | Per-question countdown timer (6–16s depending on question), color shifts red under 30% remaining, auto-grades as wrong (with note) on timeout | per-question `timer` value | `questions` | same as LF-07 | Content editor | 2 | Not built |
| LF-12 | Lesson Flow | Pop-quiz scoring: base 20 XP (correct) / 4 XP (wrong); +10 speed bonus if answered in <45% of the timer; +3×min(combo,5) combo bonus; fever mode (combo≥3) doubles base+speed for that answer | scoring inputs above | `xp_events` (source breakdown), `vmoney_ledger` if XP converts | `POST /api/v1/lessons/{id}/steps/{n}/answer` (must be server-computed, never trust client) | none | 2/3 | Not built |
| LF-13 | Lesson Flow | Post-answer mascot reaction: correct/wrong/timeout speech line, face-swap animation, "cheer" particle burst on correct-with-streak | per-question `note`; mascot state machine | — (client-only presentation) | — | — | 2 | Not built |
| LF-14 | Lesson Flow | "SPEED BONUS +10" toast/chip shown when a fast-and-combo answer is graded | derived from scoring | — | — | — | 2 | Not built |
| LF-15 | Lesson Flow | In-lesson "Lamma AI" doubt chat: pauses video, shows scripted Q&A + suggested-question chips + a text input, resumes video on return | chat transcript, suggested prompts; if this IS the real AI mentor, needs live LLM calls | `doubt_threads`, `doubt_messages` (if same feature as Doubt Zone) | possibly `POST /api/v1/doubt-zone/messages` or a lesson-scoped variant | none | 2 or 7 — TBD, see gap | Not built |
| LF-16 | Lesson Flow | Practice-quiz step: multiple-choice "options" format, optionally framed with a dialogue snippet or a receipt/bill graphic | question payload + optional framing content | `questions` | `POST /api/v1/lessons/{id}/steps/{n}/answer` | Content editor | 2 | Not built |
| LF-17 | Lesson Flow | Practice-quiz step: sort items into 2 labeled buckets (e.g. Needs vs Wants) | items with correct bucket index | `questions` | same | Content editor | 2 | Not built |
| LF-18 | Lesson Flow | Practice-quiz step: arrange a word pool into ordered slots | pool + correct order | `questions` | same | Content editor | 2 | Not built |
| LF-19 | Lesson Flow | Practice-quiz step: fill-in-the-blank sentence built from a word pool | sentence parts + pool + correct fills | `questions` | same | Content editor | 2 | Not built |
| LF-20 | Lesson Flow | Practice-quiz step: match pairs (two columns, tap-tap to pair) | left/right items + correct pairing | `questions` | same | Content editor | 2 | Not built |
| LF-21 | Lesson Flow | Practice-quiz step: "spot the mistake" — tap the wrong line in a short scenario/plan | lines + which index is wrong | `questions` | same | Content editor | 2 | Not built |
| LF-22 | Lesson Flow | Practice-quiz scoring: 20 XP correct / 5 XP wrong, same combo/fever trigger as pop quiz (but no visible per-part XP breakdown) | — | `xp_events` | `POST /api/v1/lessons/{id}/steps/{n}/answer` | none | 2/3 | Not built |
| LF-23 | Lesson Flow | Post-answer feedback banner (green "Sahi jawab! +20 XP" / red with the question's explanatory note) | per-question `note` | `questions` | — | — | 2 | Not built |
| LF-24 | Lesson Flow | Lesson Report Card (result screen): accuracy ring %, headline based on accuracy threshold (≥83% = "impressed"), letter grade S/A/B/C (95/83/67% cutoffs) | full attempt log (per-question ok/secs) | `quiz_attempts`, `question_answers` | `GET /api/v1/lessons/{id}/attempts/{attemptId}` or inline from final submit | none | 2/3 | Not built |
| LF-25 | Lesson Flow | Report card: hero stats — avg answer speed, best combo, fastest single answer, each with a delta indicator | attempt log | `quiz_attempts` | same as LF-24 | none | 2/3 | Not built |
| LF-26 | Lesson Flow | Report card: per-question speed bar chart (bar height + glyph per question type, correct/wrong color) | per-question `type`/`ok`/`secs` | `question_answers` | same as LF-24 | none | 2/3 | Not built |
| LF-27 | Lesson Flow | Report card: XP breakdown bar (base / speed / combo / fever 2× shares) | `xp_events` grouped by source/reason for this attempt | `xp_events` | same as LF-24 | none | 2/3 | Not built |
| LF-28 | Lesson Flow | Report card: "Concept mastery" bars per sub-topic with % and delta | a mastery/skill model tying questions to concepts, tracked over time | MISSING: no `concept_mastery` or skill-tag table in DATA_MODEL.md | — | none | TBD | Not built |
| LF-29 | Lesson Flow | Report card: class-percentile "rank line" plus a slow↔fast bar with class-average marker | this student's class/cohort peer timing data | MISSING: needs a class/cohort grouping concept — not in DATA_MODEL.md | — | none | TBD | Not built |
| LF-30 | Lesson Flow | Report card: weekly streak strip (M–S, checked days) + record streak length, "days until it breaks" gap label | `streaks` | `GET /me` or embedded in lesson-complete response | none | 3 | Not built |
| LF-31 | Lesson Flow | Report card: next-unlock progress bar toward the next role-play lesson, with a note naming it | world/lesson unlock progress | `worlds`, `lessons`, user progress | same as LF-24 | none | 2/3 | Not built |
| LF-32 | Lesson Flow | Report card: "Weak spot" and "Superpower" coach-note callouts (1 sentence each, references a specific question/time) | derived insight text per attempt — likely AI-generated or rule-based | MISSING: no spec for how these sentences are generated (template vs AI) | possibly reuses `@anthropic-ai/sdk` per AI-features rule | none | TBD | Not built |
| LF-33 | Lesson Flow | Report card: confetti celebration animation on completion | — | — | — | — | 2 | Not built (pure UI) |
| LF-34 | Lesson Flow | "Restart lesson" control (chrome ✕ button) resets all lesson state | — | — | — | — | 2 | Not built |
| LF-35 | Lesson Flow | Primary CTA label/behavior changes by step type: video "Video khatam → practice shuru", AI "Wapas video pe aao", quiz "Check karo"/"Aage badho", done "Agla lesson — streak bachao" | current step/graded state | — | — | — | 2 | Not built |
| LF-36 | Lesson Flow (side-panel, prototype-only) | "Hook Loop" dev panel: Trigger/Action/Reward/Investment stage cards + a jump-to-any-node list + all in-video interrupt cue times — not part of the real phone UI, a prototype authoring/QA aid | n/a | n/a | n/a | n/a | n/a | Prototype-only, not to be built |

---

## Gaps & Questions

Organized by screen. Each item is either (a) something the prototype shows that PRODUCT_SPEC.md,
ROADMAP.md or DATA_MODEL.md don't cover or describe differently, or (b) fake/simulated data in the
prototype that needs a founder decision about how it should work for real. A prioritized summary
of the ones that most affect scope and schema is in the chat message that shipped alongside this
file.

### World Home
1. **XP→V Money conversion rate vs. per-lesson hardcoded rewards.** PRODUCT_SPEC says "100 XP = 250 VM (admin-controlled)" via a single `settings_kv` rate, but the prototype hardcodes separate, unrelated XP and VM rewards per lesson kind (e.g. Video = 20 XP **and** 10 VM — not a 100:250 ratio). Which model is real: one global conversion rate, or independently authored XP/VM per lesson?
2. **World unlock rule: XP vs. level vs. previous-world-cleared.** DATA_MODEL's `worlds.unlock_xp` implies an XP gate; the prototype's pills show `LVL 32/40/50` (level, not XP); PRODUCT_SPEC says "clearing the boss quiz unlocks the next world" (sequential, not XP/level). Which rule (or combination) is correct?
3. **Duplicated, inconsistent `WORLDS` data across screens** (World Home, Arena, Profile each hardcode their own copy) — expected in a prototype, just confirms `worlds` must be one real table.
4. **Mentors have no backing table anywhere in DATA_MODEL.** Should mentors be fully hardcoded/shipped in the app (no admin control), or a real admin-editable content type?
5. **Screen-time tracking isn't in DATA_MODEL or ROADMAP** — is session time purely client/PostHog-derived, or does the app need to report it to our API?
6. V Money weekly numbers in the prototype don't reconcile (spend+trade > balance) — just fabricated filler, no question needed.
7. **Notification auto-expiry after 30 days** — real rule, or prototype flavor text?
8. The scripted push-notification demo (4 items) is obviously prototype-only — confirm the notification *types* observed (streak, boss, market news, session goal, rank-change) is the full intended set for ROADMAP Phase 7.
9. Is the "Top 8%" percentile on World Home global, or scoped like Arena's leaderboard scopes?

### Arena
1. **Competitions are entirely undocumented** — no `competitions` table, no phase, no admin console anywhere in PRODUCT_SPEC/ROADMAP/DATA_MODEL. Is this in scope for v1, and if so which phase?
2. **Real-money prize pool (₹10,000 scholarship, ₹4,000 cash) contradicts "nothing involves real rupees."** Real money (KYC, payout rails, parental consent, tax/compliance) or virtual-only for v1?
3. "My State" scope needs a `state` field on `users` — collect it at signup? Privacy concern for a kid-safe app?
4. Per-user aggregate stats shown everywhere (lessons done, quiz accuracy, sim P&L) are prototype hash-based fakes — which are must-have for launch vs. cuttable (perf-sensitive if not)?
5. "LIVE" presence tag has no real-time presence concept elsewhere — worth building (Redis), or cut as a nice-to-have?
6. **League structure is flat, not tiered** — PRODUCT_SPEC implies real promotable tiers (Bronze/Silver/Gold); prototype only computes top/bottom 25% of one pool. Which is the real design?
7. Cheer has no rate limit/cooldown in the prototype — should it be limited to prevent XP farming?
8. Arena reward/prize amounts are hardcoded with no "admin-controlled" language (unlike the XP→VM rate) — should they be `settings_kv`-editable too?
9. Sparkline/member-count data has no source table — needs a daily snapshot job or Redis time-series.

### Trade + Ops console
**Doc gaps:** `market_controls` has no volatility field; no watchlist table (or is "watchlist" just the full always-shown instrument list?); no candle/OHLC history table; no indices data source; `funds` table is a one-line stub missing most fields shown; no risk-flag computation rule defined; `instruments` has no per-stock tip/tag fields.

**Fake data needing a decision:**
1. **Volatility slider (0–3×)** — once real Twelve Data prices are wired in, what should this control (removed entirely, a synthetic-fallback mode, a demo toggle)?
2. **Feed mode PAUSED/DELAYED** — confirm the exact real mechanism (stop forwarding Redis updates / serve N-minute-old prices) so it's not just a label.
3. 12-stock sector/about/tip text — admin-curated static text (matches PRODUCT_SPEC), or pulled from a data provider?
4. Brokerage ₹0 — confirmed permanent, just flagging it's a hardcoded string today.
5. Mutual fund returns/star ratings aren't AMFI fields — where do they come from if AMFI only gives NAV?
6. Ops console KPIs are hardcoded, not computed — confirm these become real aggregate queries.
7. Starting cash ₹5,00,000 — does a new user start at ₹0 and earn toward it, or is it seeded?

### News + Pulse Check + News Desk
**Doc gaps:** a 10th "PREDICT" quiz format toggle exists with no implementation — keep or remove? No table for staff-curated "FinLamma Desk" picks distinct from auto-ingested stories. No quality-grade (A/B/C) rubric defined. No topic taxonomy for "topic-wise mastery." Is the "7-day Pulse Check streak" the same `streaks` table as the main learning streak, or separate? No per-user "read" tracking table.

**Fake data needing a decision:**
1. News Desk KPIs ("31 ingested", "3.2L VM", "1,284 users") are hardcoded — live queries from day one, or an acceptable fixed dashboard early on?
2. "7 partner feeds" is flavor text — ARCHITECTURE.md says Finnhub + one India source (2, not 7). What's the real target?
3. Base VM per question (20/30/50) — admin-editable per PRODUCT_SPEC's general principle, or fixed?
4. Speed bonus/combo bonus/all-correct bonus constants — intended real values, or should they be `settings_kv`-configurable?
5. Live "N people playing now" counter — real-time concurrent count in scope, or a cheaper static "X played today"?

### Profile + report card + certificates
**Doc gaps:** DATA_MODEL has no table at all for the weekly report card, efficiency score, coach notes, topic mastery, or the 5-week consistency heatmap — ROADMAP Phase 3 doesn't list a report-card item either. **Nothing anywhere mentions a parent/mentor contact**, yet the prototype has a real "send weekly summary to Mentor" letter feature — is this a self-service PDF the student shares themselves, or a real notification/email to a registered parent contact (needs consent + contact storage)? Does Profile's rank/percentile read from Arena's weekly snapshot (built later, Phase 6) rather than compute its own?

**Fake data needing a decision:**
1. Coach notes are hand-written per the sample numbers — AI-generated per user per week (with staff review, like news drafts?), or templated?
2. Module letter-grade cutoffs (S/A/B/C) have no stated rule beyond the sample data — what are the real thresholds, fixed or admin-tunable?
3. Badge VM rewards/thresholds are hardcoded per badge — admin-editable like the XP→VM rate, or fixed at launch?
4. All reward-catalog brands are explicitly fictional (prototype admits "no real tie-ups") — real partners need sourcing before launch; is a reward-catalog admin CRUD in scope for Phase 3?
5. Locked-reward pricing scales with the *viewing user's own balance* — a UI trick, not a real price. Real rewards should have fixed admin-set VM prices instead?
6. Certificate ID format (`FL-<world>-<year>-<4 digits>`) and the report-card ID formula are both arbitrary — what's the real ID generation rule?
7. Certificate/report download and share both just open the browser print dialog — confirm real implementation needs actual server-side PDF generation + storage (`certificates.file_key` already implies this).

### Settings
1. **Not itemized in ROADMAP.md at all**: sound/haptics, data-saver, contact channels, support form, rate-app flow, legal-content delivery, PIN login.
2. `bio` field missing from `users` in DATA_MODEL — add it, or out of scope?
3. No preferences storage for sound/haptics/data-saver — new `users` columns, or one `preferences jsonb`?
4. **Legal content (Terms/Privacy/Risk disclosure)**: static in the app repo, or staff-editable via a simple CMS? The prototype's version is English-only (no hi/hx) unlike everything else — intentional, or just not bothered with in the mockup?
5. **Login methods (Google/Password/PIN)** — should this literally reflect Clerk's own account UI, or a thin Finlamma wrapper? "Login PIN" isn't a documented Clerk or Finlamma concept anywhere — real feature or cut?
6. **Legal clauses mention parental-consent and school-account concepts** not modeled anywhere — is COPPA/DPDP-style parental consent actually in scope for v1, or boilerplate that overstates real scope?
7. "Write to us" and "Rate Finlamma" are non-functional even in the prototype — real ticket table + admin inbox, or just deep-links to email/Play Store with no backend?

### Lesson Flow + quizzes
1. **PRODUCT_SPEC's "6 node kinds" don't map cleanly onto what's built.** Only one continuous Video-flow example exists; no Story, Boss Quiz, or Role Play example anywhere. Do those reuse this same `lf` engine with different content, or are they structurally different screens still needing design?
2. **Two different quiz-format taxonomies** exist (5 pop-quiz types vs. 6 practice types), overlapping with but distinct from Pulse Check's own 9 formats, and PRODUCT_SPEC only names a few examples. Is the full canonical format list the union of all of these, or should they converge into one shared list app-wide?
3. **Fever mode's exact rule (combo=3 → 2× XP) is hardcoded and undocumented** in PRODUCT_SPEC (which just says "fever mode on long combos"). Keep exactly this rule, or is it a placeholder?
4. **Speed-bonus threshold mismatch: PRODUCT_SPEC says "within half the time," the prototype's actual code uses 45% of the timer.** Which number is final? Also: there's no visible separate "all-correct bonus" in this engine (only in Pulse Check) — does lesson scoring need one too?
5. "Concept mastery" and "class percentile" need data models nothing in DATA_MODEL covers (skill/concept tagging, a class/cohort grouping concept). Real scored metrics, or decorative/simulated?
6. "Weak spot"/"Superpower" coach-note sentences — same question as Profile's coach notes: AI-generated or templated?
7. **Is the in-lesson "Lamma AI" doubt chat the real Doubt Zone feature (Phase 7) surfaced mid-lesson, or a separate simpler scripted explainer that could ship in Phase 2 without a live LLM?**
8. All lesson content is Hinglish-only in the prototype (unlike World Home's UI chrome) — confirms the prototype just doesn't demo the translation layer for content, not that content shouldn't be translated (ROADMAP Phase 2 already requires en/hi/hx per content field).
9. Only one lesson's worth of content exists — does every video lesson reuse the same 3 scene "kinds" (trade/coins/timeline), or is scene "kind" an open enum content authors pick per lesson?

### Global / App shell
1. **The V Money balance the app displays is derived directly from the Trade screen's own cash + market value of positions in the prototype**, not from a separate ledger balance. DATA_MODEL's `vmoney_ledger` is meant to be the source of truth for V Money (per ARCHITECTURE.md decision D7, "balances are derived" from the ledger) — confirming the real implementation computes the displayed balance from `vmoney_ledger`, and that the Trade `cash` figure is itself just one more ledger-derived read, not an independent number that could drift from it.
