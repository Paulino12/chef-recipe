import { createSupabaseAdminClient } from "@/lib/api/supabaseAdmin";

type FavoriteRow = {
  recipe_id: string;
};

/**
 * Supabase can return either PostgREST schema-cache errors (PGRST205)
 * or plain PostgreSQL "relation does not exist" (42P01) while the
 * favorites table migration is pending.
 */
function isMissingFavoritesTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const withCode = error as { code?: string; message?: string };
  if (withCode.code === "PGRST205" || withCode.code === "42P01") return true;
  const message = withCode.message?.toLowerCase() || "";
  return (
    message.includes("user_recipe_favorites") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}

function createFavoritesClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("Missing server config: SUPABASE_SERVICE_ROLE_KEY not set");
  }
  return client;
}

function normalizeRecipeIds(recipeIds: string[] | undefined) {
  if (!recipeIds?.length) return [];
  return [...new Set(recipeIds.map((id) => id.trim()).filter(Boolean))];
}

export async function listRecipeFavoriteIds(userId: string, recipeIds?: string[]) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return new Set<string>();

  const client = createFavoritesClient();
  const ids = normalizeRecipeIds(recipeIds);

  let query = client
    .from("user_recipe_favorites")
    .select("recipe_id")
    .eq("user_id", normalizedUserId);

  if (ids.length > 0) {
    query = query.in("recipe_id", ids);
  }

  const { data, error } = await query.returns<FavoriteRow[]>();
  if (error) {
    // Graceful fallback: treat missing table as "no favorites yet"
    // so recipe pages still render while infra catches up.
    if (isMissingFavoritesTableError(error)) return new Set<string>();
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.recipe_id));
}

export async function addRecipeFavorite(userId: string, recipeId: string) {
  const normalizedUserId = userId.trim();
  const normalizedRecipeId = recipeId.trim();
  if (!normalizedUserId || !normalizedRecipeId) {
    throw new Error("Missing favorite input");
  }

  const client = createFavoritesClient();
  const { error } = await client.from("user_recipe_favorites").upsert(
    {
      user_id: normalizedUserId,
      recipe_id: normalizedRecipeId,
    },
    {
      onConflict: "user_id,recipe_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    // No-op when table is not migrated yet; cookie fallback still updates UI.
    if (isMissingFavoritesTableError(error)) return;
    throw new Error(error.message);
  }
}

export async function removeRecipeFavorite(userId: string, recipeId: string) {
  const normalizedUserId = userId.trim();
  const normalizedRecipeId = recipeId.trim();
  if (!normalizedUserId || !normalizedRecipeId) {
    throw new Error("Missing favorite input");
  }

  const client = createFavoritesClient();
  const { error } = await client
    .from("user_recipe_favorites")
    .delete()
    .eq("user_id", normalizedUserId)
    .eq("recipe_id", normalizedRecipeId);

  if (error) {
    // No-op when table is not migrated yet; cookie fallback still updates UI.
    if (isMissingFavoritesTableError(error)) return;
    throw new Error(error.message);
  }
}
