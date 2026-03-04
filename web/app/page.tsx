import Image from "next/image";
import Link from "next/link";

import { MotionReveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getServerAccessSession } from "@/lib/api/serverSession";

export default async function HomePage() {
  // Landing stays public while sign-in gates recipes/profile management routes.
  const session = await getServerAccessSession();

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <MotionReveal>
        <section className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-card/80 shadow-2xl shadow-black/10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-secondary/30 via-secondary/10 to-transparent" />
          <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-secondary/35 blur-3xl" />

          <div className="relative grid gap-8 p-6 sm:p-8 md:gap-10 md:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] lg:items-center">
            <div className="space-y-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Recipe Platform</Badge>
                <Badge variant="outline">Web + Mobile Access</Badge>
              </div>

              <div className="max-w-2xl space-y-5">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary/80">
                  Curated recipes, ready when you are
                </p>
                <h1 className="max-w-3xl font-serif text-4xl leading-tight sm:text-5xl md:text-6xl">
                  Welcome to your recipetheque
                </h1>
                <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Access thousands of Chefs crafted recipes all in one place.
                </p>
              </div>

              <MotionReveal delay={0.12} y={14}>
                <div
                  id="pricing"
                  className="rounded-[1.6rem] border border-border/70 bg-background/80 p-5 shadow-lg shadow-black/5 backdrop-blur sm:p-6"
                >
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
              </MotionReveal>
            </div>

            <MotionReveal delay={0.18} y={18}>
              <div className="relative mx-auto w-full max-w-xl">
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-secondary/40 via-white/10 to-primary/20 blur-2xl" />
                <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-stone-950 p-3 shadow-[0_24px_80px_rgba(28,25,23,0.24)]">
                  <div className="mb-3 flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-white/8 px-4 py-3 text-xs uppercase tracking-[0.22em] text-stone-200/80">
                    <span>Featured Collection</span>
                    <span>Kitchen Notes</span>
                  </div>
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem]">
                    <Image
                      src="/images/ChatGPT Image Mar 3, 2026, 09_49_11 PM.png"
                      alt="Styled plated dish from the recipe collection"
                      fill
                      priority
                      sizes="(min-width: 1024px) 42vw, (min-width: 640px) 70vw, 100vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-stone-950/5 to-white/10" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-200/85">
                        Member preview
                      </p>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-stone-100/90 sm:text-base">
                        A recipe library designed to feel collected, practical, and worth returning to.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </MotionReveal>
          </div>
        </section>
      </MotionReveal>
    </main>
  );
}
