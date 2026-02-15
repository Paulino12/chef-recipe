import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listPublicRecipes } from "@/lib/recipes";

export default async function HomePage() {
  // Hero stats only; recipe listing now lives on /recipes.
  const stats = await listPublicRecipes("", { page: 1, pageSize: 10 });

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

          <div className="max-w-3xl space-y-4">
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
              Recipe operations in one place.
            </h1>
            <p className="text-base text-muted-foreground sm:text-lg">
              Discover recipes as a subscriber and manage visibility and subscriber access as an owner.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/recipes" className={buttonVariants({ variant: "default" })}>
              Explore all recipes
            </Link>
          </div>

          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Public Library</p>
              <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">recipes available</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner Controls</p>
              <p className="mt-1 text-2xl font-semibold">Visibility</p>
              <p className="mt-1 text-xs text-muted-foreground">recipe audiences and access rules</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Subscriber Access</p>
              <p className="mt-1 text-2xl font-semibold">Enterprise</p>
              <p className="mt-1 text-xs text-muted-foreground">grant and revoke from owner dashboard</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
