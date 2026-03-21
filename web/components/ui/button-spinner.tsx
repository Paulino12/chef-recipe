"use client";

import { cn } from "@/lib/utils";

export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent shrink-0",
        className,
      )}
    />
  );
}
