import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { type IngredientCatalogEntry } from "@/lib/recipeCosting";

type RawCatalogEntry = {
  supplier?: unknown;
  source_sheet?: unknown;
  major_description?: unknown;
  minor_description?: unknown;
  code?: unknown;
  searchable_text?: unknown;
  description?: unknown;
  pack_size?: unknown;
  price?: unknown;
  price_per_item?: unknown;
  manufacturer?: unknown;
  pricing_unit?: unknown;
  estimated_unit_price?: unknown;
  weighted_item?: unknown;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown, fractionDigits = 6) {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return null;
  const factor = 10 ** fractionDigits;
  return Math.round(raw * factor) / factor;
}

function normalizePricingUnit(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function isSingleEachPack(packSize: string) {
  const normalized = packSize.toUpperCase().replace(/\s+/g, " ").trim();
  return /^(?:1 X )?(?:1 X )?EACH$/.test(normalized);
}

function resolveEstimatedUnitPrice(raw: RawCatalogEntry) {
  const directEstimate = normalizeNumber(raw.estimated_unit_price, 8);
  if (directEstimate !== null) return directEstimate;

  const pricePerItem = normalizeNumber(raw.price_per_item, 8);
  if (pricePerItem !== null) return pricePerItem;

  const pricingUnit = normalizePricingUnit(raw.pricing_unit);
  const packSize = normalizeText(raw.pack_size);
  const packPrice = normalizeNumber(raw.price, 8);
  const isWeightedItem = raw.weighted_item === true;

  if (
    pricingUnit === "EA" &&
    !isWeightedItem &&
    packPrice !== null &&
    isSingleEachPack(packSize)
  ) {
    return packPrice;
  }

  return null;
}

function normalizeEntry(value: unknown): IngredientCatalogEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawCatalogEntry;
  const description = normalizeText(raw.description);
  const supplier = normalizeText(raw.supplier);
  if (!description || !supplier) return null;

  const majorDescription = normalizeText(raw.major_description);
  const minorDescription = normalizeText(raw.minor_description);
  const manufacturer = normalizeText(raw.manufacturer);
  const searchableText =
    normalizeText(raw.searchable_text) ||
    [description, majorDescription, minorDescription, manufacturer, supplier]
      .filter(Boolean)
      .join(" ");
  const pricingUnit = normalizeText(raw.pricing_unit);

  return {
    item: description,
    canonicalItem: description,
    searchableText,
    lineCount: 0,
    recipeCount: 0,
    units: pricingUnit ? [pricingUnit] : [],
    matchStatus: "catalog",
    confidence: 1,
    isSubRecipe: false,
    matchedCatalogCode: normalizeText(raw.code),
      matchedCatalogDescription: description,
      matchedSupplier: supplier,
      matchedPackSize: normalizeText(raw.pack_size),
      matchedPackPrice: normalizeNumber(raw.price, 2),
      estimatedUnitPrice: resolveEstimatedUnitPrice(raw),
      candidateMatches: [],
  };
}

let ingredientCatalogPromise: Promise<IngredientCatalogEntry[]> | null = null;

async function loadIngredientCatalogEntries() {
  const filePath = path.join(process.cwd(), "data", "ingredient_search_catalog.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as { items?: unknown };
  if (!Array.isArray(parsed.items)) {
    throw new Error("Ingredient costing catalog is missing or malformed.");
  }

  return parsed.items
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is IngredientCatalogEntry => Boolean(entry));
}

export async function listIngredientCatalogEntries() {
  if (!ingredientCatalogPromise) {
    ingredientCatalogPromise = loadIngredientCatalogEntries();
  }
  return ingredientCatalogPromise;
}
