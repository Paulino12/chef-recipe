import type { SanityClient } from "sanity";

import { apiVersion } from "../env";

export type CategoryPathOption = {
  label: string;
  parts: string[];
};

const RECIPE_WITH_HIGHEST_RN_QUERY = `
  *[
    _type == "recipe" &&
    defined(pluNumber) &&
    pluNumber >= $minRecipeNumber &&
    pluNumber <= $maxRecipeNumber
  ] | order(pluNumber desc)[0].pluNumber
`;

const RECIPE_CATEGORY_PATHS_QUERY = `
  *[_type == "recipe" && defined(categoryPath[0])]{ categoryPath }
`;

const DUPLICATE_RECIPE_NUMBER_QUERY = `
  count(*[
    _type == "recipe" &&
    pluNumber == $pluNumber &&
    !(_id in $excludedIds)
  ]) > 0
`;

const MIN_RECIPE_NUMBER = 12000000;
const MAX_RECIPE_NUMBER = 12999999;

function getRecipeStudioClient(client: SanityClient) {
  return client.withConfig({
    apiVersion,
    perspective: "previewDrafts",
    useCdn: false,
  });
}

export function normalizeCategoryPath(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
}

export function serializeCategoryPath(parts: string[]) {
  return parts.join(" / ");
}

export function dedupeCategoryPathOptions(paths: Iterable<string[]>) {
  const byLabel = new Map<string, CategoryPathOption>();

  for (const path of paths) {
    const parts = normalizeCategoryPath(path);
    if (!parts.length) continue;

    const label = serializeCategoryPath(parts);
    if (!byLabel.has(label)) {
      byLabel.set(label, { label, parts });
    }
  }

  return [...byLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export async function fetchNextRecipeNumber(client: SanityClient) {
  const recipeClient = getRecipeStudioClient(client);
  const highestRecipeNumber = await recipeClient.fetch<number | null>(RECIPE_WITH_HIGHEST_RN_QUERY, {
    maxRecipeNumber: MAX_RECIPE_NUMBER,
    minRecipeNumber: MIN_RECIPE_NUMBER,
  });

  if (typeof highestRecipeNumber !== "number") {
    return MIN_RECIPE_NUMBER;
  }

  if (highestRecipeNumber >= MAX_RECIPE_NUMBER) {
    throw new Error("No recipe numbers remain in the 12xxxxxx range.");
  }

  return highestRecipeNumber + 1;
}

export async function fetchRecipeCategoryPathOptions(client: SanityClient) {
  const recipeClient = getRecipeStudioClient(client);
  const rows = await recipeClient.fetch<Array<{ categoryPath?: string[] | null }>>(RECIPE_CATEGORY_PATHS_QUERY);

  return dedupeCategoryPathOptions(rows.map((row) => row.categoryPath ?? []));
}

function buildDocumentIdVariants(documentId: string | undefined) {
  if (!documentId) return [];

  const publishedId = documentId.startsWith("drafts.") ? documentId.slice("drafts.".length) : documentId;
  const draftId = `drafts.${publishedId}`;

  return [...new Set([documentId, publishedId, draftId].filter(Boolean))];
}

export async function hasDuplicateRecipeNumber(
  client: SanityClient,
  pluNumber: number,
  documentId?: string,
) {
  const recipeClient = getRecipeStudioClient(client);

  return recipeClient.fetch<boolean>(DUPLICATE_RECIPE_NUMBER_QUERY, {
    excludedIds: buildDocumentIdVariants(documentId),
    pluNumber,
  });
}
