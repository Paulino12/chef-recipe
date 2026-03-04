import { type RecipeCollection, normalizeCollection } from "@/lib/recipes";
import { getSanityWriteClients, sanityServer } from "@/lib/sanity/serverClient";

export const ADMIN_AUDIENCES = ["public", "enterprise"] as const;
export type AdminAudience = (typeof ADMIN_AUDIENCES)[number];
export const ADMIN_PAGE_SIZES = [10, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];
export type AdminImageFilter = "with" | "without";
export type AdminVisibilityFilter =
  | "public_on"
  | "public_off"
  | "enterprise_on"
  | "enterprise_off"
  | "any_on"
  | "both_off";

export type AdminRecipesResult = {
  items: AdminRecipeRow[];
  total: number;
  page: number;
  pageSize: AdminPageSize;
  totalPages: number;
  categories: AdminCategoryOption[];
  collections: AdminCollectionOption[];
};

export type AdminRecipeRow = {
  id: string;
  pluNumber: number;
  title: string;
  collection: RecipeCollection;
  imageUrl?: string;
  categoryPath?: string[];
  portions: number | null;
  visibility?: {
    public?: boolean;
    enterprise?: boolean;
  };
};

export type AdminCategoryOption = {
  name: string;
  value: string;
  count: number;
};

export type AdminCollectionOption = {
  name: RecipeCollection;
  count: number;
};

type RelationRecipeRow = {
  id: string;
  title: string;
  collection: RecipeCollection;
  ingredients?: Array<{ item?: string; text?: string }>;
};

type TitleIndexRow = {
  id: string;
  collection: RecipeCollection;
  norm: string;
};

type RelationGraph = {
  adjacency: Map<string, Set<string>>;
};

const RELATION_GRAPH_CACHE_TTL_MS = 5 * 60 * 1000;
let relationGraphCache:
  | {
      promise: Promise<RelationGraph>;
      expiresAt: number;
    }
  | null = null;

const COLLECTION_FILTER = '(!defined($collection) || coalesce(collection, "Dining") == $collection)';
const IMAGE_FILTER = `
  (
    !defined($imageFilter) ||
    (
      $imageFilter == "with" &&
      (
        defined(image.asset) ||
        (
          defined(imageUrl) &&
          imageUrl != "" &&
          imageUrl != "/recipe-placeholder.svg"
        )
      )
    ) ||
    (
      $imageFilter == "without" &&
      !defined(image.asset) &&
      (
        !defined(imageUrl) ||
        imageUrl == "" ||
        imageUrl == "/recipe-placeholder.svg"
      )
    )
  )
`;
const VISIBILITY_FILTER = `
  (
    !defined($visibilityFilter) ||
    ($visibilityFilter == "public_on" && coalesce(visibility.public, false) == true) ||
    ($visibilityFilter == "public_off" && coalesce(visibility.public, false) == false) ||
    ($visibilityFilter == "enterprise_on" && coalesce(visibility.enterprise, false) == true) ||
    ($visibilityFilter == "enterprise_off" && coalesce(visibility.enterprise, false) == false) ||
    ($visibilityFilter == "any_on" && (coalesce(visibility.public, false) == true || coalesce(visibility.enterprise, false) == true)) ||
    ($visibilityFilter == "both_off" && coalesce(visibility.public, false) == false && coalesce(visibility.enterprise, false) == false)
  )
`;

const ADMIN_RECIPES_COUNT_QUERY = `
  count(
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      ${COLLECTION_FILTER} &&
      ${IMAGE_FILTER} &&
      ${VISIBILITY_FILTER} &&
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

const ADMIN_RECIPES_ITEMS_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    ${COLLECTION_FILTER} &&
    ${IMAGE_FILTER} &&
    ${VISIBILITY_FILTER} &&
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
    title,
    "collection": coalesce(collection, "Dining"),
    "imageUrl": coalesce(image.asset->url, imageUrl, "/recipe-placeholder.svg"),
    categoryPath,
    portions,
    visibility
  }
`;

const ADMIN_RECIPE_CATEGORIES_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    ${COLLECTION_FILTER} &&
    ${IMAGE_FILTER} &&
    ${VISIBILITY_FILTER} &&
    defined(categoryPath[0]) &&
    string(categoryPath[0]) != ""
  ]{
    categoryPath
  }
`;

const ADMIN_RECIPE_COLLECTIONS_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**"))
  ]{
    "collection": coalesce(collection, "Dining")
  }
`;

const ADMIN_RELATION_GRAPH_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**"))
  ]{
    "id": _id,
    title,
    "collection": coalesce(collection, "Dining"),
    ingredients[]{ item, text }
  }
