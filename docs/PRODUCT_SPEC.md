# Finlamma — Product Spec

Source of truth for *what* we build. Derived from the clickable prototype
(`D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI`). When the prototype and this
file disagree, ask the user.

## What Finlamma is
A gamified financial-literacy app for Indian students and young earners. Users learn
through a map of "worlds" (staff decide how many — see §1), earn XP and **V Money**
(virtual currency), and practise paper trading on real NSE market data. Nothing involves
real rupees. Educational only — never investment advice.

Languages: **Hinglish (default)**, English, Hindi (Devanagari). Themes: dark (default), light.
Mascot family: Lamma characters (Baby, Young, Father, Mother, Brother, Sister, Grandpa,
Professor, Trader) with ~20 expressions.

## Navigation
Bottom tabs: **Home (World map) · Arena · Trade · News · Profile**. Settings is reached from Home.

## 1. World Home & Lessons
- **Worlds are a fully data-driven, unbounded content type (D25, `docs/ARCHITECTURE.md`)**:
  staff decide how many exist (5, 7, 10, 20, any number), their names, order, tagline, art
  and accent color, all through the admin World editor. v1 seeds an initial 7-world set
  (Money World → Savings Valley → Budget Bazaar → Market Maidan → Risk Ridge → Economy
  Empire → Elite Summit) as **starting content only** — fully editable, reorderable, and
  (once empty of lessons) deletable, not a fixed spec.
- **World unlock is sequential only**: the first (lowest-order) published world is unlocked;
  clearing a world's **Boss quiz** unlocks the next one. There is no separate XP or level gate
  — a locked world's card shows the user's XP/level as a **progress indicator only**, never as
  the actual unlock condition, and never a paywall. Trading's own unlock (§4) is
  **position-based**, not tied to any specific world: it opens once the learner passes the Boss
  Quiz of the world at `settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition`
  (default: the 3rd published world, super_admin-editable).
- A world is a trail of lesson nodes. Six node kinds: **Video, Story, Quiz, Boss Quiz,
  Role Play, Doubt Zone**. Boss Quiz and Role Play don't need their own screens — both reuse the
  same lesson-flow engine as a normal Quiz step, Boss Quiz with higher-stakes settings (longer
  timer, bigger reward, chapter-final framing) and Role Play as a dialogue/scenario-framed
  practice step ("you play the decision-maker and live with the result").
- Video lessons (~48 s) have timed in-video pop quizzes (e.g. 6-second "lightning" tap,
  ordering, matching, slider). Captions on/off, playback speed.
- Scoring: base per correct answer + speed bonus (answered within **45%** of the allotted time)
  + combo bonus + fever mode (2× on base+speed once combo reaches 3) on top of that. The result
  screen shows a breakdown. These constants (speed-bonus %, fever threshold, fever multiplier,
  combo-bonus-per-step) are admin-editable config, not hardcoded — same mechanism as
  `reward_rules` (see §2).
- **Doubt Zone** ("AI Chat" node): in **v1 (Phase 2b) this is scripted** — a fixed Q&A written by
  the content team per lesson, no live AI call. The **real "Ask Lamma AI" live AI mentor ships in
  Phase 7**, with the safety and rate-limit rules a minors-facing AI feature needs; it then
  becomes what this node kind (and the standalone Doubt Zone entry point) actually calls.
- **Mentors are a fully data-driven, unbounded content type (D25)**: staff create any number
  of Lamma mentors (name, bio per language, art, persona/voice notes for the Doubt Zone AI
  chat). A mentor's assignment to a world lives **only** on `worlds.mentorId`, chosen per world
  in the admin World editor — one mentor can cover many worlds. v1 seeds Baby/Father/Grandpa
  Lamma as an initial, fully-editable starting set, not a fixed 3-stage system.
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
- Weekly leaderboards (reset weekly). Scopes: class, school, state, India, world teams. The
  **state** scope is **optional** — collected at onboarding with a plain-language explanation of
  why it's asked, used only to place the user in the state leaderboard, and **never shown on
  any public profile**.
- Leagues with promote (top ~25%) / demote (bottom ~25%) / safe band — a flat pool per scope, not
  named tiers. Promote/safe/demote reward amounts (V Money, crest) are admin-editable via the
  same `reward_rules`-style mechanism as lesson rewards.
