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
  manufacturer?: unknown;
  pricing_unit?: unknown;
  estimated_unit_price?: unknown;
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
    estimatedUnitPrice: normalizeNumber(raw.estimated_unit_price, 8),
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
