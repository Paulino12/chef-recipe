import "server-only";

import { getSanityWriteClients } from "@/lib/sanity/serverClient";
import { type Recipe } from "@/lib/recipes";
import { estimateRecipeNutrition } from "@/lib/recipeNutrition";

import { listNutritionCatalogEntries } from "./nutritionCatalog";

function isProjectHostMismatchError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("session does not match project host")
  );
}

function isPermissionFailure(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("insufficient permissions")
  );
}

function roundNumber(value: number | null, fractionDigits = 4) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

async function patchRecipeNutritionDocument(
  recipeId: string,
  patch: Record<string, unknown>,
) {
  const writeClients = getSanityWriteClients();
  let sawHostMismatch = false;
  let sawPermissionFailure = false;
  const attemptedSources: string[] = [];

  for (const { source, client } of writeClients) {
    attemptedSources.push(source);
    try {
      await client.patch(recipeId, { set: patch }).commit();
      return;
    } catch (error) {
      if (isProjectHostMismatchError(error)) {
        sawHostMismatch = true;
        continue;
      }
      if (isPermissionFailure(error)) {
        sawPermissionFailure = true;
        continue;
      }
      throw error;
    }
  }

  if (sawPermissionFailure) {
    throw new Error(
      `Sanity token lacks update permission for recipe documents. Tried: ${attemptedSources.join(", ")}.`,
    );
  }

  if (sawHostMismatch) {
    throw new Error("Sanity write token does not belong to the active project.");
  }

  throw new Error("Failed to update recipe nutrition due to missing or invalid Sanity token.");
}

export async function saveEstimatedRecipeNutrition(options: {
  recipe: Recipe;
}) {
  const { recipe } = options;

  if (recipe.nutritionMeta?.lockedByEditor) {
    throw new Error("Nutrition is locked for manual editing and cannot be overwritten.");
  }

  const catalog = await listNutritionCatalogEntries();
  if (!catalog.length) {
    throw new Error("Nutrition catalog is not available.");
  }

  const estimate = estimateRecipeNutrition({
    ingredients: recipe.ingredients,
    portions: recipe.portions,
    portionNetWeightG: recipe.portionNetWeightG ?? recipe.nutrition?.portionNetWeightG ?? null,
    catalog,
  });

  if (estimate.status === "unavailable" || estimate.matchedIngredientCount === 0) {
    throw new Error("Nutrition estimate could not be generated for this recipe.");
  }

  const confidence =
    estimate.totalIngredientCount > 0
      ? roundNumber(estimate.matchedIngredientCount / estimate.totalIngredientCount, 4)
      : null;

  await patchRecipeNutritionDocument(recipe.id, {
    nutrition: {
      portionNetWeightG:
        recipe.portionNetWeightG ?? recipe.nutrition?.portionNetWeightG ?? null,
      perServing: {
        energyKj: estimate.perServing.energyKj,
        energyKcal: estimate.perServing.energyKcal,
        fatG: estimate.perServing.fatG,
        saturatesG: estimate.perServing.saturatesG,
        sugarsG: estimate.perServing.sugarsG,
        saltG: estimate.perServing.saltG,
      },
      per100g: {
        energyKj: estimate.per100g.energyKj,
        energyKcal: estimate.per100g.energyKcal,
      },
      riPercent: {
        energy: estimate.riPercent.energy,
        fat: estimate.riPercent.fat,
        saturates: estimate.riPercent.saturates,
        sugars: estimate.riPercent.sugars,
        salt: estimate.riPercent.salt,
      },
    },
    nutritionMeta: {
      status: "estimated",
      source: "calculated",
      confidence,
      matchedIngredientCount: estimate.matchedIngredientCount,
      totalIngredientCount: estimate.totalIngredientCount,
      unmatchedItems: estimate.unmatchedItems,
      lastCalculatedAt: new Date().toISOString(),
      lockedByEditor: false,
    },
  });

  return estimate;
}
