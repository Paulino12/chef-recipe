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

export type PublicRecipeCard = {
  id: string;
  pluNumber: number;
  title: string;
  categoryPath?: string[];
  portions: number | null;
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

const PUBLIC_RECIPES_COUNT_QUERY = `
  count(
    *[
      _type == "recipe" &&
      (!defined($q) || title match $q)
    ]
  )
`;

const PUBLIC_RECIPES_ITEMS_QUERY = `
  *[
    _type == "recipe" &&
    (!defined($q) || title match $q)
  ] | order(title asc, _id asc)[$start...$end] {
    "id": _id,
    pluNumber,
    title,
    categoryPath,
    portions,
    visibility
  }
`;

function normalizePage(value: number | undefined) {
  const page = Number.isFinite(value) ? Math.floor(value ?? 1) : 1;
  return page > 0 ? page : 1;
}

function normalizePageSize(value: number | undefined): PublicPageSize {
  if (value === 50 || value === 100) return value;
  return 10;
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
  const q = query?.trim();
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const params = { q: q ? `*${q}*` : null };

  const totalRaw = await sanity.fetch<number>(PUBLIC_RECIPES_COUNT_QUERY, params);
  const total = Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const start = (resolvedPage - 1) * pageSize;
  const end = start + pageSize;

  const items = await sanity.fetch<PublicRecipeCard[]>(PUBLIC_RECIPES_ITEMS_QUERY, {
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
