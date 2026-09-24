import { Inngest } from "inngest";

// One client, shared by every background job under src/inngest/functions.
// Signing-key / event-key / dev-mode behavior is entirely the SDK's own
// concern (see src/lib/env.ts's INNGEST_* comments and docs/ARCHITECTURE.md's
// Inngest bootstrap note) - this file never reads env.INNGEST_SIGNING_KEY
// itself, since the SDK already reads process.env.INNGEST_SIGNING_KEY /
// process.env.INNGEST_EVENT_KEY / process.env.INNGEST_DEV directly and
// defaults to Cloud mode (signature verification ON, refuses to start
// without a signing key) unless INNGEST_DEV=1 explicitly opts into Dev mode.
export const inngest = new Inngest({ id: "finlamma-backend" });
