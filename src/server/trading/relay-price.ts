import { getRedisJsonValue } from "@/lib/redis";

// docs/ARCHITECTURE.md D40 - the ONLY thing this backend ever reads to
// price a trade (Checkpoint 5's order execution). Written exclusively by
// the market relay (a separate repo) - never this backend, never the app.
// Deliberately NOT the same path as src/server/market/cache.ts's
// getCachedQuote (Checkpoint 2's REST-polled, Redis-cached DISPLAY quotes)
// - see D40 for why conflating the two would be wrong: only this one
// prices real (virtual) money movement.
export type RelayPrice = { pricePaise: number; ts: number };

function relayPriceKey(symbol: string, exchange: string): string {
  return `px:${symbol}:${exchange}`;
}

// Returns null when the relay has never written this symbol's key, the
// key expired (the relay is expected to TTL its own writes - D40), or
// Redis itself is unreachable/unconfigured - all three collapse to the
// same "no price available" outcome by design (getRedisJsonValue's own
// comment), which src/server/orders/repo.ts maps to PRICE_UNAVAILABLE.
export async function getRelayPrice(symbol: string, exchange: string): Promise<RelayPrice | null> {
  return getRedisJsonValue<RelayPrice>(relayPriceKey(symbol, exchange));
}
