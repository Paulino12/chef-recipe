import { type Recipe, type RecipeCollection } from "@/lib/recipes";

export const RECIPE_COSTING_CURRENCY = "GBP";

export type IngredientCatalogCandidate = {
  score: number | null;
  catalogCode: string;
  description: string;
  supplier: string;
  packSize: string;
  packPrice: number | null;
  estimatedUnitPrice: number | null;
};

export type IngredientCatalogEntry = {
  item: string;
  canonicalItem: string;
  searchableText: string;
  lineCount: number;
  recipeCount: number;
  units: string[];
  matchStatus: string;
  confidence: number | null;
  isSubRecipe: boolean;
  matchedCatalogCode: string;
  matchedCatalogDescription: string;
  matchedSupplier: string;
  matchedPackSize: string;
  matchedPackPrice: number | null;
  estimatedUnitPrice: number | null;
  candidateMatches: IngredientCatalogCandidate[];
};

export type ResolvedSubRecipeCosting = {
  label: string;
  recipeId: string;
  recipeTitle: string;
  recipePortions: number | null;
  totalCost: number;
  costPerPortion: number | null;
  currency: string;
};

export type ResolvedSubRecipeTarget = {
  label: string;
  recipeId: string;
  recipeTitle: string;
};

export type RecipeCostLine = {
  text: string;
  qty: number | null;
  unit: string | null;
  item: string | null;
  lineCost: number | null;
  matchedItem: string;
  matchedCatalogCode: string;
  matchedCatalogDescription: string;
  matchedSupplier: string;
  matchedPackSize: string;
  matchedPackPrice: number | null;
  estimatedUnitPrice: number | null;
  matchStatus: string;
  confidence: number | null;
  costLabel: string;
  notes: string;
};

export type RecipeCostingStatus = "current" | "needs_review";

export type RecipeCosting = {
  recipeId: string;
  recipeTitle: string;
  recipeCollection: RecipeCollection;
  recipePortions: number | null;
  ingredientFingerprint: string;
  currency: string;
  totalCost: number;
  costPerPortion: number | null;
  sourceRecipeId: string | null;
  costLines: RecipeCostLine[];
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  status: RecipeCostingStatus;
};

export type RecipeCostSummary = {
  recipeId: string;
  recipePortions: number | null;
  currency: string;
  totalCost: number;
  costPerPortion: number | null;
  sourceRecipeId: string | null;
  updatedAt: string;
  status: RecipeCostingStatus;
};

export type CostedRecipeSearchResult = {
  id: string;
  title: string;
  pluNumber: number;
  collection: RecipeCollection;
  totalCost: number;
  costPerPortion: number | null;
  updatedAt: string;
};

type RecipeIngredient = Recipe["ingredients"][number];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
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

function normalizeCurrencyNumber(value: unknown) {
  return normalizeNumber(value, 2);
}

function normalizeCostingUnit(value: string | null | undefined) {
  const normalizedUnit = normalizeText(value).toUpperCase();

  switch (normalizedUnit) {
    case "G":
    case "GRAM":
    case "GRAMS":
      return "G";
    case "KG":
    case "KGS":
    case "KILO":
    case "KILOS":
    case "KILOGRAM":
    case "KILOGRAMS":
      return "KG";
    case "ML":
    case "MLS":
    case "MILLILITRE":
    case "MILLILITRES":
    case "MILLILITER":
    case "MILLILITERS":
      return "ML";
    case "L":
    case "LTR":
    case "LTRS":
    case "LT":
    case "LITRE":
    case "LITRES":
    case "LITER":
    case "LITERS":
      return "L";
    case "EA":
    case "EACH":
    case "UNIT":
    case "UNITS":
    case "ITEM":
    case "ITEMS":
    case "PC":
    case "PCS":
    case "PIECE":
    case "PIECES":
      return "EA";
    case "PTN":
    case "PORTION":
    case "PORTIONS":
      return "PTN";
    case "TSP":
    case "TSPS":
    case "TEASPOON":
    case "TEASPOONS":
      return "TSP";
    case "TBSP":
    case "TBSPS":
    case "TABLESPOON":
    case "TABLESPOONS":
      return "TBSP";
    default:
      return normalizedUnit;
  }
}

function normalizeIngredientSnapshot(ingredient: Partial<RecipeIngredient>) {
  return {
    text: normalizeText(ingredient.text),
    qty: normalizeNumber(ingredient.qty),
    unit: normalizeNullableText(ingredient.unit),
    item: normalizeNullableText(ingredient.item),
  };
}

