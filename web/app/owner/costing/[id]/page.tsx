import Link from "next/link";
import { redirect } from "next/navigation";

import { RecipeCostingEditor } from "@/components/recipe-costing-editor";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { LinkedFormSubmitButton } from "@/components/ui/linked-form-submit-button";
import { MotionReveal } from "@/components/motion/reveal";
import { listIngredientCatalogEntries } from "@/lib/api/costingCatalog";
import { getRecipeCosting, listCostedRecipesSearch } from "@/lib/api/recipeCostings";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { extractPtnReference, findSubRecipeTargets, getRecipeById } from "@/lib/recipes";
import {
  applySubRecipeCostingToRecipeCostLine,
  buildRecipeIngredientFingerprint,
  createRecipeCostLinesFromIngredients,
  formatRecipeCostMoney,
  hydrateRecipeCostLineFromCatalog,
  RECIPE_COSTING_CURRENCY,
  type ResolvedSubRecipeCosting,
  type ResolvedSubRecipeTarget,
} from "@/lib/recipeCosting";
import { pickFirstQueryParam } from "@/lib/searchParams";
import { cn } from "@/lib/utils";

import {
  copyRecipeCostingAction,
  deleteRecipeCostingAction,
  saveRecipeCostingAction,
} from "./actions";

