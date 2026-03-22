export type NutritionWorkflowStatus =
  | "missing"
  | "estimated"
  | "verified"
  | "manual";

export type NutritionWorkflowSource =
  | "calculated"
  | "manual"
  | "imported"
  | "unknown";

export type RecipeNutritionValue = {
  portionNetWeightG?: number | null;
  perServing?: Record<string, number>;
  per100g?: Record<string, number>;
  riPercent?: Record<string, number>;
};

export type RecipeNutritionMeta = {
  status?: NutritionWorkflowStatus | null;
  source?: NutritionWorkflowSource | null;
  confidence?: number | null;
  matchedIngredientCount?: number | null;
  totalIngredientCount?: number | null;
  unmatchedItems?: string[];
  lastCalculatedAt?: string | null;
  lockedByEditor?: boolean | null;
};

export type NutritionCatalogEntry = {
  foodCode: string;
  item: string;
  searchableText: string;
  description: string;
  group: string;
  servingSizeG: number | null;
  energyKjPer100g: number | null;
  energyKcalPer100g: number | null;
  fatGPer100g: number | null;
  saturatesGPer100g: number | null;
  sugarsGPer100g: number | null;
  saltGPer100g: number | null;
};

export type NormalizedRecipeNutrition = {
  portionNetWeightG: number | null;
  perServing: {
    energyKj: number | null;
    energyKcal: number | null;
    fatG: number | null;
    saturatesG: number | null;
    sugarsG: number | null;
    saltG: number | null;
  };
  per100g: {
    energyKj: number | null;
    energyKcal: number | null;
  };
  riPercent: {
    energy: number | null;
    fat: number | null;
    saturates: number | null;
    sugars: number | null;
    salt: number | null;
  };
};

export type NormalizedRecipeNutritionMeta = {
  status: NutritionWorkflowStatus | null;
  source: NutritionWorkflowSource | null;
  confidence: number | null;
  matchedIngredientCount: number | null;
  totalIngredientCount: number | null;
  unmatchedItems: string[];
  lastCalculatedAt: string | null;
  lockedByEditor: boolean;
};

export type RecipeNutritionWorkflowSummary = {
  nutrition: NormalizedRecipeNutrition;
  meta: NormalizedRecipeNutritionMeta;
  status: NutritionWorkflowStatus;
  source: NutritionWorkflowSource;
  badgeLabel: string;
  badgeVariant: "outline" | "secondary" | "success";
  statusDescription: string;
  guidance: string;
  sourceLabel: string;
  hasAnyNutritionData: boolean;
  canShowNutritionCard: boolean;
  filledMetricCount: number;
  totalMetricCount: number;
  coverageLabel: string;
  notes: string[];
};

export type RecipeNutritionEstimateLine = {
  text: string;
  qty: number | null;
  unit: string | null;
  amountG: number | null;
  matchedItem: string | null;
  foodCode: string | null;
  score: number;
  status:
    | "matched"
    | "unmatched"
    | "missing_qty"
    | "unsupported_unit";
};

export type RecipeNutritionEstimate = {
  status: "ready" | "partial" | "unavailable";
  matchedIngredientCount: number;
  totalIngredientCount: number;
  unmatchedItems: string[];
  notes: string[];
  lines: RecipeNutritionEstimateLine[];
  totals: NormalizedRecipeNutrition["perServing"];
  perServing: NormalizedRecipeNutrition["perServing"];
  per100g: NormalizedRecipeNutrition["per100g"];
  riPercent: NormalizedRecipeNutrition["riPercent"];
};

const VALID_STATUSES = new Set<NutritionWorkflowStatus>([
  "missing",
  "estimated",
  "verified",
  "manual",
]);

const VALID_SOURCES = new Set<NutritionWorkflowSource>([
  "calculated",
  "manual",
  "imported",
  "unknown",
]);

