import { z, ZodError } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, logInternalError, okList, parseLimit, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import {
  DoubtZoneStreamLineSchema,
  MessagesListResponseSchema,
  SendMessageInputSchema,
  ThreadIdParamSchema,
} from "@/server/doubt-zone/schemas";
import {
  listThreadMessages,
  prepareMessage,
  streamReplyAndPersist,
  type DoubtZoneStreamLine,
} from "@/server/doubt-zone/service";
import { requireFullAccess } from "@/server/onboarding/service";

const RATE_LIMITED_EXAMPLE = {
  error: { code: "RATE_LIMITED", message: "Too many messages - slow down and try again shortly" },
};

registry.registerPath({
  method: "get",
  path: "/api/v1/doubt-zone/threads/{id}/messages",
  summary: "Get a Doubt Zone thread's message history",
  description: "The caller's own thread only, newest first, cursor-paginated.",
  tags: ["Doubt Zone"],
  security: [{ bearerAuth: [] }],
  request: {
    params: ThreadIdParamSchema,
    query: z.object({
      limit: z.string().optional().openapi({ example: "20" }),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "A page of this thread's messages",
      content: { "application/json": { schema: MessagesListResponseSchema } },
    },
    401: {
      description: "Not signed in",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Sign-in required" } },
        },
      },
    },
    403: {
      description: "Onboarding, parental consent or legal acceptance is incomplete",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "FORBIDDEN", message: "Complete onboarding before using this feature" },
          },
        },
      },
    },
    404: {
      description: "No thread with this id belonging to the caller",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No Doubt Zone thread with this id" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const { id } = ThreadIdParamSchema.parse(await params);
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const { data, nextCursor } = await listThreadMessages(user, id, { limit, cursor: searchParams.get("cursor") });
  return okList(data, nextCursor);
});

registry.registerPath({
  method: "post",
  path: "/api/v1/doubt-zone/threads/{id}/messages",
  summary: "Send a message to the Doubt Zone AI mentor and stream its reply",
  description:
    "The response body is always newline-delimited JSON (`application/x-ndjson`, one compact " +
    "JSON object per line matching DoubtZoneStreamLine), never a single JSON object - even when " +
    "the safety classifier or the advice-language output filter replaces the reply, since that " +
    "still arrives as a single 'done' line on the same stream, not a different response shape. " +
    "Every message runs through a safety classifier BEFORE the AI ever sees it, biased heavily " +
    "toward flagging when uncertain (docs/ARCHITECTURE.md's Phase 7 kickoff decisions) - a " +
    "flagged message gets a fixed, settings_kv-driven safety redirect instead of a normal reply, " +
    "and is queued for staff review (doubt_zone.moderate). The AI never receives the learner's " +
    "name, age, email, phone, state, school or any other identifying detail - only language, the " +
    "mentor's persona, and (when opened from a lesson) that lesson's own public topic.",
  tags: ["Doubt Zone"],
  security: [{ bearerAuth: [] }],
  request: {
    params: ThreadIdParamSchema,
    body: { content: { "application/json": { schema: SendMessageInputSchema } } },
  },
  responses: {
    200: {
      description:
        "A newline-delimited stream of DoubtZoneStreamLine objects: zero or more 'delta' lines " +
        "followed by exactly one 'done' line. When 'done'.replaced is true, discard any " +
        "accumulated 'delta' text and show replacementText instead.",
      content: { "application/x-ndjson": { schema: DoubtZoneStreamLineSchema } },
    },
    401: {
      description: "Not signed in",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Sign-in required" } },
        },
      },
    },
    403: {
      description: "Onboarding, parental consent or legal acceptance is incomplete",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "FORBIDDEN", message: "Complete onboarding before using this feature" },
          },
        },
      },
    },
    404: {
      description: "No thread with this id belonging to the caller",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No Doubt Zone thread with this id" } },
        },
      },
    },
    400: {
      description: "Message is empty or too long",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Request validation failed" } },
        },
      },
    },
    429: {
      description: "Burst, daily-per-learner, or global daily message cap exceeded",
      content: { "application/json": { schema: ErrorResponseSchema, example: RATE_LIMITED_EXAMPLE } },
    },
    503: {
      description: "The safety classifier or the AI model is not configured / unavailable",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "SERVICE_UNAVAILABLE", message: "Safety classifier call failed" } },
        },
      },
    },
  },
});

// Deliberately NOT wrapped in withErrors: everything that can still become
// a clean HTTP error status (thread ownership, rate limits, the safety
// classifier) happens inside prepareMessage, BEFORE this handler opens the
// stream - a thrown AppError there is caught below and turned into a normal
// JSON error response, exactly like withErrors would. Once the stream is
// open, streamReplyAndPersist never throws (see its own doc comment) - by
// then a clean HTTP status is no longer possible, only what the stream
// itself communicates.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = ThreadIdParamSchema.parse(await params);
    const body = SendMessageInputSchema.parse(await req.json());
    const meta = requestMeta(req.headers);
    const doubtZoneUser = { id: user.id, language: user.language };

    const prepared = await prepareMessage(doubtZoneUser, id, body.content, meta);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (line: DoubtZoneStreamLine) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        if (prepared.kind === "flagged") {
          emit({
            type: "done",
            messageId: prepared.assistantMessageId,
            replaced: true,
            replacementText: prepared.replacementText,
          });
        } else {
          await streamReplyAndPersist(doubtZoneUser, id, prepared, emit, meta);
        }
        controller.close();
      },
    });

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  } catch (err) {
    // Same error-to-response mapping as withErrors (src/lib/http.ts) -
    // reimplemented inline rather than wrapping this whole handler in it,
    // since withErrors' signature always returns a Response for any
    // thrown error, and everything above this catch is exactly the part
    // that's still safe to convert into a normal JSON error response (the
    // stream hasn't opened yet).
    if (err instanceof AppError) return fail(err);
    if (err instanceof ZodError) {
      return fail(new AppError("VALIDATION_FAILED", "Request validation failed", z.flattenError(err).fieldErrors));
    }
    const errorId = crypto.randomUUID();
    logInternalError(errorId, err);
    return fail(new AppError("INTERNAL", "Something went wrong", { errorId }));
  }
}
