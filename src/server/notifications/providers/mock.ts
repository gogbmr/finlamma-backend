import type { PushProvider, PushSendInput, PushSendResult } from "../types";

// Logs instead of sending - lets the whole notifications flow (trigger jobs,
// prefs, quiet hours, the feed) be built and tested with zero Expo account,
// same role src/server/market/providers/mock.ts plays for trading before a
// Twelve Data key exists. Never throws, always reports "sent" - there is no
// real delivery to fail.
export class MockPushProvider implements PushProvider {
  async send(messages: PushSendInput[]): Promise<PushSendResult[]> {
    for (const message of messages) {
      console.log(`[mock-push] -> ${message.expoPushToken}: "${message.title}" - "${message.body}"`);
    }
    return messages.map(() => ({ status: "sent" as const }));
  }
}
