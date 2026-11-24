"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// A shadcn-style "Sheet" (slide-in panel) built directly on
// @radix-ui/react-dialog - admin-only (src/components/admin/, not
// src/components/ui/, since nothing outside /admin needs it yet). Radix's
// Dialog gives this its focus trap, Esc-to-close, overlay and body-scroll
// lock for free - see Root's own docs, node_modules/@radix-ui/react-dialog.
// No tailwindcss-animate plugin is installed in this project (confirmed -
// nothing else uses animate-in/out classes), so the slide transition is
// hand-written with plain CSS transitions keyed off Radix's own
// data-state="open"|"closed" attribute, which Tailwind v4 reads natively
// via the data-[state=...] arbitrary-variant syntax - no new dependency
// needed for that part. Radix's internal Presence wrapper already waits
// for the CSS transition to finish before unmounting on close, the same
// mechanism tailwindcss-animate itself relies on, just without the plugin's
// animate-in/out utility names.
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({ className, ...props }: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[1px] transition-opacity duration-200 motion-reduce:transition-none",
        "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

// `side` only supports "left" (the nav drawer's own need) - not built out
// for right/top/bottom since nothing else in admin uses this yet; add those
// variants when something actually needs them, not speculatively.
function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col outline-none",
          "transition-transform duration-200 motion-reduce:transition-none",
          "data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-4 py-3", className)} {...props} />
  );
}

function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-base font-semibold", className)} {...props} />;
}

function SheetCloseButton({ className, ...props }: ComponentProps<typeof SheetPrimitive.Close>) {
  return (
    <SheetPrimitive.Close
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </SheetPrimitive.Close>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetCloseButton };
