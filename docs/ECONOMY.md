# Economy simulation — trading capital under "no grant"

Built to answer one question from the founder before PRODUCT_SPEC/DATA_MODEL/ROADMAP are updated:
if trading capital is purely earned V Money (no ₹5,00,000 starting grant, no unlock bonus — see
the decision below), does a typical learner actually have enough V Money to trade meaningfully by
the time the order pad unlocks?

## The decision this simulation supports

- Trade tab is visible from day one in **explore mode**: live prices, charts, watchlist, stock
  info — no lock. The **order pad** (placing real BUY/SELL orders) is locked with a progress
  message ("Reach Market Maidan to start trading — 2 worlds to go").
- The unlock world defaults to **Market Maidan (World 4)**, admin-configurable in the Ops console
  (change logged via `activity_logs`).
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

To reach World 4 (Market Maidan), a learner clears Worlds 1–3 (Money World, Savings Valley,
Budget Bazaar): **3 × 870 = 2,610 VM**, counting *only* the guaranteed lesson path — zero credit
for Pulse Check, Arena cheers, or streak bonuses, since those depend on optional daily engagement
this simulation shouldn't assume.

The 12 stock prices at World 4 arrival (`STOCKS`, prototype's `p0` field, lines 6693–6706):

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
guaranteed lesson path arrives at Market Maidan able to place a couple of small single-stock
trades, but nowhere near enough to explore the full watchlist or hold a diversified handful of
positions — the Trade screen would feel cramped rather than "comfortable" the moment real money
management starts.

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
**VM at World 4 arrival (3 worlds, proposed):** `3 × 2,610 = 7,830 VM`

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
likely arrive at World 4 with meaningfully more than either floor shown above.

## Time to reach World 4

Per-world time, from the same `LSTEP` minutes (Video 4, Story 6, AI Chat 5, Role Play 7, Quiz 3,
Boss Quiz 10, same 8×/8×/8×/8×/7×/1× step counts as the VM calculation above):

`8×4 + 8×6 + 8×5 + 8×7 + 7×3 + 1×10 = 207 minutes per world`

Three worlds to reach Market Maidan: `3 × 207 = 621 minutes` of actual lesson time. At a realistic
15–20 minutes/day of use, that's **roughly 31–41 days — about a month** of typical daily use
before the order pad unlocks. (This ignores days skipped entirely; a learner who misses days
takes proportionally longer in calendar time, though streak freezes and the daily-goal nudge exist
precisely to reduce that.)

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
