# Finlamma — Product Spec

Source of truth for *what* we build. Derived from the clickable prototype
(`D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI`). When the prototype and this
file disagree, ask the user.

## What Finlamma is
A gamified financial-literacy app for Indian students and young earners. Users learn
through a map of 7 "worlds", earn XP and **V Money** (virtual currency), and practise
paper trading on real NSE market data. Nothing involves real rupees.
Educational only — never investment advice.

Languages: **Hinglish (default)**, English, Hindi (Devanagari). Themes: dark (default), light.
Mascot family: Lamma characters (Baby, Young, Father, Mother, Brother, Sister, Grandpa,
Professor, Trader) with ~20 expressions.

## Navigation
Bottom tabs: **Home (World map) · Arena · Trade · News · Profile**. Settings is reached from Home.

## 1. World Home & Lessons
- 7 worlds in order: Money World → Savings Valley → Budget Bazaar → Market Maidan →
  Risk Ridge → Economy Empire → Elite Summit.
- World 1 is unlocked. Each world ends in a **Boss quiz**; clearing it unlocks the next world.
  Locked worlds show a level/XP target, never a paywall.
- A world is a trail of lesson nodes. Six node kinds: **Video, Story, Quiz, Boss Quiz,
  Role Play, Doubt Zone**.
- Video lessons (~48 s) have timed in-video pop quizzes (e.g. 6-second "lightning" tap,
  ordering, matching, slider). Captions on/off, playback speed.
- Scoring: base per correct answer + speed bonus (answered within half the time) +
  combo bonus + all-correct bonus; "fever" mode on long combos. The result screen shows
  a breakdown.
- **Doubt Zone**: "Ask Lamma AI" — an AI mentor that answers in the user's language.
- **Mentor evolution**: the user's mentor changes as they progress through worlds (e.g. Baby →
  Father → Grandpa Lamma), each stage covering a fixed range of worlds with its own bio and
  dialogue. Mentors are an **admin-editable content type** (name, bio, world range, art, per
  language) — not hardcoded in the app — so staff can add or adjust stages without a release.
- Completing a world issues a printable A4 **certificate** (ID like `FL-MW-2026-0417`, XP, score, date).

## 2. Progress economy
- **XP and V Money are earned side by side, never converted from one another.** XP is never
  spent — it only drives level and world unlocks. V Money is the only spendable currency (trades,
  badges, brand coupons). There is no global "100 XP = X VM" conversion rate.
- Every earning activity (video, story, AI chat, role play, quiz, boss quiz, Pulse Check question,
  streak bonus, Arena cheer, etc.) has its own admin-editable XP and VM amount in a `reward_rules`
  table — see `docs/ECONOMY.md` for the seeded starting values and the simulation behind them.
  Individual lessons/quizzes may override their kind's default. Speed, combo, fever-mode and
  all-correct bonuses are computed server-side on top of the base amount, per the exact formulas
  in `docs/FEATURE_MAP.md` (Lesson Flow and Pulse Check sections).
- A separate, admin-controlled **global VM issuance multiplier** (default 1.0, in the Ops console)
  scales every VM award at the moment it's issued, without touching the seeded `reward_rules`
  values or requiring a redeploy. The multiplier actually applied is stored on every
  `vmoney_ledger` entry, so any balance stays fully explainable.
- **No V Money grant, ever.** There is no starting balance and no "unlock bonus." A learner's
  trading capital is purely the V Money they've earned so far, carried over automatically the
  moment trading unlocks (see §4). "Add V Money" is refused.
- **Streak** = consecutive days (IST) with learning. **2 streak freezes per month**.
- Daily goal meter and session timer nudges.
- Push notifications: streak about to break, boss battle, market news, session goal.

## 3. Arena (social)
- Weekly leaderboards (reset weekly). Scopes: class, school, state, India, world teams.
- Leagues with promote (top ~25%) / demote (bottom ~25%) / safe band.
- Worlds table: XP per world and XP-per-member so small worlds can compete.
- **Cheers**: send a cheer to any player; the receiver gets +5 XP and a notification.
- **Kid-safe**: public name is first name + last initial only. No profile photos, no chat.
- **Monthly Competition**: a single-stock trading contest with its own isolated virtual capital,
  ranked by ROI%. **Prizes are never real money** — V Money, exclusive badges/titles, and optional
  brand coupons from the Rewards catalog only, with prize amounts admin-configurable per
  competition. (Sponsored non-cash prizes, e.g. real-world merchandise, are a possible future
  addition, but only after legal review — not in v1 scope.)

