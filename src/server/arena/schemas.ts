import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - must run
// before any .openapi() call in this file (see src/lib/openapi.ts).
import "@/lib/openapi";

export const ArenaScopeKindSchema = z.enum(["world", "state", "india", "global"]).openapi({
  example: "global",
  description:
    "Which leaderboard to view (FEATURE_MAP AR-07). 'world' is the caller's own current " +
    "world team; 'state' uses the caller's own users.state if set. A thin state pool " +
    "transparently falls back to 'india' (see fallbackApplied on the response).",
});

const LeaderboardRowSchema = z.object({
  rank: z.number().int().positive().openapi({ example: 1 }),
  userId: z.uuid().openapi({ example: "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b" }),
  firstName: z.string().nullable().openapi({ example: "Aarav" }),
  lastInitial: z.string().nullable().openapi({
    example: "S",
    description: "Kid-safe display name is always firstName + lastInitial - never a full name.",
  }),
  xp: z.number().int().nonnegative().openapi({ example: 2710, description: "XP earned this week." }),
  isSelf: z.boolean().openapi({ example: false }),
});

export const ArenaLeaderboardResponseSchema = z.object({
  data: z.object({
    requestedScope: z.string().openapi({
      example: "state:Maharashtra",
      description: "The scope actually requested, before any privacy-floor fallback.",
    }),
    scope: z.string().openapi({
      example: "india",
      description: "The scope actually returned - may differ from requestedScope, see fallbackApplied.",
    }),
    fallbackApplied: z.boolean().openapi({
      example: true,
      description:
        "true when the requested scope's pool was below the minimum size (settings_kv, " +
        "default 20) and this response falls back to a broader scope instead.",
    }),
    notEnoughPlayers: z.boolean().openapi({
      example: false,
      description:
        "true when even the returned scope doesn't meet the minimum pool size - the app " +
        "should render 'not enough players yet' rather than this (possibly empty) list.",
    }),
    weekStartDate: z.string().openapi({ example: "2026-09-28", description: "Monday IST, this week." }),
    poolSize: z.number().int().nonnegative().openapi({ example: 214 }),
    rows: z.array(LeaderboardRowSchema),
    self: z
      .object({ rank: z.number().int().positive(), xp: z.number().int().nonnegative() })
      .nullable()
      .openapi({ description: "The caller's own rank/xp, even if outside `rows` (AR-06)." }),
  }),
});
