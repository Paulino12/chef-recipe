"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OwnerVisibilityButtonProps = {
  ids: string[];
  audience: "public" | "enterprise";
  value: boolean;
  includeRelated?: boolean;
  variant: ButtonVariant;
  size?: ButtonSize;
  children: string;
  pendingText?: string;
  className?: string;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function OwnerVisibilityButton({
  ids,
  audience,
  value,
  includeRelated = false,
  variant,
  size = "sm",
  children,
  pendingText = "Saving...",
  className,
}: OwnerVisibilityButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={isPending || ids.length === 0}
        aria-busy={isPending || undefined}
        className={cn("min-w-20", className)}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const response = await fetch("/api/owner/recipes/visibility", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids, audience, value, includeRelated }),
            });

            if (!response.ok) {
              let message = `request failed (${response.status})`;
              try {
                const data = (await response.json()) as { error?: string };
                if (typeof data.error === "string" && data.error.trim()) {
                  message = data.error;
                }
              } catch {
                // Keep fallback status message.
              }
              setError(message);
              return;
            }

            router.refresh();
          });
        }}
      >
        {isPending ? <Spinner /> : null}
        {isPending ? pendingText : children}
      </Button>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </>
  );
}
