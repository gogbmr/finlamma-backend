import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { fail, ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";

const HealthDataSchema = z.object({
  status: z.literal("ok").openapi({ example: "ok" }),
  database: z.literal("ok").openapi({ example: "ok" }),
  timestamp: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
});

const HealthResponseSchema = registry.register("HealthResponse", z.object({ data: HealthDataSchema }));

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  summary: "Health check",
  description: "Confirms the API is running and can reach the database. Used by uptime monitors.",
  tags: ["System"],
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
    503: {
      description: "Database is unreachable",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "SERVICE_UNAVAILABLE", message: "Database is unreachable" },
          },
        },
      },
    },
  },
});

export const GET = withErrors(async () => {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    console.error("Health check: database ping failed", err);
    return fail(new AppError("SERVICE_UNAVAILABLE", "Database is unreachable"));
  }
  return ok({
    status: "ok" as const,
    database: "ok" as const,
    timestamp: new Date().toISOString(),
  });
});
