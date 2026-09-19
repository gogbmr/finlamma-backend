import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

// Scoped to the /admin subtree only - the public homepage under (public)
// never needs Clerk context. See docs/ARCHITECTURE.md decision D2a: this is
// the STAFF Clerk application (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY /
// CLERK_SECRET_KEY), the only one that ever holds a session cookie on this
// domain.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
