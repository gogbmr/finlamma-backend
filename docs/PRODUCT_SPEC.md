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
- Completing a world issues a printable A4 **certificate** (ID like `FL-MW-2026-0417`, XP, score, date).

## 2. Progress economy
- **XP** raises level and unlocks worlds. **V Money** is earned from lessons/Arena and
  spent on trades, badges and brand coupons. Conversion example: `100 XP = 250 VM`
  (rate is admin-controlled).
- The ₹5,00,000 practice balance is **earned, not gifted**. "Add V Money" is refused.
- **Streak** = consecutive days (IST) with learning. **2 streak freezes per month**.
- Daily goal meter and session timer nudges.
- Push notifications: streak about to break, boss battle, market news, session goal.

## 3. Arena (social)
- Weekly leaderboards (reset weekly). Scopes: class, school, state, India, world teams.
- Leagues with promote (top ~25%) / demote (bottom ~25%) / safe band.
- Worlds table: XP per world and XP-per-member so small worlds can compete.
- **Cheers**: send a cheer to any player; the receiver gets +5 XP and a notification.
- **Kid-safe**: public name is first name + last initial only. No profile photos, no chat.

## 4. Trade (paper trading)
- 12 NSE large caps: RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, SBIN, ITC, TATAMOTORS,
  BHARTIARTL, HINDUNILVR, LT, ASIANPAINT (list is admin-editable).
- Stock detail: candlestick chart (timeframes), sector, about text, market cap, P/E, volume.
- Order pad: BUY/SELL, MARKET/LIMIT, qty stepper (1/5/10/MAX), order value, available
  margin, ₹0 brokerage, rejection states that name the reason.
- Orders book, holdings, P&L. Every order uses the server-side price.
- Mutual funds: SIP and lump-sum on a few index/direct funds (virtual).
- Weekly portfolio report in Profile.
- Market status respects NSE hours (09:15–15:30 IST) and holidays.

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
opportunity / habit), coin ledger. **Efficiency score** 0–100 = average of retention,
watch speed, quiz accuracy, consistency, with the weakest part explained.
Badges e.g. Pehla Kadam, Paper Trader, News Nerd, Streak Star, Speed Reader, Arena King.
Certificates: view, share, download PDF.

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
