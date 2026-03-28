import Link from "next/link";
import { redirect } from "next/navigation";

import { MotionReveal } from "@/components/motion/reveal";
import { OwnerVisibilityButton } from "@/components/owner-visibility-button";
import { OwnerVisibilitySwitch } from "@/components/owner-visibility-switch";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClearableInput } from "@/components/ui/clearable-input";
import { type AdminRecipesResult } from "@/lib/api/adminRecipes";
import { getInternalApiOrigin } from "@/lib/api/origin";
import { listRecipeCostingSummariesByIds } from "@/lib/api/recipeCostings";
import { buildCompactPagination } from "@/lib/pagination";
import { getRecipeNutritionWorkflow } from "@/lib/recipeNutrition";
import { formatRecipeCostMoney } from "@/lib/recipeCosting";
import { getServerAccessSession } from "@/lib/api/serverSession";
import {
  buildHrefWithQuery,
  parseCategoryFilter,
  parseCollectionFilter,
  parseCostingFilter,
  parseImageFilter,
  parseVisibilityFilter,
  parsePageNumber,
  parsePageSizeNumber,
  pickFirstQueryParam,
} from "@/lib/searchParams";
import { cn } from "@/lib/utils";

type OwnerSearchParams = {
  q?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  category?: string | string[];
  collection?: string | string[];
  image?: string | string[];
  visibility?: string | string[];
  costing?: string | string[];
};

function buildOwnerHref(params: {
  q: string;
  category: string;
  collection: string;
  image: string;
  visibility: string;
  costing: string;
  page: number;
  pageSize: number;
}) {
  return buildHrefWithQuery("/owner", {
    q: params.q,
    category: params.category,
    collection: params.collection,
    image: params.image,
    visibility: params.visibility,
    costing: params.costing,
    page: params.page,
    pageSize: params.pageSize,
  });
}

