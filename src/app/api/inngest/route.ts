import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { functions } from "@/inngest/functions";

// Signature verification on every invocation is the Inngest SDK's own
// built-in behavior, not something this route re-implements: `serve()`
// defaults to Cloud mode, which requires INNGEST_SIGNING_KEY and rejects an
// unsigned/invalid request with 401 before any function code runs - the same
// fail-closed-by-default shape as the Clerk webhook routes, just enforced
// inside the SDK instead of a hand-rolled check here. Only INNGEST_DEV=1
// (local-only, see src/lib/env.ts) switches this off, by talking to the
// local Inngest Dev Server instead of Inngest Cloud.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