function asNumber(value: unknown, fractionDigits = 4) {
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

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumeric(record: unknown, keys: string[]) {
  if (!record || typeof record !== "object") return null;
  const source = record as Record<string, unknown>;
  for (const key of keys) {
    const value = asNumber(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => asString(item)).filter(Boolean);
}

function countPresent(values: Array<number | null>) {
  return values.reduce<number>(
    (count, value) => count + (value === null ? 0 : 1),
    0,
  );
}

function normalizeSearchText(value: unknown) {
  return asString(value)
    .toLowerCase()
    .replace(/[0-9]+(?:\.[0-9]+)?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singularizeToken(token: string) {
  return token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
}

function normalizeSearchTokens(value: unknown) {
  return normalizeSearchText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => singularizeToken(token));
}

function roundNumber(value: number | null, fractionDigits = 4) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

function sumNumbers(values: Array<number | null>) {
  return roundNumber(
    values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
  );
}

function tokensRoughlyMatch(left: string, right: string) {
  return (
    left === right ||
    left.startsWith(right) ||
    right.startsWith(left)
  );
}

const LOW_SIGNAL_TOKENS = new Set([
  "with",
  "without",
  "and",
  "the",
  "type",
  "style",
  "non",
  "reduced",
]);

const PREPARED_FOOD_TOKENS = new Set([
  "baked",
  "biscuit",
  "boiled",
  "canned",
  "centre",
  "centres",
  "cookie",
  "creme",
  "curry",
  "dessert",
  "filled",
  "fondant",
  "fried",
  "ghee",
  "gravy",
  "homemade",
  "ice",
  "milk",
  "mint",
  "nog",
  "oil",
  "omelette",
  "pancake",
  "poached",
  "pudding",
  "reheated",
  "sauce",
  "scrambled",
  "scoop",
  "spread",
  "stewed",
  "sundae",
  "wafer",
  "water",
  "white",
  "yolk",
 ]);

function scoreNutritionCatalogMatch(
  query: string,
  entry: NutritionCatalogEntry,
) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedItem = normalizeSearchText(entry.item);
  if (!normalizedQuery || !normalizedItem) return 0;

  const queryTokens = normalizeSearchTokens(query).filter(
    (token) => !LOW_SIGNAL_TOKENS.has(token),
  );
  const itemTokens = normalizeSearchTokens(entry.item);
  if (!queryTokens.length || !itemTokens.length) return 0;

  const matchedTokens = queryTokens.filter((queryToken) =>
    itemTokens.some((itemToken) => tokensRoughlyMatch(queryToken, itemToken)),
  );
  const coverage = matchedTokens.length / queryTokens.length;
  if (coverage < 0.5) return 0;

  let score = coverage * 100;
  const headToken = queryTokens[queryTokens.length - 1] ?? "";

  if (normalizedItem === normalizedQuery) score += 120;
  if (itemTokens.includes(headToken)) score += 50;
  if (
    queryTokens.every((queryToken) =>
      itemTokens.some((itemToken) => tokensRoughlyMatch(queryToken, itemToken)),
    )
  ) {
    score += 60;
  }

  const extraTokens = itemTokens.filter(
    (itemToken) =>
      !queryTokens.some((queryToken) => tokensRoughlyMatch(queryToken, itemToken)),
  );
  score -= extraTokens.length * 4;
  score -=
    extraTokens.filter((token) => PREPARED_FOOD_TOKENS.has(token)).length * 18;

  if (headToken === "egg") {
    if (itemTokens.includes("chicken")) score += 15;
    if (itemTokens.includes("whole")) score += 20;
    if (itemTokens.includes("raw")) score += 20;
    if (itemTokens.includes("white") || itemTokens.includes("yolk")) score -= 30;
  }

  if (
    ["butter", "chocolate", "cocoa", "egg", "flour", "sugar"].includes(headToken)
  ) {
    score -=
      extraTokens.filter((token) => PREPARED_FOOD_TOKENS.has(token)).length * 12;
  }

  if (headToken === "butter" && itemTokens[0] === "butter") score += 25;
  if (headToken === "sugar" && itemTokens[0] === "sugar") score += 25;
  if (headToken === "chocolate" && itemTokens[0] === "chocolate") score += 25;
  if (headToken === "flour" && itemTokens[0] === "flour") score += 25;

  const searchableTokens = normalizeSearchTokens(entry.searchableText);
  const searchableCoverage =
    searchableTokens.length > 0
      ? queryTokens.filter((queryToken) =>
          searchableTokens.some((candidateToken) =>
            tokensRoughlyMatch(queryToken, candidateToken),
          ),
        ).length / queryTokens.length
      : 0;

  if (score < 100 && searchableCoverage >= 0.75) {
    score = Math.max(score, searchableCoverage * 90);
  }

  return score;
}

function findBestNutritionCatalogMatch(
  catalog: NutritionCatalogEntry[],
  query: string,
) {
  if (!normalizeSearchText(query)) return null;

  let best: { entry: NutritionCatalogEntry; score: number } | null = null;
  for (const entry of catalog) {
    const score = scoreNutritionCatalogMatch(query, entry);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  return best && best.score >= 90 ? best : null;
}

function resolveNutritionAmountG(
  qty: unknown,
  unit: unknown,
  servingSizeG: number | null,
  ingredientText: string,
) {
  const normalizedQty = asNumber(qty);
  if (normalizedQty === null) return null;

  switch (asString(unit).toUpperCase()) {
    case "G":
      return normalizedQty;
    case "KG":
      return roundNumber(normalizedQty * 1000);
    case "ML":
      return normalizedQty;
    case "L":
      return roundNumber(normalizedQty * 1000);
    case "EA":
      if (servingSizeG) return roundNumber(normalizedQty * servingSizeG);
      if (normalizeSearchText(ingredientText).includes("egg")) {
        const normalizedText = normalizeSearchText(ingredientText);
        const gramsPerEgg = normalizedText.includes("small")
          ? 45
          : normalizedText.includes("large")
            ? 60
            : normalizedText.includes("medium")
              ? 50
              : 50;
        return roundNumber(normalizedQty * gramsPerEgg);
      }
      return null;
    default:
      return null;
  }
}

function buildPer100Contribution(
  valuePer100g: number | null,
  amountG: number | null,
) {
  if (valuePer100g === null || amountG === null) return null;
  return roundNumber((valuePer100g * amountG) / 100);
}

function buildRiPercent(perServing: NormalizedRecipeNutrition["perServing"]) {
  return {
    energy:
      perServing.energyKcal !== null
        ? roundNumber((perServing.energyKcal / 2000) * 100, 1)
        : null,
    fat:
      perServing.fatG !== null ? roundNumber((perServing.fatG / 70) * 100, 1) : null,
    saturates:
      perServing.saturatesG !== null
        ? roundNumber((perServing.saturatesG / 20) * 100, 1)
        : null,
    sugars:
      perServing.sugarsG !== null
        ? roundNumber((perServing.sugarsG / 90) * 100, 1)
        : null,
    salt:
      perServing.saltG !== null ? roundNumber((perServing.saltG / 6) * 100, 1) : null,
  };
}

export function normalizeRecipeNutrition(
  value: unknown,
): NormalizedRecipeNutrition {
  const source = (value ?? {}) as RecipeNutritionValue;
  return {
    portionNetWeightG: asNumber(source.portionNetWeightG),
    perServing: {
      energyKj: readNumeric(source.perServing, ["energyKj", "energy_kj", "kj", "kJ"]),
      energyKcal: readNumeric(source.perServing, [
        "energyKcal",
        "energy_kcal",
        "kcal",
        "kCal",
      ]),
      fatG: readNumeric(source.perServing, ["fatG", "fat_g", "fat"]),
      saturatesG: readNumeric(source.perServing, [
        "saturatesG",
        "saturates_g",
        "saturates",
      ]),
      sugarsG: readNumeric(source.perServing, ["sugarsG", "sugars_g", "sugars"]),
      saltG: readNumeric(source.perServing, ["saltG", "salt_g", "salt"]),
    },
    per100g: {
      energyKj: readNumeric(source.per100g, ["energyKj", "energy_kj", "kj", "kJ"]),
      energyKcal: readNumeric(source.per100g, [
        "energyKcal",
        "energy_kcal",
        "kcal",
        "kCal",
      ]),
    },
    riPercent: {
      energy: readNumeric(source.riPercent, ["energy"]),
      fat: readNumeric(source.riPercent, ["fat"]),
      saturates: readNumeric(source.riPercent, ["saturates"]),
      sugars: readNumeric(source.riPercent, ["sugars"]),
      salt: readNumeric(source.riPercent, ["salt"]),
    },
  };
}

export function normalizeRecipeNutritionMeta(
  value: unknown,
): NormalizedRecipeNutritionMeta {
  const source = (value ?? {}) as RecipeNutritionMeta;
  const status = asString(source.status);
  const workflowSource = asString(source.source);

  return {
    status: VALID_STATUSES.has(status as NutritionWorkflowStatus)
      ? (status as NutritionWorkflowStatus)
      : null,
    source: VALID_SOURCES.has(workflowSource as NutritionWorkflowSource)
      ? (workflowSource as NutritionWorkflowSource)
      : null,
    confidence: asNumber(source.confidence),
    matchedIngredientCount: asNumber(source.matchedIngredientCount, 0),
    totalIngredientCount: asNumber(source.totalIngredientCount, 0),
    unmatchedItems: normalizeStringArray(source.unmatchedItems),
    lastCalculatedAt: asString(source.lastCalculatedAt) || null,
    lockedByEditor: source.lockedByEditor === true,
  };
}

function resolveStatusLabel(status: NutritionWorkflowStatus) {
  switch (status) {
    case "missing":
      return "Nutrition missing";
    case "estimated":
      return "Estimated nutrition";
    case "verified":
    case "manual":
      return "Verified nutrition";
  }
}

function resolveStatusDescription(status: NutritionWorkflowStatus) {
  switch (status) {
    case "missing":
      return "No nutrition values are stored on this recipe yet.";
    case "estimated":
      return "These values are an estimate and should be reviewed against official nutrition if needed.";
    case "verified":
    case "manual":
      return "Nutrition is already stored on this recipe and is treated as verified.";
  }
}

function resolveGuidance(
  status: NutritionWorkflowStatus,
  nutritionCatalogConnected: boolean,
) {
  switch (status) {
    case "missing":
      return nutritionCatalogConnected
        ? "Once ingredient-level nutrition data is connected, this recipe can be estimated after save and reviewed later."
        : "Connect an ingredient nutrition catalog or keep entering values manually in Sanity for now.";
    case "estimated":
      return "Review the estimate, then mark it verified or keep a manual override if the official numbers differ.";
    case "verified":
    case "manual":
      return "Keep these values as the source of truth, and only re-check them when ingredients, portions, or finished yield change.";
  }
}

function resolveSourceLabel(source: NutritionWorkflowSource) {
  switch (source) {
    case "calculated":
      return "Calculated";
    case "manual":
      return "Manual";
    case "imported":
      return "Imported";
    case "unknown":
      return "Unknown";
  }
}

function resolveBadgeVariant(status: NutritionWorkflowStatus) {
  switch (status) {
    case "verified":
    case "manual":
      return "success";
    case "estimated":
      return "secondary";
    case "missing":
      return "outline";
  }
}

export function getRecipeNutritionWorkflow(options: {
  nutrition: unknown;
  nutritionMeta?: unknown;
  sourcePdfPath?: string | null;
  nutritionCatalogConnected?: boolean | null;
}): RecipeNutritionWorkflowSummary {
  const nutrition = normalizeRecipeNutrition(options.nutrition);
  const meta = normalizeRecipeNutritionMeta(options.nutritionMeta);
  const nutritionCatalogConnected = options.nutritionCatalogConnected === true;
  const savedMetricValues = [
    nutrition.perServing.energyKj,
    nutrition.perServing.energyKcal,
    nutrition.perServing.fatG,
    nutrition.perServing.saturatesG,
    nutrition.perServing.sugarsG,
    nutrition.perServing.saltG,
    nutrition.per100g.energyKj,
    nutrition.per100g.energyKcal,
    nutrition.riPercent.energy,
    nutrition.riPercent.fat,
    nutrition.riPercent.saturates,
    nutrition.riPercent.sugars,
    nutrition.riPercent.salt,
  ];

  const filledMetricCount =
    countPresent([nutrition.portionNetWeightG]) + countPresent(savedMetricValues);

  const canShowNutritionCard = countPresent(savedMetricValues) > 0;

  const hasAnyNutritionData = filledMetricCount > 0;
  const status = hasAnyNutritionData ? "verified" : "missing";
  const source =
    meta.source ??
    (hasAnyNutritionData
      ? options.sourcePdfPath
        ? "imported"
        : "manual"
      : "unknown");

  const notes: string[] = [];
  if (meta.totalIngredientCount !== null && meta.matchedIngredientCount !== null) {
    notes.push(
      `${meta.matchedIngredientCount}/${meta.totalIngredientCount} ingredients matched for nutrition.`,
    );
  }
  if (meta.unmatchedItems.length > 0) {
    notes.push(
      `${meta.unmatchedItems.length} ingredients still need nutrition matches.`,
    );
  }
  if (!nutrition.portionNetWeightG) {
    notes.push("Per 100g is strongest once portion net weight is known.");
  }
  if (meta.lockedByEditor) {
    notes.push("Manual nutrition is locked against automatic overwrite.");
  }
  if (meta.lastCalculatedAt) {
    notes.push(`Last calculated: ${meta.lastCalculatedAt}`);
  }

  const coverageLabel =
    meta.totalIngredientCount !== null
      ? meta.matchedIngredientCount !== null
        ? `${meta.matchedIngredientCount}/${meta.totalIngredientCount} ingredients matched`
        : `${meta.totalIngredientCount} ingredients tracked`
      : "No calculation coverage yet";

  return {
    nutrition,
    meta,
    status,
    source,
    badgeLabel: resolveStatusLabel(status),
    badgeVariant: resolveBadgeVariant(status),
    statusDescription: resolveStatusDescription(status),
    guidance: resolveGuidance(status, nutritionCatalogConnected),
    sourceLabel: resolveSourceLabel(source),
    hasAnyNutritionData,
    canShowNutritionCard,
    filledMetricCount,
    totalMetricCount: 14,
    coverageLabel,
    notes,
  };
}

export function estimateRecipeNutrition(options: {
  ingredients: Array<{
    text?: string | null;
    qty?: number | null;
    unit?: string | null;
    item?: string | null;
  }> | null | undefined;
  portions: number | null | undefined;
  portionNetWeightG?: number | null;
  catalog: NutritionCatalogEntry[];
}): RecipeNutritionEstimate {
  const ingredients = Array.isArray(options.ingredients) ? options.ingredients : [];
  const totalIngredientCount = ingredients.filter((ingredient) =>
    Boolean(asString(ingredient.item) || asString(ingredient.text)),
  ).length;

  const lines = ingredients.map((ingredient) => {
    const text = asString(ingredient.item) || asString(ingredient.text);
    const qty = asNumber(ingredient.qty);
    const unit = asString(ingredient.unit) || null;

    if (!text) {
      return {
        text: "",
        qty,
        unit,
        amountG: null,
        matchedItem: null,
        foodCode: null,
        score: 0,
        status: "unmatched" as const,
      };
    }

    if (qty === null) {
      return {
        text,
        qty,
        unit,
        amountG: null,
        matchedItem: null,
        foodCode: null,
        score: 0,
        status: "missing_qty" as const,
      };
    }

    const match = findBestNutritionCatalogMatch(options.catalog, text);
    const amountG = resolveNutritionAmountG(
      qty,
      unit,
      match?.entry.servingSizeG ?? null,
      text,
    );
    if (!match) {
      return {
        text,
        qty,
        unit,
        amountG,
        matchedItem: null,
        foodCode: null,
        score: 0,
        status: "unmatched" as const,
      };
    }

    if (amountG === null) {
      return {
        text,
        qty,
        unit,
        amountG: null,
        matchedItem: match.entry.item,
        foodCode: match.entry.foodCode,
        score: match.score,
        status: "unsupported_unit" as const,
      };
    }

    return {
      text,
      qty,
      unit,
      amountG,
      matchedItem: match.entry.item,
      foodCode: match.entry.foodCode,
      score: match.score,
      status: "matched" as const,
    };
  });

  const matchedLines = lines
    .map((line) => {
      if (line.status !== "matched" || line.amountG === null || !line.matchedItem) {
        return null;
      }

      const entry = options.catalog.find(
        (candidate) =>
          candidate.foodCode === line.foodCode && candidate.item === line.matchedItem,
      );
      if (!entry) return null;

      return {
        energyKj: buildPer100Contribution(entry.energyKjPer100g, line.amountG),
        energyKcal: buildPer100Contribution(entry.energyKcalPer100g, line.amountG),
        fatG: buildPer100Contribution(entry.fatGPer100g, line.amountG),
        saturatesG: buildPer100Contribution(entry.saturatesGPer100g, line.amountG),
        sugarsG: buildPer100Contribution(entry.sugarsGPer100g, line.amountG),
        saltG: buildPer100Contribution(entry.saltGPer100g, line.amountG),
      };
    })
    .filter(Boolean);

  const totals = {
    energyKj: sumNumbers(matchedLines.map((line) => line?.energyKj ?? null)),
    energyKcal: sumNumbers(matchedLines.map((line) => line?.energyKcal ?? null)),
    fatG: sumNumbers(matchedLines.map((line) => line?.fatG ?? null)),
    saturatesG: sumNumbers(matchedLines.map((line) => line?.saturatesG ?? null)),
    sugarsG: sumNumbers(matchedLines.map((line) => line?.sugarsG ?? null)),
    saltG: sumNumbers(matchedLines.map((line) => line?.saltG ?? null)),
  };

  const normalizedPortions = asNumber(options.portions);
  const perServing =
    normalizedPortions && normalizedPortions > 0
      ? {
          energyKj: roundNumber((totals.energyKj ?? 0) / normalizedPortions),
          energyKcal: roundNumber((totals.energyKcal ?? 0) / normalizedPortions),
          fatG: roundNumber((totals.fatG ?? 0) / normalizedPortions),
          saturatesG: roundNumber((totals.saturatesG ?? 0) / normalizedPortions),
          sugarsG: roundNumber((totals.sugarsG ?? 0) / normalizedPortions),
          saltG: roundNumber((totals.saltG ?? 0) / normalizedPortions),
        }
      : {
          energyKj: null,
          energyKcal: null,
          fatG: null,
          saturatesG: null,
          sugarsG: null,
          saltG: null,
        };

  const totalYieldG =
    normalizedPortions && normalizedPortions > 0 && options.portionNetWeightG
      ? roundNumber(normalizedPortions * options.portionNetWeightG)
      : null;
  const per100g =
    totalYieldG && totalYieldG > 0
      ? {
          energyKj: roundNumber(((totals.energyKj ?? 0) / totalYieldG) * 100),
          energyKcal: roundNumber(((totals.energyKcal ?? 0) / totalYieldG) * 100),
        }
      : {
          energyKj: null,
          energyKcal: null,
        };

  const matchedIngredientCount = lines.filter((line) => line.status === "matched").length;
  const unmatchedItems = lines
    .filter((line) => line.status !== "matched" && line.text)
    .map((line) => line.text);
  const notes: string[] = [];
  if (lines.some((line) => line.unit === "ML" || line.unit === "L")) {
    notes.push("Liquid quantities are currently treated as 1ml = 1g for estimation.");
  }
  if (!totalYieldG) {
    notes.push("Per 100g estimate needs portions and portion net weight to be reliable.");
  }

  return {
    status:
      matchedIngredientCount === 0
        ? "unavailable"
        : unmatchedItems.length > 0
          ? "partial"
          : "ready",
    matchedIngredientCount,
    totalIngredientCount,
    unmatchedItems,
    notes,
    lines,
    totals,
    perServing,
    per100g,
    riPercent: buildRiPercent(perServing),
  };
}