type CostingSearchParams = {
  q?: string | string[];
  error?: string | string[];
  copiedFrom?: string | string[];
  costing?: string | string[];
  returnTo?: string | string[];
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function recipeDetailHref(recipeId: string, collection: string) {
  return `/recipes/${encodeURIComponent(recipeId)}?from=owner${
    collection ? `&collection=${encodeURIComponent(collection)}` : ""
  }`;
}

function resolveReturnTo(value?: string) {
  const next = value?.trim();
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

function buildCurrentCostingHref(recipeId: string, q: string, returnTo: string | null) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (returnTo) params.set("returnTo", returnTo);
  const query = params.toString();
  return `/owner/costing/${encodeURIComponent(recipeId)}${query ? `?${query}` : ""}`;
}

export default async function OwnerRecipeCostingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CostingSearchParams>;
}) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fowner");
  if (session.user.role !== "owner") redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  const q = (pickFirstQueryParam(sp.q) ?? "").trim();
  const errorMessage = (pickFirstQueryParam(sp.error) ?? "").trim();
  const copiedFrom = (pickFirstQueryParam(sp.copiedFrom) ?? "").trim();
  const costingState = (pickFirstQueryParam(sp.costing) ?? "").trim();
  const returnTo = resolveReturnTo(pickFirstQueryParam(sp.returnTo));
  const costingSaved = costingState === "saved";
  const costingDeleted = costingState === "deleted";

  const recipe = await getRecipeById(id);
  if (!recipe) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <MotionReveal>
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>Recipe not found</CardTitle>
              <CardDescription>The recipe may have been removed or the link may be invalid.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/owner" className={buttonVariants({ variant: "outline" })}>
                Back to owner area
              </Link>
            </CardContent>
          </Card>
        </MotionReveal>
      </main>
    );
  }

  const backToRecipeHref = returnTo ?? recipeDetailHref(recipe.id, recipe.collection);
  const currentCostingHref = buildCurrentCostingHref(recipe.id, q, backToRecipeHref);
  const currentFingerprint = buildRecipeIngredientFingerprint(recipe.ingredients);
  const ingredientRows = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const subRecipeLabels: Array<string | null> = ingredientRows.map(
    (ingredient: (typeof ingredientRows)[number]) =>
      extractPtnReference(ingredient.item) ?? extractPtnReference(ingredient.text),
  );
  const ptnLineCount = subRecipeLabels.filter(
    (label: string | null): label is string => Boolean(label),
  ).length;

  let setupError = "";
  let savedCosting = null as Awaited<ReturnType<typeof getRecipeCosting>>;
  let costedRecipes = [] as Awaited<ReturnType<typeof listCostedRecipesSearch>>;
  let ingredientCatalog = [] as Awaited<ReturnType<typeof listIngredientCatalogEntries>>;
  let resolvedSubRecipeCostings = [] as Array<ResolvedSubRecipeCosting | null>;
  let resolvedSubRecipeTargets = [] as Array<ResolvedSubRecipeTarget | null>;

  try {
    [savedCosting, costedRecipes, ingredientCatalog] = await Promise.all([
      getRecipeCosting(recipe.id, currentFingerprint),
      q
        ? listCostedRecipesSearch({ query: q, excludeRecipeId: recipe.id, limit: 10 })
        : Promise.resolve([] as Awaited<ReturnType<typeof listCostedRecipesSearch>>),
      listIngredientCatalogEntries(),
    ]);

    const uniqueSubRecipeLabels: string[] = [
      ...new Set(
        subRecipeLabels.filter(
          (label: string | null): label is string => Boolean(label),
        ),
      ),
    ];
    if (uniqueSubRecipeLabels.length > 0) {
      const subRecipeTargets = await findSubRecipeTargets(uniqueSubRecipeLabels, {
        audience: "all",
        includeAll: true,
        collection: recipe.collection,
      });
      const resolvedSubRecipeTargetByLabel = new Map<string, ResolvedSubRecipeTarget>();
      const uniqueTargetIds: string[] = [
        ...new Set(
          Object.values(subRecipeTargets)
            .filter((target): target is NonNullable<typeof target> => Boolean(target?.directMatch))
            .map((target) => target.id),
        ),
      ];
      const targetCostings = await Promise.all(
        uniqueTargetIds.map(async (targetRecipeId) => [targetRecipeId, await getRecipeCosting(targetRecipeId)] as const),
      );
      const targetCostingById = new Map(targetCostings);
      const resolvedSubRecipeByLabel = new Map<string, ResolvedSubRecipeCosting>();

      for (const label of uniqueSubRecipeLabels) {
        const target = subRecipeTargets[label];
        if (!target?.directMatch) continue;
        resolvedSubRecipeTargetByLabel.set(label, {
          label,
          recipeId: target.id,
          recipeTitle: target.title || label,
        });
        const costing = targetCostingById.get(target.id);
        if (!costing || costing.costPerPortion === null) continue;
        resolvedSubRecipeByLabel.set(label, {
          label,
          recipeId: target.id,
          recipeTitle: target.title || label,
          recipePortions: costing.recipePortions,
          totalCost: costing.totalCost,
          costPerPortion: costing.costPerPortion,
          currency: costing.currency,
        });
      }

      resolvedSubRecipeTargets = subRecipeLabels.map((label: string | null) =>
        label ? (resolvedSubRecipeTargetByLabel.get(label) ?? null) : null,
      );
      resolvedSubRecipeCostings = subRecipeLabels.map((label: string | null) =>
        label ? (resolvedSubRecipeByLabel.get(label) ?? null) : null,
      );
    }
  } catch (error) {
    setupError = error instanceof Error ? error.message : "Recipe costing is unavailable.";
  }

  const initialLines = (
    savedCosting?.costLines?.length
      ? savedCosting.costLines
      : createRecipeCostLinesFromIngredients(recipe.ingredients)
  ).map((line, index) =>
    applySubRecipeCostingToRecipeCostLine(
      hydrateRecipeCostLineFromCatalog(line, ingredientCatalog),
      resolvedSubRecipeCostings[index],
    ),
  );
  const costingPortions = savedCosting?.recipePortions ?? recipe.portions;
  const resolvedSubRecipeCount = resolvedSubRecipeCostings.filter(Boolean).length;
  const unresolvedSubRecipeCount = Math.max(ptnLineCount - resolvedSubRecipeCount, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <Link
        href={backToRecipeHref}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4")}
      >
        Back to recipe
      </Link>

      <MotionReveal>
        <section>
          <Card className="surface-panel border-white/40">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Owner Costing</Badge>
                <Badge variant={savedCosting ? "outline" : "secondary"}>
                  {savedCosting ? "Saved costing" : "Not costed yet"}
                </Badge>
                {savedCosting?.status === "needs_review" ? (
                  <Badge variant="outline">Needs review</Badge>
                ) : null}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl">{recipe.title}</CardTitle>
                <CardDescription>
                  {recipe.collection} | {recipe.categoryPath?.join(" / ") || "Uncategorised"} | RN{" "}
                  {recipe.pluNumber}
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Costing portions</p>
                  <p className="mt-1 text-lg font-semibold">{costingPortions ?? "-"}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saved total</p>
                  <p className="mt-1 text-lg font-semibold">
                    {savedCosting
                      ? formatRecipeCostMoney(savedCosting.totalCost, savedCosting.currency)
                      : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Updated</p>
                  <p className="mt-1 text-sm font-medium">
                    {savedCosting ? formatUpdatedAt(savedCosting.updatedAt) : "Not saved yet"}
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>
        </section>
      </MotionReveal>

      {!setupError ? (
        <div className="mt-6">
          <MotionReveal delay={0.06}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Manual costing</CardTitle>
                <CardDescription>
                  Current ingredients are preloaded. Cost the recipe, adjust portions, and save the
                  result back to the recipe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3 text-sm">
                  <p>
                    Currency: <span className="font-medium">{RECIPE_COSTING_CURRENCY}</span>
                  </p>
                  {savedCosting?.status === "needs_review" ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                      Ingredients have changed since this costing was saved. Review and save again to
                      refresh it.
                    </div>
                  ) : null}
                  {costingSaved ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
                      Costing saved. The recipe page now shows the updated summary.
                    </div>
                  ) : null}
                  {costingDeleted ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
                      Costing deleted. This recipe now has no saved costing.
                    </div>
                  ) : null}
                  {copiedFrom ? (
                    <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sky-900">
                      Costing copied from {copiedFrom}. Review the lines below and save any changes you
                      want to keep.
                    </div>
                  ) : null}
                  {errorMessage ? (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-900">
                      {errorMessage}
                    </div>
                  ) : null}
                  {resolvedSubRecipeCount > 0 ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
                      {resolvedSubRecipeCount} PTN sub-recipe
                      {resolvedSubRecipeCount === 1 ? " line has" : " lines have"} been auto-filled from
                      saved sub-recipe costing.
                    </div>
                  ) : null}
                  {unresolvedSubRecipeCount > 0 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                      {unresolvedSubRecipeCount} PTN sub-recipe
                      {unresolvedSubRecipeCount === 1 ? " line does" : " lines do"} not have a saved
                      sub-recipe costing yet, so those lines still need manual costing.
                    </div>
                  ) : null}
                </div>

                <form
                  id="save-recipe-costing-form"
                  action={saveRecipeCostingAction}
                  className="space-y-4"
                >
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <input type="hidden" name="returnTo" value={backToRecipeHref} />
                  <RecipeCostingEditor
                    initialLines={initialLines}
                    initialPortions={costingPortions}
                    currency={savedCosting?.currency ?? RECIPE_COSTING_CURRENCY}
                    sourceRecipeId={savedCosting?.sourceRecipeId}
                    ingredientCatalog={ingredientCatalog}
                    subRecipeCostings={resolvedSubRecipeCostings}
                    subRecipeTargets={resolvedSubRecipeTargets}
                  />
                </form>

                <div className="flex flex-wrap items-center gap-3">
                  <LinkedFormSubmitButton
                    formId="save-recipe-costing-form"
                    pendingText="Saving costing"
                  >
                    Save costing
                  </LinkedFormSubmitButton>
                  {savedCosting ? (
                    <form action={deleteRecipeCostingAction}>
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <input type="hidden" name="returnTo" value={backToRecipeHref} />
                      <ConfirmSubmitButton
                        variant="outline"
                        pendingText="Deleting costing"
                        confirmMessage={`Delete the saved costing for ${recipe.title}? This removes the saved recipe costing and summary.`}
                        className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        Delete costing
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                  <Link
                    href={backToRecipeHref}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Cancel
                  </Link>
                </div>

                <div className="border-t border-border/70 pt-6">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">Costed recipes</CardTitle>
                    <CardDescription>
                      Search costed recipes, then copy one into this recipe as a starting point.
                    </CardDescription>
                  </div>

                  <div className="mt-4 space-y-4">
                    <form
                      method="get"
                      action={`/owner/costing/${encodeURIComponent(recipe.id)}`}
                      className="space-y-3"
                    >
                      <input type="hidden" name="returnTo" value={backToRecipeHref} />
                      <label htmlFor="q" className="block text-sm font-medium">
                        Search by title or RN
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="q"
                          name="q"
                          defaultValue={q}
                          placeholder="e.g. Curry or 12086068"
                        />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: "outline" })}
                        >
                          Search
                        </button>
                      </div>
                    </form>

                    {q && costedRecipes.length > 0 ? (
                      <div className="space-y-3">
                        {costedRecipes.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-border/70 bg-background/60 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.collection} | RN {item.pluNumber}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Total {formatRecipeCostMoney(item.totalCost)} | Per portion{" "}
                                  {formatRecipeCostMoney(item.costPerPortion)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Updated {formatUpdatedAt(item.updatedAt)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  href={recipeDetailHref(item.id, item.collection)}
                                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                                >
                                  View
                                </Link>
                                <form action={copyRecipeCostingAction}>
                                  <input type="hidden" name="targetRecipeId" value={recipe.id} />
                                  <input type="hidden" name="sourceRecipeId" value={item.id} />
                                  <input type="hidden" name="returnTo" value={currentCostingHref} />
                                  <FormSubmitButton
                                    size="sm"
                                    variant="outline"
                                    pendingText="Copying"
                                  >
                                    Copy costing
                                  </FormSubmitButton>
                                </form>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : q ? (
                      <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                        No costed recipes matched that search yet.
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </MotionReveal>
        </div>
      ) : (
        <MotionReveal delay={0.06}>
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-900">
                {setupError}
              </div>
            </CardContent>
          </Card>
        </MotionReveal>
      )}
    </main>
  );
}