function readNumeric(map: Record<string, number | null | undefined> | undefined, keys: string[]) {
  if (!map) return null;
  for (const key of keys) {
    const value = map[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function formatNutritionNumber(value: number | null) {
  if (value === null) return "-";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

async function loadRecipes(
  q: string,
  category: string,
  collection: string,
  image: string,
  visibility: string,
  costing: string,
  page: number,
  pageSize: number,
) {
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
  if (collection) {
    url.searchParams.set("collection", collection);
  }
  if (image) {
    url.searchParams.set("image", image);
  }
  if (visibility) {
    url.searchParams.set("visibility", visibility);
  }
  if (costing) {
    url.searchParams.set("costing", costing);
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
  const selectedCollection = parseCollectionFilter(pickFirstQueryParam(sp.collection));
  const selectedImageFilter = parseImageFilter(pickFirstQueryParam(sp.image));
  const selectedVisibilityFilter = parseVisibilityFilter(pickFirstQueryParam(sp.visibility));
  const selectedCostingFilter = parseCostingFilter(pickFirstQueryParam(sp.costing));
  const requestedPage = parsePageNumber(pickFirstQueryParam(sp.page));
  const requestedPageSize = parsePageSizeNumber(pickFirstQueryParam(sp.pageSize));
  const data = await loadRecipes(
    q,
    selectedCategory,
    selectedCollection,
    selectedImageFilter,
    selectedVisibilityFilter,
    selectedCostingFilter,
    requestedPage,
    requestedPageSize,
  );
  const activeCategory =
    selectedCategory && data.categories.some((category) => category.value === selectedCategory)
      ? selectedCategory
      : "";
  const recipes = data.items;
  let recipeCostingSummaries = {} as Awaited<
    ReturnType<typeof listRecipeCostingSummariesByIds>
  >;
  try {
    recipeCostingSummaries = await listRecipeCostingSummariesByIds(
      recipes.map((recipe) => recipe.id),
    );
  } catch {
    recipeCostingSummaries = {};
  }
  const currentOwnerHref = buildOwnerHref({
    q,
    category: activeCategory,
    collection: selectedCollection,
    image: selectedImageFilter,
    visibility: selectedVisibilityFilter,
    costing: selectedCostingFilter,
    page: data.page,
    pageSize: data.pageSize,
  });
  const currentPageIds = recipes.map((recipe) => recipe.id);
  const allPublicOn = recipes.length > 0 && recipes.every((recipe) => Boolean(recipe.visibility?.public));
  const allEnterpriseOn =
    recipes.length > 0 && recipes.every((recipe) => Boolean(recipe.visibility?.enterprise));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = data.total === 0 ? 0 : Math.min(data.page * data.pageSize, data.total);
  const pageTokens = buildCompactPagination(data.totalPages, data.page);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <MotionReveal>
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
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildOwnerHref({
                  q,
                  category: "",
                  collection: "",
                  image: selectedImageFilter,
                  visibility: selectedVisibilityFilter,
                  costing: selectedCostingFilter,
                  page: 1,
                  pageSize: data.pageSize,
                })}
                className={buttonVariants({
                  variant: selectedCollection ? "outline" : "secondary",
                  size: "sm",
                })}
              >
                All recipes ({data.collections.reduce((sum, item) => sum + item.count, 0)})
              </Link>
              {data.collections.map((collection) => (
                <Link
                  key={collection.name}
                  href={buildOwnerHref({
                    q,
                    category: "",
                    collection: collection.name,
                    image: selectedImageFilter,
                    visibility: selectedVisibilityFilter,
                    costing: selectedCostingFilter,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({
                    variant: selectedCollection === collection.name ? "secondary" : "outline",
                    size: "sm",
                  })}
                >
                  {collection.name} ({collection.count})
                </Link>
              ))}
            </div>
            <form className="space-y-3" action="/owner" method="get">
              <input type="hidden" name="page" value="1" />
              {selectedCollection ? <input type="hidden" name="collection" value={selectedCollection} /> : null}
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.75fr)] lg:items-end">
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="q">
                    Search by title
                  </label>
                  <ClearableInput
                    id="q"
                    name="q"
                    defaultValue={q}
                    placeholder="e.g. Curry, Soup, Brownie"
                    className="bg-background/80"
                  />
                </div>
                <div>
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
                      <option key={category.value} value={category.value}>
                        {category.name} ({category.count})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="image">
                    Picture
                  </label>
                  <select
                    id="image"
                    name="image"
                    defaultValue={selectedImageFilter}
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    <option value="with">Image</option>
                    <option value="without">No image</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.75fr)_auto] lg:items-end">
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="visibility">
                    Visibility
                  </label>
                  <select
                    id="visibility"
                    name="visibility"
                    defaultValue={selectedVisibilityFilter}
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    <option value="public_on">Public ON</option>
                    <option value="public_off">Public OFF</option>
                    <option value="enterprise_on">Enterprise ON</option>
                    <option value="enterprise_off">Enterprise OFF</option>
                    <option value="any_on">Visible anywhere</option>
                    <option value="both_off">Both OFF</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="costing">
                    Costing
                  </label>
                  <select
                    id="costing"
                    name="costing"
                    defaultValue={selectedCostingFilter}
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    <option value="with">With costing</option>
                    <option value="without">Without costing</option>
                  </select>
                </div>
                <div>
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
                <Button type="submit" className="lg:min-w-28">
                  Apply
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Visibility changes automatically apply to related recipes and sub recipes.
              </p>
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
      </MotionReveal>

      <MotionReveal delay={0.06}>
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
                    <OwnerVisibilitySwitch
                      ids={currentPageIds}
                      audience="public"
                      checked={allPublicOn}
                      disabled={recipes.length === 0}
                      ariaLabel="Toggle public visibility for all recipes on this page"
                    />
                  </div>
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  <div className="inline-flex items-center justify-center gap-2">
                    <p>Enterprise</p>
                    <OwnerVisibilitySwitch
                      ids={currentPageIds}
                      audience="enterprise"
                      checked={allEnterpriseOn}
                      disabled={recipes.length === 0}
                      ariaLabel="Toggle enterprise visibility for all recipes on this page"
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
                const recipeCostingSummary = recipeCostingSummaries[recipe.id];
                const costingLabel = recipeCostingSummary
                  ? recipeCostingSummary.costPerPortion !== null
                    ? `${formatRecipeCostMoney(
                        recipeCostingSummary.costPerPortion,
                        recipeCostingSummary.currency,
                      )}/portion`
                    : "Costed"
                  : "";
                const nutritionWorkflow = getRecipeNutritionWorkflow({
                  nutrition: recipe.nutrition,
                  nutritionMeta: recipe.nutritionMeta,
                });
                const energyKj = readNumeric(nutritionWorkflow.nutrition.per100g, [
                  "energyKj",
                  "energy_kj",
                  "kj",
                  "kJ",
                ]);
                const energyKcal = readNumeric(nutritionWorkflow.nutrition.per100g, [
                  "energyKcal",
                  "energy_kcal",
                  "kcal",
                  "kCal",
                ]);

                return (
                  <tr key={recipe.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={(recipe.imageUrl ?? "/recipe-placeholder.svg").trim() || "/recipe-placeholder.svg"}
                            alt={recipe.title}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/recipes/${encodeURIComponent(recipe.id)}?from=owner${
                              recipe.collection ? `&collection=${encodeURIComponent(recipe.collection)}` : ""
                            }&returnTo=${encodeURIComponent(currentOwnerHref)}`}
                            className="link-hover font-medium"
                          >
                            {recipe.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {recipe.collection} | RN {recipe.pluNumber}
                            {costingLabel ? ` | ${costingLabel}` : ""}
                          </p>
                          <div className="mt-1 rounded-md bg-background/60 text-xs text-muted-foreground">
                            <p>
                              <span className="font-medium text-foreground">Portions:</span> {recipe.portions ?? "-"}
                            </p>
                            {nutritionWorkflow.canShowNutritionCard ? (
                              <p>
                                <span className="font-medium text-foreground">Per 100g energy:</span>{" "}
                                {formatNutritionNumber(energyKj)} kJ / {formatNutritionNumber(energyKcal)} kcal
                              </p>
                            ) : (
                              <p>
                                <span className="font-medium text-foreground">Nutrition:</span> Not saved
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {recipe.categoryPath?.join(" / ") ?? "Uncategorised"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <OwnerVisibilityButton
                        ids={[recipe.id]}
                        audience="public"
                        value={!isPublic}
                        size="sm"
                        variant={isPublic ? "success" : "outline"}
                        pendingText="Saving..."
                      >
                        {isPublic ? "ON" : "OFF"}
                      </OwnerVisibilityButton>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <OwnerVisibilityButton
                        ids={[recipe.id]}
                        audience="enterprise"
                        value={!isEnterprise}
                        size="sm"
                        variant={isEnterprise ? "success" : "outline"}
                        pendingText="Saving..."
                      >
                        {isEnterprise ? "ON" : "OFF"}
                      </OwnerVisibilityButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </Card>
      </MotionReveal>

      <MotionReveal delay={0.1} className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{data.page}</span> of{" "}
          <span className="font-medium text-foreground">{data.totalPages}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {data.page > 1 ? (
            <Link
              href={buildOwnerHref({
                q,
                category: activeCategory,
                collection: selectedCollection,
                image: selectedImageFilter,
                visibility: selectedVisibilityFilter,
                costing: selectedCostingFilter,
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

          <div className="flex items-center gap-1">
            {pageTokens.map((token, index) =>
              token === "..." ? (
                <span key={`ellipsis-${index}`} className="px-1 text-sm text-muted-foreground">
                  ...
                </span>
              ) : token === data.page ? (
                <span
                  key={token}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "pointer-events-none min-w-8 px-2",
                  )}
                >
                  {token}
                </span>
              ) : (
                <Link
                  key={token}
                  href={buildOwnerHref({
                    q,
                    category: activeCategory,
                    collection: selectedCollection,
                    image: selectedImageFilter,
                    visibility: selectedVisibilityFilter,
                    costing: selectedCostingFilter,
                    page: token,
                    pageSize: data.pageSize,
                  })}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-w-8 px-2")}
                >
                  {token}
                </Link>
              ),
            )}
          </div>

          {data.page < data.totalPages ? (
            <Link
              href={buildOwnerHref({
                q,
                category: activeCategory,
                collection: selectedCollection,
                image: selectedImageFilter,
                visibility: selectedVisibilityFilter,
                costing: selectedCostingFilter,
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
      </MotionReveal>
    </main>
  );
}
