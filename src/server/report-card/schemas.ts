import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

export const CoachNoteCategoryEnum = z.enum(["strength", "gap", "opportunity", "habit"]);

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16) ---

export const CreateCoachNoteTemplateSchema = z.object({
  category: CoachNoteCategoryEnum,
  template: LocalizedTextSchema,
});
export type CreateCoachNoteTemplateInput = z.infer<typeof CreateCoachNoteTemplateSchema>;

export const UpdateCoachNoteTemplateSchema = CreateCoachNoteTemplateSchema.extend({
  id: z.string().uuid(),
});
export type UpdateCoachNoteTemplateInput = z.infer<typeof UpdateCoachNoteTemplateSchema>;

export const CoachNoteTemplateIdSchema = z.object({ id: z.string().uuid() });

// --- App (GET /me/report-card) ---

const EfficiencySubMetricsSchema = z.object({
  retention: z.number().int().min(0).max(100),
  watchSpeed: z.number().int().min(0).max(100),
  quizAccuracy: z.number().int().min(0).max(100),
  consistency: z.number().int().min(0).max(100),
});

const ModuleBreakdownRowSchema = z.object({
  worldId: z.uuid(),
  worldTitle: z.string(),
  lessonsCompleted: z.number().int().nonnegative(),
  minutesSpent: z.number().int().nonnegative(),
  accuracyPct: z.number().int().min(0).max(100),
  grade: z.enum(["S", "A", "B", "C"]),
});

const TopicMasteryRowSchema = z.object({
  topic: z.string(),
  accuracyPct: z.number().int().min(0).max(100),
});

const CoachNoteSchema = z.object({
  category: CoachNoteCategoryEnum,
  text: LocalizedTextSchema.openapi({
    description: "The template with placeholders already filled in with this learner's own numbers.",
  }),
});

export const ReportCardSnapshotSchema = z.object({
  weekStartDate: z.string().openapi({ example: "2026-09-21", description: "IST Monday." }),
  efficiencyScore: z.number().int().min(0).max(100),
  subMetrics: EfficiencySubMetricsSchema,
  moduleBreakdown: z.array(ModuleBreakdownRowSchema),
  topicMastery: z.array(TopicMasteryRowSchema),
  coachNotes: z.array(CoachNoteSchema),
});

export const ReportCardResponseSchema = registry.register(
  "ReportCardResponse",
  z.object({
    data: z.object({
      current: ReportCardSnapshotSchema.nullable().openapi({
        description: "Null until the first Monday after signup has run.",
      }),
      trend: z
        .array(z.object({ weekStartDate: z.string(), efficiencyScore: z.number().int() }))
        .openapi({ description: "Up to the last 8 weeks, oldest first." }),
      sharedWithParent: z
        .object({
          maskedEmail: z.string().openapi({ example: "j***@gmail.com" }),
          weeklyEmailOn: z.boolean().openapi({
            description:
              "Whether the parent currently receives the weekly report email - the parent's own " +
              "choice, set on the consent/reapproval pages or an unsubscribe link, never a toggle " +
              "the learner controls themselves.",
          }),
        })
        .nullable()
        .openapi({
          description:
            "Non-null whenever this learner is currently under 18 with a consented parent - see " +
            "docs/ARCHITECTURE.md D33. Non-null does not mean the weekly email is sending; check " +
            "weeklyEmailOn for that.",
        }),
    }),
  }),
);
