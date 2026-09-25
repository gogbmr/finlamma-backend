import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { functions } from "@/inngest/functions";

// Signature verification on every invocation is the Inngest SDK's own
// built-in behavior, not something this route re-implements: this handler's
// mode follows `client`'s own `isDev` (src/lib/inngest.ts) - Cloud mode
// (requires INNGEST_SIGNING_KEY, rejects an unsigned/invalid request with
// 401 before any function code runs, the same fail-closed-by-default shape
// as the Clerk webhook routes) on every real Vercel deployment (preview and
// production alike), Dev mode (no signing key needed, talks to the local
// Inngest Dev Server) automatically on any machine that isn't one.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
