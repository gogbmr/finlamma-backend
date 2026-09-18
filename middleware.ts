import { clerkMiddleware } from "@clerk/nextjs/server";

// Bare middleware: it makes Clerk session state (cookie or Authorization:
// Bearer header) available to auth() in route handlers, but doesn't block
// any route itself - there is no auth.protect() call here or anywhere in
// this file. Each route decides what it needs via requireUser() /
// requireStaff() (src/lib/auth.ts); a route that calls neither, like the
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
