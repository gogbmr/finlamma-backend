import "./envConfig";
import { defineConfig } from "drizzle-kit";
import { env } from "./src/lib/env";

// drizzle-kit uses the direct (session pooler) connection, not the pooled
// runtime one - migrations need a stable session, not transaction pooling.
export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL_DIRECT,
  },
});
