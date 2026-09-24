import { z } from "zod";
import { registry } from "@/lib/openapi";

export const RecordSessionTimeRequestSchema = registry.register(
  "RecordSessionTimeRequest",
  z.object({
    seconds: z.number().int().positive().max(3600).openapi({
      example: 240,
      description:
        "Duration of one finished session (a lesson/screen, not a heartbeat) - sent once when " +
        "the session ends, capped at 1 hour per call.",
    }),
  }),
);

export const RecordSessionTimeResponseSchema = registry.register(
  "RecordSessionTimeResponse",
  z.object({
    data: z.object({
      todaySeconds: z.number().int().nonnegative().openapi({
        example: 1140,
        description: "Running total for today (IST), after adding this ping.",
      }),
    }),
  }),
);
