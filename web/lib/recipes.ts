import { sanity } from "@/lib/sanity/client";
import { RECIPES_LIST_QUERY, RECIPE_BY_ID_QUERY } from "@/lib/sanity/queries";

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

export type Recipe = {
  id: string;
  pluNumber: number;
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
  nutrition: {
    portionNetWeightG: number | null;
    perServing: Record<string, number>;
    per100g: Record<string, number>;
    riPercent: Record<string, number>;
  };
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
  title: string;
  categoryPath?: string[];
  portions: number | null;
  nutrition?: {
    per100g?: Record<string, number>;
  };
  visibility?: {
    public?: boolean;
    enterprise?: boolean;
  };
};

export type PublicRecipesResult = {
  items: PublicRecipeCard[];
  total: number;
  page: number;
  pageSize: PublicPageSize;
  totalPages: number;
};

export type RecipeCategoryOption = {
  name: string;
  count: number;
};

type RecipeTitleRow = {
  id: string;
  title: string;
};

export type SubRecipeTarget = {
  id: string;
  title: string;
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

function normalizeCategory(value?: string) {
  const category = value?.trim();
  return category ? category : null;
}

function normalizeRecipeIds(values?: string[]) {
  if (!values?.length) return null;
  const ids = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : null;
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
    *[_type == "recipe" && title match $q] | order(title asc, _id asc) {
      "id": _id, pluNumber, title, categoryPath, portions, nutrition, visibility
    }
  `;
  return sanity.fetch(SEARCH_QUERY, { q: `*${q}*` });
}

export async function listPublicRecipes(
  query?: string,
  options?: { page?: number; pageSize?: number },
): Promise<PublicRecipesResult> {
  return listAccessibleRecipes("public", query, options);
}

/**
 * Returns only the total count for a given audience/query combination.
 */
export async function countAccessibleRecipes(
  audience: RecipeAudienceFilter,
  query?: string,
  options?: { category?: string; recipeIds?: string[] },
): Promise<number> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const recipeIds = normalizeRecipeIds(options?.recipeIds);
  const visibility = visibilityPredicate(audience);
  const countQuery = `
    count(
      *[
        _type == "recipe" &&
        ${visibility} &&
        (!defined($recipeIds) || _id in $recipeIds) &&
        (!defined($category) || $category in categoryPath) &&
        (!defined($q) || title match $q)
      ]
    )
  `;
  const totalRaw = await sanity.fetch<number>(countQuery, {
    q: q ? `*${q}*` : null,
    category,
    recipeIds,
  });
  return Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
}

/**
 * Shared listing for signed-in recipe browsing where audience can be public, enterprise, or both.
 */
export async function listAccessibleRecipes(
  audience: RecipeAudienceFilter,
  query?: string,
  options?: { page?: number; pageSize?: number; category?: string; recipeIds?: string[] },
): Promise<PublicRecipesResult> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const recipeIds = normalizeRecipeIds(options?.recipeIds);
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const params = { q: q ? `*${q}*` : null, category, recipeIds };
  const visibility = visibilityPredicate(audience);
  const countQuery = `
    count(
      *[
        _type == "recipe" &&
        ${visibility} &&
        (!defined($recipeIds) || _id in $recipeIds) &&
        (!defined($category) || $category in categoryPath) &&
        (!defined($q) || title match $q)
      ]
    )
  `;
  const itemsQuery = `
    *[
      _type == "recipe" &&
      ${visibility} &&
      (!defined($recipeIds) || _id in $recipeIds) &&
      (!defined($category) || $category in categoryPath) &&
      (!defined($q) || title match $q)
    ] | order(title asc, _id asc)[$start...$end] {
      "id": _id,
      pluNumber,
      title,
      categoryPath,
      portions,
      nutrition,
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
      title,
      categoryPath,
      portions,
      ingredients[]{ text, qty, unit, item },
      method,
      allergens,
      nutrition,
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
  options?: { recipeIds?: string[] },
) {
  const recipeIds = normalizeRecipeIds(options?.recipeIds);
  const query = `
    *[
      _type == "recipe" &&
      ${visibilityPredicate(audience)} &&
      (!defined($recipeIds) || _id in $recipeIds) &&
      defined(categoryPath[0]) &&
      string(categoryPath[0]) != ""
    ]{
      "category": categoryPath[0]
    }
  `;
  const rows = await sanity.fetch<Array<{ category?: string }>>(query, { recipeIds });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const category = row.category?.trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  options: { audience: RecipeAudienceFilter; includeAll: boolean },
): Promise<Record<string, SubRecipeTarget | null>> {
  const uniqueLabels = [...new Set(labels.map((x) => x.trim()).filter(Boolean))];
  if (!uniqueLabels.length) return {};

  const query = options.includeAll
    ? `
      *[
        _type == "recipe" &&
        !(_id in path("drafts.**"))
      ]{
        "id": _id,
        title
      }
    `
    : `
      *[
        _type == "recipe" &&
        !(_id in path("drafts.**")) &&
        ${visibilityPredicate(options.audience)}
      ]{
        "id": _id,
        title
      }
    `;

  const rows = await sanity.fetch<RecipeTitleRow[]>(query);
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
        best = { id: row.id, title: row.title };
      }
    }

    // Keep threshold conservative to avoid wrong direct links.
    result[label] = bestScore >= 72 ? best : null;
  }

  return result;
}
