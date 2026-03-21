import "server-only";

import { createSupabaseAdminClient } from "@/lib/api/supabaseAdmin";
import { type Recipe, normalizeCollection, type RecipeCollection } from "@/lib/recipes";
import { sanityServer } from "@/lib/sanity/serverClient";
import {
  buildRecipeIngredientFingerprint,
  calculateRecipeCostTotals,
  type CostedRecipeSearchResult,
  getRecipeCostingStatus,
  type RecipeCostLine,
  type RecipeCosting,
  RECIPE_COSTING_CURRENCY,
  sanitizeRecipeCostLines,
  toRecipeCostSummary,
} from "@/lib/recipeCosting";

type RecipeCostingRow = {
  recipe_id: string;
  recipe_title: string;
  recipe_collection: string;
  recipe_portions: number | null;
  ingredient_fingerprint: string;
  currency: string | null;
  total_cost: number | null;
  cost_per_portion: number | null;
  source_recipe_id: string | null;
  cost_lines: unknown;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeCostingListSummary = {
  recipeId: string;
  currency: string;
  totalCost: number;
  costPerPortion: number | null;
  updatedAt: string;
};

type CostingRecipeMetadataRow = {
  id: string;
  title: string;
  pluNumber: number;
  collection: RecipeCollection;
};

const COSTED_RECIPE_METADATA_QUERY = `
  *[
    _type == "recipe" &&
    _id in $recipeIds
  ]{
    "id": _id,
    title,
    pluNumber,
    "collection": coalesce(collection, "Dining")
  }
`;

function createCostingsClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error(
      "Missing server config: recipe costing requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return client;
}

function isMissingRecipeCostingsTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const withCode = error as { code?: string; message?: string };
  if (withCode.code === "PGRST205" || withCode.code === "42P01") return true;
  const message = withCode.message?.toLowerCase() || "";
  return (
    message.includes("recipe_costings") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}

function normalizeCollectionValue(value: string) {
  return normalizeCollection(value) ?? "Dining";
}

function mapRecipeCostingRow(
  row: RecipeCostingRow,
  currentIngredientFingerprint?: string,
): RecipeCosting {
  const costLines = sanitizeRecipeCostLines(row.cost_lines);
  const { totalCost, costPerPortion } = calculateRecipeCostTotals(costLines, row.recipe_portions);
  return {
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title,
    recipeCollection: normalizeCollectionValue(row.recipe_collection),
    recipePortions: row.recipe_portions,
    ingredientFingerprint: row.ingredient_fingerprint,
    currency: row.currency?.trim() || RECIPE_COSTING_CURRENCY,
    totalCost: row.total_cost ?? totalCost,
    costPerPortion: row.cost_per_portion ?? costPerPortion,
    sourceRecipeId: row.source_recipe_id,
    costLines,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: currentIngredientFingerprint
      ? getRecipeCostingStatus(row.ingredient_fingerprint, currentIngredientFingerprint)
      : "current",
  };
}

function normalizeSearchQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesRecipeSearch(
  row: Pick<CostingRecipeMetadataRow, "title" | "pluNumber">,
  query: string,
) {
  if (!query) return true;
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return true;

  const normalizedTitle = normalizeSearchQuery(row.title);
  const normalizedPlu = String(row.pluNumber ?? "");

  return (
    normalizedTitle.includes(normalizedQuery) ||
    normalizedPlu.includes(normalizedQuery.replace(/\s+/g, ""))
  );
}

export async function getRecipeCosting(
  recipeId: string,
  currentIngredientFingerprint?: string,
) {
  const normalizedRecipeId = recipeId.trim();
  if (!normalizedRecipeId) return null;

  const client = createCostingsClient();
  const { data, error } = await client
    .from("recipe_costings")
    .select(
      "recipe_id, recipe_title, recipe_collection, recipe_portions, ingredient_fingerprint, currency, total_cost, cost_per_portion, source_recipe_id, cost_lines, updated_by, created_at, updated_at",
    )
    .eq("recipe_id", normalizedRecipeId)
    .maybeSingle<RecipeCostingRow>();

  if (error) {
    if (isMissingRecipeCostingsTableError(error)) {
      throw new Error(
        "Recipe costing is not ready yet: the Supabase table `recipe_costings` has not been created.",
      );
    }
    throw new Error(error.message);
  }

  if (!data) return null;
  return mapRecipeCostingRow(data, currentIngredientFingerprint);
}

export async function getRecipeCostSummary(recipe: Pick<Recipe, "id" | "ingredients">) {
  const fingerprint = buildRecipeIngredientFingerprint(recipe.ingredients);
  const costing = await getRecipeCosting(recipe.id, fingerprint);
  if (!costing) return null;
  return toRecipeCostSummary(costing, fingerprint);
}

export async function saveRecipeCosting(input: {
  recipe: Pick<Recipe, "id" | "title" | "collection" | "portions" | "ingredients">;
  costLines: RecipeCostLine[];
  updatedBy: string;
  sourceRecipeId?: string | null;
  currency?: string;
}) {
  const normalizedRecipeId = input.recipe.id.trim();
  const normalizedUserId = input.updatedBy.trim();
  if (!normalizedRecipeId || !normalizedUserId) {
    throw new Error("Missing recipe costing input.");
  }

  const client = createCostingsClient();
  const costLines = sanitizeRecipeCostLines(input.costLines);
  const ingredientFingerprint = buildRecipeIngredientFingerprint(input.recipe.ingredients);
  const { totalCost, costPerPortion } = calculateRecipeCostTotals(
    costLines,
    input.recipe.portions,
  );

  const payload = {
    recipe_id: normalizedRecipeId,
    recipe_title: input.recipe.title.trim(),
    recipe_collection: input.recipe.collection,
    recipe_portions: input.recipe.portions,
    ingredient_fingerprint: ingredientFingerprint,
    currency: (input.currency ?? RECIPE_COSTING_CURRENCY).trim() || RECIPE_COSTING_CURRENCY,
    total_cost: totalCost,
    cost_per_portion: costPerPortion,
    source_recipe_id: input.sourceRecipeId?.trim() || null,
    cost_lines: costLines,
    updated_by: normalizedUserId,
  };

  const { data, error } = await client
    .from("recipe_costings")
    .upsert(payload, { onConflict: "recipe_id" })
    .select(
      "recipe_id, recipe_title, recipe_collection, recipe_portions, ingredient_fingerprint, currency, total_cost, cost_per_portion, source_recipe_id, cost_lines, updated_by, created_at, updated_at",
    )
    .single<RecipeCostingRow>();

  if (error) {
    if (isMissingRecipeCostingsTableError(error)) {
      throw new Error(
        "Recipe costing cannot be saved yet: the Supabase table `recipe_costings` has not been created.",
      );
    }
    throw new Error(error.message);
  }

  return mapRecipeCostingRow(data, ingredientFingerprint);
}

export async function deleteRecipeCosting(recipeId: string) {
  const normalizedRecipeId = recipeId.trim();
  if (!normalizedRecipeId) {
    throw new Error("Missing recipe id.");
  }

  const client = createCostingsClient();
  const { error } = await client
    .from("recipe_costings")
    .delete()
    .eq("recipe_id", normalizedRecipeId);

  if (error) {
    if (isMissingRecipeCostingsTableError(error)) {
      throw new Error(
        "Recipe costing cannot be deleted yet: the Supabase table `recipe_costings` has not been created.",
      );
    }
    throw new Error(error.message);
  }
}

export async function listRecipeCostingSummariesByIds(recipeIds: string[]) {
  const normalizedRecipeIds = [...new Set(recipeIds.map((id) => id.trim()).filter(Boolean))];
  if (!normalizedRecipeIds.length) {
    return {} as Record<string, RecipeCostingListSummary>;
  }

  const client = createCostingsClient();
  const { data, error } = await client
    .from("recipe_costings")
    .select("recipe_id, currency, total_cost, cost_per_portion, updated_at")
    .in("recipe_id", normalizedRecipeIds);

  if (error) {
    if (isMissingRecipeCostingsTableError(error)) {
      throw new Error(
        "Recipe costing is not ready yet: the Supabase table `recipe_costings` has not been created.",
      );
    }
    throw new Error(error.message);
  }

  const summaries: Record<string, RecipeCostingListSummary> = {};
  const rows = (data ?? []) as Array<{
    recipe_id?: unknown;
    currency?: unknown;
    total_cost?: unknown;
    cost_per_portion?: unknown;
    updated_at?: unknown;
  }>;
  for (const row of rows) {
    if (typeof row.recipe_id !== "string" || !row.recipe_id.trim()) continue;
    summaries[row.recipe_id.trim()] = {
      recipeId: row.recipe_id.trim(),
      currency:
        typeof row.currency === "string" && row.currency.trim()
          ? row.currency.trim()
          : RECIPE_COSTING_CURRENCY,
      totalCost: typeof row.total_cost === "number" ? row.total_cost : 0,
      costPerPortion:
        typeof row.cost_per_portion === "number" ? row.cost_per_portion : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    };
  }

  return summaries;
}

export async function listCostedRecipeIds() {
  const client = createCostingsClient();
  const { data, error } = await client
    .from("recipe_costings")
    .select("recipe_id, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingRecipeCostingsTableError(error)) {
      throw new Error(
        "Recipe costing is not ready yet: the Supabase table `recipe_costings` has not been created.",
      );
    }
    throw new Error(error.message);
  }

  const ids = (data ?? [])
    .map((row) => (typeof row.recipe_id === "string" ? row.recipe_id.trim() : ""))
    .filter(Boolean);
  return [...new Set(ids)];
}

