import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { Badge } from "@/components/ui/badge";
import {
  MotionReveal,
  MotionStaggerItem,
  MotionStaggerList,
} from "@/components/motion/reveal";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClearableInput } from "@/components/ui/clearable-input";
import { FavoriteToggleButton } from "@/components/favorite-toggle-button";
import { getFavoriteIdsFromCookieStore } from "@/lib/api/favoriteCookie";
import { listRecipeFavoriteIds } from "@/lib/api/favorites";
import {
  listCostedRecipeIds,
  listRecipeCostingSummariesByIds,
} from "@/lib/api/recipeCostings";
import { buildCompactPagination } from "@/lib/pagination";
import { formatRecipeCostMoney } from "@/lib/recipeCosting";
import { getServerAccessSession } from "@/lib/api/serverSession";
import {
  buildHrefWithQuery,
  parseCategoryFilter,
  parseCollectionFilter,
  parseCostingFilter,
  parsePageNumber,
  parsePageSizeNumber,
  pickFirstQueryParam,
} from "@/lib/searchParams";
import {
  countAccessibleRecipes,
  listContainedAllergenLabels,
  listAccessibleCategories,
  listAccessibleRecipes,
  RecipeAudienceFilter,
  type RecipeCostingFilter,
} from "@/lib/recipes";
import { cn } from "@/lib/utils";

import { setRecipeFavoriteAction } from "./actions";

type RecipesSearchParams = {
  q?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  audience?: string | string[];
  category?: string | string[];
  collection?: string | string[];
  favorites?: string | string[];
  costing?: string | string[];
};

