# Prototype Index

Map of the clickable prototype at `D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI`
(read-only, outside this repo — never edit it). Built by reading the whole prototype screen by
screen; see `docs/FEATURE_MAP.md` for the feature-by-feature breakdown this index supports.

## Files

| File | What it is |
|---|---|
| `Finlamma App.dc.html` | The entire prototype: one file, ~10,744 lines. A custom declarative template (`<x-dc>`, `<sc-if>`, `<sc-for>` tags, `{{ }}` bindings) for the markup (lines ~1–4567), followed by a plain-JS logic section (lines ~4568–10744) with one class per screen, each exposing `renderVals()` that produces the view-model the markup binds to. |
| `i18n.js` | Auto-extracted `DICT` — every literal source string used anywhere in the markup, keyed by the string itself, mapped to `[en, hi, hx]`. Generated, not hand-authored; not scoped per screen. Applied at runtime by walking the live DOM text nodes (`_i18nApply()` in the root shell, ~line 10497) — a demo trick, not how the real app should localize (the real app renders already-translated content per `user.language`, it doesn't DOM-patch). |
| `strings.txt`, `strings2.txt` | Same string dump as `i18n.js`, different formats (source strings only vs. with translations). No additional signal beyond `i18n.js`. |
| `support.js` | Prototype framework runtime (the `DCLogic`/`x-dc` engine itself). Not app content — skip. |
| `assets/` | Brand marks (`fl-*.png`), the Lamma mascot family art (`lm-*.png` — young/father/grandpa mentor stages, ~20 `lm-ex-*.png` expression stills), a couple of hero/background images. |
| `screenshots/` | Loose reference screenshots (names like `holo-hud.png`, `grid-A.png`, `push-compact.png`, `alert.png`) — visual references for specific UI moments, not opened during this pass (out of scope; names suggest World Home hologram stats, Trade grids, and push/alert cards). |
| `uploads/` | User-uploaded miscellany (WhatsApp images, a couple of AI-generated images, a logo) — unrelated to any screen, skip. |

## Screen → line-range map

Each top-level tab is `m0`–`m4` in the markup, with its own screen-var namespace (`p1`–`p5`) and
a matching logic class. The Settings sheet (`s1`/`s2`) and the full-screen Lesson Flow overlay
(`lf`) are separate reusable components mounted from inside other screens. The root `App` class
(~10472–10744) composes all of them, owns tab navigation (`go(i)`), the global V Money balance
display (`vmAmount()` — note: in the prototype this is literally derived from the Trade screen's
own `cash + market value of positions`, not a separate ledger balance; flagged in FEATURE_MAP's
gap list), theme, and the i18n DOM-patch described above.

| Tab | Markup lines | Logic class / lines | Namespace |
|---|---|---|---|
| Home (World Home) | 88–593 | `Component.P1`, ~4568–5986 | `p1` |
| ↳ Settings sheet (mounted from Home) | 594–877 | `Component.SET`, ~9444–9781 | `s1` |
| Arena | 878–1399 | `Component.P2`, ~5986–6674 | `p2` |
| Trade (+ Ops console) | 1400–2030 | `Component.P3`, ~6674–7397 | `p3` |
| News (+ Pulse Check + News Desk) | 2031–2768 | `Component.P4`, ~7397–8380 | `p4` |
| Profile (+ report card + certificates) | 2769–3460, 3741–3963 | `Component.P5`, ~8380–9551 | `p5` |
| ↳ Settings sheet (mounted from Profile) | 3461–3740 | (same `Component.SET` as above) | `s2` |
| Lesson Flow (full-screen overlay, opened from Home) | 3964–4559 | `Component.LF`, ~9782–10471 | `lf` |
| App shell / root | n/a | `App`, ~10472–10744 | — |

`s1`/`s2` are two mount points of the *same* Settings component — byte-identical markup, verified
by direct comparison. `lf` is not one of the `m0`–`m4` tabs; it's a full-screen overlay
(`lessonMounted` flag) that slides up over whichever tab is active.

---

## Home (World Home) — `p1`

**Markup (88–593):**
- 98–242 header, hologram stat strip (time/streak/vmoney/xp tiles, each expandable), resume
  banner, world cards list, mentor panel
- 244–340 the per-world "journey" map sub-view — interactive drag-to-tilt 3D lesson path
- 342–366 lesson-select bottom sheet (tap a path node)
- 368–420 onboarding/mentor-intro modal (mentor bio + typed dialogue + worlds they teach)
- 422–431 bottom tab nav
- 433–498 full-screen Notifications panel (hero rich-push card + grouped list)
- 500–529 in-app "news" toast/push simulation
- 531–548 in-app "Lamma" full-card alert simulation (streak warning, session-timer)
- 550–569 help/settings flyout drawer (profile chip + 6 menu rows)
- 571–593 entry point into Settings (`s1`)

**Logic (~4568–5986):**
- 4588–4642 `PUSHQ` — hardcoded 4-item scripted push-notification demo sequence (fires at 1.5s,
  then every 8.2s, never repeats — demo only, not a real trigger schedule)
- 4725–4742 `NOTIF_FEED` — hardcoded notification history (2 groups, 6 items)
- 4951–4990 `WORLD_BASE`/`WORLD_TEXT`/`get WORLDS()` — the canonical 7-world list for this screen.
  **Arena (line 6006) and Profile (line 8628) each define their own separate, independently
  hardcoded `WORLDS` array** — a duplication the real `worlds` table must resolve.
- 5086–5143 `CHAPS` — the full lesson-content tree: 7 worlds × 8 chapters × 5 lesson titles
  (Hinglish only)
- 5145–5151 `LSTEP` — the 5 lesson-step kinds in order (Video/Story/AI Chat/Role Play/Quiz) with
  hardcoded time/XP/VM per kind; chapter 8's step 5 is always overridden to "Boss Quiz"
- 5519–5546 `MENTOR_INFO` — the 3 mentor stages (Baby/Father/Grandpa Lamma), each with bio, accent
  color and the worlds they cover — the source of "mentor evolves" in PRODUCT_SPEC
- 5588–5625 `STAT_DATA` — the 4 header stat tiles, each with a headline number, 3 breakdown
  stats and a coach-style note
- 5641–5980 `renderVals()`/`renderVals_()` — assembles everything; hardcoded profile chip
  ("Chirag Sharma", "LVL 14 · 12 DAY STREAK"), hardcoded app version pill `v2.4.1`

**Copy/i18n:** inline per-object `{en,hi,hx}` dicts throughout this class (`HOME`, `stepText()`,
`stepBlurb()`, `MENTOR_LINES`, `WORLD_TEXT`) — not centralized in `i18n.js`.

**Assets:** `fl-fmark.png`/`fl-mascot.png`/`fl-lockup.png` (brand), `lm-young.png`/`lm-father.png`/
`lm-grandpa.png` + their `lm-head-*.png` variants (mentor stages), `lm-ex-*.png` (push/notif card
expressions).

---

## Arena — `p2`

**Markup (878–1399):**
- 927–936 3-way lens switch: Worlds / Players / Contest (Competitions)
- 940–1032 Worlds lens: ranked world strip + full table (expand → top-10 + "you" row)
- 1034–1139 Players lens: scope chips (My World/My State/India/Global), podium, ladder (expand →
  per-player stats + Cheer), promote/demote dividers, rewards card
- 1141–1271 Competitions lens: monthly single-stock contest hero, facts, "you" rank, top-3 podium,
  full board, prizes, rules, disclaimer
- 1274–1304 sticky "you" bar + "Khelo" (Play) quick-action sheet
- 1306–1363 player-profile bottom sheet (opened from any avatar/name)
- 1378–1394 desktop-only side panel: 5 static "how ranking works" rule cards

**Logic (~5986–6674):**
- 6006–6014 `WORLDS` — own hardcoded 7-world array (member counts, weekly XP delta, sparkline)
- 6016 `C` — the single active Competition's facts; 6018–6030 `COMP` — 11 hardcoded leaderboard
  entries (incl. the logged-in user)
- 6046–6113 `profileVals()` — the tap-any-player profile sheet is **procedurally generated from a
  hash of the player's name**, not real stored stats — fully fake/deterministic-random
- 6130 `MEMBER_NAMES` — pool of 22 fake names reused everywhere a roster is needed
- 6132–6152 `worldTop()`/`worldBoard()` — generate each world's leaderboard purely from formulas
- 6229–6239 promote/demote math: top/bottom ~25% (`round(n/4)`), matches PRODUCT_SPEC
- 6383–6406 `compPrizes` (real-money: ₹10,000/₹4,000+coins/coins+badge) and `compRules` (virtual
  ₹1,00,000 single-stock capital, max 10 trades/month, ranked by ROI%, square-off deadline,
  disqualify copy-trading/circuit-hit)
- 6578–6586 season `rewards` (Promote/Safe/Demote payouts)

**Sample/fake data:** `WORLDS`, `COMP`, `SCHOOL_EXTRA`, `GLOBAL_EXTRA`, `PLAYERS`, `MEMBER_NAMES`
and everything `worldTop`/`worldBoard`/`profileVals` derive from name-hashing — none of it maps to
a real backend concept yet.

**Assets:** `fl-mascot.png` only, hue-rotated per player via CSS filter (no per-user photos,
consistent with the kid-safe "no profile photos" rule).

---

## Trade (+ Ops console) — `p3`

**Markup (1400–2030):**
- 1440–1686 home sub-view: search, balance card, 3 indices + chart, Watchlist/Positions/
  Orders/Funds tabs
- 1688–1767 stock detail (candles, stat grid, your-position box, about+tags, tip)
- 1770–1829 buy/sell action bar + order ticket bottom sheet
- 1841–1846 halted banner; 1848–1897 full-screen zoom chart
- 1900–2024 side panel: **Ops console** (1907–2007) and Design Notes (2009–2024)
  - Ops console: KPI grid, Price Feed Control (mode/volatility/global halt), Symbol Master table
    (per-symbol halt), User Trading Ledger + XP→VM rate chips, Audit Log

**Logic (~6674–7397):**
- 6676–6683 `initialState`: starting cash `500000` (₹5,00,000), feed `"LIVE"`, `vol: 1` (0–3×
  range), `rate: "100 XP = 250 VM"`
- 6693–6706 `STOCKS` — the 12 NSE stocks (sym, sector, base price, mcap, pe, tags, tip)
- 6708–6718 `FUNDS` — 9 mutual funds (cat, risk, 1Y/3Y/5Y returns, nav, aum, expense, minSip)
- 6720 `SEED` — 3 pre-seeded positions; 6722–6728 `USERS` — 5 sample Ops-console ledger rows
- 6730–6771 client-side fake candle/price simulator (ticks every 1500ms, `vol` scales the
  random-walk noise)
- 7319–7389 Ops console controls; `opsKpis` (7319–7324) are hardcoded strings, not computed
- 7367 `rateChips` = `["100 XP = 100 VM", "100 XP = 250 VM", "100 XP = 500 VM"]` — confirms
  PRODUCT_SPEC's admin-controlled conversion rate is accurate
- 7381–7388 `notes` — the Design Notes panel's own prose explaining intended real-world behavior
  (a useful primary source for the gap list)

**Copy:** most Trade-screen copy (stock names, tips, fund descriptions, Ops console labels) is
English/Hinglish-mixed and **not** run through the i18n dict — untranslated for hi/hx in this
screen, unlike World Home.

---

## News (+ Pulse Check + News Desk) — `p4`

**Markup (2031–2768):**
- 2070–2278 main feed: Pulse Check CTA, category chips, hero story, "FinLamma Desk" admin-picks
  section, news row list
- 2072–2123 full story view (hero, impact/source tags, paragraphs, "Aaj ka term" jargon box)
- 2125–2145 in-app webview for "read original source"
- 2280–2494 Pulse Check quiz engine: host/mascot bubble, timer, progress pips, one block per
  question type (list/binary/grid/slider/order/match/sort/fill/spot)
- 2497–2614 result screen: payout hero, KPI row, VM breakdown bars, per-question speed chart,
  topic mastery bars, 7-day streak card
- 2635–2745 side panel: **News Desk console** (2642–2745, admin) and Design Notes (2747–2762)

**Logic (~7397–8380):**
- 7424–7465 `NEWS` — 8 sample stories (headline, 3-line explainer, 3 bullets, impact tag, jargon
  term, outlet, source url)
- 7467–7513 `QS` — 9 sample Pulse Check questions, one per format
- 7517–7526 `PIPE` — News Desk pipeline sample (8 rows, title/source/grade/question count)
- 7575–7587 seeds a "formats" toggle set (9 formats on, a 10th **"PREDICT" format toggle exists
  with no implemented question type anywhere** — unused) and 4 sample audit-log entries
- 7636–7651 `grade()` — scoring: base (admin preset 20/30/50 VM) → +15 speed bonus if <45% of
  timer → + `min(combo,5)×5` combo bonus → +100 VM all-correct bonus (in `next()`)
- 8297–8355 News Desk KPI tiles (hardcoded, not computed), quiz-generator sliders (question
  count, timer 10–35s, base-coin presets 20/30/50), 7-day engagement bars (hardcoded)

**Copy:** all story/quiz content is Hinglish-only, hardcoded inline in `NEWS`/`QS`/`PIPE` — not
in `i18n.js`/`strings.txt` (those only cover chrome/nav labels).

**Assets:** `fl-mascot.png` + `lm-ex-*.png` mascot faces for the quiz host. News art is generated
CSS gradients (`newsArt()`), not images.

---

## Profile (+ report card + certificates) — `p5`

**Markup (2769–3460, 3741–3963):**
- 2819–3006 Overview: ID card, XP bar, rank-delta cells, 4 quick-stat tiles, streak card + weekly
  dot calendar, "3 daily targets", worlds-cleared list (tap → certificate sheet)
- 3008–3125 Stats: time-spent chart, efficiency-score ring + 4 sub-metric bars, lifetime 6-stat
  grid, topic mastery bars, 5-week consistency heatmap
- 3127–3211 Badges: summary ring, category chips, grid, picked-badge detail, "next 3 badges"
- 3213–3307 Rewards: wallet + earn breakdown, coupons, VM-gated locked rewards, redeem history
- 3309–3393 Trades: portfolio hero + sparkline, trading-stats grid, win/loss bar, trade history
- 3396–3436 Profile's own Notifications panel (separate instance, same shape as Home's)
- 3741–3760 report-card share sheet (3 export actions); 3762–3824 certificate view/share sheet
- 3837–3958 desktop-only side panel: `panelIsReport` (bigger report card) and `panelIsNotes`
  (plain-text design notes — **not an admin console**, unlike Trade's Ops or News's Desk)

