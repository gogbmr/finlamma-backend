import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - must run
// before any .openapi() call in this file (see src/lib/openapi.ts).
import "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

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

const WorldsLeaderboardRowSchema = z.object({
  worldId: z.uuid().openapi({ example: "c1c6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b" }),
  title: z.object({ en: z.string(), hi: z.string(), hx: z.string() }).openapi({
    example: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
  }),
  xp: z.number().int().nonnegative().openapi({ example: 48210, description: "Total weekly XP, this world's team." }),
  memberCount: z.number().int().nonnegative().openapi({ example: 214 }),
  xpPerMember: z.number().int().nonnegative().openapi({
    example: 225,
    description: "xp / memberCount, rounded - lets a small world compete on average, not just total.",
  }),
  deltaPct: z.number().int().nullable().openapi({
    example: 21,
    description: "% change vs last week's total. Null if last week's total was 0 (nothing to compare against).",
  }),
  sparkline: z
    .array(z.object({ date: z.string().openapi({ example: "2026-09-22" }), xp: z.number().int().nonnegative() }))
    .openapi({ description: "Oldest-first daily totals, up to the last 7 IST days. Shorter if less history exists." }),
});

export const ArenaWorldsResponseSchema = z.object({
  data: z.object({
    weekStartDate: z.string().openapi({ example: "2026-09-28" }),
    worlds: z.array(WorldsLeaderboardRowSchema),
  }),
});

const ActivityFeedItemSchema = z.object({
  firstName: z.string().nullable().openapi({ example: "Meera" }),
  lastInitial: z.string().nullable().openapi({ example: "K" }),
  amount: z.number().int().openapi({ example: 80 }),
  createdAt: z.string().datetime().openapi({ example: "2026-09-28T10:12:00.000Z" }),
});

export const ArenaActivityResponseSchema = z.object({
  data: z.object({ items: z.array(ActivityFeedItemSchema) }),
});

export const SendCheerRequestSchema = z.object({
  receiverId: z.uuid().openapi({ example: "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b" }),
});

export const SendCheerResponseSchema = z.object({
  data: z.object({
    alreadyCheeredToday: z.boolean().openapi({
      example: false,
      description: "true if you'd already cheered this learner today - no additional XP was awarded.",
    }),
    xpAwarded: z.number().int().nonnegative().openapi({ example: 5 }),
    dailyCapReached: z.boolean().openapi({
      example: false,
      description: "true if the receiver's daily cheer-XP cap limited (or zeroed) this award.",
    }),
  }),
});

export const MyCheersSummaryResponseSchema = z.object({
  data: z.object({
    receivedThisWeek: z.number().int().nonnegative().openapi({
      example: 12,
      description: "Aggregate count only - who sent them is never shown (docs/ARCHITECTURE.md D53).",
    }),
  }),
});

const AboutMeChipSchema = z.object({
  id: z.uuid(),
  name: LocalizedTextSchema,
  iconKey: z.string().nullable().openapi({ example: "piggy-bank" }),
});

export const AboutMeChipListResponseSchema = z.object({
  data: z.array(AboutMeChipSchema),
});

export const SetMySelectedChipsRequestSchema = z.object({
  chipIds: z.array(z.uuid()).max(3).openapi({
    description: "Replaces your whole chip selection - at most 3 (settings, not schema-fixed).",
  }),
});

export const MySelectedChipsResponseSchema = z.object({
  data: z.array(AboutMeChipSchema),
});

const PublicBadgeSchema = z.object({
  id: z.uuid(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema,
  iconKey: z.string().nullable(),
});

const PublicWorldProgressSchema = z
  .object({
    id: z.uuid(),
    title: LocalizedTextSchema,
    completedLessons: z.number().int().nonnegative().openapi({ example: 6 }),
    totalLessons: z.number().int().nonnegative().openapi({ example: 40 }),
  })
  .nullable();

export const PublicProfileResponseSchema = z.object({
  data: z.object({
    firstName: z.string().nullable().openapi({ example: "Aarav" }),
    lastInitial: z.string().nullable().openapi({
      example: "S",
      description: "Kid-safe display name is always firstName + lastInitial - never a full name or photo.",
    }),
    level: z.number().int().positive().openapi({ example: 4 }),
    rankTitle: LocalizedTextSchema.nullable(),
    badges: z.array(PublicBadgeSchema),
    chips: z.array(AboutMeChipSchema).openapi({
      description: "Preset chips this learner picked - never free text (docs/ARCHITECTURE.md D36).",
    }),
    weekXp: z.number().int().nonnegative().openapi({ example: 1240 }),
    streak: z.object({
      current: z.number().int().nonnegative().openapi({ example: 4 }),
      longest: z.number().int().nonnegative().openapi({ example: 12 }),
    }),
    quizAccuracyPct: z.number().int().min(0).max(100).nullable().openapi({ example: 82 }),
    currentWorld: PublicWorldProgressSchema,
  }),
});

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16) ---

// All three languages required - same "no draft state to hold an
// incomplete row in" reasoning as rank_titles (src/server/rank-titles/schemas.ts).
const NonBlankLocalizedTextSchema = z.object({
  en: z.string().min(1, "English name is required"),
  hi: z.string().min(1, "Hindi name is required"),
  hx: z.string().min(1, "Hinglish name is required"),
});

export const AboutMeChipInputSchema = z.object({
  name: NonBlankLocalizedTextSchema,
  iconKey: z.string().nullable().optional(),
  active: z.boolean(),
});
export type AboutMeChipInput = z.infer<typeof AboutMeChipInputSchema>;
