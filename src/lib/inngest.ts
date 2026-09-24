import { Inngest } from "inngest";
import { env } from "@/lib/env";

// One client, shared by every background job under src/inngest/functions.
// Signing-key / event-key behavior is entirely the SDK's own concern (it
// already reads process.env.INNGEST_SIGNING_KEY / process.env.INNGEST_EVENT_KEY
// directly) - but Dev-vs-Cloud MODE is set explicitly here via `isDev`,
// rather than left to the SDK's own INNGEST_DEV-env-var default, so local
// dev works key-less on any machine with zero manual setup (no .env.local
// edit needed): `isDev` is true whenever env.VERCEL_ENV is absent, which is
// exactly and only true for a local `pnpm dev`/`pnpm test` run - Vercel sets
// VERCEL_ENV on every deployment it builds, preview included, so both
// preview and production always get isDev: false (Cloud mode, signature
// verification ON, INNGEST_SIGNING_KEY required) no matter what. This is
// deliberately NOT derived from NODE_ENV: `next build` always sets
// NODE_ENV=production, preview deployments included, so that alone can't
// distinguish "a real Vercel deployment" from "someone ran a local
// production build" - VERCEL_ENV is the one signal that's absent outside
// Vercel and present on every environment Vercel actually manages.
export const inngest = new Inngest({ id: "finlamma-backend", isDev: !env.VERCEL_ENV });