## 4. Trade (paper trading)
- **Explore mode from day one**: live prices, charts, watchlist and stock info are visible to
  every user regardless of progress. The **order pad** (placing real BUY/SELL orders) is locked
  until the learner reaches **Market Maidan (World 4)** by default — an admin-configurable unlock
  world in the Ops console — shown with a progress message ("Reach Market Maidan to start trading
  — N worlds to go"). No grant on unlock: trading capital is whatever V Money the learner has
  already earned (see §2), carried over automatically.
- 12 NSE large caps: RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, SBIN, ITC, TATAMOTORS,
  BHARTIARTL, HINDUNILVR, LT, ASIANPAINT (list is admin-editable).
- Stock detail: candlestick chart (timeframes), sector, about text, market cap, P/E, volume.
- Order pad: BUY/SELL, MARKET/LIMIT, qty stepper (1/5/10/MAX), order value, available
  margin, ₹0 brokerage, rejection states that name the reason. **Whole shares only** — no
  fractional/amount-based orders, matching real NSE trading.
- Orders book, holdings, P&L. Every order uses the server-side price.
- Mutual funds: SIP and lump-sum on a few index/direct funds (virtual). SIP minimums are tiered
  by fund category: **₹100** for index funds, **₹500** for equity/hybrid/debt/ELSS funds.
- Weekly portfolio report in Profile.
- Market status respects NSE hours (09:15–15:30 IST) and holidays.
- See `docs/ECONOMY.md` for the simulation behind the reward values and unlock design (how much
  V Money a typical learner has by World 4, and whether it's enough to trade comfortably).

### Ops console (admin)
Feed mode LIVE / 15-min delayed / paused, volatility setting for simulations, per-symbol
halts, global halt (order pad rejects on the phone), XP→V Money issuance rate, user
ledger with risk flags, audit log.

## 5. News & Pulse Check
- Daily finance news rewritten for students: 3-line explainers, one jargon term explained
  per story (repo rate, index, CPI, IPO…). Categories, bookmarks, "good/bad for market" tags.
- Includes scam-awareness stories (e.g. "guaranteed return" Telegram groups).
- **Pulse Check**: timed quiz at the end of the feed built from today's stories. Formats:
  MCQ, Sach-ya-Afwah (fact or rumour), number-guess slider, odd-one-out, good/bad sorting,
  fill-in-the-blank, match pairs, "biggest impact" ordering, spot the fake headline.
  Every question shows its source headline.

### News Desk console (admin)
Ingestion pipeline (e.g. 31 ingested → 8 simplified), per-story publish toggle,
quiz generator (question count, timer, base coins, formats on/off), 7-day engagement, audit log.

## 6. Profile
Overview → Stats → Badges → Rewards. Weekly report card: module table (done, time,
accuracy, grade), 8-week speed vs accuracy trend, coach notes (strength / gap /
opportunity / habit), coin ledger.
Badges e.g. Pehla Kadam, Paper Trader, News Nerd, Streak Star, Speed Reader, Arena King.
Certificates: view, share, download PDF.

### Weekly report card — in scope for v1
Computed by a weekly Inngest job (Monday, IST) that writes a per-user weekly snapshot; the
snapshot powers the module table, the 8-week trend, and this week's coach notes. No AI involved —
every number and sentence below is computed/templated server-side.

**Efficiency score** (0–100) = average of 4 sub-metrics, each itself 0–100:
- **Retention**: % of questions on a previously-completed topic that the user answers correctly
  when it reappears later (in Pulse Check or a later lesson's review question). Before a user has
  any repeat-exposure data (e.g. their first week), retention defaults to their current quiz
  accuracy.
- **Watch speed**: `clamp(video duration / actual time spent watching, 0, 1) × 100` (actual time
  excludes paused/idle time) — rewards finishing near the video's real length without excessive
  re-watching; never penalizes watching at normal (1×) speed.
- **Quiz accuracy**: % of quiz-type answers correct across the period (practice quiz + in-video
  pop quiz + Pulse Check, combined).
  - **Consistency**: `active days ÷ days in period × 100`, where an active day is one with any
    completed lesson step, Pulse Check, or trade.

**Coach notes** — 4 categories, sentence templates in en/hi/hx with placeholders for the user's
real numbers/topics, stored in an admin-editable table (draft → publish, logged like all content):
- **Strength (Taakat)**: the sub-metric that scored highest this period.
- **Gap**: the sub-metric that scored lowest this period.
- **Opportunity (Mauka)**: the topic with the lowest per-topic mastery % among topics the user
  hasn't revisited in N days.
- **Habit (Aadat)**: derived from consistency/streak data (e.g. best study day of the week, or a
  nudge if the streak broke recently).
- The result screen's **"weak spot" topic** is the topic tag with the lowest recent accuracy
  (minimum sample size, e.g. ≥3 attempts) among topics attempted in the period; "superpower" is
  the highest, same rule.

A future phase may explore AI-generated notes (with the same staff-review-before-publish pattern
as news/quiz drafts), but v1 ships template-only.

## 7. Settings
How-to-use walkthrough, language, appearance, notifications, sound & haptics, data saver,
account (name, email, login), contact, rate app, terms/privacy/risk disclosure, about, log out,
delete account.

## Monetisation
- Ads start after the user completes World 3; hidden for ad-free subscribers.
- Ad-free monthly subscription via RevenueCat + Apple/Google in-app purchase.
- Razorpay is out of scope for v1.

## Staff roles (admin dashboard)
Super admin, user manager, content uploader, content publisher, quiz maker (extensible).
Every staff and user action is written to the activity log.
