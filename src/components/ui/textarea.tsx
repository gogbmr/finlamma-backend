import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-32 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
