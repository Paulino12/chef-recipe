"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HeaderSession = {
  email: string;
  role: "owner" | "subscriber";
  display_name: string;
} | null;

type SiteHeaderProps = {
  session: HeaderSession;
};

function isRecipesRoute(pathname: string) {
  return pathname === "/recipes" || pathname.startsWith("/recipes/");
}

function isOwnerDashboardRoute(pathname: string) {
  return pathname === "/owner";
}

function isSubscribersRoute(pathname: string) {
  return (
    pathname === "/owner/subscribers" ||
    pathname.startsWith("/owner/subscribers/")
  );
}

function isBillingRoute(pathname: string) {
  return pathname === "/billing" || pathname.startsWith("/billing/");
}

function isProfileRoute(pathname: string) {
  return pathname === "/profile" || pathname.startsWith("/profile/");
}

function navClass(isActive: boolean) {
  return buttonVariants({
    variant: isActive ? "secondary" : "ghost",
    size: "sm",
  });
}

/**
 * Global site header with role-aware navigation and pathname-based active states.
 */
export function SiteHeader({ session }: SiteHeaderProps) {
  const pathname = usePathname();
  const isOwner = session?.role === "owner";
  const shouldReduceMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const hydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Keep first client render identical to server HTML to avoid hydration mismatches.
  const currentPathname = hydrated ? pathname : "";

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const menuTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: "easeOut" as const };

  function renderNavItems(isMobile: boolean) {
    const mobileItemClassName = isMobile ? "w-full justify-start" : "";

    return (
      <>
        <Link
          href="/recipes"
          className={cn(navClass(isRecipesRoute(currentPathname)), mobileItemClassName)}
          onClick={() => setMobileMenuOpen(false)}
        >
          All recipes
        </Link>

        {isOwner ? (
          <Link
            href="/owner"
            className={cn(
              navClass(isOwnerDashboardRoute(currentPathname)),
              mobileItemClassName,
            )}
            onClick={() => setMobileMenuOpen(false)}
          >
            Owner area
          </Link>
        ) : null}
        {isOwner ? (
          <Link
            href="/owner/subscribers"
            className={cn(navClass(isSubscribersRoute(currentPathname)), mobileItemClassName)}
            onClick={() => setMobileMenuOpen(false)}
          >
            Subscribers
          </Link>
        ) : null}
        {session ? (
          <Link
            href="/profile"
            className={cn(
              navClass(
                isProfileRoute(currentPathname) || isBillingRoute(currentPathname),
              ),
              mobileItemClassName,
            )}
            onClick={() => setMobileMenuOpen(false)}
          >
            Profile
          </Link>
        ) : null}

        {session ? (
          <form action={signOutAction} className={isMobile ? "w-full" : undefined}>
            <FormSubmitButton
              size="sm"
              variant="outline"
              className={cn("cursor-pointer", mobileItemClassName)}
              pendingText="Signing out..."
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign out
            </FormSubmitButton>
          </form>
        ) : (
          <Link
            href="/signin"
            className={cn(
              buttonVariants({
                variant:
                  currentPathname === "/signin" || currentPathname === "/signup"
                    ? "secondary"
                    : "default",
                size: "sm",
              }),
              isMobile ? "w-full justify-start" : "min-w-20",
            )}
            onClick={() => setMobileMenuOpen(false)}
          >
            Sign in
          </Link>
        )}
      </>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-semibold tracking-tight">
            Recipe Platform
          </Link>
          {session ? (
            <span className="hidden rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground md:inline-flex">
              Hey, {session.display_name || session.email}
            </span>
          ) : null}
        </div>

        <nav className="hidden flex-wrap items-center gap-2 md:flex">
          {renderNavItems(false)}
        </nav>

        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "relative h-9 md:hidden",
          )}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-site-nav"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          <span className="relative block h-4 w-5">
            <motion.span
              className="absolute left-0 block h-0.5 w-5 rounded-full bg-foreground"
              animate={mobileMenuOpen ? { top: 7, rotate: 45 } : { top: 0, rotate: 0 }}
              transition={menuTransition}
            />
            <motion.span
              className="absolute left-0 top-[7px] block h-0.5 w-5 rounded-full bg-foreground"
              animate={mobileMenuOpen ? { opacity: 0 } : { opacity: 1 }}
              transition={menuTransition}
            />
            <motion.span
              className="absolute left-0 block h-0.5 w-5 rounded-full bg-foreground"
              animate={mobileMenuOpen ? { top: 7, rotate: -45 } : { top: 14, rotate: 0 }}
              transition={menuTransition}
            />
          </span>
          <span className="sr-only">{mobileMenuOpen ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {mobileMenuOpen ? (
          <motion.nav
            id="mobile-site-nav"
            className="overflow-hidden border-t border-border/70 md:hidden"
            initial={
              shouldReduceMotion
                ? { opacity: 1, height: "auto" }
                : { opacity: 0, height: 0 }
            }
            animate={{ opacity: 1, height: "auto" }}
            exit={
              shouldReduceMotion ? { opacity: 1, height: 0 } : { opacity: 0, height: 0 }
            }
            transition={menuTransition}
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-4 pt-3 sm:px-6">
              {session ? (
                <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                  Hey, {session.display_name || session.email}
                </span>
              ) : null}
              {renderNavItems(true)}
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
