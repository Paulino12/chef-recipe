import { sanity } from "@/lib/sanity/client";
import { RECIPES_LIST_QUERY, RECIPE_BY_ID_QUERY } from "@/lib/sanity/queries";
import {
  type RecipeNutritionMeta,
  type RecipeNutritionValue,
} from "@/lib/recipeNutrition";

export type AllergenStatus = "contains" | "may_contain" | "none";

export type AllergenSlug =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soya"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export const RECIPE_COLLECTIONS = ["Dining", "Hospitality"] as const;
export type RecipeCollection = (typeof RECIPE_COLLECTIONS)[number];

export type Recipe = {
  id: string;
  pluNumber: number;
  collection: RecipeCollection;
  imageUrl?: string;
  title: string;
  categoryPath: string[];
  portions: number | null;
  ingredients: Array<{
    text: string;
    qty: number | null;
    unit: string | null;
    item: string | null;
  }>;
  method: {
    steps: Array<{ number: number; text: string }>;
    text: string;
  };
  allergens: Record<AllergenSlug, AllergenStatus>;
  nutrition?: RecipeNutritionValue | null;
  nutritionMeta?: RecipeNutritionMeta | null;
  portionNetWeightG: number | null;
  visibility: { enterprise: boolean; public: boolean };
  source?: { pdfPath: string };
};

export const PUBLIC_PAGE_SIZES = [10, 50, 100] as const;
export type PublicPageSize = (typeof PUBLIC_PAGE_SIZES)[number];
export type RecipeAudienceFilter = "public" | "enterprise" | "all";

export type PublicRecipeCard = {
  id: string;
  pluNumber: number;
  collection: RecipeCollection;
  imageUrl?: string;
  title: string;
  categoryPath?: string[];
  allergens?: Partial<Record<AllergenSlug, AllergenStatus>>;
  portions: number | null;
  nutrition?: {
    per100g?: Record<string, number>;
  };
  nutritionMeta?: RecipeNutritionMeta | null;
  visibility?: {
    public?: boolean;
    enterprise?: boolean;
  };
};

export type RelatedRecipeCard = Pick<
  PublicRecipeCard,
  "id" | "pluNumber" | "collection" | "imageUrl" | "title" | "categoryPath" | "visibility"
>;

export type PublicRecipesResult = {
  items: PublicRecipeCard[];
  total: number;
  page: number;
  pageSize: PublicPageSize;
  totalPages: number;
};

export type RecipeCategoryOption = {
  name: string;
  value: string;
  count: number;
};

const ALLERGEN_LABELS: Record<AllergenSlug, string> = {
  gluten: "Gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  peanuts: "Peanuts",
  soya: "Soya",
  milk: "Milk",
  nuts: "Nuts",
  celery: "Celery",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
};

type RecipeTitleRow = {
  id: string;
  title: string;
  pluNumber: number;
};

export type SubRecipeTarget = {
  id: string;
  title: string;
  pluNumber: number;
  directMatch: boolean;
};

function visibilityPredicate(audience: RecipeAudienceFilter) {
  switch (audience) {
    case "public":
      return "coalesce(visibility.public, false) == true";
    case "enterprise":
      return "coalesce(visibility.enterprise, false) == true";
    case "all":
      return "(coalesce(visibility.public, false) == true || coalesce(visibility.enterprise, false) == true)";
  }
}

function normalizePage(value: number | undefined) {
  const page = Number.isFinite(value) ? Math.floor(value ?? 1) : 1;
  return page > 0 ? page : 1;
}

function normalizePageSize(value: number | undefined): PublicPageSize {
  if (value === 50 || value === 100) return value;
  return 10;
}

function normalizeCategory(value?: string | null) {
  const category = value?.trim();
  return category ? category : null;
}

