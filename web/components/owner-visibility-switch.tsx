"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type OwnerVisibilitySwitchProps = {
  ids: string[];
  audience: "public" | "enterprise";
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  turningOnText?: string;
  turningOffText?: string;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function OwnerVisibilitySwitch({
  ids,
  audience,
  checked,
  disabled = false,
  ariaLabel,
  turningOnText = "Turning on...",
  turningOffText = "Turning off...",
}: OwnerVisibilitySwitchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextState = !checked;

  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Spinner />
        {nextState ? turningOnText : turningOffText}
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "text-[11px] font-semibold leading-none",
            checked ? "text-emerald-700" : "text-muted-foreground",
          )}
        >
          ON
        </span>
        <Switch
          type="button"
          checked={checked}
          checkedSide="left"
          disabled={disabled || ids.length === 0}
          aria-label={ariaLabel}
          onClick={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const response = await fetch("/api/owner/recipes/visibility", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ids, audience, value: nextState }),
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
        />
        <span
          className={cn(
            "text-[11px] font-semibold leading-none",
            checked ? "text-muted-foreground" : "text-slate-700",
          )}
        >
          OFF
        </span>
      </div>
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
