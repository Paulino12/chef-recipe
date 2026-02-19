import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-static";

export default function StudioPage() {
  const studioUrl = process.env.NEXT_PUBLIC_STUDIO_URL?.trim() || "http://localhost:3333";
  const studioLabel = studioUrl.replace(/^https?:\/\//, "");

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <section className="surface-panel rounded-2xl border border-white/40 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Embedded Studio is disabled</h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Use the standalone Sanity Studio instead.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={studioUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "default" })}
          >
            Open Studio ({studioLabel})
          </a>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to app
          </Link>
        </div>
      </section>
    </main>
  );
}
