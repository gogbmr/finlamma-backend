import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";
import { findAdviceLikePhrases } from "@/server/trading/advice-language";

export type DoubtZoneChatMessage = { role: "user" | "assistant"; content: string };

// Extends advice-language.ts's static list (authored for staff reviewing
// instrument copy) with phrasing more likely from a model actively
// answering a "what should I do" style question in a live conversation,
// rather than describing a company in third person.
const DOUBT_ZONE_EXTRA_ADVICE_PHRASES = [
  "you should buy",
  "you should sell",
  "you should invest",
  "i recommend buying",
  "i recommend selling",
  "i'd invest in",
  "i would invest in",
  "put your money into",
  "put your money in",
  "go for this stock",
  "this is a good buy",
] as const;

// Exported so the same check can be unit-tested directly, and so a future
// caller (e.g. a moderation review tool) can re-run the exact same check
// against a stored message.
export function findAllDoubtZoneAdvicePhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const extra = DOUBT_ZONE_EXTRA_ADVICE_PHRASES.filter((phrase) => lower.includes(phrase));
  return [...findAdviceLikePhrases(text), ...extra];
}

export type DoubtZoneReplyOutcome =
  | { kind: "ok"; text: string }
  | { kind: "cut_for_advice_language"; partialText: string; matchedPhrases: string[] };

// Streams the main chat reply, calling onDelta with the accumulated text so
// far as it grows (the caller forwards this to the client, e.g. over SSE).
// findAllDoubtZoneAdvicePhrases runs on every delta's accumulated snapshot -
// the instant it trips, the stream is aborted and nothing further is
// forwarded. The caller is expected to discard partialText and show
// settings.adviceLanguageFallbackMessage instead (kept out of this function
// since that's a localization/settings concern, not a streaming-mechanics
// one - see src/server/doubt-zone/schemas.ts).
export async function streamDoubtZoneReply(
  input: { systemPrompt: string; messages: DoubtZoneChatMessage[] },
  onDelta: (accumulatedText: string) => void,
): Promise<DoubtZoneReplyOutcome> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError("SERVICE_UNAVAILABLE", "ANTHROPIC_API_KEY is not configured");
  }
  if (!env.ANTHROPIC_MODEL_SMART) {
    throw new AppError("SERVICE_UNAVAILABLE", "ANTHROPIC_MODEL_SMART is not configured");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: env.ANTHROPIC_MODEL_SMART,
    max_tokens: 1024,
    system: input.systemPrompt,
    messages: input.messages,
  });

  let lastSnapshot = "";
  let cutMatches: string[] | null = null;

  stream.on("text", (_delta, snapshot) => {
    lastSnapshot = snapshot;
    if (cutMatches) return;
    const matches = findAllDoubtZoneAdvicePhrases(snapshot);
    if (matches.length > 0) {
      cutMatches = matches;
      stream.abort();
      return;
    }
    onDelta(snapshot);
  });

  try {
    await stream.finalMessage();
  } catch (err) {
    if (!cutMatches) {
      logInternalError("doubt_zone.reply_stream_failed", err);
      throw new AppError("SERVICE_UNAVAILABLE", "Doubt Zone reply stream failed");
    }
    // A deliberate stream.abort() from the circuit breaker above rejects
    // finalMessage() the same way a real error would - expected, not a
    // failure to report.
  }

  if (cutMatches) {
    return { kind: "cut_for_advice_language", partialText: lastSnapshot, matchedPhrases: cutMatches };
  }
  return { kind: "ok", text: lastSnapshot };
}
