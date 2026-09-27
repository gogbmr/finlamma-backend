import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts. Must be imported before any .openapi() call below.
import "@/lib/openapi";
import { registry } from "@/lib/openapi";

// GET /api/v1/relay/config's response - everything the market relay (a
// separate repo, docs/ARCHITECTURE.md) needs to know which symbols to
// track and whether to bother at all right now. Registered (not plain
// Zod) per CLAUDE.md's "relay-only endpoints are registered too, with
// their own security schemes, so the document covers the whole backend" -
// see the route's own `tags: ["Relay"]` and description for how it's kept
// clearly marked internal without a formal securitySchemes entry (no
// OpenAPI security scheme type fits a raw shared-secret header well -
// same reasoning the Clerk/RevenueCat webhooks already use).
const RelayInstrumentSchema = z.object({
  symbol: z.string().openapi({ example: "RELIANCE" }),
  exchange: z.string().openapi({ example: "NSE" }),
  halted: z.boolean().openapi({
    description: "Per-symbol halt (Ops console) - the relay may choose to skip a halted symbol.",
  }),
});

const RelayConfigSchema = z.object({
  instruments: z.array(RelayInstrumentSchema),
  feedMode: z.enum(["live", "delayed_15m", "paused"]).openapi({
    description: "Ops console setting. 'paused' is a signal the relay can use to stop polling/streaming entirely, saving vendor credits.",
    example: "live",
  }),
  globalHalt: z.boolean(),
  holidays: z.array(z.string()).openapi({
    description: "NSE holiday dates (YYYY-MM-DD) - the relay can skip polling on these too.",
    example: ["2026-10-02"],
  }),
});

export const RelayConfigResponseSchema = registry.register(
  "RelayConfigResponse",
  z.object({ data: RelayConfigSchema }),
);
