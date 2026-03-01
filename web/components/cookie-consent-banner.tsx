"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CONSENT_COOKIE_NAME = "rp_cookie_pref";
const CONSENT_STORAGE_KEY = "rp_cookie_pref";
const CONSENT_TTL_DAYS = 180;

type ConsentValue = "all" | "essential";

function getCookie(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Lightweight cookie acknowledgement banner.
 * Stores a compact preference in both cookie and localStorage for resilience.
 */
export function CookieConsentBanner() {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const acknowledged = hydrated
    ? (() => {
        const cookieValue = getCookie(CONSENT_COOKIE_NAME);
        const storedValue = window.localStorage.getItem(CONSENT_STORAGE_KEY);
        return (
          cookieValue === "all" ||
          cookieValue === "essential" ||
          storedValue === "all" ||
          storedValue === "essential"
        );
      })()
    : true;
  const visible = hydrated && !dismissed && !acknowledged;

  const panelClass = useMemo(
    () =>
      cn(
        "pointer-events-auto fixed inset-x-0 bottom-4 z-[70] mx-auto w-[min(760px,calc(100vw-1.5rem))] rounded-2xl border border-border/70 bg-background/95 p-4 shadow-2xl backdrop-blur-sm transition-all duration-300 print:hidden",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      ),
    [visible],
  );

  function acknowledge(value: ConsentValue) {
    setCookie(CONSENT_COOKIE_NAME, value, CONSENT_TTL_DAYS);
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    setDismissed(true);
  }

  if (!visible) return null;

  return (
    <aside className={panelClass} role="dialog" aria-live="polite" aria-label="Cookie preferences">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-tight">Cookies on Recipe Platform</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            We use essential cookies to improve your experience.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {/* <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => acknowledge("essential")}
          >
            Essential only
          </Button> */}
          <Button type="button" size="sm" onClick={() => acknowledge("all")}>
            Accept all
          </Button>
        </div>
      </div>
    </aside>
  );
}
