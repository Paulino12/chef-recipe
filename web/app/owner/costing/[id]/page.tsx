import Link from "next/link";
import { redirect } from "next/navigation";

import { RecipeCostingEditor } from "@/components/recipe-costing-editor";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { ClearableInput } from "@/components/ui/clearable-input";
import { DismissibleNotice } from "@/components/ui/dismissible-notice";
import { LinkedFormSubmitButton } from "@/components/ui/linked-form-submit-button";
import { MotionReveal } from "@/components/motion/reveal";
import { listIngredientCatalogEntries } from "@/lib/api/costingCatalog";
import {
  getNutritionCatalogStatus,
  listNutritionCatalogEntries,
} from "@/lib/api/nutritionCatalog";
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
import {
  estimateRecipeNutrition,
  getRecipeNutritionWorkflow,
} from "@/lib/recipeNutrition";
import { pickFirstQueryParam } from "@/lib/searchParams";
import { cn } from "@/lib/utils";

import {
  copyRecipeCostingAction,
  deleteRecipeCostingAction,
  saveRecipeNutritionEstimateAction,
  saveRecipeCostingAction,
} from "./actions";

type CostingSearchParams = {
  q?: string | string[];
  error?: string | string[];
  copiedFrom?: string | string[];
  costing?: string | string[];
  nutrition?: string | string[];
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

function formatNutritionNumber(value: number | null) {
  if (value === null) return "-";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
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
  const nutritionState = (pickFirstQueryParam(sp.nutrition) ?? "").trim();
  const returnTo = resolveReturnTo(pickFirstQueryParam(sp.returnTo));
  const costingSaved = costingState === "saved";
  const costingDeleted = costingState === "deleted";
  const nutritionSaved = nutritionState === "saved";

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
  const nutritionCatalogStatus = await getNutritionCatalogStatus();
  const nutritionWorkflow = getRecipeNutritionWorkflow({
    nutrition: recipe.nutrition,
    nutritionMeta: recipe.nutritionMeta,
    sourcePdfPath: recipe.source?.pdfPath ?? null,
    nutritionCatalogConnected: nutritionCatalogStatus.configured,
  });
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
  let nutritionEstimate = null as ReturnType<typeof estimateRecipeNutrition> | null;
  let nutritionEstimateError = "";

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

  try {
    const nutritionCatalog = await listNutritionCatalogEntries();
    nutritionEstimate = estimateRecipeNutrition({
      ingredients: recipe.ingredients,
      portions: recipe.portions,
      portionNetWeightG:
        recipe.portionNetWeightG ?? recipe.nutrition?.portionNetWeightG ?? null,
      catalog: nutritionCatalog,
    });
  } catch (error) {
    nutritionEstimateError =
      error instanceof Error ? error.message : "Nutrition estimate is unavailable.";
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
            <Card className="mb-6">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={nutritionWorkflow.badgeVariant}>
                    {nutritionWorkflow.badgeLabel}
                  </Badge>
                  <Badge
                    variant={nutritionCatalogStatus.configured ? "success" : "outline"}
                  >
                    {nutritionCatalogStatus.configured
                      ? "Nutrition catalog connected"
                      : "Nutrition catalog not connected"}
                  </Badge>
                </div>
                <CardTitle className="text-lg">Nutrition workflow</CardTitle>
                <CardDescription>
                  {nutritionWorkflow.statusDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {nutritionWorkflow.guidance}
                </p>

                {nutritionSaved ? (
                  <DismissibleNotice
                    variant="success"
                    clearQueryKeys={["nutrition"]}
                  >
                    Nutrition estimate saved. The recipe page now reads this nutrition from Sanity.
                  </DismissibleNotice>
                ) : null}

                {!nutritionCatalogStatus.configured ? (
                  <DismissibleNotice variant="warning">
                    This preview is ready, but automatic nutrition estimates will not run until an
                    ingredient-level nutrition catalog is added to the app.
                  </DismissibleNotice>
                ) : null}

                {nutritionEstimateError ? (
                  <DismissibleNotice variant="error">
                    {nutritionEstimateError}
                  </DismissibleNotice>
                ) : nutritionEstimate && nutritionEstimate.status !== "unavailable" ? (
                  <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sky-950">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          nutritionEstimate.status === "ready" ? "success" : "secondary"
                        }
                      >
                        {nutritionEstimate.status === "ready"
                          ? "Estimate ready"
                          : "Partial estimate"}
                      </Badge>
                      <p className="text-sm">
                        {nutritionEstimate.matchedIngredientCount}/
                        {nutritionEstimate.totalIngredientCount} ingredients matched
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          kcal / serving
                        </p>
                        <p className="mt-3 text-lg font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.perServing.energyKcal)}
                        </p>
                      </div>
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          Fat / serving
                        </p>
                        <p className="mt-3 text-lg font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.perServing.fatG)} g
                        </p>
                      </div>
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          Sugars / serving
                        </p>
                        <p className="mt-3 text-lg font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.perServing.sugarsG)} g
                        </p>
                      </div>
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          Salt / serving
                        </p>
                        <p className="mt-3 text-lg font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.perServing.saltG)} g
                        </p>
                      </div>
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          kJ / serving
                        </p>
                        <p className="mt-3 text-base font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.perServing.energyKj)}
                        </p>
                      </div>
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          kcal / 100g
                        </p>
                        <p className="mt-3 text-base font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.per100g.energyKcal)}
                        </p>
                      </div>
                      <div className="flex min-h-24 flex-col justify-between rounded-md border border-sky-200 bg-white/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">
                          Energy RI
                        </p>
                        <p className="mt-3 text-base font-semibold tabular-nums">
                          {formatNutritionNumber(nutritionEstimate.riPercent.energy)}%
                        </p>
                      </div>
                    </div>

                    {nutritionEstimate.unmatchedItems.length > 0 ? (
                      <p className="mt-4 text-sm text-sky-900">
                        Still needs review for: {nutritionEstimate.unmatchedItems.join(", ")}
                      </p>
                    ) : null}

                    {nutritionEstimate.notes.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-sm text-sky-900">
                        {nutritionEstimate.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : nutritionCatalogStatus.configured ? (
                  <DismissibleNotice
                    variant="neutral"
                    className="border-dashed bg-background/40"
                  >
                    The catalog loaded, but this recipe does not have enough matched weighted
                    ingredients for an estimate yet.
                  </DismissibleNotice>
                ) : null}

                {nutritionEstimate && nutritionEstimate.status !== "unavailable" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={saveRecipeNutritionEstimateAction}>
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <input type="hidden" name="returnTo" value={backToRecipeHref} />
                      <FormSubmitButton pendingText="Saving nutrition">
                        Save nutrition estimate
                      </FormSubmitButton>
                    </form>
                    <p className="text-xs text-muted-foreground">
                      This saves the current estimate into the recipe&apos;s Sanity nutrition fields.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </MotionReveal>

          <MotionReveal delay={0.08}>
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
                    <DismissibleNotice variant="warning">
                      Ingredients have changed since this costing was saved. Review and save again to
                      refresh it.
                    </DismissibleNotice>
                  ) : null}
                  {costingSaved ? (
                    <DismissibleNotice
                      variant="success"
                      clearQueryKeys={["costing"]}
                    >
                      Costing saved. The recipe page now shows the updated summary.
                    </DismissibleNotice>
                  ) : null}
                  {costingDeleted ? (
                    <DismissibleNotice
                      variant="success"
                      clearQueryKeys={["costing"]}
                    >
                      Costing deleted. This recipe now has no saved costing.
                    </DismissibleNotice>
                  ) : null}
                  {copiedFrom ? (
                    <DismissibleNotice
                      variant="info"
                      clearQueryKeys={["copiedFrom"]}
                    >
                      Costing copied from {copiedFrom}. Review the lines below and save any changes you
                      want to keep.
                    </DismissibleNotice>
                  ) : null}
                  {errorMessage ? (
                    <DismissibleNotice
                      variant="error"
                      clearQueryKeys={["error"]}
                    >
                      {errorMessage}
                    </DismissibleNotice>
                  ) : null}
                  {resolvedSubRecipeCount > 0 ? (
                    <DismissibleNotice variant="success">
                      {resolvedSubRecipeCount} PTN sub-recipe
                      {resolvedSubRecipeCount === 1 ? " line has" : " lines have"} been auto-filled from
                      saved sub-recipe costing.
                    </DismissibleNotice>
                  ) : null}
                  {unresolvedSubRecipeCount > 0 ? (
                    <DismissibleNotice variant="warning">
                      {unresolvedSubRecipeCount} PTN sub-recipe
                      {unresolvedSubRecipeCount === 1 ? " line does" : " lines do"} not have a saved
                      sub-recipe costing yet, so those lines still need manual costing.
                    </DismissibleNotice>
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
                        <ClearableInput
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
              <DismissibleNotice variant="error">
                {setupError}
              </DismissibleNotice>
            </CardContent>
          </Card>
        </MotionReveal>
      )}
    </main>
  );
}