function splitCategoryPath(value?: string | null) {
  const category = normalizeCategory(value);
  if (!category) return [] as string[];
  return category
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeCollection(value?: string | null): RecipeCollection | null {
  if (value === "Dining" || value === "Hospitality") return value;
  return null;
}

function normalizeRecipeIds(values?: string[]) {
  if (!values?.length) return null;
  const ids = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : null;
}

function normalizeCategoryPathArray(value?: string[] | null) {
  if (!value?.length) return [] as string[];
  return value.map((part) => part?.trim()).filter(Boolean);
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function shuffleArray<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function scoreTitleMatch(labelNorm: string, titleNorm: string) {
  if (!labelNorm || !titleNorm) return 0;
  if (titleNorm === labelNorm) return 120;
  if (titleNorm.startsWith(labelNorm)) return 110;
  if (labelNorm.startsWith(titleNorm)) return 95;
  if (titleNorm.includes(labelNorm)) return 85;

  const labelTokens = labelNorm.split(" ").filter(Boolean);
  const titleTokens = titleNorm.split(" ").filter(Boolean);
  if (!labelTokens.length || !titleTokens.length) return 0;

  let matched = 0;
  for (const labelToken of labelTokens) {
    const found = titleTokens.some(
      (titleToken) =>
        titleToken.startsWith(labelToken) || labelToken.startsWith(titleToken),
    );
    if (found) matched += 1;
  }

  const ratio = matched / labelTokens.length;
  if (ratio >= 0.9) return 78;
  if (ratio >= 0.75) return 72;
  if (ratio >= 0.6) return 68;
  return 0;
}

export async function getAllRecipes() {
  return sanity.fetch(RECIPES_LIST_QUERY);
}

export async function searchRecipes(query: string) {
  const q = query.trim();
  if (!q) return getAllRecipes();

  const SEARCH_QUERY = `
    *[
      _type == "recipe" &&
      title match $q
    ] | order(title asc, _id asc) {
      "id": _id,
      pluNumber,
      "collection": coalesce(collection, "Dining"),
      "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
      title,
      categoryPath,
      portions,
      allergens,
      nutrition,
      nutritionMeta,
      visibility
    }
  `;
  return sanity.fetch(SEARCH_QUERY, { q: `*${q}*` });
}

export async function listPublicRecipes(
  query?: string,
  options?: { page?: number; pageSize?: number; collection?: RecipeCollection | null },
): Promise<PublicRecipesResult> {
  return listAccessibleRecipes("public", query, options);
}

/**
 * Returns only the total count for a given audience/query combination.
 */
export async function countAccessibleRecipes(
  audience: RecipeAudienceFilter,
  query?: string,
  options?: { category?: string; recipeIds?: string[]; collection?: RecipeCollection | null },
): Promise<number> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const categoryPath = splitCategoryPath(category);
  const recipeIds = normalizeRecipeIds(options?.recipeIds);
  const collection = normalizeCollection(options?.collection);
  const visibility = visibilityPredicate(audience);
  const qParam = q ? `*${q}*` : null;
  const countQuery = `
    count(
      *[
        _type == "recipe" &&
        ${visibility} &&
        (!defined($recipeIds) || _id in $recipeIds) &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
        (
          !defined($categoryPath) ||
          (
            count($categoryPath) == 1 &&
            defined(categoryPath[0]) &&
            categoryPath[0] == $categoryPath[0]
          ) ||
          (
            count($categoryPath) == 2 &&
            defined(categoryPath[0]) &&
            defined(categoryPath[1]) &&
            categoryPath[0] == $categoryPath[0] &&
            categoryPath[1] == $categoryPath[1]
          )
        ) &&
        (!defined($q) || title match $q)
      ]
    )
  `;
  const totalRaw = await sanity.fetch<number>(countQuery, {
    q: qParam,
    categoryPath: categoryPath.length ? categoryPath : null,
    recipeIds,
    collection,
  });
  return Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
}

/**
 * Shared listing for signed-in recipe browsing where audience can be public, enterprise, or both.
 */
export async function listAccessibleRecipes(
  audience: RecipeAudienceFilter,
  query?: string,
  options?: {
    page?: number;
    pageSize?: number;
    category?: string;
    recipeIds?: string[];
    collection?: RecipeCollection | null;
  },
): Promise<PublicRecipesResult> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const categoryPath = splitCategoryPath(category);
  const recipeIds = normalizeRecipeIds(options?.recipeIds);
  const collection = normalizeCollection(options?.collection);
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const params = {
    q: q ? `*${q}*` : null,
    categoryPath: categoryPath.length ? categoryPath : null,
    recipeIds,
    collection,
  };
  const visibility = visibilityPredicate(audience);
  const countQuery = `
    count(
      *[
        _type == "recipe" &&
        ${visibility} &&
        (!defined($recipeIds) || _id in $recipeIds) &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
        (
          !defined($categoryPath) ||
          (
            count($categoryPath) == 1 &&
            defined(categoryPath[0]) &&
            categoryPath[0] == $categoryPath[0]
          ) ||
          (
            count($categoryPath) == 2 &&
            defined(categoryPath[0]) &&
            defined(categoryPath[1]) &&
            categoryPath[0] == $categoryPath[0] &&
            categoryPath[1] == $categoryPath[1]
          )
        ) &&
        (!defined($q) || title match $q)
      ]
    )
  `;
  const itemsQuery = `
    *[
      _type == "recipe" &&
      ${visibility} &&
      (!defined($recipeIds) || _id in $recipeIds) &&
      (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
      (
        !defined($categoryPath) ||
        (
          count($categoryPath) == 1 &&
          defined(categoryPath[0]) &&
          categoryPath[0] == $categoryPath[0]
        ) ||
        (
          count($categoryPath) == 2 &&
          defined(categoryPath[0]) &&
          defined(categoryPath[1]) &&
          categoryPath[0] == $categoryPath[0] &&
          categoryPath[1] == $categoryPath[1]
        )
      ) &&
      (!defined($q) || title match $q)
    ] | order(title asc, _id asc)[$start...$end] {
      "id": _id,
      pluNumber,
      "collection": coalesce(collection, "Dining"),
      "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
      title,
      categoryPath,
      portions,
      allergens,
      nutrition,
      nutritionMeta,
      visibility
    }
  `;

  const totalRaw = await sanity.fetch<number>(countQuery, params);
  const total = Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const start = (resolvedPage - 1) * pageSize;
  const end = start + pageSize;

  const items = await sanity.fetch<PublicRecipeCard[]>(itemsQuery, {
    ...params,
    start,
    end,
  });

  return {
    items,
    total,
    page: resolvedPage,
    pageSize,
    totalPages,
  };
}