**Logic (~8380–9551):**
- 8388 `CERT` — fixed per-world sample certificates. ID format: `FL-<2-letter world code>-<year>-
  <4 digits>` (e.g. `FL-MW-2026-0417`)
- 8394–8607 `certHTML`/`reportHTML`/`storyHTML`/`mentorHTML` + `printDoc`/`printReport`/`printCert`
  — four printable HTML→PDF templates (certificate, weekly report, Instagram-story card, and a
  **"weekly mentor summary" letter addressed to a parent/mentor**), all rendered via the browser
  print dialog — no real PDF generation, storage, or delivery
- 8628–8723 `WORLDS`, `TIME`, `EFF` (efficiency sub-metrics), `MASTERY`, `BADGES` (9), `COUPONS`
  (4, all `cost:0`, earned not bought), `LOCKED` (3, VM-gated), `MODULES` (6, letter grades),
  `TREND` (8-week), `TRADES` (6 sample rows)
- 9160 locked-reward price formula: `round(userBalance × mult / 10000) × 10000` — price scales
  with the *viewing user's own* balance, a UI trick, not a real fixed price
- 9410 `coachNotes` — 4 fixed categories (Taakat/strength, Gap, Mauka/opportunity, Aadat/habit),
  hand-written sentences referencing the sample numbers

