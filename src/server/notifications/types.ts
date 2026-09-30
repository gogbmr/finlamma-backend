// The one seam every push vendor integration implements. Callers never call
// a vendor's SDK directly - always through this interface, via
// getPushProvider() (./provider.ts). Mirrors src/server/market/types.ts's
// MarketDataProvider pattern.
export type PushSendInput = {
  expoPushToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// "invalid_token" (Expo's DeviceNotRegistered) is its own status, not
// folded into "error" - the caller (src/server/notifications/service.ts)
// uses it to delete the stale push_tokens row, which a generic transient
// "error" must never trigger.
export type PushSendResult =
  | { status: "sent" }
  | { status: "invalid_token" }
  | { status: "error"; message: string };

export interface PushProvider {
  // One call per batch, one result per input, same order - not one call per
  // message, since Expo's own API is inherently batch/chunked.
  send(messages: PushSendInput[]): Promise<PushSendResult[]>;
}
