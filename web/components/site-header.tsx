"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HeaderSession = {
  email: string;
  role: "owner" | "subscriber";
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
  return pathname === "/owner/subscribers" || pathname.startsWith("/owner/subscribers/");
}

function navClass(isActive: boolean) {
  return buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "sm" });
}

/**
 * Global site header with role-aware navigation and pathname-based active states.
 */
export function SiteHeader({ session }: SiteHeaderProps) {
  const pathname = usePathname();
  const isOwner = session?.role === "owner";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-semibold tracking-tight">
            Recipe Platform
          </Link>
          {session ? (
            <span className="hidden rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground md:inline-flex">
              {session.email}
            </span>
          ) : null}
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <Link href="/recipes" className={navClass(isRecipesRoute(pathname))}>
            All recipes
          </Link>
          {isOwner ? (
            <Link href="/owner" className={navClass(isOwnerDashboardRoute(pathname))}>
              Owner area
            </Link>
          ) : null}
          {isOwner ? (
            <Link href="/owner/subscribers" className={navClass(isSubscribersRoute(pathname))}>
              Subscribers
            </Link>
          ) : null}

          {session ? (
            <form action={signOutAction}>
              <Button type="submit" size="sm" variant="outline" className="cursor-pointer">
                Sign out
              </Button>
            </form>
          ) : (
            <Link
              href="/signin"
              className={cn(
                buttonVariants({
                  variant: pathname === "/signin" ? "secondary" : "default",
                  size: "sm",
                }),
                "min-w-20",
              )}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
