import { NextRequest } from "next/server";

import { requirePublicApiAccess } from "@/lib/api/public/auth";
import { jsonError, jsonSuccess } from "@/lib/api/public/http";
import {
  PUBLIC_API_DEFAULT_PAGE_SIZE,
  PUBLIC_API_LIST_CACHE_CONTROL,
  PUBLIC_API_MAX_PAGE_SIZE,
  listPublicApiRecipes,
} from "@/lib/api/public/recipes";
import {
  isPublicAllergenSlug,
  isPublicRecipeCollection,
  isPublicRecipeOrder,
  isPublicRecipeSort,
  type PublicAllergenSlug,
  type PublicRecipeCollection,
  type PublicRecipeOrder,
  type PublicRecipeSort,
} from "@/lib/api/public/validation";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOptionalNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAllergens(value: string | null): PublicAllergenSlug[] | null {
  if (!value) return [];
  const items = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!items.every(isPublicAllergenSlug)) return null;
  return [...new Set(items)] as PublicAllergenSlug[];
}

export async function GET(req: NextRequest) {
  const auth = requirePublicApiAccess(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const collectionRaw = (searchParams.get("collection") ?? "").trim();
  const sortRaw = (searchParams.get("sort") ?? "title").trim();
  const orderRaw = (searchParams.get("order") ?? "asc").trim();
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("page_size"), PUBLIC_API_DEFAULT_PAGE_SIZE);
  const minKcal = parseOptionalNumber(searchParams.get("min_kcal"));
  const maxKcal = parseOptionalNumber(searchParams.get("max_kcal"));
  const maxSaltG = parseOptionalNumber(searchParams.get("max_salt_g"));
  const includeAllergens = parseAllergens(searchParams.get("include_allergens"));
  const excludeAllergens = parseAllergens(searchParams.get("exclude_allergens"));

  if (page === null) {
    return jsonError("invalid_query", "page must be a positive integer", { status: 400 });
  }

  if (pageSize === null || pageSize > PUBLIC_API_MAX_PAGE_SIZE) {
    return jsonError(
      "invalid_query",
      `page_size must be between 1 and ${PUBLIC_API_MAX_PAGE_SIZE}`,
      { status: 400 },
    );
  }

  if (collectionRaw && !isPublicRecipeCollection(collectionRaw)) {
    return jsonError("invalid_query", 'collection must be "Dining" or "Hospitality"', {
      status: 400,
    });
  }

  if (!isPublicRecipeSort(sortRaw)) {
    return jsonError("invalid_query", 'sort must be one of "title", "updated_at", or "rn"', {
      status: 400,
    });
  }

  if (!isPublicRecipeOrder(orderRaw)) {
    return jsonError("invalid_query", 'order must be "asc" or "desc"', { status: 400 });
  }

  if (includeAllergens === null) {
    return jsonError("invalid_query", "include_allergens contains an unsupported allergen", {
      status: 400,
    });
  }

  if (excludeAllergens === null) {
    return jsonError("invalid_query", "exclude_allergens contains an unsupported allergen", {
      status: 400,
    });
  }

  if (minKcal === null && searchParams.has("min_kcal")) {
    return jsonError("invalid_query", "min_kcal must be numeric", { status: 400 });
  }

  if (maxKcal === null && searchParams.has("max_kcal")) {
    return jsonError("invalid_query", "max_kcal must be numeric", { status: 400 });
  }

  if (maxSaltG === null && searchParams.has("max_salt_g")) {
    return jsonError("invalid_query", "max_salt_g must be numeric", { status: 400 });
  }

  if (minKcal !== null && maxKcal !== null && minKcal > maxKcal) {
    return jsonError("invalid_query", "min_kcal cannot be greater than max_kcal", { status: 400 });
  }

  const collection = collectionRaw ? (collectionRaw as PublicRecipeCollection) : null;
  const sort = sortRaw as PublicRecipeSort;
  const order = orderRaw as PublicRecipeOrder;

  const response = await listPublicApiRecipes({
    q: q || undefined,
    collection,
    category: (searchParams.get("category") ?? "").trim() || null,
    subcategory: (searchParams.get("subcategory") ?? "").trim() || null,
    includeAllergens,
    excludeAllergens,
    minKcal,
    maxKcal,
    maxSaltG,
    page,
    pageSize,
    sort,
    order,
  });

  return jsonSuccess(response, {
    cacheControl: PUBLIC_API_LIST_CACHE_CONTROL,
  });
}
