import { clerkMiddleware } from "@clerk/nextjs/server";

// Bound to the STAFF/ADMIN Clerk application only (NEXT_PUBLIC_CLERK_
// PUBLISHABLE_KEY / CLERK_SECRET_KEY) - this is the only Clerk instance
// that ever manages a session cookie on this domain. The mobile app's
// users are a separate Clerk application, verified directly via
// @clerk/backend in requireUser() (src/lib/auth.ts), which never touches
// this middleware or auth() at all. See docs/ARCHITECTURE.md decision D2.
//
// Bare middleware: it makes staff Clerk session state available to auth()
// in Server Components/route handlers, but doesn't block any route itself
// - there is no auth.protect() call here or anywhere in this file. Staff
// routes decide what they need via requireStaff() (src/lib/auth.ts); a
// route that calls neither requireStaff() nor requireUser(), like the
// webhook endpoints (src/app/api/webhooks/*), is reachable with no Clerk
// session at all, which is required since Clerk/RevenueCat sign those
// requests with their own HMAC signature instead of a Clerk session.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
