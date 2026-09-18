import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Transaction pool mode (Supabase pooler, port 6543) does not support
// prepared statements or connection-level state, so prepare is disabled.
const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle({ client: queryClient, schema });
