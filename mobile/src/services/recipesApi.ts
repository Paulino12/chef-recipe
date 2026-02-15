import { env } from "../config/env";
import { getJson } from "../lib/http";
import { mapDetail, mapListItem } from "../lib/recipeMapper";
import { Audience, RecipeDetail, RecipeListItem } from "../types/recipe";

function buildAudienceHeaders(audience: Audience) {
  // Enterprise requests are protected by existing web API key checks.
  if (audience !== "enterprise" || !env.enterpriseApiKey) return undefined;
  return { "x-api-key": env.enterpriseApiKey };
}

export async function fetchRecipes(
  audience: Audience,
  query: string,
  signal?: AbortSignal,
): Promise<RecipeListItem[]> {
  const payload = await getJson<unknown>("/api/recipes", {
    signal,
    query: { audience, q: query.trim() || undefined },
    headers: buildAudienceHeaders(audience),
  });

  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((row) => mapListItem(row as Record<string, unknown>)).filter((recipe) => Boolean(recipe.id));
}

export async function fetchRecipeById(
  id: string,
  audience: Audience,
  signal?: AbortSignal,
): Promise<RecipeDetail> {
  const payload = await getJson<unknown>(`/api/recipes/${id}`, {
    signal,
    query: { audience },
    headers: buildAudienceHeaders(audience),
  });

  return mapDetail(payload as Record<string, unknown>);
}
