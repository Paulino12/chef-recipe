import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { listPublicRecipes } from "@/lib/recipes";
import { cn } from "@/lib/utils";

type RecipesSearchParams = {
  q?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
};

function pickFirst(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : 1;
}

function parsePageSize(value?: string) {
  return value === "50" || value === "100" ? Number(value) : 10;
}

function buildRecipesHref(params: { q: string; page: number; pageSize: number }) {
  const nextParams = new URLSearchParams();
  if (params.q) nextParams.set("q", params.q);
  nextParams.set("page", String(params.page));
  nextParams.set("pageSize", String(params.pageSize));
  return `/recipes?${nextParams.toString()}`;
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<RecipesSearchParams>;
}) {
  // Recipes list is a signed-in experience.
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Frecipes");

  const sp = await searchParams;
  const q = (pickFirst(sp.q) ?? "").trim();
  const requestedPage = parsePage(pickFirst(sp.page));
  const requestedPageSize = parsePageSize(pickFirst(sp.pageSize));
  const data = await listPublicRecipes(q, {
    page: requestedPage,
    pageSize: requestedPageSize,
  });

  const recipes = data.items;
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = data.total === 0 ? 0 : Math.min(data.page * data.pageSize, data.total);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <section className="mb-6">
        <Card className="surface-panel border-white/40 shadow-xl shadow-black/5">
          <CardHeader className="space-y-5">
            <div className="space-y-2">
              <CardTitle className="text-3xl sm:text-4xl">All Recipes</CardTitle>
              <CardDescription className="max-w-xl text-sm sm:text-base">
                Search live recipes, inspect categories, and open full method details.
              </CardDescription>
            </div>
            <form action="/recipes" method="get" className="space-y-3">
              <input type="hidden" name="page" value="1" />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="q">
                    Search by title
                  </label>
                  <Input
                    id="q"
                    name="q"
                    defaultValue={q}
                    placeholder="e.g. Chicken, Soup, Brownie"
                    className="h-11 bg-background/85"
                  />
                </div>
                <div className="sm:w-28">
                  <label className="mb-2 block text-sm font-medium" htmlFor="pageSize">
                    Per page
                  </label>
                  <select
                    id="pageSize"
                    name="pageSize"
                    defaultValue={String(data.pageSize)}
                    className="h-11 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="10">10</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
                <Button type="submit" className="h-11 sm:min-w-28">
                  Apply
                </Button>
              </div>
            </form>
          </CardHeader>
        </Card>
      </section>

      {recipes.length === 0 ? (
        <Card className="surface-panel border-dashed">
          <CardContent className="py-10 text-center">
            <p className="text-base font-medium">No recipes found for: {q || "your query"}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a broader keyword or clear the search.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Card className="group h-full overflow-hidden border-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-lg">
                <Link href={`/recipes/${recipe.id}`} className="flex h-full flex-col">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg leading-tight">{recipe.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {recipe.categoryPath?.[0] ?? "Uncategorised"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-between pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={recipe.visibility?.public ? "success" : "outline"}>
                        Public {recipe.visibility?.public ? "ON" : "OFF"}
                      </Badge>
                      <Badge variant={recipe.visibility?.enterprise ? "secondary" : "outline"}>
                        Enterprise {recipe.visibility?.enterprise ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">Portions: {recipe.portions ?? "-"}</span>
                  </CardContent>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <p>
            Showing <span className="font-medium text-foreground">{from}</span>-
            <span className="font-medium text-foreground">{to}</span> of{" "}
            <span className="font-medium text-foreground">{data.total}</span>
          </p>
          <p>
            Page <span className="font-medium text-foreground">{data.page}</span> of{" "}
            <span className="font-medium text-foreground">{data.totalPages}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={buildRecipesHref({ q, page: data.page - 1, pageSize: data.pageSize })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none opacity-50",
              )}
            >
              Previous
            </span>
          )}
          {data.page < data.totalPages ? (
            <Link
              href={buildRecipesHref({ q, page: data.page + 1, pageSize: data.pageSize })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none opacity-50",
              )}
            >
              Next
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
