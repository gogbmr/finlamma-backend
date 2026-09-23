# Economy simulation — trading capital under "no grant"

Built to answer one question from the founder before PRODUCT_SPEC/DATA_MODEL/ROADMAP are updated:
if trading capital is purely earned V Money (no ₹5,00,000 starting grant, no unlock bonus — see
the decision below), does a typical learner actually have enough V Money to trade meaningfully by
the time the order pad unlocks?

## The decision this simulation supports

- Trade tab is visible from day one in **explore mode**: live prices, charts, watchlist, stock
  info — no lock. The **order pad** (placing real BUY/SELL orders) is locked with a progress
  message ("N worlds to go").
- **D25 (`docs/ARCHITECTURE.md`): the unlock is by world POSITION, never a specific world's id
  or name.** `settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition` defaults to
  **3** (i.e. trading unlocks once the 3rd published world's Boss Quiz is passed),
  super_admin-editable and logged via `activity_logs`. Because it's position-based, it keeps
  working automatically if worlds are added, removed or reordered ahead of it — this whole
  simulation below is written in terms of "3 worlds of guaranteed content," which is what the
  *default* position means today, not a hardcoded assumption about which world that is.
- **No grant of any kind.** No ₹5,00,000 starting balance, no unlock bonus. Trading capital is
  only the V Money the learner has actually earned — from lessons, quizzes, boss battles, Pulse
  Check, streaks, Arena, cheers — plus trading P&L once they start. No "add money."
- V Money earned before the unlock accumulates normally in `vmoney_ledger` and becomes the
  starting capital the moment trading unlocks — no separate "convert" step.

## Where the numbers come from

The prototype's per-lesson-step rewards (`LSTEP`, `Finlamma App.dc.html` lines 5145–5151):

| Step kind | Minutes | XP | VM (current) |
|---|---|---|---|
| Video | 4 | 20 | 10 |
| Story | 6 | 30 | 15 |
| AI Chat (Doubt Zone) | 5 | 25 | 20 |
| Role Play | 7 | 40 | 25 |
| Quiz | 3 | 50 | 30 |
| Boss Quiz (chapter finale) | 10 | 120 | 100 |

Each world is 8 chapters × 5 steps = 40 nodes. Every chapter cycles Video → Story → AI Chat →
Role Play → Quiz, **except** the very last step of the last chapter, which is always Boss Quiz
instead of a 5th Quiz. So per world: Video ×8, Story ×8, AI Chat ×8, Role Play ×8, Quiz ×7,
Boss Quiz ×1.

**Per-world VM total (current values):** `8×10 + 8×15 + 8×20 + 8×25 + 7×30 + 1×100 = 870 VM`

To reach the trading-unlock world (position 3 by default - the 3 worlds seeded as Money World,
Savings Valley, Budget Bazaar in v1, but this holds for whichever 3 worlds staff have published
first): **3 × 870 = 2,610 VM**, counting *only* the guaranteed lesson path — zero credit for
Pulse Check, Arena cheers, or streak bonuses, since those depend on optional daily engagement
this simulation shouldn't assume.

The 12 stock prices at trading-unlock (`STOCKS`, prototype's `p0` field, lines 6693–6706):

| Symbol | Price (₹) |
|---|---|
| ITC | 462.90 |
| SBIN | 812.65 |
| TATAMOTORS | 1,042.75 |
| ICICIBANK | 1,248.30 |
| HDFCBANK | 1,667.45 |
| BHARTIARTL | 1,586.40 |
| INFY | 1,475.80 |
| HINDUNILVR | 2,398.20 |
| RELIANCE | 2,845.10 |
| ASIANPAINT | 2,914.30 |
| LT | 3,624.85 |
| TCS | 3,859.55 |
| **One share of all 12** | **₹23,938.25** |

Fund minimums (`FUNDS`, lines 6708–6718): the two **index** funds (Nifty 50, Nifty Next 50)
already have `minSip: 100`. The other 7 (Flexi Cap, Mid Cap, Small Cap, Balanced Advantage,
Corporate Bond, Liquid, ELSS) all have `minSip: 500`.

## Affordability check — current reward values (2,610 VM floor)

| Ask | Affordable? |
|---|---|
| A ₹100 SIP (index fund) | **Yes**, easily — 2,610 VM covers it 26× over |
| "A first trade" (one share of *a* stock) | **Yes for cheap stocks** (ITC, SBIN, TATAMOTORS all under 2,610), **no for 6 of the 12** (INFY through TCS all cost more than a learner could spend without going near-broke on one position) |
| One share of **each** of the 12 stocks (₹23,938.25) | **No** — the floor covers barely 11% of this |

**Conclusion:** with the current per-lesson VM values and no grant, a learner who does only the
guaranteed lesson path arrives at the trading-unlock world able to place a couple of small
single-stock trades, but nowhere near enough to explore the full watchlist or hold a diversified
handful of positions — the Trade screen would feel cramped rather than "comfortable" the moment
real money management starts.

## Proposed revised values

XP stays exactly as the prototype has it — XP drives level/world-unlock pacing, which isn't in
question here. Only the **VM** column changes (VM and XP are fully decoupled per the "no grant,
earn side by side" model already decided — there's no fixed conversion ratio to preserve). Proposal:
**3× the current VM value** per step kind.

| Step kind | XP (unchanged) | VM (current) | VM (proposed, 3×) |
|---|---|---|---|
| Video | 20 | 10 | 30 |
| Story | 30 | 15 | 45 |
| AI Chat | 25 | 20 | 60 |
| Role Play | 40 | 25 | 75 |
| Quiz | 50 | 30 | 90 |
| Boss Quiz | 120 | 100 | 300 |

**Per-world VM total (proposed):** `8×30 + 8×45 + 8×60 + 8×75 + 7×90 + 1×300 = 2,610 VM`
**VM at trading-unlock (3 worlds at the default position, proposed):** `3 × 2,610 = 7,830 VM`

### Affordability check — proposed values (7,830 VM floor)

| Ask | Affordable? |
|---|---|
| A ₹100 SIP | Yes, trivially |
| "A first trade" | Yes, comfortably, for any single stock up to ~₹7,800 — i.e. 10 of the 12 stocks individually (all but LT and TCS) |
| One share of each of the 12 stocks | **Still no** (₹23,938 total), but the learner can now hold **6 different stocks at once** (ITC + SBIN + TATAMOTORS + ICICIBANK + HDFCBANK + BHARTIARTL = ₹6,820.45) with ~₹1,000 left over — a genuinely diversified starter portfolio, not a single cramped position |

This reads as "comfortably place several trades" without making the practice balance feel
unlimited or arbitrary. The exact multiplier isn't precision-critical: the Ops console's global
VM multiplier (already decided — a live-tunable issuance multiplier, default 1.0, applied at
award time and stored on each ledger entry) is the intended lever for tuning this further after
launch without a redeploy, so 3× is a starting proposal, not a permanent constant.

Note this floor is deliberately pessimistic — it assumes zero Pulse Check participation. Pulse
Check alone (News tab, unlocked from day one) can plausibly add several hundred VM per active day
under its own scoring rules (see `docs/FEATURE_MAP.md` NW-25/NW-26), so an engaged learner would
likely arrive at the trading-unlock world with meaningfully more than either floor shown above.

## Time to reach the trading-unlock world

Per-world time, from the same `LSTEP` minutes (Video 4, Story 6, AI Chat 5, Role Play 7, Quiz 3,
Boss Quiz 10, same 8×/8×/8×/8×/7×/1× step counts as the VM calculation above):

`8×4 + 8×6 + 8×5 + 8×7 + 7×3 + 1×10 = 207 minutes per world`

Three worlds at the default unlock position: `3 × 207 = 621 minutes` of actual lesson time. At a
realistic 15–20 minutes/day of use, that's **roughly 31–41 days — about a month** of typical
daily use before the order pad unlocks. (This ignores days skipped entirely; a learner who misses
days takes proportionally longer in calendar time, though streak freezes and the daily-goal nudge
exist precisely to reduce that. If `tradingUnlockAfterWorldPosition` is changed from its default
of 3, this figure scales roughly linearly with the new position.)

## A note on re-checking this later

The stock prices used above (`STOCKS[].p0`, lines 6693–6706) are the prototype's fixed baseline
snapshot, not live prices — so "a learner can hold 6 of the 12 stocks at once" is true **at these
specific prices**, not a permanent guarantee. Real NSE prices move daily, and once Phase 4 wires
in the live Twelve Data feed, actual prices will drift from this baseline over time (a stock like
TATAMOTORS or HDFCBANK could easily move 20–30% in either direction over months). If the reward
values in `reward_rules` are ever revisited, or before launch, re-run this same calculation with
current prices (12 numbers from `instruments`, summed and sorted) to confirm the affordability
story still holds — a five-minute check, not a rebuild of this document.

## Decisions

**1. Order entry: whole shares only.** Matches the prototype and real NSE trading exactly.
Affordability is governed entirely by the reward values below, by design — cheaper stocks (ITC,
SBIN, TATAMOTORS, ICICIBANK, HDFCBANK, BHARTIARTL) are accessible sooner than the priciest ones
(LT, TCS). No fractional/amount-based orders.

**2. SIP minimums: keep tiered.** ₹100 for the two index funds, ₹500 for the other 7
(equity/hybrid/debt/ELSS) — matches the prototype exactly and mirrors how real fund platforms
price minimums by risk/complexity tier.

**3. Reward values: 3× baked directly into the seeded `reward_rules` values** (whole numbers, not
computed from a multiplier at runtime):

| Step kind | XP (unchanged) | VM (seeded) |
|---|---|---|
| Video | 20 | 30 |
| Story | 30 | 45 |
| AI Chat | 25 | 60 |
| Role Play | 40 | 75 |
| Quiz | 50 | 90 |
| Boss Quiz | 120 | 300 |

The Ops console's global VM multiplier stays at its default of **1.0** — it's a separate,
independently-tunable lever for later, not a second multiplication of this 3× baseline. Every
`vmoney_ledger` entry records which `reward_rules` value and which multiplier applied, so any
balance stays fully explainable.

These figures, plus the virtual-only Competition prizes, admin-editable mentors, and the in-scope
templated report card decided earlier in this round, are now reflected in `docs/PRODUCT_SPEC.md`,
`docs/DATA_MODEL.md`, `docs/ROADMAP.md` and the relevant `docs/FEATURE_MAP.md` rows.

**4. "Successful completion" per lesson kind (Phase 3 Checkpoint 2, revised in Checkpoint 3 kickoff
— D28) — what actually credits `reward_rules`' XP/VM.** A lesson is credited **once per user per
lesson**, on the first successful completion; a failed first attempt never forfeits the reward,
and any later replay (successful or not) never credits again. Idempotency is a DB unique
constraint on `(userId, sourceType, sourceId=lessonId)` on both `xp_events` and `vmoney_ledger`
(see `docs/DATA_MODEL.md`, the `money-ledger` skill) — crediting code always attempts the insert
and treats a conflict as "already credited," which is what makes this correct across retries
without tracking "has this been credited" separately.

**Revised (D28): every kind with graded questions needs a minimum accuracy to count as
successful, not just Boss Quiz.** Checked against the prototype (`Finlamma App.dc.html`) and this
doc before deciding: the prototype's own Lesson Report Card (lines 4283-4417/9782-10471) shows a
real accuracy ring and S/A/B/C grade as *feedback*, but never gates the flat per-lesson VM reward
on it anywhere — the original design paid a flat reward for finishing, regardless of score. This
is a **deliberate departure from that**: for a learning app, "finish it however badly and still
get paid the same as someone who tried" doesn't hold up, so a real (lower-than-Boss-Quiz) pass
mark was added on top of the original design rather than restoring it as-is.

| Lesson kind | "Successful" means | Why |
|---|---|---|
| Video, Quiz, Role Play | The attempt reaches `completed` **and** `accuracyPct >= settings_kv.lesson_flow_scoring.lessonPassMarkPct` (default 50%) | All three go through the same graded-step engine as Boss Quiz (`quiz-attempts/service.ts`'s `quizKindForLesson` — Role Play included, per PRODUCT_SPEC.md's "Boss Quiz and Role Play reuse the same lesson-flow content shape as Quiz") and so all have a real `accuracyPct` to judge, unlike Story/Doubt Zone. Deliberately lower than Boss Quiz's bar (D24) — this gates one lesson's reward, not world progression. |
| Story, Doubt Zone (AI Chat) | The Checkpoint 3 completion endpoint marks it complete (served, then a server-measured minimum time elapsed) | These kinds have no graded steps and no `quiz_attempts` row at all (docs/ARCHITECTURE.md D23's known gap, closed in Checkpoint 3) — there is no accuracy to judge, only "did they actually engage with it." |
| Boss Quiz | The attempt reaches `completed` **and** `accuracyPct >= settings_kv.lesson_flow_scoring.bossQuizPassMarkPct` (default 60%, D24) | Reuses the exact same pass mark that already gates the next world's unlock (D24) — a higher bar than the other graded kinds, since it also gates world progression, not just this lesson's own reward. |

Every graded kind's pattern is identical: a failed attempt doesn't block anything — the learner
just starts a fresh attempt (new `attemptNumber`, same lesson id), and *that* attempt's success is
what credits, since the idempotency key is per-lesson, not per-attempt.

**5. What counts as "activity" for the learning streak (Phase 3 Checkpoint 4).** A day extends the
`learning`-scope streak (`docs/ARCHITECTURE.md` D30) if and only if it contains **at least one
real, first-time XP/VM credit** — i.e. `src/server/economy/service.ts`'s `creditLessonCompletion`
actually inserted new `xp_events`/`vmoney_ledger` rows (`credited: true`), for *any* lesson kind
(Video/Quiz/Role Play/Boss Quiz passing its pass mark per decision 4 above, or Story/Doubt Zone
completing per Checkpoint 3's minimum-time rule). Deliberately **not** triggered by:
- Opening the app, viewing a lesson, or starting an attempt with no completion.
- A failed/below-pass-mark attempt (never credits, per decision 4 — so never extends the streak
  either, matching the same "genuine engagement" bar rather than mere app usage).
- A replay of an already-completed lesson (never re-credits, per `docs/ARCHITECTURE.md` D26's
  idempotency — so it never re-triggers a streak update either, though this is moot in practice
  since the streak update itself is also idempotent within a day regardless).

This ties the streak to the same "successful completion" bar the ledger already uses, rather than
inventing a separate, weaker "activity" concept — one real accomplishment a day keeps the streak
alive, not just opening the app. `pulse_check`-scope streaks have no trigger yet (Phase 5's Pulse
Check doesn't exist); the row structure exists (`streaks.scope`) but nothing writes to it today.

**No XP/VM reward is credited for a streak itself in this checkpoint** — nothing above (or
anywhere else in this document) defines a streak-length bonus amount, so none is invented here.
If/when one is decided, it must be credited through the same `creditLessonCompletion`-style
`(userId, sourceType, sourceId)` idempotency path as everything else (`docs/ARCHITECTURE.md` D26),
never a separate ad hoc write to `xp_events`/`vmoney_ledger`.

A lesson's `xpOverride`/`vmOverride` (nullable columns on `lessons`, `null` = use the kind's
`reward_rules` default) let an individual lesson pay a different amount than its kind's default —
decided in `docs/DATA_MODEL.md`'s `reward_rules` entry, no admin UI for setting them yet (the
per-lesson override is a natural extension of the Phase 2b lesson content editor, deferred until a
real lesson actually needs a non-default amount).