/**
 * Returns only allergens marked as "contains".
 * "may_contain" and "none" are intentionally excluded from display.
 */
export function listContainedAllergenLabels(allergens: unknown) {
  if (!allergens || typeof allergens !== "object") return [] as string[];
  const record = allergens as Partial<Record<AllergenSlug, AllergenStatus>>;
  const labels: string[] = [];
  for (const slug of Object.keys(ALLERGEN_LABELS) as AllergenSlug[]) {
    if (record[slug] === "contains") {
      labels.push(ALLERGEN_LABELS[slug]);
    }
  }
  return labels;
}

export async function getRecipeById(id: string) {
  return sanity.fetch(RECIPE_BY_ID_QUERY, { id });
}

/**
 * Loads a single recipe only when it belongs to the selected audience scope.
 */
export async function getAccessibleRecipeById(id: string, audience: RecipeAudienceFilter) {
  const visibility = visibilityPredicate(audience);
  const query = `
    *[
      _type == "recipe" &&
      _id == $id &&
      ${visibility}
    ][0]{
      "id": _id,
      pluNumber,
      "collection": coalesce(collection, "Dining"),
      "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
      title,
      categoryPath,
      portions,
      ingredients[]{ text, qty, unit, item },
      method,
      allergens,
      nutrition,
      nutritionMeta,
      "portionNetWeightG": nutrition.portionNetWeightG,
      visibility
    }
  `;
  return sanity.fetch(query, { id });
}

/**
 * Category options for recipes filter dropdown in web app.
 */
