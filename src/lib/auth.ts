import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { AppError } from "./errors";

// Verifies the caller's Clerk session - either the admin dashboard's cookie
// or the mobile app's `Authorization: Bearer <token>` header, both handled
// the same way by clerkMiddleware() - and resolves it to our own `users`
// row, since downstream code keys everything off our internal uuid, not
// the Clerk id. Returns UNAUTHENTICATED (not NOT_FOUND) when the session is
// valid but no users row exists yet, since from the caller's point of view
// they're simply not signed in to our system.
export async function requireUser() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new AppError("UNAUTHENTICATED", "Sign-in required");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user || user.deletedAt) {
    throw new AppError("UNAUTHENTICATED", "No account found for this session");
  }

  return user;
}