- Worlds table: XP per world and XP-per-member so small worlds can compete.
- **Cheers**: send a cheer to any player; the receiver gets +5 XP and a notification. **Limits**:
  one cheer per recipient per sender per day; a daily cap on total XP a user can receive from
  cheers; un-cheering and re-cheering the same person never re-awards the XP.
- **Kid-safe**: public name is first name + last initial only. No profile photos, no chat.
- **Monthly Competition**: a single-stock trading contest with its own isolated virtual capital,
  ranked by ROI%. **Prizes are never real money** — V Money, exclusive badges/titles, and optional
  brand coupons from the Rewards catalog only, with prize amounts admin-configurable per
  competition (same mechanism as promote/safe/demote rewards above). (Sponsored non-cash prizes,
  e.g. real-world merchandise, are a possible future addition, but only after legal review — not
  in v1 scope.)

## 4. Trade (paper trading)
- **Explore mode from day one**: live prices, charts, watchlist and stock info are visible to
  every user regardless of progress. The **order pad** (placing real BUY/SELL orders) unlocks
  once the learner passes the Boss Quiz of the world at position
  `settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition` (default: the 3rd published
  world, super_admin-editable) — **by position, never a specific world's id or name** (D25,
  `docs/ARCHITECTURE.md`), so it keeps working automatically if worlds are added, removed or
  reordered ahead of it, and not a separate XP/level threshold — shown with a progress message
  ("N worlds to go"). If fewer published worlds exist than the configured position, trading
  stays locked for everyone (`GET /api/v1/health` warns). No grant on unlock: trading capital is
  whatever V Money the learner has already earned (see §2), carried over automatically.
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
  V Money a typical learner has by the trading-unlock world, and whether it's enough to trade
  comfortably).

### Ops console (admin)
Feed mode LIVE / 15-min delayed / paused, per-symbol halts, global halt (order pad rejects on the
phone), V Money issuance multiplier, user ledger with risk flags, audit log. **No volatility
control and no synthetic prices, ever** — when the market is closed, every screen simply shows
the last real close; nothing simulates price movement near a real trade.

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
Certificates: view, share, download PDF (server-rendered, no headless browser — see
`docs/DATA_MODEL.md`). Sharing a certificate or the weekly report is the student generating and
sending the file themselves via the device share sheet — v1 never contacts anyone on the
student's behalf (see the parental-consent note in §7 for why that boundary matters).

**Rewards**: at launch, **Finlamma-only** — badges, titles, cosmetic themes — each with a
**fixed, admin-set V Money price**. No brand coupons and no fictional partner brands at launch.
Real brand-partner rewards are a later addition once partnerships exist, added the same way
(admin CRUD, fixed price) without a schema change.

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

## Onboarding & parental consent (real, v1 scope, decided at Phase 2a kickoff)
- Onboarding collects **date of birth**, set once. After that, the user cannot change their own
  date of birth — only staff can correct it, and only with a reason, which is logged
  (`activity_logs`). A user with no date of birth yet is treated as "onboarding incomplete" by
  `requireFullAccess` (see below), same as an unverified minor.
