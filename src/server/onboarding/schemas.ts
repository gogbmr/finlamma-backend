import { z } from "zod";
import { registry } from "@/lib/openapi";

export const SetDateOfBirthRequestSchema = registry.register(
  "SetDateOfBirthRequest",
  z.object({
    dateOfBirth: z.iso.date().openapi({
      example: "2012-05-14",
      description:
        "YYYY-MM-DD. Can be set exactly once through this endpoint - contact support to " +
        "correct a mistake after that.",
    }),
  }),
);
export type SetDateOfBirthInput = z.infer<typeof SetDateOfBirthRequestSchema>;

export const DateOfBirthStatusDataSchema = registry.register(
  "DateOfBirthStatus",
  z.object({
    dateOfBirth: z.iso.date().openapi({ example: "2012-05-14" }),
    isMinor: z.boolean().openapi({ example: true }),
    requiresParentConsent: z.boolean().openapi({
      example: true,
      description: "True if isMinor and parental consent hasn't been completed yet.",
    }),
  }),
);

export const SetDateOfBirthResponseSchema = registry.register(
  "SetDateOfBirthResponse",
  z.object({ data: DateOfBirthStatusDataSchema }),
);

export const OnboardingCompleteDataSchema = registry.register(
  "OnboardingCompleteStatus",
  z.object({
    onboardingCompletedAt: z.iso.datetime().openapi({
      example: "2026-01-01T00:00:00.000Z",
      description:
        "When the World Home mentor-intro modal (WH-11) first finished for this user. Calling " +
        "this endpoint again after it's already set just returns the original timestamp - it " +
        "never errors and never moves the timestamp forward.",
    }),
  }),
);

export const OnboardingCompleteResponseSchema = registry.register(
  "OnboardingCompleteResponse",
  z.object({ data: OnboardingCompleteDataSchema }),
);

export const RequestParentConsentRequestSchema = registry.register(
  "RequestParentConsentRequest",
  z.object({
    parentName: z.string().min(1).max(200).openapi({ example: "Priya Sharma" }),
    parentEmail: z.email().openapi({ example: "priya.sharma@example.com" }),
  }),
);
export type RequestParentConsentInput = z.infer<typeof RequestParentConsentRequestSchema>;

export const RequestParentConsentResponseSchema = registry.register(
  "RequestParentConsentResponse",
  z.object({
    data: z.object({
      status: z.literal("pending").openapi({ example: "pending" }),
      parentEmail: z.email().openapi({ example: "priya.sharma@example.com" }),
    }),
  }),
);

export const ResendLegalReapprovalResponseSchema = registry.register(
  "ResendLegalReapprovalResponse",
  z.object({
    data: z.object({
      resent: z.number().int().openapi({
        example: 1,
        description: "How many pending re-approval emails were actually resent just now.",
      }),
    }),
  }),
);
