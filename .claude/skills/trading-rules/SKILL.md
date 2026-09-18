---
name: trading-rules
description: Rules for the paper-trading engine — prices, market hours, orders, margin, halts, idempotency. Use for any work on orders, holdings, instruments, market data or the Ops console.
paths: "src/server/trading/**, src/server/market/**, src/inngest/**"
---

**Prices**
- Execution price = latest price for the symbol from Redis key `px:<SYMBOL>:NSE`
  (`{ pricePaise, ts }`), written by `finlamma-market-relay`. Never accept a price from the client.
- If the price is older than 60 s during market hours → reject with `PRICE_STALE`.
- Candle history comes from Twelve Data `/time_series` (`symbol=X&exchange=NSE`), cached in Redis
  per symbol+interval. Never call Twelve Data per user request without the cache.

**Market status** (Asia/Kolkata)
- Open 09:15–15:30 Mon–Fri, excluding `market_holidays`. Outside hours: MARKET orders rejected
  with `MARKET_CLOSED`; LIMIT orders may be placed and stay OPEN until matched or cancelled at
  day end (confirm with the user if unsure).
- `market_controls.global_halt` or `instruments.halted` → reject with `MARKET_HALTED` / `SYMBOL_HALTED`.
- Feed mode LIVE / DELAYED_15M / PAUSED comes from `market_controls` (admin Ops console).

**Orders**
- Require `Idempotency-Key`. Validate qty ≥ 1 and integer. Sides BUY/SELL; types MARKET/LIMIT.
- BUY: cost = qty × price (paise → V Money conversion rule in the `money-ledger` skill). Reject with
  `INSUFFICIENT_MARGIN` if available V Money < cost. SELL: reject `INSUFFICIENT_HOLDINGS`.
- Fill = one DB transaction: order row → ledger entry → holdings update → activity log.
  Lock the user's rows (`SELECT ... FOR UPDATE`) to prevent double spending.
- Brokerage is ₹0. Rejections always carry a reason code the app can show.
- LIMIT orders are matched by an Inngest job that reads Redis prices; same transaction rules.

**Never**
- Let the client set balances, fills, timestamps or P&L.
- Give recommendations ("buy X"). The app is educational; copy must not be investment advice.
