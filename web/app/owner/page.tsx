import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { type AdminRecipesResult } from "@/lib/api/adminRecipes";
import { getInternalApiOrigin } from "@/lib/api/origin";
import { getServerAccessSession } from "@/lib/api/serverSession";
import {
  buildHrefWithQuery,
  parseCategoryFilter,
  parsePageNumber,
  parsePageSizeNumber,
  pickFirstQueryParam,
} from "@/lib/searchParams";
import { cn } from "@/lib/utils";

import { setPageVisibilityAction, toggleVisibilityAction } from "./actions";

type OwnerSearchParams = {
  q?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  category?: string | string[];
};

function buildOwnerHref(params: { q: string; category: string; page: number; pageSize: number }) {
  return buildHrefWithQuery("/owner", {
    q: params.q,
    category: params.category,
    page: params.page,
    pageSize: params.pageSize,
  });
}

type VisibilityAudience = "public" | "enterprise";

function HeaderVisibilitySwitch({
  ids,
  audience,
  checked,
  disabled,
}: {
  ids: string;
  audience: VisibilityAudience;
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <form action={setPageVisibilityAction} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="ids" value={ids} />
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="value" value={String(!checked)} />
      <span
        className={cn(
          "text-[11px] font-semibold leading-none",
          checked ? "text-emerald-700" : "text-muted-foreground",
        )}
      >
        ON
      </span>
      <Switch
        type="submit"
        checked={checked}
        checkedSide="left"
        disabled={disabled}
        aria-label={`Toggle all ${audience} visibility for current page`}
      />
      <span
        className={cn(
          "text-[11px] font-semibold leading-none",
          checked ? "text-muted-foreground" : "text-slate-700",
        )}
      >
        OFF
      </span>
    </form>
  );
}

async function loadRecipes(q: string, category: string, page: number, pageSize: number) {
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
  if (category) {
    url.searchParams.set("category", category);
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
  const q = (pickFirstQueryParam(sp.q) ?? "").trim();
  const selectedCategory = parseCategoryFilter(pickFirstQueryParam(sp.category));
  const requestedPage = parsePageNumber(pickFirstQueryParam(sp.page));
  const requestedPageSize = parsePageSizeNumber(pickFirstQueryParam(sp.pageSize));
  const data = await loadRecipes(q, selectedCategory, requestedPage, requestedPageSize);
  const activeCategory =
    selectedCategory && data.categories.some((category) => category.name === selectedCategory)
      ? selectedCategory
      : "";
  const recipes = data.items;
  const currentPageIds = recipes.map((recipe) => recipe.id).join(",");
  const allPublicOn = recipes.length > 0 && recipes.every((recipe) => Boolean(recipe.visibility?.public));
  const allEnterpriseOn =
    recipes.length > 0 && recipes.every((recipe) => Boolean(recipe.visibility?.enterprise));
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
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
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
                <div className="sm:w-56">
                  <label className="mb-2 block text-sm font-medium" htmlFor="category">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    defaultValue={activeCategory}
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    {data.categories.map((category) => (
                      <option key={category.name} value={category.name}>
                        {category.name} ({category.count})
                      </option>
                    ))}
                  </select>
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
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Recipe</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-center font-medium">
                  <div className="inline-flex items-center justify-center gap-2">
                    <p>Public</p>
                    <HeaderVisibilitySwitch
                      ids={currentPageIds}
                      audience="public"
                      checked={allPublicOn}
                      disabled={recipes.length === 0}
                    />
                  </div>
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  <div className="inline-flex items-center justify-center gap-2">
                    <p>Enterprise</p>
                    <HeaderVisibilitySwitch
                      ids={currentPageIds}
                      audience="enterprise"
                      checked={allEnterpriseOn}
                      disabled={recipes.length === 0}
                    />
                  </div>
                </th>
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
                      <Link
                        href={`/recipes/${encodeURIComponent(recipe.id)}?from=owner`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {recipe.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">PLU {recipe.pluNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {recipe.categoryPath?.[0] ?? "Uncategorised"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <form action={toggleVisibilityAction} className="inline-flex">
                        <input type="hidden" name="id" value={recipe.id} />
                        <input type="hidden" name="audience" value="public" />
                        <input type="hidden" name="value" value={String(!isPublic)} />
                        <Button type="submit" size="sm" variant={isPublic ? "success" : "outline"}>
                          {isPublic ? "ON" : "OFF"}
                        </Button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <form action={toggleVisibilityAction} className="inline-flex">
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
              href={buildOwnerHref({
                q,
                category: activeCategory,
                page: data.page - 1,
                pageSize: data.pageSize,
              })}
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
              href={buildOwnerHref({
                q,
                category: activeCategory,
                page: data.page + 1,
                pageSize: data.pageSize,
              })}
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
