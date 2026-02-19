import { getSanityWriteClients, sanityServer } from "@/lib/sanity/serverClient";

export const ADMIN_AUDIENCES = ["public", "enterprise"] as const;
export type AdminAudience = (typeof ADMIN_AUDIENCES)[number];
export const ADMIN_PAGE_SIZES = [10, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export type AdminRecipesResult = {
  items: AdminRecipeRow[];
  total: number;
  page: number;
  pageSize: AdminPageSize;
  totalPages: number;
  categories: AdminCategoryOption[];
};

export type AdminRecipeRow = {
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

export type AdminCategoryOption = {
  name: string;
  count: number;
};

const ADMIN_RECIPES_COUNT_QUERY = `
  count(
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      (!defined($category) || $category in categoryPath) &&
      (!defined($q) || title match $q)
    ]
  )
`;

const ADMIN_RECIPES_ITEMS_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    (!defined($category) || $category in categoryPath) &&
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

const ADMIN_RECIPE_CATEGORIES_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    defined(categoryPath[0]) &&
    string(categoryPath[0]) != ""
  ]{
    "category": categoryPath[0]
  }
`;

function normalizePage(value: number | undefined) {
  const page = Number.isFinite(value) ? Math.floor(value ?? 1) : 1;
  return page > 0 ? page : 1;
}

function normalizePageSize(value: number | undefined): AdminPageSize {
  if (value === 50 || value === 100) return value;
  return 10;
}

function normalizeCategory(value?: string) {
  const category = value?.trim();
  return category ? category : null;
}

export async function listAdminCategories() {
  const rows = await sanityServer.fetch<Array<{ category?: string }>>(ADMIN_RECIPE_CATEGORIES_QUERY);
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

export async function listAdminRecipes(
  query?: string,
  options?: { page?: number; pageSize?: number; category?: string },
): Promise<AdminRecipesResult> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const params = { q: q ? `*${q}*` : null, category };
  const totalRaw = await sanityServer.fetch<number>(ADMIN_RECIPES_COUNT_QUERY, params);
  const total = Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const start = (resolvedPage - 1) * pageSize;
  const end = start + pageSize;
  const categories = await listAdminCategories();
  const items = await sanityServer.fetch<AdminRecipeRow[]>(ADMIN_RECIPES_ITEMS_QUERY, {
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
    categories,
  };
}

export async function setRecipeVisibility(
  id: string,
  audience: AdminAudience,
  value: boolean,
) {
  if (
    !process.env.SANITY_API_WRITE_TOKEN &&
    !process.env.SANITY_API_TOKEN &&
    !process.env.SANITY_API_READ_TOKEN
  ) {
    throw new Error(
      "Missing Sanity API token for updates. Set SANITY_API_WRITE_TOKEN, SANITY_API_TOKEN, or SANITY_API_READ_TOKEN.",
    );
  }

  const recipeId = id.trim();
  if (!recipeId) return null;

  const current = await sanityServer.fetch<{
    id: string;
    visibility?: { public?: boolean; enterprise?: boolean };
  } | null>(
    `
      *[
        _type == "recipe" &&
        _id == $id &&
        !(_id in path("drafts.**"))
      ][0]{
        "id": _id,
        visibility
      }
    `,
    { id: recipeId },
  );

  if (!current) return null;

  const nextVisibility = {
    public: Boolean(current.visibility?.public),
    enterprise: Boolean(current.visibility?.enterprise),
    [audience]: value,
  };

  const writeClients = getSanityWriteClients();
  let sawHostMismatch = false;
  let sawPermissionFailure = false;
  const attemptedSources: string[] = [];

  for (const { source, client } of writeClients) {
    attemptedSources.push(source);
    try {
      await client
        .patch(recipeId)
        .set({
          "visibility.public": nextVisibility.public,
          "visibility.enterprise": nextVisibility.enterprise,
        })
        .commit();

      return {
        id: recipeId,
        visibility: nextVisibility,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("session does not match project host")) {
        sawHostMismatch = true;
        continue;
      }

      if (message.includes("insufficient permissions")) {
        sawPermissionFailure = true;
        continue;
      }

      throw error;
    }
  }

  if (sawPermissionFailure) {
    throw new Error(
      `Sanity token lacks update permission for recipe documents. Tried: ${attemptedSources.join(", ")}. Use a token with update grants (prefer SANITY_API_WRITE_TOKEN) and restart the dev server.`,
    );
  }

  if (sawHostMismatch) {
    const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "<missing-project-id>";
    throw new Error(
      `Sanity write token does not belong to project "${projectId}". Create a write token in that exact project and set SANITY_API_WRITE_TOKEN.`,
    );
  }

  throw new Error("Failed to update recipe visibility due to missing or invalid Sanity token.");
}
