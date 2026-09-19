import { createClerkClient } from "@clerk/backend";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { permissions, rolePermissions, staffMembers, users } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "./errors";

// The CONSUMER Clerk application - a separate Clerk app from the staff/admin
// one that clerkMiddleware()/auth() are bound to (see middleware.ts and
// docs/ARCHITECTURE.md decision D2). Mobile users never carry a session
// cookie on this domain, only a Bearer token, so they're verified directly
// here via @clerk/backend instead of through the shared middleware/auth() -
// that keeps exactly one Clerk instance ever touching cookies on this
// domain, so there's no handshake/redirect conflict between two instances.
// Created lazily (not at module scope) so importing this file doesn't
// require the consumer keys to be configured yet - only calling
// requireUser() does.
function getConsumerClerkClient() {
  if (!env.CONSUMER_CLERK_SECRET_KEY || !env.CONSUMER_CLERK_PUBLISHABLE_KEY) {
    return null;
  }
  return createClerkClient({
    secretKey: env.CONSUMER_CLERK_SECRET_KEY,
    publishableKey: env.CONSUMER_CLERK_PUBLISHABLE_KEY,
  });
}

// Verifies the mobile app's `Authorization: Bearer <token>` header against
// the CONSUMER Clerk application and resolves it to our own `users` row,
// since downstream code keys everything off our internal uuid, not the
// Clerk id. Returns UNAUTHENTICATED (not NOT_FOUND) when the token is valid
// but no users row exists yet, since from the caller's point of view
// they're simply not signed in to our system.
export async function requireUser(req: Request) {
  const consumerClerkClient = getConsumerClerkClient();
  if (!consumerClerkClient) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Consumer Clerk application not configured",
    );
  }

  let requestState: Awaited<ReturnType<typeof consumerClerkClient.authenticateRequest>>;
  try {
    requestState = await consumerClerkClient.authenticateRequest(req);
  } catch {
    // Deliberately don't log the caught error, same reasoning as the Clerk
    // webhook route: this path runs on every request touching Clerk's
    // secret key, and the verification library is third-party code we
    // don't control, so we never risk it echoing something sensitive.
    console.error("Consumer Clerk token verification failed unexpectedly");
    throw new AppError("SERVICE_UNAVAILABLE", "Could not verify session right now");
  }

  // Clerk's own RequestState type guarantees isAuthenticated: true only
  // ever pairs with status: 'signed-in' - a 'handshake' (the browser
  // cookie-refresh mechanism, meaningless here since a Bearer-only mobile
  // request carries no cookie to refresh) always has isAuthenticated:
  // false, so this one check also covers it.
  if (!requestState.isAuthenticated) {
    throw new AppError("UNAUTHENTICATED", "Sign-in required");
  }

  const { userId: clerkUserId } = requestState.toAuth();
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

// Authorizes a staff-only route: the caller must have an active staff Clerk
// session (via clerkMiddleware()/auth() - see middleware.ts and
// docs/ARCHITECTURE.md decision D2a) with a staff_members row whose role
// grants the given permission key (e.g. "staff.manage"). Returns the
// staff_members row so callers can use its id as the activity log actorId.
export async function requireStaff(permission: string) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new AppError("UNAUTHENTICATED", "Staff sign-in required");
  }

  const [staff] = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.clerkUserId, clerkUserId))
    .limit(1);

  if (!staff || !staff.active) {
    throw new AppError("FORBIDDEN", "No active staff account for this session");
  }

  const [grant] = await db
    .select({ id: rolePermissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(
      and(eq(rolePermissions.roleId, staff.roleId), eq(permissions.key, permission)),
    )
    .limit(1);

  if (!grant) {
    throw new AppError("FORBIDDEN", `Missing permission: ${permission}`);
  }

  return staff;
}
