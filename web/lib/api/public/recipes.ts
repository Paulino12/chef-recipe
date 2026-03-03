import { sanity } from "@/lib/sanity/client";
import {
  PUBLIC_API_ALLERGENS,
  PUBLIC_API_COLLECTIONS,
  parsePublicRecipeId,
  type PublicAllergenSlug,
  type PublicAllergenStatus,
  type PublicRecipeCollection,
  type PublicRecipeOrder,
  type PublicRecipeSort,
} from "@/lib/api/public/validation";

const ALLERGEN_OUTPUT_STATUSES = new Set(["contains", "may_contain", "none", "unknown"] as const);

export const PUBLIC_API_DEFAULT_PAGE_SIZE = 20;
export const PUBLIC_API_MAX_PAGE_SIZE = 50;
export const PUBLIC_API_LIST_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=86400";
export const PUBLIC_API_DETAIL_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";
export const PUBLIC_API_METADATA_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

type RawRecipeRow = {
  pluNumber?: unknown;
  title?: unknown;
  collection?: unknown;
  imageUrl?: unknown;
  categoryPath?: unknown;
  portions?: unknown;
  allergens?: unknown;
  nutrition?: unknown;
  updatedAt?: unknown;
};

type RawNutritionRecord = {
  portionNetWeightG?: unknown;
  perServing?: unknown;
  per100g?: unknown;
};

export type PublicRecipeListItem = {
  id: string;
  rn: number;
  title: string;
  collection: PublicRecipeCollection;
  category_path: string[];
  image_url: string | null;
  portions: number | null;
  allergens: Partial<Record<PublicAllergenSlug, PublicAllergenStatus>>;
  nutrition_summary: {
    kcal_per_serving: number | null;
    fat_g: number | null;
    sugars_g: number | null;
    salt_g: number | null;
  };
  updated_at: string | null;
};

export type PublicRecipeDetail = PublicRecipeListItem & {
  nutrition: {
    portion_net_weight_g: number | null;
    per_serving: {
      energy_kcal: number | null;
      energy_kj: number | null;
      fat_g: number | null;
      saturates_g: number | null;
      sugars_g: number | null;
      salt_g: number | null;
    };
    per_100g: {
      energy_kcal: number | null;
      energy_kj: number | null;
    };
  };
};