`;

const ADMIN_VISIBILITY_ROWS_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    _id in $ids
  ]{
    "id": _id,
    visibility
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

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function consonantSignature(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/[aeiou]/g, "");
}

function tokensRoughlyMatch(labelToken: string, titleToken: string) {
  if (!labelToken || !titleToken) return false;
  if (labelToken === titleToken) return true;
  if (titleToken.startsWith(labelToken) || labelToken.startsWith(titleToken)) return true;
  if (titleToken.includes(labelToken) || labelToken.includes(titleToken)) return true;

  const labelSignature = consonantSignature(labelToken);
  const titleSignature = consonantSignature(titleToken);
  if (!labelSignature || !titleSignature) return false;

  if (labelSignature === titleSignature) return true;
  if (labelSignature.length <= 3 && titleSignature.startsWith(labelSignature)) return true;
  if (titleSignature.length <= 3 && labelSignature.startsWith(titleSignature)) return true;

  return false;
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
    const found = titleTokens.some((titleToken) => tokensRoughlyMatch(labelToken, titleToken));
    if (found) matched += 1;
  }

  const ratio = matched / labelTokens.length;
  if (ratio >= 0.9) return 78;
  if (ratio >= 0.75) return 72;
  if (ratio >= 0.6) return 68;
  return 0;
}

function extractPtnReference(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/\bPTN\b\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim() || "";
  return token || null;
}

function collectPtnLabels(ingredients?: Array<{ item?: string; text?: string }>) {
  if (!ingredients?.length) return [];
  const labels = new Set<string>();
  for (const ingredient of ingredients) {
    const fromItem = extractPtnReference(ingredient.item);
    const fromText = extractPtnReference(ingredient.text);
    if (fromItem) labels.add(fromItem);
    if (fromText) labels.add(fromText);
  }
  return [...labels];
}

function resolveLabelTargetId(label: string, titles: TitleIndexRow[], collection: RecipeCollection) {
  const labelNorm = normalizeComparableText(label);
  if (!labelNorm) return null;

  let bestId: string | null = null;
  let bestScore = 0;
  for (const row of titles) {
    if (row.collection !== collection) continue;
    const score = scoreTitleMatch(labelNorm, row.norm);
    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
    }
  }

  return bestScore >= 72 ? bestId : null;
}

async function buildRelationGraph() {
  const rows = await sanityServer.fetch<RelationRecipeRow[]>(ADMIN_RELATION_GRAPH_QUERY);
  if (!rows.length) {
    return { adjacency: new Map<string, Set<string>>() };
  }

  const titles: TitleIndexRow[] = rows.map((row) => ({
    id: row.id,
    collection: row.collection,
    norm: normalizeComparableText(row.title || ""),
  }));

  const adjacency = new Map<string, Set<string>>();
  for (const row of rows) adjacency.set(row.id, new Set());

  const labelTargetCache = new Map<string, string | null>();

  for (const row of rows) {
    const labels = collectPtnLabels(row.ingredients);
    if (!labels.length) continue;

    for (const label of labels) {
      const cacheKey = `${row.collection}::${label}`;
      if (!labelTargetCache.has(cacheKey)) {
        labelTargetCache.set(cacheKey, resolveLabelTargetId(label, titles, row.collection));
      }
      const targetId = labelTargetCache.get(cacheKey);
      if (!targetId || targetId === row.id) continue;

      adjacency.get(row.id)?.add(targetId);
      adjacency.get(targetId)?.add(row.id);
    }
  }

  return { adjacency };
}

async function getRelationGraph() {
  const now = Date.now();
  if (relationGraphCache && relationGraphCache.expiresAt > now) {
    return relationGraphCache.promise;
  }

  const promise = buildRelationGraph();
  relationGraphCache = {
    promise,
    expiresAt: now + RELATION_GRAPH_CACHE_TTL_MS,
  };
  return promise;
}

async function resolveRelatedRecipeIds(seedIds: string[]) {
  const uniqueSeeds = [...new Set(seedIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueSeeds.length) return [];

  const { adjacency } = await getRelationGraph();
  if (!adjacency.size) return [];

  const visited = new Set<string>();
  const queue: string[] = [];
  for (const seed of uniqueSeeds) {
    if (!adjacency.has(seed) || visited.has(seed)) continue;
    visited.add(seed);
    queue.push(seed);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbours = adjacency.get(current);
    if (!neighbours) continue;
    for (const next of neighbours) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return [...visited];
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function patchRecipesVisibility(
  updates: Array<{ id: string; nextVisibility: { public: boolean; enterprise: boolean } }>,
) {
  const writeClients = getSanityWriteClients();
  let sawHostMismatch = false;
  let sawPermissionFailure = false;
  const attemptedSources: string[] = [];
  const batches = chunkArray(updates, 50);

  for (const { source, client } of writeClients) {
    attemptedSources.push(source);
    try {
      for (const batch of batches) {
        let transaction = client.transaction();
        for (const update of batch) {
          transaction = transaction.patch(update.id, {
            set: {
              "visibility.public": update.nextVisibility.public,
              "visibility.enterprise": update.nextVisibility.enterprise,
            },
          });
        }
        await transaction.commit();
      }
      return;
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

function assertWriteTokenConfigured() {
  if (
    !process.env.SANITY_API_WRITE_TOKEN &&
    !process.env.SANITY_API_TOKEN &&
    !process.env.SANITY_API_READ_TOKEN
  ) {
    throw new Error(
      "Missing Sanity API token for updates. Set SANITY_API_WRITE_TOKEN, SANITY_API_TOKEN, or SANITY_API_READ_TOKEN.",
    );
  }
}

export async function listAdminCollections() {
  const rows = await sanityServer.fetch<Array<{ collection?: string }>>(ADMIN_RECIPE_COLLECTIONS_QUERY);
  const counts = new Map<RecipeCollection, number>();
  for (const row of rows) {
    const collection = normalizeCollection(row.collection) ?? "Dining";
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
  }
  return (["Dining", "Hospitality"] as const).map((name) => ({
    name,
    count: counts.get(name) ?? 0,
  }));
}

export async function listAdminCategories(
  collection?: RecipeCollection | null,
  imageFilter?: AdminImageFilter | null,
  visibilityFilter?: AdminVisibilityFilter | null,
) {
  const rows = await sanityServer.fetch<Array<{ categoryPath?: string[] }>>(ADMIN_RECIPE_CATEGORIES_QUERY, {
    collection: normalizeCollection(collection),
    imageFilter: imageFilter === "with" || imageFilter === "without" ? imageFilter : null,
    visibilityFilter:
      visibilityFilter &&
      [
        "public_on",
        "public_off",
        "enterprise_on",
        "enterprise_off",
        "any_on",
        "both_off",
      ].includes(visibilityFilter)
        ? visibilityFilter
        : null,
  });
  const counts = new Map<string, AdminCategoryOption>();
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

export async function listAdminRecipes(
  query?: string,
  options?: {
    page?: number;
    pageSize?: number;
    category?: string;
    collection?: RecipeCollection | null;
    imageFilter?: AdminImageFilter | null;
    visibilityFilter?: AdminVisibilityFilter | null;
  },
): Promise<AdminRecipesResult> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const categoryPath = splitCategoryPath(category);
  const collection = normalizeCollection(options?.collection);
  const imageFilter = options?.imageFilter === "with" || options?.imageFilter === "without"
    ? options.imageFilter
    : null;
  const visibilityFilter =
    options?.visibilityFilter &&
    [
      "public_on",
      "public_off",
      "enterprise_on",
      "enterprise_off",
      "any_on",
      "both_off",
    ].includes(options.visibilityFilter)
      ? options.visibilityFilter
      : null;
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const params = {
    q: q ? `*${q}*` : null,
    categoryPath: categoryPath.length ? categoryPath : null,
    collection,
    imageFilter,
    visibilityFilter,
  };
  const totalRaw = await sanityServer.fetch<number>(ADMIN_RECIPES_COUNT_QUERY, params);
  const total = Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const start = (resolvedPage - 1) * pageSize;
  const end = start + pageSize;
  const [categories, collections, items] = await Promise.all([
    listAdminCategories(collection, imageFilter, visibilityFilter),
    listAdminCollections(),
    sanityServer.fetch<AdminRecipeRow[]>(ADMIN_RECIPES_ITEMS_QUERY, {
      ...params,
      start,
      end,
    }),
  ]);

  return {
    items,
    total,
    page: resolvedPage,
    pageSize,
    totalPages,
    categories,
    collections,
  };
}

export async function setRecipesVisibility(
  seedIds: string[],
  audience: AdminAudience,
  value: boolean,
  options?: { includeRelated?: boolean },
) {
  assertWriteTokenConfigured();

  const uniqueSeedIds = [...new Set(seedIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueSeedIds.length) {
    return { updatedIds: [] as string[], relatedIds: [] as string[] };
  }

  const includeRelated = Boolean(options?.includeRelated);
  const relatedIds = includeRelated
    ? await resolveRelatedRecipeIds(uniqueSeedIds)
    : uniqueSeedIds;
  if (!relatedIds.length) {
    return { updatedIds: [] as string[], relatedIds: [] as string[] };
  }

  const currentRows = await sanityServer.fetch<
    Array<{ id: string; visibility?: { public?: boolean; enterprise?: boolean } }>
  >(ADMIN_VISIBILITY_ROWS_QUERY, { ids: relatedIds });
  if (!currentRows.length) {
    return { updatedIds: [] as string[], relatedIds };
  }

  const updatedIds: string[] = [];
  const updates: Array<{ id: string; nextVisibility: { public: boolean; enterprise: boolean } }> = [];
  for (const row of currentRows) {
    const nextVisibility = {
      public: Boolean(row.visibility?.public),
      enterprise: Boolean(row.visibility?.enterprise),
      [audience]: value,
    };
    updates.push({ id: row.id, nextVisibility });
    updatedIds.push(row.id);
  }

  await patchRecipesVisibility(updates);

  return { updatedIds, relatedIds };
}
