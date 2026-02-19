import { env } from "../config/env";
import { getJson } from "../lib/http";
import { mapDetail, mapListItem } from "../lib/recipeMapper";
import { Audience, RecipeDetail, RecipeListItem } from "../types/recipe";

function buildAudienceHeaders(audience: Audience, accessToken: string) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  };

  // Keep compatibility with legacy enterprise-key environments.
  if (audience === "enterprise" && env.enterpriseApiKey) {
    headers["x-api-key"] = env.enterpriseApiKey;
  }

  return headers;
}

export async function fetchRecipes(
  audience: Audience,
  query: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RecipeListItem[]> {
  const payload = await getJson<unknown>("/api/recipes", {
    signal,
    query: { audience, q: query.trim() || undefined },
    headers: buildAudienceHeaders(audience, accessToken),
  });

  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((row) => mapListItem(row as Record<string, unknown>)).filter((recipe) => Boolean(recipe.id));
}

export async function fetchRecipeById(
  id: string,
  audience: Audience,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RecipeDetail> {
  const payload = await getJson<unknown>(`/api/recipes/${id}`, {
    signal,
    query: { audience },
    headers: buildAudienceHeaders(audience, accessToken),
  });

  return mapDetail(payload as Record<string, unknown>);
}
