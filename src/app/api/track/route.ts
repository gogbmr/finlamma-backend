import { z } from "zod";
import { captureEvent } from "@/lib/analytics";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";

// Public, unauthenticated-by-design beacon for the marketing homepage
// (docs/ARCHITECTURE.md D69) - there is no account/session concept on that
// page, so this deliberately doesn't call requireUser/requireStaff. No DB
// write happens here either (nothing to put in activity_logs) - the only
// effect is a forwarded, anonymous PostHog event. A fixed Zod enum (not a
// free-form string) is the whole defense against this becoming an arbitrary
// event-injection endpoint; distinct_id is always a fresh crypto.randomUUID()
// per call, never anything that could identify the visitor.
const TrackRequestSchema = z.object({
  event: z.enum(["homepage_viewed", "app_store_link_clicked"]).openapi({
    description: "Fixed set of homepage marketing events - see docs/ARCHITECTURE.md D69.",
    example: "homepage_viewed",
  }),
  platform: z
    .enum(["ios", "android"])
    .optional()
    .openapi({ description: "Only present for app_store_link_clicked.", example: "android" }),
});

registry.registerPath({
  method: "post",
  path: "/api/track",
  summary: "Homepage analytics beacon (public, anonymous)",
  description:
    "Forwards a fixed, closed set of marketing-homepage events to PostHog server-side - no " +
    "client ever holds a PostHog key (docs/ARCHITECTURE.md D69). Unauthenticated by design: " +
    "the public marketing homepage has no account/session concept. distinct_id is a fresh " +
    "random id per call, never derived from the visitor.",
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
      description: "Invalid event name",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const input = TrackRequestSchema.parse(await req.json());
  captureEvent(
    crypto.randomUUID(),
    input.event,
    input.platform ? { platform: input.platform } : undefined,
  );
  return ok({ tracked: true });
});
