"use client";

import { useFormStatus } from "react-dom";

import { FavoriteStarIcon } from "@/components/favorite-star-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FavoriteToggleButtonProps = {
  filled: boolean;
  label: string;
  pendingLabel?: string;
  iconSize?: number;
  className?: string;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 m-auto h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function FavoriteToggleButton({
  filled,
  label,
  pendingLabel = "Saving favourite",
  iconSize = 24,
  className,
}: FavoriteToggleButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={pending ? pendingLabel : label}
      aria-busy={pending || undefined}
      className={className}
    >
      <span className="relative inline-flex h-6 w-6 items-center justify-center">
        <FavoriteStarIcon
          filled={filled}
          size={iconSize}
          className={cn("transition-opacity", pending && "opacity-30")}
        />
        {pending ? <Spinner /> : null}
      </span>
      <span className="sr-only">{pending ? pendingLabel : label}</span>
    </Button>
  );
}
