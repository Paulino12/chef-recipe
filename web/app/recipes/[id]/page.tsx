import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PortableText } from "next-sanity";
import { EditIcon } from "@sanity/icons";

import { Badge } from "@/components/ui/badge";
import { FavoriteToggleButton } from "@/components/favorite-toggle-button";
import { MotionReveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";
import { DismissibleNotice } from "@/components/ui/dismissible-notice";
import { RelatedRecipesCarousel } from "@/components/related-recipes-carousel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrintRecipeButton } from "@/components/print-recipe-button";
import { getRecipeCostSummary } from "@/lib/api/recipeCostings";
import {
  extractPtnReference,
  findSubRecipeTargets,
  getAccessibleRecipeById,
  getRecipeById,
  listContainedAllergenLabels,
  listRelatedRecipeCards,
  RecipeAudienceFilter,
} from "@/lib/recipes";
import { getFavoriteIdsFromCookieStore } from "@/lib/api/favoriteCookie";
import { listRecipeFavoriteIds } from "@/lib/api/favorites";
import { formatRecipeCostMoney } from "@/lib/recipeCosting";
import { getRecipeNutritionWorkflow } from "@/lib/recipeNutrition";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { pickFirstQueryParam } from "@/lib/searchParams";
import { cn } from "@/lib/utils";

import { setRecipeFavoriteAction } from "../actions";

type RecipeDetailSearchParams = {
  audience?: string | string[];
  from?: string | string[];
  favorites?: string | string[];
  collection?: string | string[];
  returnTo?: string | string[];
  costing?: string | string[];
  nutrition?: string | string[];
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
  if (canViewPublic && canViewEnterprise) return "public";
  if (canViewPublic) return "public";
  return "enterprise";
}

function formatNumber(value: number | null) {
  if (value === null) return "-";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function trafficLightPillShellClass(riPercent: number | null) {
  if (riPercent === null) return "border-slate-300 bg-slate-500 text-white";
  if (riPercent <= 5) return "border-lime-500 bg-lime-500 text-white";
  if (riPercent <= 20) return "border-amber-500 bg-amber-500 text-white";
  return "border-orange-500 bg-orange-500 text-white";
}

function trafficLightPillBadgeClass(riPercent: number | null) {
  if (riPercent === null) return "text-slate-700";
  if (riPercent <= 5) return "text-lime-700";
  if (riPercent <= 20) return "text-amber-700";
  return "text-orange-700";
}

function resolveReturnTo(value?: string) {
  const next = value?.trim();
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

function buildRecipeDetailReturnHref(options: {
  recipeId: string;
  audience: RecipeAudienceFilter;
  favoritesOnly: boolean;
  collection: string;
  returnTo: string | null;
  from: string;
}) {
  const params = new URLSearchParams();
  params.set("audience", options.audience);
  if (options.favoritesOnly) params.set("favorites", "1");
  if (options.collection) params.set("collection", options.collection);
  if (options.returnTo) params.set("returnTo", options.returnTo);
  if (options.from) params.set("from", options.from);
  const query = params.toString();
  return `/recipes/${encodeURIComponent(options.recipeId)}${query ? `?${query}` : ""}`;
}

function relatedReasonLabel(reason: "subrecipe" | "favorite" | "category") {
  switch (reason) {
    case "subrecipe":
      return "Sub recipe";
    case "favorite":
      return "Favourite";
    case "category":
      return "Same category";
  }
}

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RecipeDetailSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // Direct recipe links require authentication and access-based audience checks.
  const session = await getServerAccessSession();
  if (!session) {
    redirect(`/signin?next=${encodeURIComponent(`/recipes/${id}`)}`);
  }

  const requestedAudience = parseAudience(pickFirstQueryParam(sp.audience));
  const favoritesOnly = parseFavorites(pickFirstQueryParam(sp.favorites));
  const collection = (pickFirstQueryParam(sp.collection) ?? "").trim();
  const returnTo = resolveReturnTo(pickFirstQueryParam(sp.returnTo));
  const from = (pickFirstQueryParam(sp.from) ?? "").trim();
  const nutritionState = (pickFirstQueryParam(sp.nutrition) ?? "").trim();
  const isOwner = session.user.role === "owner";
  const nutritionSaved = nutritionState === "saved";
  const audience = getAllowedAudience(
    requestedAudience,
    session.entitlements.can_view_public,
    session.entitlements.can_view_enterprise,
  );

  if (!audience) {
    redirect("/recipes");
  }

  // Owner can inspect any recipe from owner visibility table, including recipes hidden from subscribers.
  const recipe = isOwner
    ? await getRecipeById(id)
    : await getAccessibleRecipeById(id, audience);

  if (!recipe) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <MotionReveal>
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>Recipe not found</CardTitle>
              <CardDescription>
                The recipe may have been removed or the link may be invalid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/recipes"
                className={buttonVariants({ variant: "outline" })}
              >
                Back to recipes
              </Link>
            </CardContent>
          </Card>
        </MotionReveal>
      </main>
    );
  }

  const cookieStore = await cookies();
  const cookieFavoriteIds = getFavoriteIdsFromCookieStore(cookieStore);
  const favoriteIds = new Set([
    ...cookieFavoriteIds,
    ...(await listRecipeFavoriteIds(session.user.id)),
  ]);
  const isFavorite = favoriteIds.has(recipe.id);
  const recipeDetailReturnHref = buildRecipeDetailReturnHref({
    recipeId: recipe.id,
    audience,
    favoritesOnly,
    collection,
    returnTo,
    from,
  });
  const costingHref = `/owner/costing/${encodeURIComponent(recipe.id)}?returnTo=${encodeURIComponent(
    recipeDetailReturnHref,
  )}`;

  let recipeCostSummary: Awaited<ReturnType<typeof getRecipeCostSummary>> =
    null;
  let costingUnavailableReason = "";
  try {
    recipeCostSummary = await getRecipeCostSummary(recipe);
  } catch (error) {
    if (isOwner) {
      costingUnavailableReason =
        error instanceof Error
          ? error.message
          : "Recipe costing is unavailable.";
    }
  }
  const showRecipeCostingCard =
    isOwner || Boolean(recipeCostSummary) || Boolean(costingUnavailableReason);
  const nutritionWorkflow = getRecipeNutritionWorkflow({
    nutrition: recipe.nutrition,
    nutritionMeta: recipe.nutritionMeta,
    sourcePdfPath: recipe.source?.pdfPath ?? null,
  });

  const method = recipe.method as unknown as
    | Array<{ _type?: string; [key: string]: unknown }>
    | { steps?: Array<{ number?: number; text?: string }>; text?: string };

  const portionWeight =
    recipe.portionNetWeightG ??
    nutritionWorkflow.nutrition.portionNetWeightG ??
    null;
  const energyKjPer100g = nutritionWorkflow.nutrition.per100g.energyKj;
  const energyKcalPer100g = nutritionWorkflow.nutrition.per100g.energyKcal;
  const energyKjPerServing = nutritionWorkflow.nutrition.perServing.energyKj;
  const energyKcalPerServing =
    nutritionWorkflow.nutrition.perServing.energyKcal;
  const fatPerServing = nutritionWorkflow.nutrition.perServing.fatG;
  const saturatesPerServing = nutritionWorkflow.nutrition.perServing.saturatesG;
  const sugarsPerServing = nutritionWorkflow.nutrition.perServing.sugarsG;
  const saltPerServing = nutritionWorkflow.nutrition.perServing.saltG;
  const riEnergy = nutritionWorkflow.nutrition.riPercent.energy;
  const riFat = nutritionWorkflow.nutrition.riPercent.fat;
  const riSaturates = nutritionWorkflow.nutrition.riPercent.saturates;
  const riSugars = nutritionWorkflow.nutrition.riPercent.sugars;
  const riSalt = nutritionWorkflow.nutrition.riPercent.salt;
  const nutritionPills = [
    {
      key: "energy",
      label: "kJ/kcal",
      value: `${formatNumber(energyKjPerServing)}/${formatNumber(energyKcalPerServing)}`,
      ri: riEnergy,
    },
    {
      key: "fat",
      label: "Fat",
      value: `${formatNumber(fatPerServing)}g`,
      ri: riFat,
    },
    {
      key: "saturates",
      label: "Sat fat",
      value: `${formatNumber(saturatesPerServing)}g`,
      ri: riSaturates,
    },
    {
      key: "sugars",
      label: "Sugar",
      value: `${formatNumber(sugarsPerServing)}g`,
      ri: riSugars,
    },
    {
      key: "salt",
      label: "Salt",
      value: `${formatNumber(saltPerServing)}g`,
      ri: riSalt,
    },
  ] as const;
  const containedAllergens = listContainedAllergenLabels(recipe.allergens);

  const ingredientRows = Array.isArray(recipe.ingredients)
    ? (recipe.ingredients as Array<Record<string, unknown>>)
    : [];

  const subRecipeLabels = [
    ...new Set(
      ingredientRows
        .map((ingredient) => {
          const fromItem = extractPtnReference(ingredient.item);
          const fromText = extractPtnReference(ingredient.text);
          return fromItem ?? fromText;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const subRecipeTargets =
    subRecipeLabels.length > 0
      ? await findSubRecipeTargets(subRecipeLabels, {
          audience,
          includeAll: isOwner,
          collection: recipe.collection,
        })
      : {};
  const subRecipeIds = subRecipeLabels
    .map((label) => subRecipeTargets[label]?.id)
    .filter((value): value is string => Boolean(value));
  const relatedRecipes = await listRelatedRecipeCards({
    audience,
    includeAll: isOwner,
    collection: recipe.collection,
    categoryPath: recipe.categoryPath,
    currentRecipeId: recipe.id,
    subRecipeIds,
    favoriteRecipeIds: [...favoriteIds],
    limit: 7,
  });
  const relatedRecipeItems = relatedRecipes.map((item) => ({
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    categoryLabel: item.categoryPath?.join(" / ") ?? "Uncategorised",
    pluNumber: item.pluNumber,
    href: `/recipes/${encodeURIComponent(item.id)}?audience=${encodeURIComponent(audience)}${
      favoritesOnly ? "&favorites=1" : ""
    }${item.collection ? `&collection=${encodeURIComponent(item.collection)}` : ""}${
      returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
    }${isOwner ? "&from=owner" : ""}`,
    reasonLabel: relatedReasonLabel(item.reason),
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 print:max-w-none print:px-0 print:pb-0 print:pt-0 sm:px-6">
      <Link
        href={
          returnTo
            ? returnTo
            : isOwner && from === "owner"
              ? `/owner${collection ? `?collection=${encodeURIComponent(collection)}` : ""}`
              : `/recipes?audience=${encodeURIComponent(audience)}${favoritesOnly ? "&favorites=1" : ""}${
                  collection
                    ? `&collection=${encodeURIComponent(collection)}`
                    : ""
                }`
        }
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-4 print:hidden",
        )}
      >
        Back to list
      </Link>

      <MotionReveal>
        <Card className="surface-panel mb-6 border-white/40 print:break-inside-avoid print:border-border print:shadow-none">
          <CardHeader className="space-y-4">
            {isOwner ? (
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Badge
                  variant={recipe.visibility?.public ? "success" : "outline"}
                >
                  Public {recipe.visibility?.public ? "ON" : "OFF"}
                </Badge>
                <Badge
                  variant={
                    recipe.visibility?.enterprise ? "secondary" : "outline"
                  }
                >
                  Enterprise {recipe.visibility?.enterprise ? "ON" : "OFF"}
                </Badge>
                <Badge variant={nutritionWorkflow.badgeVariant}>
                  {nutritionWorkflow.badgeLabel}
                </Badge>
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="text-3xl">{recipe.title}</CardTitle>
                <CardDescription>
                  {recipe.collection} |{" "}
                  {recipe.categoryPath?.join(" / ") || "Uncategorised"} | RN{" "}
                  {recipe.pluNumber}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <PrintRecipeButton />
                <form action={setRecipeFavoriteAction}>
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <input
                    type="hidden"
                    name="value"
                    value={String(!isFavorite)}
                  />
                  <FavoriteToggleButton
                    filled={isFavorite}
                    label={
                      isFavorite ? "Remove from favorites" : "Save as favorite"
                    }
                    pendingLabel={
                      isFavorite ? "Removing favourite" : "Saving favourite"
                    }
                    className={cn(
                      "h-11 w-11 overflow-visible p-0",
                      isFavorite
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  />
                </form>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
              {nutritionSaved ? (
                <DismissibleNotice
                  variant="success"
                  clearQueryKeys={["nutrition"]}
                  className="print:hidden"
                >
                  Nutrition estimate saved to Sanity.
                </DismissibleNotice>
              ) : null}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start">
              <div className="aspect-4/3 overflow-hidden rounded-xl border border-border/70 bg-muted/20 lg:aspect-6/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    (recipe.imageUrl ?? "/recipe-placeholder.svg").trim() ||
                    "/recipe-placeholder.svg"
                  }
                  alt={recipe.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>

              <div className="grid gap-3">
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Collection
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {recipe.collection}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Category
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {recipe.categoryPath?.join(" / ") ?? "Uncategorised"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Portions
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {recipe.portions ?? "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Portion weight
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {portionWeight ? `${portionWeight} g` : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Allergens
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {containedAllergens.length > 0
                      ? containedAllergens.map((name) => `✓ ${name}`).join(", ")
                      : "None listed"}
                  </p>
                </div>

                {showRecipeCostingCard ? (
                  <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Recipe costing
                        </p>
                        {isOwner ? (
                          <p className="text-[11px] text-muted-foreground">
                            {recipeCostSummary ? "Edit" : "Cost"}
                          </p>
                        ) : null}
                      </div>
                      {isOwner ? (
                        <Link
                          href={costingHref}
                          className={`${cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                          )}`}
                          aria-label={
                            recipeCostSummary ? "Edit costing" : "Cost recipe"
                          }
                          title={
                            recipeCostSummary ? "Edit costing" : "Cost recipe"
                          }
                        >
                          <EditIcon className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>

                    {costingUnavailableReason ? (
                      <p className="mt-3 text-xs text-rose-700">
                        {costingUnavailableReason}
                      </p>
                    ) : recipeCostSummary ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Total cost
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {formatRecipeCostMoney(
                              recipeCostSummary.totalCost,
                              recipeCostSummary.currency,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Cost/portion
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {formatRecipeCostMoney(
                              recipeCostSummary.costPerPortion,
                              recipeCostSummary.currency,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Portions
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {recipeCostSummary.recipePortions ?? "-"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        No saved costing yet.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </MotionReveal>

      <MotionReveal delay={0.06}>
        <Card className="mb-6 print:break-inside-avoid print:shadow-none">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg">Nutrition</CardTitle>
                <CardDescription>
                  {nutritionWorkflow.statusDescription}
                </CardDescription>
              </div>
              <Badge variant={nutritionWorkflow.badgeVariant}>
                {nutritionWorkflow.badgeLabel}
              </Badge>
            </div>
            {isOwner ? (
              <p className="text-sm text-muted-foreground">
                {nutritionWorkflow.guidance}
              </p>
            ) : null}
          </CardHeader>
          {nutritionWorkflow.canShowNutritionCard ? (
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-linear-to-br from-stone-50 to-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-center gap-6">
                  {nutritionPills.map((pill) => (
                    <div
                      key={pill.key}
                      className={cn(
                        "flex min-h-40 w-[125px] flex-col justify-between rounded-[30px] border-2 px-3 py-4 shadow-sm",
                        trafficLightPillShellClass(pill.ri),
                      )}
                    >
                      <div className="space-y-3">
                        <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em]">
                          {pill.label}
                        </p>
                        <p className="text-center text-[1.5rem] font-black leading-none tracking-tight">
                          {pill.value}
                        </p>
                      </div>
                      <div className="mt-4 rounded-full bg-white px-3 py-1.5 text-center shadow-inner">
                        <span
                          className={cn(
                            "text-base font-black leading-none",
                            trafficLightPillBadgeClass(pill.ri),
                          )}
                        >
                          {pill.ri === null
                            ? "No RI"
                            : `${formatNumber(pill.ri)}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-3 w-full text-center text-sm text-muted-foreground">
                  Typical values per 100g: Energy{" "}
                  <span className="font-semibold text-foreground">
                    {formatNumber(energyKjPer100g)} kJ
                  </span>
                  ,{" "}
                  <span className="font-semibold text-foreground">
                    {formatNumber(energyKcalPer100g)} kcal
                  </span>
                </p>
              </div>
            </CardContent>
          ) : (
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {nutritionWorkflow.guidance}
              </p>
            </CardContent>
          )}
        </Card>
      </MotionReveal>

      <MotionReveal
        delay={0.1}
        className="grid gap-6 print:grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]"
      >
        <Card className="h-fit print:break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-lg">Ingredients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recipe.ingredients?.length ? (
              <ul className="space-y-2">
                {recipe.ingredients.map(
                  (ingredient: Record<string, unknown>, index: number) => {
                    const text = String(ingredient.text ?? "");
                    const ptnLabel =
                      extractPtnReference(ingredient.item) ??
                      extractPtnReference(text);
                    const target = ptnLabel ? subRecipeTargets[ptnLabel] : null;
                    const fallbackHref = ptnLabel
                      ? `/recipes?audience=${encodeURIComponent(audience)}&q=${encodeURIComponent(ptnLabel)}${
                          recipe.collection
                            ? `&collection=${encodeURIComponent(recipe.collection)}`
                            : ""
                        }`
                      : null;
                    const targetHref = target?.directMatch
                      ? `/recipes/${encodeURIComponent(target.id)}?audience=${encodeURIComponent(audience)}${
                          isOwner ? "&from=owner" : ""
                        }${recipe.collection ? `&collection=${encodeURIComponent(recipe.collection)}` : ""}`
                      : null;

                    return (
                      <li
                        key={`${ingredient.text}-${index}`}
                        className="rounded-md border border-border/70 bg-background/70 p-3 text-sm"
                      >
                        <p className="font-medium">{text}</p>
                        {ptnLabel ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Sub recipe:{" "}
                            {targetHref ? (
                              <Link
                                href={targetHref}
                                className="link-hover text-foreground"
                              >
                                {target?.title ?? ptnLabel}
                              </Link>
                            ) : fallbackHref ? (
                              <Link
                                href={fallbackHref}
                                className="link-hover text-foreground"
                              >
                                {ptnLabel} (search)
                              </Link>
                            ) : (
                              ptnLabel
                            )}
                          </p>
                        ) : null}
                      </li>
                    );
                  },
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No ingredients listed for this recipe.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-lg">Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            {Array.isArray(method) ? (
              <PortableText
                value={
                  method as Array<{ _type: string; [key: string]: unknown }>
                }
                components={{
                  list: {
                    bullet: ({ children }) => (
                      <ul className="list-disc space-y-2 pl-6">{children}</ul>
                    ),
                    number: ({ children }) => (
                      <ol className="list-decimal space-y-2 pl-6">
                        {children}
                      </ol>
                    ),
                  },
                  listItem: {
                    bullet: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                    number: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                  },
                }}
              />
            ) : method.steps?.length ? (
              <ol className="space-y-3">
                {method.steps.map((step, index) => (
                  <li
                    key={`step-${index}`}
                    className="rounded-md border border-border/70 bg-background/60 p-3 text-sm"
                  >
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Step {step.number ?? index + 1}
                    </span>
                    <p>{step.text ?? ""}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {method.text || "No method provided."}
              </p>
            )}
          </CardContent>
        </Card>
      </MotionReveal>

      {relatedRecipeItems.length > 0 ? (
        <MotionReveal delay={0.14}>
          <RelatedRecipesCarousel items={relatedRecipeItems} />
        </MotionReveal>
      ) : null}
    </main>
  );
}