export function sanitizeRecipeCostLine(line: Partial<RecipeCostLine>): RecipeCostLine {
  const snapshot = normalizeIngredientSnapshot(line);
  return {
    ...snapshot,
    lineCost: normalizeCurrencyNumber(line.lineCost),
    matchedItem: normalizeText(line.matchedItem),
    matchedCatalogCode: normalizeText(line.matchedCatalogCode),
    matchedCatalogDescription: normalizeText(line.matchedCatalogDescription),
    matchedSupplier: normalizeText(line.matchedSupplier),
    matchedPackSize: normalizeText(line.matchedPackSize),
    matchedPackPrice: normalizeCurrencyNumber(line.matchedPackPrice),
    estimatedUnitPrice: normalizeNumber(line.estimatedUnitPrice, 8),
    matchStatus: normalizeText(line.matchStatus),
    confidence: normalizeNumber(line.confidence, 4),
    costLabel: normalizeText(line.costLabel),
    notes: normalizeText(line.notes),
  };
}

export function createRecipeCostLinesFromIngredients(
  ingredients: Recipe["ingredients"] | undefined | null,
): RecipeCostLine[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map((ingredient) => ({
    ...normalizeIngredientSnapshot(ingredient),
    lineCost: null,
    matchedItem: "",
    matchedCatalogCode: "",
    matchedCatalogDescription: "",
    matchedSupplier: "",
    matchedPackSize: "",
    matchedPackPrice: null,
    estimatedUnitPrice: null,
    matchStatus: "",
    confidence: null,
    costLabel: "",
    notes: "",
  }));
}

export function sanitizeRecipeCostLines(lines: unknown): RecipeCostLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) =>
    sanitizeRecipeCostLine(
      (line && typeof line === "object" ? line : {}) as Partial<RecipeCostLine>,
    ),
  );
}

export function mergeRecipeCostLinesFromSource(
  ingredients: Recipe["ingredients"] | undefined | null,
  sourceLines: RecipeCostLine[],
) {
  const targetLines = createRecipeCostLinesFromIngredients(ingredients);
  return targetLines.map((line, index) => {
    const source = sourceLines[index];
    if (!source) return line;
    return {
      ...line,
      lineCost: source.lineCost,
      matchedItem: source.matchedItem,
      matchedCatalogCode: source.matchedCatalogCode,
      matchedCatalogDescription: source.matchedCatalogDescription,
      matchedSupplier: source.matchedSupplier,
      matchedPackSize: source.matchedPackSize,
      matchedPackPrice: source.matchedPackPrice,
      estimatedUnitPrice: source.estimatedUnitPrice,
      matchStatus: source.matchStatus,
      confidence: source.confidence,
      costLabel: source.costLabel,
      notes: source.notes,
    };
  });
}

export function buildRecipeIngredientFingerprint(
  ingredients: Recipe["ingredients"] | undefined | null,
) {
  const snapshot = createRecipeCostLinesFromIngredients(ingredients).map(
    ({ text, qty, unit, item }) => ({
      text,
      qty,
      unit,
      item,
    }),
  );
  return JSON.stringify(snapshot);
}

export function calculateRecipeCostTotals(
  lines: RecipeCostLine[],
  portions: number | null | undefined,
) {
  const totalCost = Math.round(
    lines.reduce((sum, line) => sum + (line.lineCost ?? 0), 0) * 100,
  ) / 100;
  const normalizedPortions = normalizeNumber(portions, 2);
  const costPerPortion =
    normalizedPortions && normalizedPortions > 0
      ? Math.round((totalCost / normalizedPortions) * 100) / 100
      : null;

  return { totalCost, costPerPortion };
}

export function calculateSubRecipeLineCost(
  qty: number | null | undefined,
  costPerPortion: number | null | undefined,
) {
  const normalizedQty = normalizeNumber(qty, 4);
  const normalizedCostPerPortion = normalizeCurrencyNumber(costPerPortion);
  if (normalizedQty === null || normalizedCostPerPortion === null) return null;
  return Math.round(normalizedQty * normalizedCostPerPortion * 100) / 100;
}

export function applySubRecipeCostingToRecipeCostLine(
  line: RecipeCostLine,
  subRecipe: ResolvedSubRecipeCosting | null | undefined,
) {
  if (!subRecipe || line.lineCost !== null) return line;
  return {
    ...line,
    lineCost: calculateSubRecipeLineCost(line.qty, subRecipe.costPerPortion),
  };
}

