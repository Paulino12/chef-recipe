import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getServerAccessSession } from "@/lib/api/serverSession";

export default async function HomePage() {
  // Landing stays public while sign-in gates recipes/profile management routes.
  const session = await getServerAccessSession();

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/40 bg-card/70 p-6 shadow-xl shadow-black/5 sm:p-8 md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-secondary/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-0 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Recipe Platform</Badge>
            <Badge variant="outline">Web + Mobile Access</Badge>
          </div>

          <div className="max-w-full space-y-4">
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
              Welcome to your recipetheque
            </h1>
            <p className="text-base text-muted-foreground sm:text-lg">
              Access thousands of Chefs crafted recipes all in one place.
            </p>
          </div>



          <div id="pricing" className="rounded-2xl border border-border/70 bg-background/75 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">Pricing</Badge>
              <Badge variant="outline">Public Recipes</Badge>
            </div>
            <h2 className="text-2xl font-semibold sm:text-3xl">
              GBP 4.95 / month after a 3-day free trial
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Includes access to public recipes. Cancel anytime, including during trial.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {session ? (
                <>
                  <Link href="/profile" className={buttonVariants({ variant: "default" })}>
                    Manage plan in profile
                  </Link>
                  <Link href="/recipes" className={buttonVariants({ variant: "outline" })}>
                    Browse recipes
                  </Link>
                </>
              ) : (
                <Link href="/signup" className={buttonVariants({ variant: "default" })}>
                  Start a free trial
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
