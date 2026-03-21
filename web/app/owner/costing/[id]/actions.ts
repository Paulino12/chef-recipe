"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerAccessSession } from "@/lib/api/serverSession";
import {
  deleteRecipeCosting,
  getRecipeCosting,
  saveRecipeCosting,
} from "@/lib/api/recipeCostings";
import { getRecipeById } from "@/lib/recipes";
import {
  mergeRecipeCostLinesFromSource,
  RECIPE_COSTING_CURRENCY,
  sanitizeRecipeCostLines,
} from "@/lib/recipeCosting";

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function assertOwnerRole(role: string) {
  if (role !== "owner") {
    throw new Error("Only owners can manage recipe costing.");
  }
}

function parseReturnTo(raw: FormDataEntryValue | null, fallback: string) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
}

function withQuery(path: string, key: string, value: string) {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function normalizeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Recipe costing failed.";
  return message.trim() || "Recipe costing failed.";
}

function parseRecipePortions(raw: FormDataEntryValue | null, fallback: number | null) {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.round(next * 100) / 100;
}

export async function saveRecipeCostingAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fowner");
  assertOwnerRole(session.user.role);

  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const fallbackReturnTo = `/owner/costing/${encodeURIComponent(recipeId)}`;
  const returnTo = parseReturnTo(formData.get("returnTo"), fallbackReturnTo);

  try {
    if (!recipeId) {
      throw new Error("Missing recipe id.");
    }

    const recipe = await getRecipeById(recipeId);
    if (!recipe) {
      throw new Error("Recipe not found.");
    }

    const rawLines = String(formData.get("costLines") ?? "").trim();
    const parsedLines = rawLines ? JSON.parse(rawLines) : [];
    const costLines = sanitizeRecipeCostLines(parsedLines);
    const recipePortions = parseRecipePortions(formData.get("recipePortions"), recipe.portions);
    const sourceRecipeId = String(formData.get("sourceRecipeId") ?? "").trim() || null;

    await saveRecipeCosting({
      recipe: { ...recipe, portions: recipePortions },
      costLines,
      updatedBy: session.user.id,
      sourceRecipeId,
      currency: RECIPE_COSTING_CURRENCY,
    });

    revalidatePath(`/owner/costing/${recipe.id}`);
    revalidatePath(`/recipes/${recipe.id}`);
    revalidatePath("/owner");

    redirect(withQuery(returnTo, "costing", "saved"));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(withQuery(fallbackReturnTo, "error", normalizeErrorMessage(error)));
  }
}

export async function copyRecipeCostingAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fowner");
  assertOwnerRole(session.user.role);

  const targetRecipeId = String(formData.get("targetRecipeId") ?? "").trim();
  const sourceRecipeId = String(formData.get("sourceRecipeId") ?? "").trim();
  const fallbackReturnTo = `/owner/costing/${encodeURIComponent(targetRecipeId)}`;
  const returnTo = parseReturnTo(formData.get("returnTo"), fallbackReturnTo);

  try {
    if (!targetRecipeId || !sourceRecipeId) {
      throw new Error("Missing copy source.");
    }

    const [targetRecipe, sourceCosting] = await Promise.all([
      getRecipeById(targetRecipeId),
      getRecipeCosting(sourceRecipeId),
    ]);

    if (!targetRecipe) {
      throw new Error("Target recipe not found.");
    }
    if (!sourceCosting) {
      throw new Error("Source recipe costing was not found.");
    }

    const costLines = mergeRecipeCostLinesFromSource(
      targetRecipe.ingredients,
      sourceCosting.costLines,
    );

    await saveRecipeCosting({
      recipe: targetRecipe,
      costLines,
      updatedBy: session.user.id,
      sourceRecipeId,
      currency: sourceCosting.currency || RECIPE_COSTING_CURRENCY,
    });

    revalidatePath(`/owner/costing/${targetRecipe.id}`);
    revalidatePath(`/recipes/${targetRecipe.id}`);

    redirect(withQuery(returnTo, "copiedFrom", sourceRecipeId));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(withQuery(fallbackReturnTo, "error", normalizeErrorMessage(error)));
  }
}

export async function deleteRecipeCostingAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fowner");
  assertOwnerRole(session.user.role);

  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const fallbackReturnTo = `/owner/costing/${encodeURIComponent(recipeId)}`;
  const returnTo = parseReturnTo(formData.get("returnTo"), fallbackReturnTo);

  try {
    if (!recipeId) {
      throw new Error("Missing recipe id.");
    }

    await deleteRecipeCosting(recipeId);

    revalidatePath(`/owner/costing/${recipeId}`);
    revalidatePath(`/recipes/${recipeId}`);
    revalidatePath("/owner");

    redirect(withQuery(returnTo, "costing", "deleted"));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(withQuery(fallbackReturnTo, "error", normalizeErrorMessage(error)));
  }
}
