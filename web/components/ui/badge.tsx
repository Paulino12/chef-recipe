import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariantStyles = {
  default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/85",
  outline: "border-border text-foreground",
  success: "border-transparent bg-emerald-100 text-emerald-800",
  muted: "border-transparent bg-muted text-muted-foreground",
} as const;

type BadgeVariant = keyof typeof badgeVariantStyles;

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: BadgeVariant }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        badgeVariantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
