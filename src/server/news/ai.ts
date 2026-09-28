import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";
import type { RawNewsItem } from "./providers/mock";
import { NewsDraftAiOutputSchema, type NewsDraftAiOutput } from "./schemas";

// CLAUDE.md rule 11: every AI-drafted story is a draft (news_stories.status
// defaults to "draft") until a staff member publishes it - this module only
// ever produces a draft, never anything learner-visible on its own.
// ANTHROPIC_MODEL_FAST (Haiku-tier per src/lib/env.ts) does this bulk,
// per-story simplification work - not a task that benefits from a smarter/
// slower model, same reasoning docs/ECONOMY.md-adjacent bulk-content jobs
// in this codebase already follow.

const LOCALIZED_TEXT_SCHEMA = {
  type: "object" as const,
  properties: {
    en: { type: "string" as const },
    hi: { type: "string" as const },
    hx: { type: "string" as const },
  },
  required: ["en", "hi", "hx"],
  additionalProperties: false,
};

const SUBMIT_DRAFT_TOOL: Anthropic.Tool = {
  name: "submit_news_draft",
  description: "Submit the simplified, three-language news story draft.",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "object",
        properties: {
          headline: LOCALIZED_TEXT_SCHEMA,
          summary: LOCALIZED_TEXT_SCHEMA,
          body: { type: "array", items: LOCALIZED_TEXT_SCHEMA, minItems: 2, maxItems: 4 },
        },
        required: ["headline", "summary", "body"],
        additionalProperties: false,
      },
      jargon: {
        type: "object",
        properties: { term: LOCALIZED_TEXT_SCHEMA, explanation: LOCALIZED_TEXT_SCHEMA },
        required: ["term", "explanation"],
        additionalProperties: false,
      },
      category: {
        type: "string",
        enum: [
          "rbi_rates",
          "inflation",
          "stock_market_basics",
          "ipos_new_listings",
          "mutual_funds",
          "banking",
          "scams_fraud",
          "government_budget",
          "global_markets",
          "currency",
        ],
      },
      impact: { type: "string", enum: ["good", "bad", "neutral"] },
      question: {
        type: "object",
        description: "One multiple-choice Pulse Check question testing understanding of this story.",
        properties: {
          prompt: LOCALIZED_TEXT_SCHEMA,
          options: { type: "array", items: LOCALIZED_TEXT_SCHEMA, minItems: 3, maxItems: 3 },
          correctIndex: { type: "integer", minimum: 0, maximum: 2 },
          explanation: LOCALIZED_TEXT_SCHEMA,
        },
        required: ["prompt", "options", "correctIndex", "explanation"],
        additionalProperties: false,
      },
    },
    required: ["content", "jargon", "category", "impact", "question"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You simplify Indian financial/business news for students aged roughly 13-18 learning
personal finance and investing basics, for a kid-safe educational app. For the given raw headline
and summary:

- Write a 2-3 paragraph simplified explainer in English (en), Hindi (hi), and Hinglish (hx - Hindi
  content written in Latin script, casual tone). Never invent facts not present in the source; if
  the source is thin, keep the explainer short rather than padding it with speculation.
- Write a one-line summary in all three languages.
- Pick exactly ONE finance/economics jargon term that appears in or is directly relevant to this
  story (e.g. "repo rate", "inflation", "IPO") and explain it in one simple sentence, in all three
  languages.
- Classify the story into exactly one category from the given enum.
- Classify its likely impact on the stock market as "good", "bad", or "neutral".
- Never phrase anything as investment advice, a price prediction, or a recommendation to buy/sell -
  state facts only ("the RBI held rates" not "this is a good time to invest").
- Never use real people's names in a way that could be defamatory; stick to what the source states.
- Write one multiple-choice "Quick Check" question (3 options, exactly one correct) testing whether
  a learner understood the story - e.g. "What did the RBI do to the repo rate?" with plausible wrong
  options, not trick questions or questions answerable without reading the story. Include a one-
  sentence explanation of the correct answer, in all three languages.

Call the submit_news_draft tool with your result. Do not include any other text in your response.`;

export async function draftNewsStoryFromRaw(raw: RawNewsItem): Promise<NewsDraftAiOutput> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError("SERVICE_UNAVAILABLE", "ANTHROPIC_API_KEY is not configured");
  }
  if (!env.ANTHROPIC_MODEL_FAST) {
    throw new AppError("SERVICE_UNAVAILABLE", "ANTHROPIC_MODEL_FAST is not configured");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL_FAST,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_DRAFT_TOOL],
    tool_choice: { type: "tool", name: "submit_news_draft" },
    messages: [
      {
        role: "user",
        content: `Headline: ${raw.headline}\n\nSummary: ${raw.summary}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "submit_news_draft",
  );
  if (!toolUse) {
    throw new AppError("SERVICE_UNAVAILABLE", "News drafting model did not return a draft");
  }

  // The SDK's tolerant tool-input parser can hand back a structurally odd
  // value even for a non-streaming, non-strict call - never trust it as
  // NewsDraftAiOutput without a real Zod parse (same reasoning the skill's
  // eager-input-streaming guidance gives for streamed tool input, applied
  // here defensively even though this call isn't streamed).
  const parsed = NewsDraftAiOutputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    logInternalError("news.ai_draft_shape_invalid", new Error(JSON.stringify(parsed.error.issues)));
    throw new AppError("SERVICE_UNAVAILABLE", "News drafting model returned a malformed draft");
  }
  return parsed.data;
}