**Assets:** `fl-mascot.png`, `fl-fmark.png`, `fl-exp-happy.png`.

---

## Settings — `s1` / `s2`

**Markup:** `s1` embedded in Home, lines 594–877; `s2` — the identical component — re-embedded in
Profile, lines 3461–3740 (verified byte-identical, only the `s1.`/`s2.` prefix differs).

Sub-screens (one component, state-driven, no separate routes): root menu (594–644), 6-step
"How to use" walkthrough (646–685), language picker (687–710), theme picker (712–739), account
(741–769, incl. a "Delete my account permanently" row with **no onClick handler wired** — dead UI
in the prototype), contact (772–801, decorative — Send has no handler), terms/legal (803–824,
**tab selection doesn't actually filter clauses — all 6 always render**), rate app (826–852,
decorative CTA).

**Logic:** `Component.SET`, lines ~9444–9781.
- 9515–9540 `TUT` — the 6 walkthrough steps' real copy (title/body/3 bullets, all 3 languages) —
  doubles as a decent plain-English feature summary of the whole app
- 9542–9549 `CLAUSES` — 6 hardcoded legal clauses, **English only** (no hi/hx, unlike everything
  else in the file). Contains a real policy detail — **users 10+, under-18 needs parent/guardian
  approval** — not reflected anywhere in DATA_MODEL.md
