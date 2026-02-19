import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FavoriteStarIcon } from "@/components/favorite-star-icon";
import { getFavoriteIdsFromCookieStore } from "@/lib/api/favoriteCookie";
import { listRecipeFavoriteIds } from "@/lib/api/favorites";
import { getServerAccessSession } from "@/lib/api/serverSession";
import {
  buildHrefWithQuery,
  parseCategoryFilter,
  parsePageNumber,
  parsePageSizeNumber,
  pickFirstQueryParam,
} from "@/lib/searchParams";
import {
  countAccessibleRecipes,
  listAccessibleCategories,
  listAccessibleRecipes,
  RecipeAudienceFilter,
} from "@/lib/recipes";
import { cn } from "@/lib/utils";

import { setRecipeFavoriteAction } from "./actions";

type RecipesSearchParams = {
  q?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  audience?: string | string[];
  category?: string | string[];
  favorites?: string | string[];
};

function parseAudience(value?: string): RecipeAudienceFilter | null {
  if (value === "public" || value === "enterprise" || value === "all") return value;
  return null;
}

function parseFavorites(value?: string) {
  return value === "1" || value === "true";
}

function getAllowedAudience(
  requested: RecipeAudienceFilter | null,
  canViewPublic: boolean,
  canViewEnterprise: boolean,
): RecipeAudienceFilter | null {
  if (!canViewPublic && !canViewEnterprise) return null;
  if (requested === "all" && canViewPublic && canViewEnterprise) return "all";
  if (requested === "public" && canViewPublic) return "public";
  if (requested === "enterprise" && canViewEnterprise) return "enterprise";

  // Default browsing mode: start on public, with explicit toggles for enterprise/all.
  if (canViewPublic && canViewEnterprise) return "public";
  if (canViewPublic) return "public";
  return "enterprise";
}

function buildRecipesHref(params: {
  q: string;
  page: number;
  pageSize: number;
  audience: RecipeAudienceFilter;
  category: string;
  favoritesOnly: boolean;
}) {
  return buildHrefWithQuery("/recipes", {
    q: params.q,
    category: params.category,
    audience: params.audience,
    favorites: params.favoritesOnly ? "1" : undefined,
    page: params.page,
    pageSize: params.pageSize,
  });
}