export async function listAccessibleCategories(
  audience: RecipeAudienceFilter,
  options?: { recipeIds?: string[]; collection?: RecipeCollection | null },
) {
  const recipeIds = normalizeRecipeIds(options?.recipeIds);
  const collection = normalizeCollection(options?.collection);
  const query = `
    *[
      _type == "recipe" &&
      ${visibilityPredicate(audience)} &&
      (!defined($recipeIds) || _id in $recipeIds) &&
      (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
      defined(categoryPath[0]) &&
      string(categoryPath[0]) != ""
    ]{
      categoryPath
    }
  `;
  const rows = await sanity.fetch<Array<{ categoryPath?: string[] }>>(query, { recipeIds, collection });
  const counts = new Map<string, RecipeCategoryOption>();
  for (const row of rows) {
    const parts = Array.isArray(row.categoryPath)
      ? row.categoryPath.map((part) => part?.trim()).filter(Boolean)
      : [];
    if (!parts.length) continue;

    const topValue = parts[0]!;
    const topEntry = counts.get(topValue);
    if (topEntry) {
      topEntry.count += 1;
    } else {
      counts.set(topValue, { name: topValue, value: topValue, count: 1 });
    }

    if (parts.length > 1) {
      const nestedValue = `${parts[0]} / ${parts[1]}`;
      const nestedEntry = counts.get(nestedValue);
      if (nestedEntry) {
        nestedEntry.count += 1;
      } else {
        counts.set(nestedValue, { name: nestedValue, value: nestedValue, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the PTN sub-recipe token from ingredient text when present, e.g.
 * "10 PTN Pickled Red Onio" -> "Pickled Red Onio".
 */
export function extractPtnReference(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/\bPTN\b\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim() || "";
  return token || null;
}

/**
 * Resolves PTN labels to recipe document ids for clickable sub-recipe navigation.
 * Uses best-effort fuzzy matching; unresolved labels should fall back to search links.
 */
export async function findSubRecipeTargets(
  labels: string[],
  options: { audience: RecipeAudienceFilter; includeAll: boolean; collection?: RecipeCollection | null },
): Promise<Record<string, SubRecipeTarget | null>> {
  const uniqueLabels = [...new Set(labels.map((x) => x.trim()).filter(Boolean))];
  if (!uniqueLabels.length) return {};

  const collection = normalizeCollection(options.collection);
  const query = options.includeAll
    ? `
      *[
        _type == "recipe" &&
        !(_id in path("drafts.**")) &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection)
      ]{
        "id": _id,
        title,
        pluNumber
      }
    `
    : `
      *[
        _type == "recipe" &&
        !(_id in path("drafts.**")) &&
        ${visibilityPredicate(options.audience)} &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection)
      ]{
        "id": _id,
        title,
        pluNumber
      }
    `;

  const rows = await sanity.fetch<RecipeTitleRow[]>(query, { collection });
  const normalizedRows = rows.map((row) => ({
    ...row,
    norm: normalizeComparableText(row.title || ""),
  }));

  const result: Record<string, SubRecipeTarget | null> = {};

  for (const label of uniqueLabels) {
    const labelNorm = normalizeComparableText(label);
    if (!labelNorm) {
      result[label] = null;
      continue;
    }

    let best: SubRecipeTarget | null = null;
    let bestScore = 0;

    for (const row of normalizedRows) {
      const score = scoreTitleMatch(labelNorm, row.norm);
      if (score > bestScore) {
        bestScore = score;
        best = {
          id: row.id,
          title: row.title,
          pluNumber: row.pluNumber,
          directMatch: score >= 72,
        };
      }
    }

    result[label] = bestScore >= 60 ? best : null;
  }

  return result;
}

async function fetchRecipeCardsByIds(
  ids: string[],
  options: {
    audience: RecipeAudienceFilter;
    includeAll: boolean;
    collection?: RecipeCollection | null;
  },
): Promise<RelatedRecipeCard[]> {
  const recipeIds = normalizeRecipeIds(ids);
  if (!recipeIds?.length) return [];

  const collection = normalizeCollection(options.collection);
  const query = options.includeAll
    ? `
      *[
        _type == "recipe" &&
        _id in $recipeIds &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection)
      ]{
        "id": _id,
        pluNumber,
        "collection": coalesce(collection, "Dining"),
        "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
        title,
        categoryPath,
        visibility
      }
    `
    : `
      *[
        _type == "recipe" &&
        _id in $recipeIds &&
        ${visibilityPredicate(options.audience)} &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection)
      ]{
        "id": _id,
        pluNumber,
        "collection": coalesce(collection, "Dining"),
        "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
        title,
        categoryPath,
        visibility
      }
    `;

  const rows = await sanity.fetch<RelatedRecipeCard[]>(query, { recipeIds, collection });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return recipeIds.map((id) => byId.get(id)).filter((row): row is RelatedRecipeCard => Boolean(row));
}

export async function listRelatedRecipesInCategory(options: {
  audience: RecipeAudienceFilter;
  includeAll: boolean;
  collection?: RecipeCollection | null;
  categoryPath?: string[] | null;
  excludeIds?: string[];
  limit?: number;
}): Promise<RelatedRecipeCard[]> {
  const collection = normalizeCollection(options.collection);
  const categoryPath = normalizeCategoryPathArray(options.categoryPath);
  if (!categoryPath.length) return [];

  const excludeIds = normalizeRecipeIds(options.excludeIds);
  const limit = Math.max(1, Math.min(options.limit ?? 5, 24));
  const [category0, category1] = categoryPath;
  const query = options.includeAll
    ? `
      *[
        _type == "recipe" &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
        (!defined($excludeIds) || !(_id in $excludeIds)) &&
        defined(categoryPath[0]) &&
        categoryPath[0] == $category0 &&
        (!defined($category1) || (defined(categoryPath[1]) && categoryPath[1] == $category1))
      ] | order(title asc, _id asc)[0...$limit]{
        "id": _id,
        pluNumber,
        "collection": coalesce(collection, "Dining"),
        "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
        title,
        categoryPath,
        visibility
      }
    `
    : `
      *[
        _type == "recipe" &&
        ${visibilityPredicate(options.audience)} &&
        (!defined($collection) || coalesce(collection, "Dining") == $collection) &&
        (!defined($excludeIds) || !(_id in $excludeIds)) &&
        defined(categoryPath[0]) &&
        categoryPath[0] == $category0 &&
        (!defined($category1) || (defined(categoryPath[1]) && categoryPath[1] == $category1))
      ] | order(title asc, _id asc)[0...$limit]{
        "id": _id,
        pluNumber,
        "collection": coalesce(collection, "Dining"),
        "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
        title,
        categoryPath,
        visibility
      }
    `;

  return sanity.fetch<RelatedRecipeCard[]>(query, {
    collection,
    excludeIds,
    category0,
    category1: category1 ?? null,
    limit,
  });
}

export async function listRelatedRecipeCards(options: {
  audience: RecipeAudienceFilter;
  includeAll: boolean;
  collection?: RecipeCollection | null;
  categoryPath?: string[] | null;
  currentRecipeId: string;
  subRecipeIds?: string[];
  favoriteRecipeIds?: string[];
  limit?: number;
}): Promise<Array<RelatedRecipeCard & { reason: "subrecipe" | "favorite" | "category" }>> {
  const limit = Math.max(1, Math.min(options.limit ?? 5, 12));
  const selected: Array<RelatedRecipeCard & { reason: "subrecipe" | "favorite" | "category" }> = [];
  const selectedIds = new Set<string>([options.currentRecipeId]);

  const pushRows = (
    rows: RelatedRecipeCard[],
    reason: "subrecipe" | "favorite" | "category",
  ) => {
    for (const row of rows) {
      if (selected.length >= limit) break;
      if (selectedIds.has(row.id)) continue;
      selectedIds.add(row.id);
      selected.push({ ...row, reason });
    }
  };

  const subRecipeRows = await fetchRecipeCardsByIds(options.subRecipeIds ?? [], {
    audience: options.audience,
    includeAll: options.includeAll,
    collection: options.collection,
  });
  pushRows(shuffleArray(subRecipeRows), "subrecipe");

  if (selected.length < limit) {
    const favoriteRows = await fetchRecipeCardsByIds(options.favoriteRecipeIds ?? [], {
      audience: options.audience,
      includeAll: options.includeAll,
      collection: options.collection,
    });
    const categoryPath = normalizeCategoryPathArray(options.categoryPath);
    const filteredFavorites = categoryPath.length
      ? favoriteRows.filter((row) => {
          const rowPath = normalizeCategoryPathArray(row.categoryPath);
          if (!rowPath.length || rowPath[0] !== categoryPath[0]) return false;
          if (categoryPath[1]) return rowPath[1] === categoryPath[1];
          return true;
        })
      : favoriteRows;
    pushRows(shuffleArray(filteredFavorites), "favorite");
  }

  if (selected.length < limit) {
    const categoryRows = await listRelatedRecipesInCategory({
      audience: options.audience,
      includeAll: options.includeAll,
      collection: options.collection,
      categoryPath: options.categoryPath,
      excludeIds: [...selectedIds],
      limit: limit - selected.length,
    });
    pushRows(shuffleArray(categoryRows), "category");
  }

  return selected;
}