export async function listCostedRecipesSearch(options?: {
  query?: string;
  excludeRecipeId?: string;
  limit?: number;
}) {
  const client = createCostingsClient();
  const excludeRecipeId = options?.excludeRecipeId?.trim() || "";
  const limit = Math.max(1, Math.min(options?.limit ?? 12, 30));

  const { data, error } = await client
    .from("recipe_costings")
    .select("recipe_id, total_cost, cost_per_portion, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingRecipeCostingsTableError(error)) {
      throw new Error(
        "Recipe costing is not ready yet: the Supabase table `recipe_costings` has not been created.",
      );
    }
    throw new Error(error.message);
  }

  const costingRows = (data ?? []).filter(
    (row): row is {
      recipe_id: string;
      total_cost: number | null;
      cost_per_portion: number | null;
      updated_at: string;
    } => typeof row.recipe_id === "string" && Boolean(row.recipe_id.trim()),
  );

  const recipeIds = costingRows
    .map((row) => row.recipe_id.trim())
    .filter((id) => id && id !== excludeRecipeId);

  if (!recipeIds.length) return [] as CostedRecipeSearchResult[];

  const metadataRows = await sanityServer.fetch<CostingRecipeMetadataRow[]>(
    COSTED_RECIPE_METADATA_QUERY,
    { recipeIds },
  );
  const metadataById = new Map(metadataRows.map((row) => [row.id, row]));
  const filtered = costingRows
    .filter((row) => row.recipe_id.trim() !== excludeRecipeId)
    .map((row) => {
      const metadata = metadataById.get(row.recipe_id.trim());
      if (!metadata) return null;
      if (!matchesRecipeSearch(metadata, options?.query ?? "")) return null;
      return {
        id: metadata.id,
        title: metadata.title,
        pluNumber: metadata.pluNumber,
        collection: metadata.collection,
        totalCost: row.total_cost ?? 0,
        costPerPortion: row.cost_per_portion,
        updatedAt: row.updated_at,
      } satisfies CostedRecipeSearchResult;
    })
    .filter((row): row is CostedRecipeSearchResult => Boolean(row));

  return filtered.slice(0, limit);
}
