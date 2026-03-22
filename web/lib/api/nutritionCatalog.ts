import "server-only";

import { readFile, access } from "node:fs/promises";
import path from "node:path";

import { type NutritionCatalogEntry } from "@/lib/recipeNutrition";

type NutritionCatalogStatus = {
  configured: boolean;
  path: string | null;
  absolutePath: string | null;
};

const CANDIDATE_PATHS = [
  {
    label: "data/ingredients_nutrition.json",
    resolve: () => path.join(process.cwd(), "data", "ingredients_nutrition.json"),
  },
  {
    label: "data/ingredient_nutrition_catalog.json",
    resolve: () =>
      path.join(process.cwd(), "data", "ingredient_nutrition_catalog.json"),
  },
  {
    label: "web/data/ingredients_nutrition.json",
    resolve: () => path.join(process.cwd(), "web", "data", "ingredients_nutrition.json"),
  },
  {
    label: "web/data/ingredient_nutrition_catalog.json",
    resolve: () =>
      path.join(process.cwd(), "web", "data", "ingredient_nutrition_catalog.json"),
  },
];

let nutritionCatalogStatusPromise: Promise<NutritionCatalogStatus> | null = null;
let nutritionCatalogEntriesPromise: Promise<NutritionCatalogEntry[]> | null = null;

type RawNutritionCatalogEntry = {
  food_code?: unknown;
  food_name?: unknown;
  description?: unknown;
  group?: unknown;
  serving_size_g?: unknown;
  energy_kj_per_100g?: unknown;
  energy_kcal_per_100g?: unknown;
  fat_g_per_100g?: unknown;
  saturates_g_per_100g?: unknown;
  sugars_g_per_100g?: unknown;
  salt_g_per_100g?: unknown;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown, fractionDigits = 4) {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(raw)) return null;
  const factor = 10 ** fractionDigits;
  return Math.round(raw * factor) / factor;
}

function sanitizeNutritionCatalogJson(raw: string) {
  return raw.replace(/(:\s*)NaN\b/g, "$1null");
}

function normalizeEntry(value: unknown): NutritionCatalogEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawNutritionCatalogEntry;
  const item = normalizeText(raw.food_name);
  if (!item) return null;

  const description = normalizeText(raw.description);
  const group = normalizeText(raw.group);

  return {
    foodCode: normalizeText(raw.food_code),
    item,
    searchableText: [item, description, group].filter(Boolean).join(" "),
    description,
    group,
    servingSizeG: normalizeNumber(raw.serving_size_g),
    energyKjPer100g: normalizeNumber(raw.energy_kj_per_100g),
    energyKcalPer100g: normalizeNumber(raw.energy_kcal_per_100g),
    fatGPer100g: normalizeNumber(raw.fat_g_per_100g),
    saturatesGPer100g: normalizeNumber(raw.saturates_g_per_100g),
    sugarsGPer100g: normalizeNumber(raw.sugars_g_per_100g),
    saltGPer100g: normalizeNumber(raw.salt_g_per_100g),
  };
}

async function loadNutritionCatalogStatus(): Promise<NutritionCatalogStatus> {
  for (const candidate of CANDIDATE_PATHS) {
    try {
      const absolutePath = candidate.resolve();
      await access(absolutePath);
      return { configured: true, path: candidate.label, absolutePath };
    } catch {
      // Keep checking other likely locations.
    }
  }

  return { configured: false, path: null, absolutePath: null };
}

async function loadNutritionCatalogEntries() {
  const status = await getNutritionCatalogStatus();
  if (!status.configured || !status.absolutePath) return [] as NutritionCatalogEntry[];

  const raw = await readFile(status.absolutePath, "utf8");
  const parsed = JSON.parse(sanitizeNutritionCatalogJson(raw)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Nutrition catalog is missing or malformed.");
  }

  return parsed
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is NutritionCatalogEntry => Boolean(entry));
}

export async function getNutritionCatalogStatus() {
  if (!nutritionCatalogStatusPromise) {
    nutritionCatalogStatusPromise = loadNutritionCatalogStatus();
  }
  return nutritionCatalogStatusPromise;
}

export async function listNutritionCatalogEntries() {
  if (!nutritionCatalogEntriesPromise) {
    nutritionCatalogEntriesPromise = loadNutritionCatalogEntries();
  }
  return nutritionCatalogEntriesPromise;
}
