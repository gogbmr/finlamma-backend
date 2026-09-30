import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";
import { SafetyClassificationSchema, type SafetyClassification } from "./schemas";

// Runs on every learner message BEFORE the main chat call (see ./reply.ts),
// independently of it - a cheap, narrow classification call, not the main
// conversational model. ANTHROPIC_MODEL_FAST (Haiku-tier), same reasoning
// as news drafting: this is bulk, per-message screening, not a task that
// needs the smarter/slower model. Using a real language-understanding call
// here (not a keyword list) is deliberate - a keyword list has poor recall
// for how a distressed teenager actually phrases things ("I feel like
// giving up" contains none of the obvious words), and the founder's
// explicit instruction was to bias hard toward catching every real signal.

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_message_safety",
  description: "Classify whether this message from a minor raises a safety concern.",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["none", "self_harm_or_suicide", "abuse_or_neglect", "other_wellbeing_concern"],
      },
      reason: {
        type: "string",
        description: "One short sentence: what in the message triggered this category, or why it's none.",
      },
    },
    required: ["category", "reason"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are a safety screening step for messages sent by students aged roughly 13-18 to an
educational financial-literacy chatbot. You do not reply to the student - you only classify their
message for a downstream safety check.

Classify the message into exactly one category:
- "self_harm_or_suicide": any hint, even mild, indirect, or ambiguous, of self-harm, suicidal
  thoughts, hopelessness framed as wanting to disappear or not exist, or similar.
- "abuse_or_neglect": any hint of physical, emotional or sexual abuse, neglect, or being unsafe at
  home or anywhere else.
- "other_wellbeing_concern": anything else that reads as a genuine wellbeing/safety concern but
  doesn't fit the two categories above (e.g. severe bullying, acute distress, an unsafe situation).
- "none": ordinary conversation, including normal negative emotions like being annoyed, bored, or
  stressed about exams, or asking something unrelated to finance - none of that alone is a concern.

Bias heavily toward flagging when uncertain: if there is any plausible reading of the message as
one of the three concern categories, even a small chance, classify it as that category rather than
"none". A wrongly flagged ordinary message costs a staff member a few seconds to dismiss; a missed
genuine concern could matter a great deal. Call classify_message_safety with your result and
nothing else.`;

// Deliberately fails CLOSED: if the classifier itself can't run (no API
// key/model configured, the call errors, or the model returns something
// that doesn't parse), this throws rather than defaulting to "none". The
// caller (./reply.ts's orchestration in Checkpoint 3) must never proceed to
// the main chat call - or show any reply at all - on an unclassified
// message. This is the opposite of this codebase's usual fail-open bias for
// non-money endpoints (see src/lib/redis.ts), applied here because an
// unclassifiable safety check is exactly the "genuinely can't verify"
// case worth refusing over, the same reasoning money-spending endpoints
// already use for a different kind of risk.
export async function classifyMessageSafety(messageText: string): Promise<SafetyClassification> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError("SERVICE_UNAVAILABLE", "ANTHROPIC_API_KEY is not configured");
  }
  if (!env.ANTHROPIC_MODEL_FAST) {
    throw new AppError("SERVICE_UNAVAILABLE", "ANTHROPIC_MODEL_FAST is not configured");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: env.ANTHROPIC_MODEL_FAST,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_message_safety" },
      messages: [{ role: "user", content: messageText }],
    });
  } catch (err) {
    logInternalError("doubt_zone.safety_classify_call_failed", err);
    throw new AppError("SERVICE_UNAVAILABLE", "Safety classifier call failed");
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === "classify_message_safety",
  );
  if (!toolUse) {
    logInternalError("doubt_zone.safety_classify_no_tool_use", new Error("model returned no tool_use block"));
    throw new AppError("SERVICE_UNAVAILABLE", "Safety classifier did not return a classification");
  }

  const parsed = SafetyClassificationSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    logInternalError("doubt_zone.safety_classify_shape_invalid", new Error(JSON.stringify(parsed.error.issues)));
    throw new AppError("SERVICE_UNAVAILABLE", "Safety classifier returned a malformed classification");
  }
  return parsed.data;
}

// The flagOnAnySignal setting's actual gate (src/server/doubt-zone/schemas.ts).
// /phase-audit 7 finding: self_harm_or_suicide and abuse_or_neglect ALWAYS
// flag (and so always get the deterministic crisis redirect), regardless of
// flagOnAnySignal - a single settings.manage-gated toggle must never be able
// to switch off a crisis response. The toggle only ever controls the
// intentionally fuzzier other_wellbeing_concern bucket (true, the default,
// flags it too with no confidence cutoff - there is no confidence field in
// the classification at all today, by design, since a confidence-weighted
// threshold is exactly the kind of knob that could accidentally suppress a
// real signal). If this is ever loosened further, it happens here, in one
// place the whole flagging decision funnels through.
export function isFlaggableSafetyCategory(
  classification: SafetyClassification,
  flagOnAnySignal: boolean,
): boolean {
  if (classification.category === "none") return false;
  if (classification.category === "self_harm_or_suicide" || classification.category === "abuse_or_neglect") {
    return true;
  }
  return flagOnAnySignal;
}