- A user under 18 requires **verifiable parental consent** before full app access. **v1 is
  email-link only — there is no code-based path**, because a code is trivially self-verifiable by
  a child who controls a second email address. Flow:
  1. The app collects a parent/guardian **email** (see constraints below) and calls
     `POST /me/parent-consent/request`.
  2. We email the parent a **magic link** to a public, unauthenticated page
     (`/consent/confirm?token=...`) — no Finlamma account or app install needed. The page shows
     the child's **first name only**, a plain-language summary of what data we collect, and the
     current Terms/Privacy/Risk-disclosure summaries.
  3. **Opening the link (GET) never verifies or records anything** — email security scanners
     prefetch links, so a GET must be side-effect-free. The page has two buttons: **"I consent"**
     and **"I do not consent"**, each a separate `POST`. Consenting records a `consent_records`
     row (status `consented`) plus a `legal_acceptances` row (`accepted_by: 'parent'`) for every
     currently published legal document. Declining records a `refused` status and nothing else.
  4. **The minor must also accept in-app, once, after the parent has consented** — a second,
     independent acceptance (`legal_acceptances`, `accepted_by: 'self'`). Full access requires
     **both**: parent consent recorded *and* the minor's own in-app acceptance. (An adult, 18+,
     only ever does the self-acceptance — there's no parent step.)
  - **Token rules**: valid **7 days**, single-use (a second POST with the same token is
    rejected), stored **hashed**, never in plaintext. Resending the consent email is rate-limited:
    a **60-second cooldown** plus a **daily cap**, tracked **per user and per parent email**
    independently (so one can't be used to exhaust the other).
  - **Withdrawal**: every email sent to a verified parent (not just the initial request) includes
    a separate "withdraw consent" link, following the exact same GET-shows-a-page /
    POST-records-the-action pattern. Withdrawing immediately drops the account back to limited
    access, records a `withdrawn` status in `consent_records`, and is logged. **Parent requests to
    delete their child's data go through support for now** — no self-service deletion flow from
    the consent page in v1.
  - **Parent email constraints**: it cannot equal the child's own account email, and one parent
    email can be linked to at most **5 children by default** (admin-configurable via
    `settings_kv`), to limit abuse of a single inbox to farm consent for many accounts.
  - Every consent event (request, consent, refusal, withdrawal) is recorded — who acted, when, by
    what method, and which legal-document version was in effect.
  - **Limited access, until both parent consent and the minor's own acceptance are complete**:
    only onboarding, Settings, and the legal document pages are available. Every endpoint that
    awards XP/V Money, or touches trading or Arena/social features — from Phase 2b onward — must
    call `requireFullAccess(user)` before proceeding; this is not enforced retroactively, it's a
    requirement on every new endpoint as it's built.
- **School/institution accounts are out of scope for v1** (moved to a future v2) — the legal text
  no longer references them.
- **Legal documents** (Terms, Privacy, Risk disclosure) are **staff-editable with versioning**.
  Only **super_admin** can publish a new version (permission `legal.manage`). Every acceptance (by
  a user, or for a minor by their consenting parent, plus the minor's own separate acceptance —
  see above) records which document version was accepted. Publishing a new version prompts
  re-acceptance from everyone who hasn't accepted it yet. **v1 launches with placeholder
  documents clearly marked DRAFT** — the real text is written after the outside legal review
  below, then published for real.
- **Parent re-approval on a material legal-document change**: when staff publish a new version,
  they must explicitly choose **Yes/No** (no default — the Publish button stays disabled until
  they pick) for whether it materially changes something a minor's parent already agreed to. A
  placeholder version can never require re-approval, regardless of what staff pick.
  - **On Yes**, every already-consented, non-deleted minor's parent gets a fresh re-approval
    email: a **new 7-day single-use link** to a public page (`/consent/reapprove?token=...`,
    same GET-is-side-effect-free / separate-POST-per-choice pattern as the original consent page,
    with the same language switcher) showing the updated document, plus the parent's **current
    withdraw-consent link** (every email to a verified parent must carry one — see below).
    Resending reuses the exact same 60s-cooldown/daily-cap rate limiting as the original
    consent-request flow.
  - **While pending, the minor drops back to limited access** via `requireFullAccess` — same
    bucket as before their parent's first consent, but a distinct error
    (`PARENT_REAPPROVAL_REQUIRED`) so the app can show "your parent needs to approve an update"
    rather than "your parent hasn't consented yet."
  - **Approving** records a fresh `legal_acceptances` row (`accepted_by: 'parent'`) for that exact
    document version and folds the version into `consent_records.legal_document_versions`, so
    access is restored immediately.
  - **Declining is the same outcome as the original decline flow** — it revokes the parent's
    consent entirely (not just this one document), returning the account to limited access.
  - The token flip and its follow-up write(s) happen in one database transaction, so a crash
    mid-request can never burn a parent's one-time link without actually recording the outcome.
  - A signed-in minor can ask for their own pending re-approval email(s) again via
    `POST /me/legal/reapproval/resend`.
- **Staff access to parent contact details is itself logged.** The `consent.view` permission
  (granted to `user_manager`) is read-only — staff can see consent/legal-acceptance status and
  cannot bypass or force it — and every time a staff member views a parent's contact details, that
  view is written to `activity_logs`.
- **Before launch**: the consent flow and the terms/privacy/risk-disclosure text need an outside
  legal review — not something this codebase can self-certify (tracked in `docs/ROADMAP.md`).

## Monetisation
- Ads start after the user completes World 3; hidden for ad-free subscribers.
- Ad-free monthly subscription via RevenueCat + Apple/Google in-app purchase.
- Razorpay is out of scope for v1.

## Staff roles (admin dashboard)
Super admin, user manager, content uploader, content publisher, quiz maker (extensible).
Every staff and user action is written to the activity log.