- 9556–9777 `renderVals()` — hardcoded sample account (`userName: "Chirag Sharma"`, email, masked
  mobile, bio), login-method rows (Google/Password/PIN), footer version `v2.4.1 (build 318)`

---

## Lesson Flow (video + in-video pop quiz + practice quiz + result) — `lf`

**Markup (3964–4559):** progress/XP/combo/streak chrome (3980–4011); video player with scene
overlays trade/coins/timeline (4015–4131); in-lesson "Lamma AI" doubt chat (4133–4154); practice-
quiz step types options/sort/order/fill/match/spot (4156–4281); the full Lesson Report Card result
screen (4283–4417); in-video pop-quiz sheet + XP burst toast (4420–4494); post-answer feedback
banner (4497–4504); a **prototype-only "Hook Loop" dev/design side panel** (4506–4557, quotes a
designer's note explaining the fever-mode mechanic — not part of the real phone UI, don't build it).

**Logic (~9782–10471):**
- 9787 `DUR = 48` (video length in seconds, matches PRODUCT_SPEC's "~48s")
- 9789–9794 `SCENES` — 4 video scenes with timestamp/kind/caption/mascot line
- 9796–9803 `VQ` — 6 in-video pop-quiz questions (timestamp trigger, type, timer, answer)
- 9890–9904 `STEPS` — 12 practice-quiz steps after the video (one example per question type)
- **Exact scoring** (`gradePop` 9851–9872, `check` 9928–9939): pop-quiz `base = ok?20:4`,
  `speedBonus = ok && used < timer*0.45 ? 10 : 0`, `comboBonus = ok ? min(combo,5)*3 : 0`,
  fever mode triggers at **combo ≥ 3** and **doubles base+speed** for that answer; practice-quiz
  is simpler (`ok?20:5`, same fever trigger, no separate XP-part breakdown); grade letters at
  `≥95% S / ≥83% A / ≥67% B / else C`
- This is **one demo lesson only** ("Chapter 1: Barter to UPI", World 1) — no second example
  exists to confirm the engine generalizes to every node kind/world

**Copy:** all lesson content (scenes, dialogue, captions, questions, notes) is **Hinglish-only,
hardcoded inline** — not run through the i18n system used elsewhere in the file.

**Assets:** `fl-mascot.png` (video host + AI mascot), `lm-ex-*.png` (pop-quiz mascot face states).

---

## App shell / root (~10472–10744)

Composes all screens (`get screens()`), owns tab index (`go(i)`), theme/language state, the
runtime DOM-text-walking i18n patcher (`_i18nApply`, `_i18nSchedule` — a prototype-only mechanism;
the real app should render pre-translated content per `user.language`, never patch live DOM text),
and `vmAmount()`/`vmNum()`/`vmInr()`/`vmShort()` — the global V Money balance display, which in the
prototype is derived directly from the Trade screen's own `cash + market value of positions`
rather than a separate ledger-derived balance (worth confirming against DATA_MODEL's
`vmoney_ledger`-as-source-of-truth model — see FEATURE_MAP gap list).
