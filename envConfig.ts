// Loads .env.local the same way Next.js does, for tools that run outside the
// Next.js runtime (drizzle-kit, one-off scripts). Import this before anything
// that reads process.env in those contexts.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
