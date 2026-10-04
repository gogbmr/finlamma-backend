import { z } from "zod";
import { captureEvent } from "@/lib/analytics";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRateLimit, HOMEPAGE_TRACK_RATE_LIMIT } from "@/lib/redis";

// Public, unauthenticated-by-design beacon for the marketing homepage
// (docs/ARCHITECTURE.md D69) - there is no account/session concept on that
// page, so this deliberately doesn't call requireUser/requireStaff. No DB
// write happens here either (nothing to put in activity_logs) - the only
// effect is a forwarded, anonymous PostHog event.
//
// Everything below is deliberate defense against this being a public,
// anonymous POST endpoint:
// - `.strict()`: an unknown field is a hard 400, not silently dropped -
//   fail loud rather than quietly accept a shape we didn't ask for.
// - A fixed, closed Zod enum for both fields (never a free-form string) -
//   there is no field of any kind that could carry a name, email, or other
//   PII through this endpoint, deliberately or otherwise.
// - No properties beyond `platform` ever reach captureEvent, and that
//   value is itself constrained to the same two-value enum - there is no
//   path to an arbitrary analytics payload.
// - IP-based rate limiting (HOMEPAGE_TRACK_RATE_LIMIT, see src/lib/redis.ts
//   for why this is the one deliberate exception to this codebase's usual
//   never-rate-limit-by-IP rule).
const TrackRequestSchema = z
  .object({
    event: z.enum(["homepage_viewed", "app_store_link_clicked"]).openapi({
      description: "Fixed set of homepage marketing events - see docs/ARCHITECTURE.md D69.",
      example: "homepage_viewed",
    }),
    platform: z
      .enum(["ios", "android"])
      .optional()
      .openapi({ description: "Only present for app_store_link_clicked.", example: "android" }),
  })
  .strict();

registry.registerPath({
  method: "post",
  path: "/api/track",
  summary: "Homepage analytics beacon (public, anonymous)",
  description:
    "Forwards a fixed, closed set of marketing-homepage events to PostHog server-side - no " +
    "client ever holds a PostHog key (docs/ARCHITECTURE.md D69). Unauthenticated by design: " +
    "the public marketing homepage has no account/session concept. distinct_id is a fresh " +
    "random id per call, never derived from the visitor. Rate-limited per IP.",
  tags: ["Analytics"],
  request: {
    body: { content: { "application/json": { schema: TrackRequestSchema } } },
  },
  responses: {
    200: {
      description: "Event accepted (forwarding is fire-and-forget; this never reflects delivery)",
      content: { "application/json": { schema: z.object({ data: z.object({ tracked: z.literal(true) }) }) } },
    },
    400: {
      description: "Invalid event name, or an unrecognized field in the request body",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Too many requests from this IP",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "RATE_LIMITED", message: "Too many requests - slow down and try again shortly" } },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const { ip } = requestMeta(req.headers);
  const { allowed } = await checkRateLimit(ip ?? "unknown", HOMEPAGE_TRACK_RATE_LIMIT, true);
  if (!allowed) {
    throw new AppError("RATE_LIMITED", "Too many requests - slow down and try again shortly");
  }

  const input = TrackRequestSchema.parse(await req.json());
  captureEvent(
    crypto.randomUUID(),
    input.event,
    input.platform ? { platform: input.platform } : undefined,
  );
  return ok({ tracked: true });
});
