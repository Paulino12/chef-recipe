import { NextRequest } from "next/server";

import { requirePublicApiAccess } from "@/lib/api/public/auth";
import { jsonError, jsonSuccess } from "@/lib/api/public/http";
import {
  PUBLIC_API_DETAIL_CACHE_CONTROL,
  getPublicApiRecipeById,
} from "@/lib/api/public/recipes";
import { parsePublicRecipeId } from "@/lib/api/public/validation";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requirePublicApiAccess(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!parsePublicRecipeId(id)) {
    return jsonError("invalid_recipe_id", "Recipe id must be an RN value such as rn_12086068", {
      status: 400,
    });
  }

  const recipe = await getPublicApiRecipeById(id);
  if (!recipe) {
    return jsonError("not_found", "Recipe not found", { status: 404 });
  }

  return jsonSuccess(
    { data: recipe },
    {
      cacheControl: PUBLIC_API_DETAIL_CACHE_CONTROL,
    },
  );
}
