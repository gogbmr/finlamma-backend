"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminSidebar } from "@/components/admin/admin-nav";
import type { AdminNavVisibility } from "@/lib/admin/nav-visibility";
import { Sheet, SheetCloseButton, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";

// Replaces the old horizontal AdminNavStrip (flattened icon+label row,
// scrolled below `lg`) with a proper slide-in drawer below `lg` - same
// breakpoint, same visibility data, but now the full grouped sidebar nav
// (not a flattened strip) is reachable on tablet/phone, consistent with
// what the founder asked for. Built on src/components/admin/sheet.tsx
// (Radix Dialog) for its focus trap/Esc/overlay/scroll-lock, so none of
// that needed hand-rolling.
export function MobileNavDrawer({ visibility }: { visibility: AdminNavVisibility }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation - a Link click inside the drawer changes the
  // route, which changes usePathname()'s return value. This adjusts state
  // directly during render rather than in a useEffect (React's own
  // recommended pattern for "reset state when a prop/derived value
  // changes" - https://react.dev/learn/you-might-not-need-an-effect) so it
  // doesn't trip the same cascading-render lint rule
  // src/components/admin/admin-nav.tsx's own comments already document
  // working around elsewhere in this codebase.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent className="admin-glass-chrome p-0">
        <SheetHeader className="border-b border-white/40">
          <SheetTitle className="text-brand-violet-900 text-base font-bold">
            FinLamma Admin
          </SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <AdminSidebar visibility={visibility} allowRailCollapse={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
