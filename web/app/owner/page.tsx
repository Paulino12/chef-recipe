import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type AdminRecipesResult } from "@/lib/api/adminRecipes";
import { getInternalApiOrigin } from "@/lib/api/origin";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { cn } from "@/lib/utils";

import { toggleVisibilityAction } from "./actions";

type OwnerSearchParams = {
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

function buildOwnerHref(params: { q: string; page: number; pageSize: number }) {
  const nextParams = new URLSearchParams();
  if (params.q) nextParams.set("q", params.q);
  nextParams.set("page", String(params.page));
  nextParams.set("pageSize", String(params.pageSize));
  return `/owner?${nextParams.toString()}`;
}

async function loadRecipes(q: string, page: number, pageSize: number) {
  // Recipe admin endpoints are currently protected by ADMIN_API_KEY.
  // Owner page access itself is protected by session role checks below.
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw new Error("Missing server config: ADMIN_API_KEY not set");
  }

  const url = new URL("/api/admin/recipes", getInternalApiOrigin());
  if (q) {
    url.searchParams.set("q", q);
  }
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      "x-api-key": adminApiKey,
    },
  });

  if (!response.ok) {
    let reason = `request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) {
        reason = data.error;
      }
    } catch {
      // Ignore parse errors and use status fallback.
    }

    throw new Error(reason);
  }

  return (await response.json()) as AdminRecipesResult;
}

export default async function OwnerPage({
  searchParams,
}: {
  searchParams: Promise<OwnerSearchParams>;
}) {
  // Owner-only gate for this page.
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fowner");
  if (session.user.role !== "owner") redirect("/");

  const sp = await searchParams;
  const q = (pickFirst(sp.q) ?? "").trim();
  const requestedPage = parsePage(pickFirst(sp.page));
  const requestedPageSize = parsePageSize(pickFirst(sp.pageSize));
  const data = await loadRecipes(q, requestedPage, requestedPageSize);
  const recipes = data.items;
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = data.total === 0 ? 0 : Math.min(data.page * data.pageSize, data.total);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Private Dashboard</Badge>
              <Badge variant="outline">Visibility Control</Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl">Owner Recipe Visibility</CardTitle>
              <CardDescription>
                Filter recipes and toggle who can access each entry.
              </CardDescription>
            </div>
            <form className="space-y-3" action="/owner" method="get">
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
                    placeholder="e.g. Curry, Soup, Brownie"
                    className="bg-background/80"
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
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="10">10</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
                <Button type="submit" className="sm:min-w-28">
                  Apply
                </Button>
              </div>
            </form>
          </CardHeader>
        </Card>

        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-2">
            <CardDescription>Current page range</CardDescription>
            <CardTitle className="text-4xl">
              {from}-{to}
            </CardTitle>
            <CardDescription>of {data.total} total recipes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/owner/subscribers"
              className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
            >
              Manage subscribers
            </Link>
            <Link href="/recipes" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              Back to public list
            </Link>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Recipe</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Public</th>
                <th className="px-4 py-3 font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {recipes.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>
                    No recipes found.
                  </td>
                </tr>
              ) : null}
              {recipes.map((recipe) => {
                const isPublic = Boolean(recipe.visibility?.public);
                const isEnterprise = Boolean(recipe.visibility?.enterprise);

                return (
                  <tr key={recipe.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{recipe.title}</p>
                      <p className="text-xs text-muted-foreground">PLU {recipe.pluNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {recipe.categoryPath?.[0] ?? "Uncategorised"}
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleVisibilityAction}>
                        <input type="hidden" name="id" value={recipe.id} />
                        <input type="hidden" name="audience" value="public" />
                        <input type="hidden" name="value" value={String(!isPublic)} />
                        <Button type="submit" size="sm" variant={isPublic ? "success" : "outline"}>
                          {isPublic ? "ON" : "OFF"}
                        </Button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleVisibilityAction}>
                        <input type="hidden" name="id" value={recipe.id} />
                        <input type="hidden" name="audience" value="enterprise" />
                        <input type="hidden" name="value" value={String(!isEnterprise)} />
                        <Button type="submit" size="sm" variant={isEnterprise ? "success" : "outline"}>
                          {isEnterprise ? "ON" : "OFF"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{data.page}</span> of{" "}
          <span className="font-medium text-foreground">{data.totalPages}</span>
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={buildOwnerHref({ q, page: data.page - 1, pageSize: data.pageSize })}
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
              href={buildOwnerHref({ q, page: data.page + 1, pageSize: data.pageSize })}
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
