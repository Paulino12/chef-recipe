import { NextRequest } from "next/server";

import { requirePublicApiAccess } from "@/lib/api/public/auth";
import { jsonError, jsonSuccess } from "@/lib/api/public/http";
import {
  PUBLIC_API_METADATA_CACHE_CONTROL,
  listPublicApiCategories,
} from "@/lib/api/public/recipes";
import {
  isPublicRecipeCollection,
  type PublicRecipeCollection,
} from "@/lib/api/public/validation";

export async function GET(req: NextRequest) {
  const auth = requirePublicApiAccess(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const collection = (searchParams.get("collection") ?? "").trim();
  if (collection && !isPublicRecipeCollection(collection)) {
    return jsonError("invalid_query", 'collection must be "Dining" or "Hospitality"', {
      status: 400,
    });
  }

  const validatedCollection = collection ? (collection as PublicRecipeCollection) : null;
  const categories = await listPublicApiCategories(validatedCollection);
  return jsonSuccess(
    { data: categories },
    {
      cacheControl: PUBLIC_API_METADATA_CACHE_CONTROL,
    },
  );
}