function readNumeric(map: Record<string, number> | undefined, keys: string[]) {
  if (!map) return null;
  for (const key of keys) {
    const value = map[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function formatNumber(value: number | null) {
  if (value === null) return "-";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<RecipesSearchParams>;
}) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Frecipes");

  const sp = await searchParams;
  const q = (pickFirstQueryParam(sp.q) ?? "").trim();
  const isOwner = session.user.role === "owner";
  const requestedAudience = parseAudience(pickFirstQueryParam(sp.audience));
  const selectedCategory = parseCategoryFilter(pickFirstQueryParam(sp.category));
  const favoritesOnly = parseFavorites(pickFirstQueryParam(sp.favorites));
  const requestedPage = parsePageNumber(pickFirstQueryParam(sp.page));
  const requestedPageSize = parsePageSizeNumber(pickFirstQueryParam(sp.pageSize));

  const canViewPublic = session.entitlements.can_view_public;
  const canViewEnterprise = session.entitlements.can_view_enterprise;
  const audience = getAllowedAudience(requestedAudience, canViewPublic, canViewEnterprise);
  const cookieStore = await cookies();
  const cookieFavoriteIds = getFavoriteIdsFromCookieStore(cookieStore);

  if (!audience) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <Card className="surface-panel border-white/40">
          <CardHeader>
            <CardTitle className="text-3xl">Subscription required</CardTitle>
            <CardDescription>
              Your account does not currently have recipe access. Start or manage your subscription from profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/profile" className={buttonVariants({ variant: "default" })}>
              Open profile and billing
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Favorites source of truth is temporarily merged from:
  // - DB rows (when migrated)
  // - cookie fallback (always present for current browser)
  const allFavoriteIds =
    favoritesOnly
      ? new Set([
          ...cookieFavoriteIds,
          ...(await listRecipeFavoriteIds(session.user.id)),
        ])
      : null;
  const favoriteRecipeIds = allFavoriteIds ? [...allFavoriteIds] : undefined;

  const data = await listAccessibleRecipes(audience, q, {
    page: requestedPage,
    pageSize: requestedPageSize,
    category: selectedCategory,
    recipeIds: favoriteRecipeIds,
  });

  const categories = await listAccessibleCategories(audience, {
    recipeIds: favoriteRecipeIds,
  });
  const activeCategory =
    selectedCategory && categories.some((category) => category.name === selectedCategory)
      ? selectedCategory
      : "";

  const [publicCount, enterpriseCount, allCount] = await Promise.all([
    canViewPublic
      ? countAccessibleRecipes("public", q, { category: activeCategory, recipeIds: favoriteRecipeIds })
      : Promise.resolve(0),
    canViewEnterprise
      ? countAccessibleRecipes("enterprise", q, { category: activeCategory, recipeIds: favoriteRecipeIds })
      : Promise.resolve(0),
    canViewPublic && canViewEnterprise
      ? countAccessibleRecipes("all", q, { category: activeCategory, recipeIds: favoriteRecipeIds })
      : Promise.resolve(0),
  ]);

  const recipes = data.items;
  // For normal browsing we only resolve favorites for currently listed cards.
  const favoriteIds =
    favoritesOnly
      ? allFavoriteIds ?? new Set<string>()
      : recipes.length > 0
      ? new Set([
          ...cookieFavoriteIds,
          ...(await listRecipeFavoriteIds(
            session.user.id,
            recipes.map((recipe) => recipe.id),
          )),
        ])
      : new Set<string>();

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <section className="mb-6">
        <Card className="surface-panel border-white/40 shadow-xl shadow-black/5">
          <CardHeader className="space-y-5">
            <div className="space-y-2">
              <CardTitle className="text-3xl sm:text-4xl">All Recipes</CardTitle>
              <CardDescription className="max-w-xl text-sm sm:text-base">
                {isOwner
                  ? "Browse recipes and visibility scope. Owners see visibility labels on each recipe."
                  : "Browse recipes based on your current access."}
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              {canViewPublic && canViewEnterprise ? (
                <Link
                  href={buildRecipesHref({
                    q,
                    category: activeCategory,
                    audience: "all",
                    favoritesOnly,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({ variant: audience === "all" ? "secondary" : "outline", size: "sm" })}
                >
                  All available ({allCount})
                </Link>
              ) : null}

              {canViewPublic ? (
                <Link
                  href={buildRecipesHref({
                    q,
                    category: activeCategory,
                    audience: "public",
                    favoritesOnly,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({
                    variant: audience === "public" ? "secondary" : "outline",
                    size: "sm",
                  })}
                >
                  Public ({publicCount})
                </Link>
              ) : null}

              {canViewEnterprise ? (
                <Link
                  href={buildRecipesHref({
                    q,
                    category: activeCategory,
                    audience: "enterprise",
                    favoritesOnly,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({
                    variant: audience === "enterprise" ? "secondary" : "outline",
                    size: "sm",
                  })}
                >
                  Enterprise ({enterpriseCount})
                </Link>
              ) : null}

              <Link
                href={buildRecipesHref({
                  q,
                  category: activeCategory,
                  audience,
                  favoritesOnly: !favoritesOnly,
                  page: 1,
                  pageSize: data.pageSize,
                })}
                className={buttonVariants({
                  variant: favoritesOnly ? "secondary" : "outline",
                  size: "sm",
                })}
              >
                {favoritesOnly ? "Favourites (on)" : "Favourites"}
              </Link>
            </div>

            <form action="/recipes" method="get" className="space-y-3">
              <input type="hidden" name="page" value="1" />
              <input type="hidden" name="audience" value={audience} />
              {favoritesOnly ? <input type="hidden" name="favorites" value="1" /> : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
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
                <div className="sm:w-56">
                  <label className="mb-2 block text-sm font-medium" htmlFor="category">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    defaultValue={activeCategory}
                    className="h-11 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    {categories.map((category) => (
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
            <p className="text-base font-medium">
              {favoritesOnly ? "No favourite recipes found." : `No recipes found for: ${q || "your query"}.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {favoritesOnly
                ? "Save recipes with the star icon, then enable Favourites to see them here."
                : "Try a broader keyword or clear the search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {recipes.map((recipe) => {
            const per100g = recipe.nutrition?.per100g;
            const energyKj = readNumeric(per100g, ["energyKj", "energy_kj", "kj", "kJ"]);
            const energyKcal = readNumeric(per100g, ["energyKcal", "energy_kcal", "kcal", "kCal"]);
            const isFavorite = favoriteIds.has(recipe.id);

            return (
              <li key={recipe.id}>
                <Card className="group relative h-full overflow-hidden border-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-lg">
                  <form action={setRecipeFavoriteAction} className="absolute right-6 top-6 z-10">
                    <input type="hidden" name="recipeId" value={recipe.id} />
                    <input type="hidden" name="value" value={String(!isFavorite)} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-10 w-10 overflow-visible p-0",
                        isFavorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-label={isFavorite ? "Remove from favorites" : "Save as favorite"}
                    >
                      <FavoriteStarIcon filled={isFavorite} size={24} />
                    </Button>
                  </form>

                  <CardHeader className="space-y-3 pr-20">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg leading-tight">
                          <Link
                            href={`/recipes/${recipe.id}?audience=${encodeURIComponent(audience)}${
                              favoritesOnly ? "&favorites=1" : ""
                            }`}
                            className="underline-offset-4 hover:underline"
                          >
                            {recipe.title}
                          </Link>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {recipe.categoryPath?.[0] ?? "Uncategorised"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="mt-auto space-y-2 pt-0">
                    {isOwner ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={recipe.visibility?.public ? "success" : "outline"}>
                          Public {recipe.visibility?.public ? "ON" : "OFF"}
                        </Badge>
                        <Badge variant={recipe.visibility?.enterprise ? "secondary" : "outline"}>
                          Enterprise {recipe.visibility?.enterprise ? "ON" : "OFF"}
                        </Badge>
                      </div>
                    ) : null}

                    <div className="rounded-md border border-border/70 bg-background/60 p-2 text-xs text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">Portions:</span> {recipe.portions ?? "-"}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Per 100g energy:</span>{" "}
                        {formatNumber(energyKj)} kJ / {formatNumber(energyKcal)} kcal
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <p>
            Page <span className="font-medium text-foreground">{data.page}</span> of{" "}
            <span className="font-medium text-foreground">{data.totalPages}</span>
          </p>
        </div>

        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={buildRecipesHref({
                q,
                category: activeCategory,
                audience,
                favoritesOnly,
                page: data.page - 1,
                pageSize: data.pageSize,
              })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
              Previous
            </span>
          )}

          {data.page < data.totalPages ? (
            <Link
              href={buildRecipesHref({
                q,
                category: activeCategory,
                audience,
                favoritesOnly,
                page: data.page + 1,
                pageSize: data.pageSize,
              })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
              Next
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
