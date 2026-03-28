"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type DismissibleNoticeProps = {
  children: React.ReactNode;
  className?: string;
  clearQueryKeys?: string[];
  variant?: "success" | "error" | "info" | "warning" | "neutral";
};

const variantClassNames: Record<NonNullable<DismissibleNoticeProps["variant"]>, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-rose-300 bg-rose-50 text-rose-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  neutral: "border-border/70 bg-background/70 text-muted-foreground",
};

export function DismissibleNotice({
  children,
  className,
  clearQueryKeys = [],
  variant = "neutral",
}: DismissibleNoticeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    setVisible(true);
  }, [children]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "relative rounded-lg border p-3 pr-10 text-sm",
        variantClassNames[variant],
        className,
      )}
    >
      {children}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => {
          setVisible(false);

          if (!pathname || clearQueryKeys.length === 0) return;

          const nextParams = new URLSearchParams(searchParams.toString());
          for (const key of clearQueryKeys) {
            nextParams.delete(key);
          }

          const query = nextParams.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-base leading-none text-current/70 transition hover:bg-black/5 hover:text-current"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}