function parseAudience(value?: string): RecipeAudienceFilter | null {
  if (value === "public" || value === "enterprise" || value === "all")
    return value;
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
  collection: string;
  favoritesOnly: boolean;
  costing: string;
}) {
  return buildHrefWithQuery("/recipes", {
    q: params.q,
    collection: params.collection,
    category: params.category,
    audience: params.audience,
    favorites: params.favoritesOnly ? "1" : undefined,
    costing: params.costing,
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

function summarizeContainedAllergens(labels: string[]) {
  if (!labels.length) return "No listed allergens";
  const preview = labels.slice(0, 2).join(", ");
  const remainder = labels.length - 2;
  return remainder > 0
    ? `Contains ${preview} +${remainder}`
    : `Contains ${preview}`;
}

function listContainedAllergensText(labels: string[]) {
  return labels.length ? labels.join(", ") : "No listed allergens";
}

function formatPortionSummary(
  portions: number | null,
  portionNetWeightG: number | null | undefined,
) {
  const portionsLabel = portions === null ? "-" : formatNumber(portions);
  const weightLabel =
    portionNetWeightG === null ||
    portionNetWeightG === undefined ||
    portionNetWeightG <= 0
      ? ""
      : `${formatNumber(portionNetWeightG)}g`;

  if (portionsLabel !== "-" && weightLabel) {
    return `${portionsLabel} portions • ${weightLabel} each`;
  }

  return portionsLabel;
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
  const selectedCategory = parseCategoryFilter(
    pickFirstQueryParam(sp.category),
  );
  const selectedCollection = parseCollectionFilter(
    pickFirstQueryParam(sp.collection),
  );
  const favoritesOnly = parseFavorites(pickFirstQueryParam(sp.favorites));
  const selectedCostingFilter = parseCostingFilter(
    pickFirstQueryParam(sp.costing),
  );
  const costingFilter: RecipeCostingFilter | null =
    selectedCostingFilter || null;
  const requestedPage = parsePageNumber(pickFirstQueryParam(sp.page));
  const requestedPageSize = parsePageSizeNumber(
    pickFirstQueryParam(sp.pageSize),
  );

  const canViewPublic = session.entitlements.can_view_public;
  const canViewEnterprise = session.entitlements.can_view_enterprise;
  const audience = getAllowedAudience(
    requestedAudience,
    canViewPublic,
    canViewEnterprise,
  );
  const cookieStore = await cookies();
  const cookieFavoriteIds = getFavoriteIdsFromCookieStore(cookieStore);
  const allFavoriteIds = new Set([
    ...cookieFavoriteIds,
    ...(await listRecipeFavoriteIds(session.user.id)),
  ]);
  const favoriteRecipeIds = [...allFavoriteIds];
  const favoriteFilterIds = favoritesOnly
    ? favoriteRecipeIds.length > 0
      ? favoriteRecipeIds
      : ["__no_favorites__"]
    : undefined;
  let costedIds: string[] = [];
  if (selectedCostingFilter) {
    try {
      costedIds = await listCostedRecipeIds();
    } catch {
      costedIds = [];
    }
  }

  if (!audience) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <Card className="surface-panel border-white/40">
          <CardHeader>
            <CardTitle className="text-3xl">Access required</CardTitle>
            <CardDescription>
              Your account does not currently have recipe access. Open your
              profile or contact the owner to enable enterprise access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href="/profile"
              className={buttonVariants({ variant: "default" })}
            >
              Open profile
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const data = await listAccessibleRecipes(audience, q, {
    page: requestedPage,
    pageSize: requestedPageSize,
    category: selectedCategory,
    collection: selectedCollection || null,
    recipeIds: favoriteFilterIds,
    costingFilter,
    costedIds,
  });

  const categories = await listAccessibleCategories(audience, {
    collection: selectedCollection || null,
    recipeIds: favoriteFilterIds,
    costingFilter,
    costedIds,
  });
  const activeCategory =
    selectedCategory &&
    categories.some((category) => category.value === selectedCategory)
      ? selectedCategory
      : "";

  const [publicCount, enterpriseCount, allCount] = await Promise.all([
    canViewPublic
      ? countAccessibleRecipes("public", q, {
          category: activeCategory,
          collection: selectedCollection || null,
          recipeIds: favoriteFilterIds,
          costingFilter,
          costedIds,
        })
      : Promise.resolve(0),
    canViewEnterprise
      ? countAccessibleRecipes("enterprise", q, {
          category: activeCategory,
          collection: selectedCollection || null,
          recipeIds: favoriteFilterIds,
          costingFilter,
          costedIds,
        })
      : Promise.resolve(0),
    canViewPublic && canViewEnterprise
      ? countAccessibleRecipes("all", q, {
          category: activeCategory,
          collection: selectedCollection || null,
          recipeIds: favoriteFilterIds,
          costingFilter,
          costedIds,
        })
      : Promise.resolve(0),
  ]);
  const [umbrellaTotalCount, diningCount, hospitalityCount] = await Promise.all(
    [
      countAccessibleRecipes(audience, q, {
        recipeIds: favoriteFilterIds,
        costingFilter,
        costedIds,
      }),
      countAccessibleRecipes(audience, q, {
        collection: "Dining",
        recipeIds: favoriteFilterIds,
        costingFilter,
        costedIds,
      }),
      countAccessibleRecipes(audience, q, {
        collection: "Hospitality",
        recipeIds: favoriteFilterIds,
        costingFilter,
        costedIds,
      }),
    ],
  );
  const favoritesCount = favoriteRecipeIds.length
    ? await countAccessibleRecipes(audience, q, {
        category: activeCategory,
        collection: selectedCollection || null,
        recipeIds: favoriteRecipeIds,
        costingFilter,
        costedIds,
      })
    : 0;

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
  const currentListHref = buildRecipesHref({
    q,
    collection: selectedCollection,
    category: activeCategory,
    audience,
    favoritesOnly,
    costing: selectedCostingFilter,
    page: data.page,
    pageSize: data.pageSize,
  });
  const listAnimationKey = `${audience}|${selectedCollection || "all"}|${activeCategory}|${q}|${
    favoritesOnly ? "fav" : "all"
  }|${selectedCostingFilter || "costing-all"}|${data.page}|${data.pageSize}`;
  const favoriteIds = allFavoriteIds;
  const pageTokens = buildCompactPagination(data.totalPages, data.page);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <MotionReveal>
        <section className="mb-6">
          <Card className="surface-panel border-white/40 shadow-xl shadow-black/5">
            <CardHeader className="space-y-5">
              <div className="space-y-2">
                <CardTitle className="text-3xl sm:text-4xl">
                  All Recipes
                </CardTitle>
                <CardDescription className="max-w-xl text-sm sm:text-base">
                  {isOwner
                    ? "Browse recipes and visibility scope. Owners see visibility labels on each recipe."
                    : "Browse recipes based on your current access."}
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={buildRecipesHref({
                    q,
                    collection: "",
                    category: "",
                    audience,
                    favoritesOnly,
                    costing: selectedCostingFilter,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({
                    variant: selectedCollection ? "outline" : "secondary",
                    size: "sm",
                  })}
                >
                  All recipes ({umbrellaTotalCount})
                </Link>

                {(["Dining", "Hospitality"] as const).map((collection) => {
                  const count =
                    collection === "Dining" ? diningCount : hospitalityCount;
                  return (
                    <Link
                      key={collection}
                      href={buildRecipesHref({
                        q,
                        collection,
                        category: "",
                        audience,
                        favoritesOnly,
                        costing: selectedCostingFilter,
                        page: 1,
                        pageSize: data.pageSize,
                      })}
                      className={buttonVariants({
                        variant:
                          selectedCollection === collection
                            ? "secondary"
                            : "outline",
                        size: "sm",
                      })}
                    >
                      {collection} ({count})
                    </Link>
                  );
                })}
                <Link
                  href={buildRecipesHref({
                    q,
                    collection: selectedCollection,
                    category: activeCategory,
                    audience,
                    favoritesOnly: !favoritesOnly,
                    costing: selectedCostingFilter,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({
                    variant: favoritesOnly ? "secondary" : "outline",
                    size: "sm",
                  })}
                >
                  Favourites ({favoritesCount})
                </Link>
              </div>

              {/* <div className="flex flex-wrap gap-2"> */}
                {/* {canViewPublic && canViewEnterprise ? (
                  <Link
                    href={buildRecipesHref({
                      q,
                      collection: selectedCollection,
                      category: activeCategory,
                      audience: "all",
                      favoritesOnly,
                      costing: selectedCostingFilter,
                      page: 1,
                      pageSize: data.pageSize,
                    })}
                    className={buttonVariants({
                      variant: audience === "all" ? "secondary" : "outline",
                      size: "sm",
                    })}
                  >
                    All available ({allCount})
                  </Link>
                ) : null} */}

                {/* {canViewPublic ? (
                  <Link
                    href={buildRecipesHref({
                      q,
                      collection: selectedCollection,
                      category: activeCategory,
                      audience: "public",
                      favoritesOnly,
                      costing: selectedCostingFilter,
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
                ) : null} */}

                {/* {canViewEnterprise ? (
                  <Link
                    href={buildRecipesHref({
                      q,
                      collection: selectedCollection,
                      category: activeCategory,
                      audience: "enterprise",
                      favoritesOnly,
                      costing: selectedCostingFilter,
                      page: 1,
                      pageSize: data.pageSize,
                    })}
                    className={buttonVariants({
                      variant:
                        audience === "enterprise" ? "secondary" : "outline",
                      size: "sm",
                    })}
                  >
                    Enterprise ({enterpriseCount})
                  </Link>
                ) : null} */}

                {/* <Link
                  href={buildRecipesHref({
                    q,
                    collection: selectedCollection,
                    category: activeCategory,
                    audience,
                    favoritesOnly: !favoritesOnly,
                    costing: selectedCostingFilter,
                    page: 1,
                    pageSize: data.pageSize,
                  })}
                  className={buttonVariants({
                    variant: favoritesOnly ? "secondary" : "outline",
                    size: "sm",
                  })}
                >
                  Favourites ({favoritesCount})
                </Link> */}
              {/* </div> */}

              <form action="/recipes" method="get" className="space-y-3">
                <input type="hidden" name="page" value="1" />
                <input type="hidden" name="audience" value={audience} />
                {selectedCollection ? (
                  <input
                    type="hidden"
                    name="collection"
                    value={selectedCollection}
                  />
                ) : null}
                {favoritesOnly ? (
                  <input type="hidden" name="favorites" value="1" />
                ) : null}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-end">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="q"
                    >
                      Search by title
                    </label>
                    <ClearableInput
                      id="q"
                      name="q"
                      defaultValue={q}
                      placeholder="e.g. Chicken, Soup, Brownie"
                      className="h-11 bg-background/85"
                    />
                  </div>
                  <div className="sm:w-56">
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="category"
                    >
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
                        <option key={category.value} value={category.value}>
                          {category.name} ({category.count})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:w-40">
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="costing"
                    >
                      Costing
                    </label>
                    <select
                      id="costing"
                      name="costing"
                      defaultValue={selectedCostingFilter}
                      className="h-11 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">All</option>
                      <option value="with">With costing</option>
                      <option value="without">Without costing</option>
                    </select>
                  </div>
                  <div className="sm:w-28">
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="pageSize"
                    >
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
      </MotionReveal>

      {recipes.length === 0 ? (
        <MotionReveal delay={0.06}>
          <Card className="surface-panel border-dashed">
            <CardContent className="py-10 text-center">
              <p className="text-base font-medium">
                {favoritesOnly
                  ? "No favourite recipes found."
                  : `No recipes found for: ${q || "your query"}.`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {favoritesOnly
                  ? "Save recipes with the star icon, then enable Favourites to see them here."
                  : "Try a broader keyword or clear the search."}
              </p>
            </CardContent>
          </Card>
        </MotionReveal>
      ) : (
        <MotionStaggerList
          key={listAnimationKey}
          className="grid gap-4 md:grid-cols-2"
          delayChildren={0.045}
        >
          {recipes.map((recipe) => {
            const per100g = recipe.nutrition?.per100g;
            const energyKj = readNumeric(per100g, [
              "energyKj",
              "energy_kj",
              "kj",
              "kJ",
            ]);
            const energyKcal = readNumeric(per100g, [
              "energyKcal",
              "energy_kcal",
              "kcal",
              "kCal",
            ]);
            const isFavorite = favoriteIds.has(recipe.id);
            const containedAllergens = listContainedAllergenLabels(
              recipe.allergens,
            );
            const allergenSummary =
              summarizeContainedAllergens(containedAllergens);
            const allergenDetails =
              listContainedAllergensText(containedAllergens);
            const recipeCostingSummary = recipeCostingSummaries[recipe.id];
            const costingLabel = recipeCostingSummary
              ? recipeCostingSummary.costPerPortion !== null
                ? `${formatRecipeCostMoney(
                    recipeCostingSummary.costPerPortion,
                    recipeCostingSummary.currency,
                  )}/portion`
                : "Costed"
              : "";
            const costPerPortionLabel =
              recipeCostingSummary?.costPerPortion !== null &&
              recipeCostingSummary?.costPerPortion !== undefined
                ? formatRecipeCostMoney(
                    recipeCostingSummary.costPerPortion,
                    recipeCostingSummary.currency,
                  )
                : null;
            const costStatusLabel = costPerPortionLabel
              ? "Portion Cost"
              : recipeCostingSummary
                ? "Saved costing"
                : "";
            const categoryLabel = recipe.categoryPath?.[0] ?? "Uncategorised";

            return (
              <MotionStaggerItem key={recipe.id}>
                <Card className="group relative h-full overflow-hidden border-border/70 bg-linear-to-br from-background via-background to-muted/20 transition duration-200 hover:-translate-y-1 hover:shadow-lg">
                  <form
                    action={setRecipeFavoriteAction}
                    className="absolute right-4 top-4 z-20 sm:right-5 sm:top-5"
                  >
                    <input type="hidden" name="recipeId" value={recipe.id} />
                    <input
                      type="hidden"
                      name="value"
                      value={String(!isFavorite)}
                    />
                    <FavoriteToggleButton
                      filled={isFavorite}
                      label={
                        isFavorite
                          ? "Remove from favorites"
                          : "Save as favorite"
                      }
                      pendingLabel={
                        isFavorite ? "Removing favourite" : "Saving favourite"
                      }
                      className={cn(
                        "h-9 w-9 overflow-visible rounded-full bg-background/90 p-0 shadow-sm backdrop-blur sm:h-10 sm:w-10",
                        isFavorite
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    />
                  </form>

                  <CardContent className="flex h-full flex-col px-5 pb-5 pt-5">
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
                      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                        {/* Each recipe has a stable fallback placeholder until a real image is provided. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            (
                              recipe.imageUrl ?? "/recipe-placeholder.svg"
                            ).trim() || "/recipe-placeholder.svg"
                          }
                          alt={recipe.title}
                          loading="lazy"
                          className="h-24 w-full object-cover sm:h-32"
                        />
                        {recipeCostingSummary ? (
                          <div
                            className={cn(
                              "absolute inset-x-2 bottom-2 rounded-lg px-2.5 py-1.5 shadow-sm backdrop-blur",
                              costPerPortionLabel
                                ? "border border-emerald-200/90 bg-emerald-50/95"
                                : "border border-border/80 bg-background/92",
                            )}
                          >
                            <p
                              className={cn(
                                "text-[10px] font-medium uppercase tracking-[0.18em]",
                                costPerPortionLabel
                                  ? "text-emerald-700"
                                  : "text-muted-foreground",
                              )}
                            >
                              {costStatusLabel}
                            </p>
                            {costPerPortionLabel ? (
                              <p className="mt-0.5 text-sm font-semibold text-emerald-950">
                                {costPerPortionLabel}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-xs font-medium text-foreground">
                                Cost saved, no portion value yet
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 space-y-3 pr-10">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="bg-background/80">
                            {recipe.collection}
                          </Badge>
                          <Badge variant="category">{categoryLabel}</Badge>
                        </div>

                        <div className="space-y-1.5">
                          <CardTitle className="text-base leading-tight sm:text-lg">
                            <Link
                              href={`/recipes/${recipe.id}?audience=${encodeURIComponent(audience)}${
                                favoritesOnly ? "&favorites=1" : ""
                              }${recipe.collection ? `&collection=${encodeURIComponent(recipe.collection)}` : ""}&returnTo=${encodeURIComponent(currentListHref)}`}
                              className="link-hover"
                            >
                              {recipe.title}
                            </Link>
                          </CardTitle>
                          <CardDescription className="text-sm">
                            RN {recipe.pluNumber}
                            {costingLabel && !costPerPortionLabel
                              ? ` | ${costingLabel}`
                              : ""}
                          </CardDescription>
                          <div className="group/allergens relative rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                            <span className="block">{allergenSummary}</span>
                            {/*
                            ? containedAllergens.map((name) => `✓ ${name}`).join(", ")
                            */}
                            {containedAllergens.length > 0 ? (
                              <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-56 rounded-lg border border-border/80 bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl group-hover/allergens:block">
                                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                  All Allergens
                                </p>
                                <p className="mt-1">{allergenDetails}</p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {isOwner ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              recipe.visibility?.public ? "success" : "outline"
                            }
                          >
                            Public {recipe.visibility?.public ? "ON" : "OFF"}
                          </Badge>
                          <Badge
                            variant={
                              recipe.visibility?.enterprise
                                ? "secondary"
                                : "outline"
                            }
                          >
                            Enterprise{" "}
                            {recipe.visibility?.enterprise ? "ON" : "OFF"}
                          </Badge>
                        </div>
                      ) : null}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/65 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Portions
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatPortionSummary(
                              recipe.portions,
                              recipe.portionNetWeightG,
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/65 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Energy / 100g
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatNumber(energyKcal)} kcal
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </MotionStaggerItem>
            );
          })}
        </MotionStaggerList>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <p>
            Page{" "}
            <span className="font-medium text-foreground">{data.page}</span> of{" "}
            <span className="font-medium text-foreground">
              {data.totalPages}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.page > 1 ? (
            <Link
              href={buildRecipesHref({
                q,
                collection: selectedCollection,
                category: activeCategory,
                audience,
                favoritesOnly,
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
                <span
                  key={`ellipsis-${index}`}
                  className="px-1 text-sm text-muted-foreground"
                >
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
                  href={buildRecipesHref({
                    q,
                    collection: selectedCollection,
                    category: activeCategory,
                    audience,
                    favoritesOnly,
                    costing: selectedCostingFilter,
                    page: token,
                    pageSize: data.pageSize,
                  })}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "min-w-8 px-2",
                  )}
                >
                  {token}
                </Link>
              ),
            )}
          </div>

          {data.page < data.totalPages ? (
            <Link
              href={buildRecipesHref({
                q,
                collection: selectedCollection,
                category: activeCategory,
                audience,
                favoritesOnly,
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
      </div>
    </main>
  );
}
