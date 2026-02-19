import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PortableText } from "next-sanity";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FavoriteStarIcon } from "@/components/favorite-star-icon";
import {
  extractPtnReference,
  findSubRecipeTargets,
  getAccessibleRecipeById,
  getRecipeById,
  RecipeAudienceFilter,
} from "@/lib/recipes";
import { getFavoriteIdsFromCookieStore } from "@/lib/api/favoriteCookie";
import { listRecipeFavoriteIds } from "@/lib/api/favorites";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { pickFirstQueryParam } from "@/lib/searchParams";
import { cn } from "@/lib/utils";

import { setRecipeFavoriteAction } from "../actions";

type RecipeDetailSearchParams = {
  audience?: string | string[];
  from?: string | string[];
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
  if (canViewPublic && canViewEnterprise) return "public";
  if (canViewPublic) return "public";
  return "enterprise";
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
  const from = (pickFirstQueryParam(sp.from) ?? "").trim();
  const isOwner = session.user.role === "owner";
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
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle>Recipe not found</CardTitle>
            <CardDescription>
              The recipe may have been removed or the link may be invalid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/recipes" className={buttonVariants({ variant: "outline" })}>
              Back to recipes
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const cookieStore = await cookies();
  const cookieFavoriteIds = getFavoriteIdsFromCookieStore(cookieStore);
  const favoriteIds = new Set([
    ...cookieFavoriteIds,
    ...(await listRecipeFavoriteIds(session.user.id, [recipe.id])),
  ]);
  const isFavorite = favoriteIds.has(recipe.id);

  const method = recipe.method as unknown as
    | Array<{ _type?: string; [key: string]: unknown }>
    | { steps?: Array<{ number?: number; text?: string }>; text?: string };

  const portionWeight =
    recipe.portionNetWeightG ?? recipe.nutrition?.portionNetWeightG ?? null;
  const per100g = recipe.nutrition?.per100g;
  const perServing = recipe.nutrition?.perServing;
  const riPercent = recipe.nutrition?.riPercent;

  const energyKjPer100g = readNumeric(per100g, ["energyKj", "energy_kj", "kj", "kJ"]);
  const energyKcalPer100g = readNumeric(per100g, ["energyKcal", "energy_kcal", "kcal", "kCal"]);

  const energyKjPerServing = readNumeric(perServing, ["energyKj", "energy_kj", "kj", "kJ"]);
  const energyKcalPerServing = readNumeric(perServing, ["energyKcal", "energy_kcal", "kcal", "kCal"]);
  const fatPerServing = readNumeric(perServing, ["fatG", "fat_g", "fat"]);
  const saturatesPerServing = readNumeric(perServing, ["saturatesG", "saturates_g", "saturates"]);
  const sugarsPerServing = readNumeric(perServing, ["sugarsG", "sugars_g", "sugars"]);
  const saltPerServing = readNumeric(perServing, ["saltG", "salt_g", "salt"]);

  const riEnergy = readNumeric(riPercent, ["energy"]);
  const riFat = readNumeric(riPercent, ["fat"]);
  const riSaturates = readNumeric(riPercent, ["saturates"]);
  const riSugars = readNumeric(riPercent, ["sugars"]);
  const riSalt = readNumeric(riPercent, ["salt"]);

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
        })
      : {};

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <Link
        href={
          isOwner && from === "owner"
            ? "/owner"
            : `/recipes?audience=${encodeURIComponent(audience)}${favoritesOnly ? "&favorites=1" : ""}`
        }
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4")}
      >
        Back to list
      </Link>

      <Card className="surface-panel mb-6 border-white/40">
        <CardHeader className="space-y-4">
          {isOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={recipe.visibility?.public ? "success" : "outline"}>
                Public {recipe.visibility?.public ? "ON" : "OFF"}
              </Badge>
              <Badge
                variant={recipe.visibility?.enterprise ? "secondary" : "outline"}
              >
                Enterprise {recipe.visibility?.enterprise ? "ON" : "OFF"}
              </Badge>
            </div>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-3xl">{recipe.title}</CardTitle>
              <CardDescription>
                {recipe.categoryPath?.join(" / ") || "Uncategorised"} | PLU{" "}
                {recipe.pluNumber}
              </CardDescription>
            </div>
            <form action={setRecipeFavoriteAction}>
              <input type="hidden" name="recipeId" value={recipe.id} />
              <input type="hidden" name="value" value={String(!isFavorite)} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-11 w-11 overflow-visible p-0",
                  isFavorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={isFavorite ? "Remove from favorites" : "Save as favorite"}
              >
                <FavoriteStarIcon filled={isFavorite} size={24} />
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Portions
            </p>
            <p className="mt-1 text-lg font-semibold">
              {recipe.portions ?? "-"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Portion Weight
            </p>
            <p className="mt-1 text-lg font-semibold">
              {portionWeight ? `${portionWeight} g` : "-"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Category
            </p>
            <p className="mt-1 text-sm font-medium">
              {recipe.categoryPath?.[0] ?? "Uncategorised"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Nutrition</CardTitle>
          <CardDescription>Presented from the recipe nutrition data.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Per 100g</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                Energy: <span className="font-medium">{formatNumber(energyKjPer100g)}</span> kJ
              </p>
              <p>
                Energy: <span className="font-medium">{formatNumber(energyKcalPer100g)}</span> kcal
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Per serving</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                Energy: <span className="font-medium">{formatNumber(energyKjPerServing)}</span> kJ /{" "}
                <span className="font-medium">{formatNumber(energyKcalPerServing)}</span> kcal
              </p>
              <p>
                Fat: <span className="font-medium">{formatNumber(fatPerServing)}</span> g
              </p>
              <p>
                Saturates: <span className="font-medium">{formatNumber(saturatesPerServing)}</span> g
              </p>
              <p>
                Sugars: <span className="font-medium">{formatNumber(sugarsPerServing)}</span> g
              </p>
              <p>
                Salt: <span className="font-medium">{formatNumber(saltPerServing)}</span> g
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reference intake</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                Energy: <span className="font-medium">{formatNumber(riEnergy)}</span>%
              </p>
              <p>
                Fat: <span className="font-medium">{formatNumber(riFat)}</span>%
              </p>
              <p>
                Saturates: <span className="font-medium">{formatNumber(riSaturates)}</span>%
              </p>
              <p>
                Sugars: <span className="font-medium">{formatNumber(riSugars)}</span>%
              </p>
              <p>
                Salt: <span className="font-medium">{formatNumber(riSalt)}</span>%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="h-fit">
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
                      ? `/recipes?audience=${encodeURIComponent(audience)}&q=${encodeURIComponent(ptnLabel)}`
                      : null;
                    const targetHref = target
                      ? `/recipes/${encodeURIComponent(target.id)}?audience=${encodeURIComponent(audience)}${
                          isOwner ? "&from=owner" : ""
                        }`
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
                              <Link href={targetHref} className="underline underline-offset-4 hover:text-foreground">
                                {target?.title ?? ptnLabel}
                              </Link>
                            ) : fallbackHref ? (
                              <Link
                                href={fallbackHref}
                                className="underline underline-offset-4 hover:text-foreground"
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

        <Card>
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
      </div>
    </main>
  );
}
