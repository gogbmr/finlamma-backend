import { requireUser } from "@/lib/auth";
import { created, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { createOrGetThread } from "@/server/doubt-zone/service";
import { CreateThreadInputSchema, ThreadResponseSchema } from "@/server/doubt-zone/schemas";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/doubt-zone/threads",
  summary: "Open or resume a Doubt Zone AI thread (Phase 7 live 'Ask Lamma AI' mentor)",
  description:
    "Idempotent by (learner, context): passing the same lessonId (or, for the standalone entry " +
    "point, the same mentorId with no lessonId) returns the existing thread rather than creating " +
    "a new one. lessonId set derives the mentor from that lesson's world server-side (never " +
    "trusted from the client); lessonId omitted requires mentorId, since the client already " +
    "knows which mentor it's showing. disclosureMessage is the upfront, non-scary notice - this " +
    "is an AI, not a person, can't give investment advice, and a flagged message may be reviewed " +
    "by a Finlamma team member - already resolved to the caller's own language.",
  tags: ["Doubt Zone"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateThreadInputSchema } } },
  },
  responses: {
    201: {
      description: "The (possibly pre-existing) thread",
      content: { "application/json": { schema: ThreadResponseSchema } },
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
      description: "No published lesson/mentor with the given id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published mentor with this id" } },
        },
      },
    },
    400: {
      description: "mentorId missing when lessonId is omitted",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "VALIDATION_FAILED", message: "mentorId is required when lessonId is omitted" },
          },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const body = CreateThreadInputSchema.parse(await req.json());
  const thread = await createOrGetThread(
    { id: user.id, language: user.language },
    body,
    requestMeta(req.headers),
  );
  return created(thread);
});
