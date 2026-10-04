import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";
import type { PushProvider, PushSendInput, PushSendResult } from "../types";

// Created lazily inside send() (not at module scope), same lazy pattern as
// getS3Config()/getResendConfig() - importing this file never requires
// EXPO_ACCESS_TOKEN to be set.
function getExpoClient(): Expo | null {
  if (!env.EXPO_ACCESS_TOKEN) return null;
  return new Expo({ accessToken: env.EXPO_ACCESS_TOKEN });
}

function toResult(ticket: ExpoPushTicket): PushSendResult {
  if (ticket.status === "ok") return { status: "sent" };
  if (ticket.details?.error === "DeviceNotRegistered") return { status: "invalid_token" };
  return { status: "error", message: ticket.message };
}

export class ExpoPushProvider implements PushProvider {
  async send(messages: PushSendInput[]): Promise<PushSendResult[]> {
    const client = getExpoClient();
    if (!client) {
      throw new AppError("SERVICE_UNAVAILABLE", "Push notifications are not configured");
    }

    const expoMessages: ExpoPushMessage[] = messages.map((m) => ({
      to: m.expoPushToken,
      title: m.title,
      body: m.body,
      data: m.data,
    }));

    const results: PushSendResult[] = [];
    for (const chunk of client.chunkPushNotifications(expoMessages)) {
      try {
        const tickets = await client.sendPushNotificationsAsync(chunk);
        results.push(...tickets.map(toResult));
      } catch (err) {
        // A whole-chunk failure (e.g. the Expo API itself is unreachable) -
        // every message in this chunk gets a generic error result rather
        // than throwing and losing the other chunks' real per-message
        // results already collected.
        logInternalError("notifications.expo_send_chunk_failed", err);
        results.push(...chunk.map(() => ({ status: "error" as const, message: "Push send failed" })));
      }
    }
    return results;
  }
}
