// Pure, no DB/Redis access - the actual matching arithmetic, kept separate
// from src/server/orders/repo.ts so it's trivial to test exhaustively
// without a transaction or a mocked price feed. trading-rules skill: BUY
// cost = qty x price; a LIMIT order only fills when the market price
// satisfies the learner's limit, and fills at "price improvement" (the
// better of the two prices) when it does - the standard, fair matching
// rule for a single-last-price venue with no order-book depth.

export type OrderSide = "buy" | "sell";

// Only ever called for a LIMIT order - a MARKET order is always
// marketable by definition, checked separately by the caller.
export function isLimitMarketable(side: OrderSide, limitPricePaise: number, currentPricePaise: number): boolean {
  return side === "buy" ? currentPricePaise <= limitPricePaise : currentPricePaise >= limitPricePaise;
}

// The price a fill actually executes at. For a MARKET order this is
// always just the current price - call this only for a marketable LIMIT
// order. A BUY never pays more than its limit (and benefits if the market
// is even cheaper); a SELL never receives less than its limit (and
// benefits if the market is even higher) - "price improvement", never
// "price worsening", in the learner's favour either way.
export function clampFillPrice(side: OrderSide, limitPricePaise: number, currentPricePaise: number): number {
  return side === "buy" ? Math.min(currentPricePaise, limitPricePaise) : Math.max(currentPricePaise, limitPricePaise);
}
