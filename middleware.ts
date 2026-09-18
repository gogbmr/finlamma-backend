import { clerkMiddleware } from "@clerk/nextjs/server";

// Bare middleware: it makes Clerk session state (cookie or Authorization:
// Bearer header) available to auth() in route handlers, but doesn't block
// any route itself. Each route decides what it needs via requireUser() /
// requireStaff() (src/lib/auth.ts).
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