export type PublicRecipesListResult = {
  data: PublicRecipeListItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export type PublicRecipeQuery = {
  q?: string;
  collection?: PublicRecipeCollection | null;
  category?: string | null;
  subcategory?: string | null;
  includeAllergens: PublicAllergenSlug[];
  excludeAllergens: PublicAllergenSlug[];
  minKcal?: number | null;
  maxKcal?: number | null;
  maxSaltG?: number | null;
  page: number;
  pageSize: number;
  sort: PublicRecipeSort;
  order: PublicRecipeOrder;
};

type CategoryRow = {
  categoryPath?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asNumber(value: unknown) {
  return isFiniteNumber(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function normalizeCollection(value: unknown): PublicRecipeCollection {
  return value === "Hospitality" ? "Hospitality" : "Dining";
}

function normalizeAllergens(value: unknown): Partial<Record<PublicAllergenSlug, PublicAllergenStatus>> {
  if (!value || typeof value !== "object") return {};

  const output: Partial<Record<PublicAllergenSlug, PublicAllergenStatus>> = {};
  const source = value as Record<string, unknown>;

  for (const slug of PUBLIC_API_ALLERGENS) {
    const raw = source[slug];
    if (typeof raw !== "string") continue;
    const normalized = raw.trim().toLowerCase();
    if (ALLERGEN_OUTPUT_STATUSES.has(normalized as PublicAllergenStatus)) {
      output[slug] = normalized as PublicAllergenStatus;
    }
  }

  return output;
}

function normalizeIsoDate(value: unknown) {
  const input = asString(value);
  if (!input) return null;
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function readNumeric(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

function normalizeNutrition(value: unknown) {
  const source = (value ?? {}) as RawNutritionRecord;
  return {
    portion_net_weight_g: asNumber(source.portionNetWeightG),
    per_serving: {
      energy_kcal: readNumeric(source.perServing, ["energyKcal", "energy_kcal", "kcal"]),
      energy_kj: readNumeric(source.perServing, ["energyKj", "energy_kj", "kj"]),
      fat_g: readNumeric(source.perServing, ["fatG", "fat_g", "fat"]),
      saturates_g: readNumeric(source.perServing, ["saturatesG", "saturates_g", "saturates"]),
      sugars_g: readNumeric(source.perServing, ["sugarsG", "sugars_g", "sugars"]),
      salt_g: readNumeric(source.perServing, ["saltG", "salt_g", "salt"]),
    },
    per_100g: {
      energy_kcal: readNumeric(source.per100g, ["energyKcal", "energy_kcal", "kcal"]),
      energy_kj: readNumeric(source.per100g, ["energyKj", "energy_kj", "kj"]),
    },
  };
}

function toPublicId(rn: number) {
  return `rn_${rn}`;
}

function serializeListItem(row: RawRecipeRow): PublicRecipeListItem | null {
  const rn = asNumber(row.pluNumber);
  if (!rn) return null;

  const nutrition = normalizeNutrition(row.nutrition);
  return {
    id: toPublicId(rn),
    rn,
    title: asString(row.title) || `Recipe ${rn}`,
    collection: normalizeCollection(row.collection),
    category_path: asStringArray(row.categoryPath),
    image_url: asString(row.imageUrl) || null,
    portions: asNumber(row.portions),
    allergens: normalizeAllergens(row.allergens),
    nutrition_summary: {
      kcal_per_serving: nutrition.per_serving.energy_kcal,
      fat_g: nutrition.per_serving.fat_g,
      sugars_g: nutrition.per_serving.sugars_g,
      salt_g: nutrition.per_serving.salt_g,
    },
    updated_at: normalizeIsoDate(row.updatedAt),
  };
}

function serializeDetail(row: RawRecipeRow): PublicRecipeDetail | null {
  const base = serializeListItem(row);
  if (!base) return null;
  return {
    ...base,
    nutrition: normalizeNutrition(row.nutrition),
  };
}

function buildRecipeFilters(filters: PublicRecipeQuery) {
  const clauses = [
    '_type == "recipe"',
    '!(_id in path("drafts.**"))',
    "coalesce(visibility.public, false) == true",
  ];
  const params: Record<string, unknown> = {};

  if (filters.q) {
    clauses.push("title match $q");
    params.q = `*${filters.q}*`;
  }

  if (filters.collection) {
    clauses.push('coalesce(collection, "Dining") == $collection');
    params.collection = filters.collection;
  }

  if (filters.category) {
    clauses.push("defined(categoryPath[0]) && categoryPath[0] == $category");
    params.category = filters.category;
  }

  if (filters.subcategory) {
    clauses.push("defined(categoryPath[1]) && categoryPath[1] == $subcategory");
    params.subcategory = filters.subcategory;
  }

  for (const [index, allergen] of filters.includeAllergens.entries()) {
    clauses.push(`coalesce(allergens.${allergen}, "unknown") == $includeAllergen${index}`);
    params[`includeAllergen${index}`] = "contains";
  }

  for (const [index, allergen] of filters.excludeAllergens.entries()) {
    clauses.push(`coalesce(allergens.${allergen}, "unknown") != $excludeAllergen${index}`);
    params[`excludeAllergen${index}`] = "contains";
  }

  if (filters.minKcal !== null && filters.minKcal !== undefined) {
    clauses.push("defined(nutrition.perServing.energyKcal) && nutrition.perServing.energyKcal >= $minKcal");
    params.minKcal = filters.minKcal;
  }

  if (filters.maxKcal !== null && filters.maxKcal !== undefined) {
    clauses.push("defined(nutrition.perServing.energyKcal) && nutrition.perServing.energyKcal <= $maxKcal");
    params.maxKcal = filters.maxKcal;
  }

  if (filters.maxSaltG !== null && filters.maxSaltG !== undefined) {
    clauses.push("defined(nutrition.perServing.saltG) && nutrition.perServing.saltG <= $maxSaltG");
    params.maxSaltG = filters.maxSaltG;
  }

  return { clauses, params };
}

function sortExpression(sort: PublicRecipeSort, order: PublicRecipeOrder) {
  const direction = order === "desc" ? "desc" : "asc";
  switch (sort) {
    case "updated_at":
      return `_updatedAt ${direction}, pluNumber ${direction}`;
    case "rn":
      return `pluNumber ${direction}, title ${direction}`;
    case "title":
    default:
      return `title ${direction}, pluNumber asc`;
  }
}

function baseProjection() {
  return `{
    pluNumber,
    title,
    "collection": coalesce(collection, "Dining"),
    "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
    categoryPath,
    portions,
    allergens,
    nutrition,
    "updatedAt": _updatedAt
  }`;
}

export async function listPublicApiRecipes(filters: PublicRecipeQuery): Promise<PublicRecipesListResult> {
  const { clauses, params } = buildRecipeFilters(filters);
  const where = clauses.join(" && ");
  const totalQuery = `count(*[${where}])`;
  const totalRaw = await sanity.fetch<number>(totalQuery, params);
  const total = Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;
  const end = start + filters.pageSize;

  const itemsQuery = `
    *[${where}] | order(${sortExpression(filters.sort, filters.order)})[$start...$end]
    ${baseProjection()}
  `;

  const rows = await sanity.fetch<RawRecipeRow[]>(itemsQuery, {
    ...params,
    start,
    end,
  });

  return {
    data: rows.map(serializeListItem).filter((row): row is PublicRecipeListItem => Boolean(row)),
    pagination: {
      page,
      page_size: filters.pageSize,
      total,
      total_pages: totalPages,
    },
  };
}

export async function getPublicApiRecipeById(publicRecipeId: string) {
  const rn = parsePublicRecipeId(publicRecipeId);
  if (!rn) return null;

  const query = `
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      coalesce(visibility.public, false) == true &&
      pluNumber == $rn
    ][0]
    ${baseProjection()}
  `;

  const row = await sanity.fetch<RawRecipeRow | null>(query, { rn });
  if (!row) return null;
  return serializeDetail(row);
}

export async function listPublicApiCategories(collection?: PublicRecipeCollection | null) {
  const query = `
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      coalesce(visibility.public, false) == true &&
      (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
      defined(categoryPath[0]) &&
      string(categoryPath[0]) != ""
    ]{
      categoryPath
    }
  `;

  const rows = await sanity.fetch<CategoryRow[]>(query, {
    collection: collection ?? null,
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const parts = asStringArray(row.categoryPath);
    if (!parts.length) continue;

    const topLevel = parts[0]!;
    counts.set(topLevel, (counts.get(topLevel) ?? 0) + 1);

    if (parts[1]) {
      const nested = `${parts[0]} / ${parts[1]}`;
      counts.set(nested, (counts.get(nested) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export async function listPublicApiCollections() {
  const query = `
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      coalesce(visibility.public, false) == true
    ]{
      "collection": coalesce(collection, "Dining")
    }
  `;

  const rows = await sanity.fetch<Array<{ collection?: unknown }>>(query);
  const counts = new Map<PublicRecipeCollection, number>();
  for (const row of rows) {
    const collection = normalizeCollection(row.collection);
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
  }

  return PUBLIC_API_COLLECTIONS.map((value) => ({
    value,
    count: counts.get(value) ?? 0,
  }));
}