export function calculateCatalogLineCost(
  qty: number | null | undefined,
  unit: string | null | undefined,
  estimatedUnitPrice: number | null | undefined,
) {
  if (qty === null || qty === undefined || estimatedUnitPrice === null || estimatedUnitPrice === undefined) {
    return null;
  }

  const normalizedQty = normalizeNumber(qty, 4);
  if (normalizedQty === null) return null;

  const normalizedUnit = normalizeCostingUnit(unit);
  let amount: number | null = null;

  switch (normalizedUnit) {
    case "G":
    case "ML":
    case "EA":
    case "PTN":
      amount = normalizedQty;
      break;
    case "TSP":
      amount = normalizedQty * 5;
      break;
    case "TBSP":
      amount = normalizedQty * 15;
      break;
    case "KG":
    case "L":
      amount = normalizedQty * 1000;
      break;
    default:
      amount = null;
      break;
  }

  if (amount === null) return null;
  return Math.round(amount * estimatedUnitPrice * 100) / 100;
}

export function applyCatalogEntryToRecipeCostLine(
  line: RecipeCostLine,
  entry: IngredientCatalogEntry,
): RecipeCostLine {
  const estimatedUnitPrice = normalizeNumber(entry.estimatedUnitPrice, 8);
  const lineCost = calculateCatalogLineCost(line.qty, line.unit, estimatedUnitPrice);

  return {
    ...line,
    lineCost,
    matchedItem: entry.item,
    matchedCatalogCode: normalizeText(entry.matchedCatalogCode),
    matchedCatalogDescription: normalizeText(entry.matchedCatalogDescription),
    matchedSupplier: normalizeText(entry.matchedSupplier),
    matchedPackSize: normalizeText(entry.matchedPackSize),
    matchedPackPrice: normalizeCurrencyNumber(entry.matchedPackPrice),
    estimatedUnitPrice,
    matchStatus: normalizeText(entry.matchStatus),
    confidence: normalizeNumber(entry.confidence, 4),
    costLabel: normalizeText(entry.matchedCatalogDescription) || line.costLabel,
  };
}

export function hydrateRecipeCostLineFromCatalog(
  line: RecipeCostLine,
  catalog: IngredientCatalogEntry[],
): RecipeCostLine {
  if (
    line.matchedPackPrice !== null &&
    line.estimatedUnitPrice !== null &&
    line.matchedPackSize
  ) {
    return line;
  }

  const normalizedCode = normalizeText(line.matchedCatalogCode);
  const normalizedItem = normalizeText(line.matchedItem);
  const normalizedSupplier = normalizeText(line.matchedSupplier);
  const normalizedDescription = normalizeText(line.matchedCatalogDescription);

  const match =
    (normalizedCode
      ? catalog.find(
          (entry) => normalizeText(entry.matchedCatalogCode) === normalizedCode,
        )
      : null) ??
    catalog.find((entry) => {
      if (normalizedItem && normalizeText(entry.item) !== normalizedItem) return false;
      if (
        normalizedSupplier &&
        normalizeText(entry.matchedSupplier) !== normalizedSupplier
      ) {
        return false;
      }
      if (
        normalizedDescription &&
        normalizeText(entry.matchedCatalogDescription) !== normalizedDescription
      ) {
        return false;
      }
      return Boolean(normalizedItem || normalizedDescription);
    }) ??
    (normalizedItem
      ? catalog.find((entry) => normalizeText(entry.item) === normalizedItem)
      : null);

  if (!match) return line;

  return {
    ...line,
    matchedCatalogCode: line.matchedCatalogCode || match.matchedCatalogCode,
    matchedCatalogDescription:
      line.matchedCatalogDescription || match.matchedCatalogDescription,
    matchedSupplier: line.matchedSupplier || match.matchedSupplier,
    matchedPackSize: line.matchedPackSize || match.matchedPackSize,
    matchedPackPrice:
      line.matchedPackPrice !== null ? line.matchedPackPrice : match.matchedPackPrice,
    estimatedUnitPrice:
      line.estimatedUnitPrice !== null
        ? line.estimatedUnitPrice
        : match.estimatedUnitPrice,
  };
}

export function getRecipeCostingStatus(
  savedIngredientFingerprint: string,
  currentIngredientFingerprint: string,
): RecipeCostingStatus {
  return savedIngredientFingerprint === currentIngredientFingerprint
    ? "current"
    : "needs_review";
}

export function toRecipeCostSummary(
  costing: Omit<RecipeCosting, "status">,
  currentIngredientFingerprint: string,
): RecipeCostSummary {
  return {
    recipeId: costing.recipeId,
    recipePortions: costing.recipePortions,
    currency: costing.currency,
    totalCost: costing.totalCost,
    costPerPortion: costing.costPerPortion,
    sourceRecipeId: costing.sourceRecipeId,
    updatedAt: costing.updatedAt,
    status: getRecipeCostingStatus(
      costing.ingredientFingerprint,
      currentIngredientFingerprint,
    ),
  };
}

export function formatRecipeCostMoney(value: number | null, currency = RECIPE_COSTING_CURRENCY) {
  if (value === null || !Number.isFinite(value)) return "-";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
