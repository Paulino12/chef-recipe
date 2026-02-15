import { MethodBlock, RecipeDetail, RecipeIngredient, RecipeListItem } from "../types/recipe";

type RawRecipeListItem = {
  id?: unknown;
  pluNumber?: unknown;
  title?: unknown;
  categoryPath?: unknown;
  portions?: unknown;
  nutrition?: {
    portionNetWeightG?: unknown;
  };
};

type RawRecipeDetail = {
  id?: unknown;
  pluNumber?: unknown;
  title?: unknown;
  categoryPath?: unknown;
  portions?: unknown;
  ingredients?: unknown;
  method?: unknown;
  allergens?: unknown;
  nutrition?: {
    portionNetWeightG?: unknown;
  };
  visibility?: unknown;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function mapIngredient(value: unknown): RecipeIngredient {
  const source = (value ?? {}) as {
    text?: unknown;
    qty?: unknown;
    unit?: unknown;
    item?: unknown;
  };

  return {
    text: asString(source.text),
    qty: asNumber(source.qty),
    unit: asOptionalString(source.unit),
    item: asOptionalString(source.item),
  };
}

function mapMethodBlocks(value: unknown): MethodBlock[] {
  if (!Array.isArray(value)) return [];
  // Method is Sanity portable text; keep only text children for display.
  return value.map((block) => {
    const source = (block ?? {}) as MethodBlock;
    const children = Array.isArray(source.children)
      ? source.children
          .filter((child) => typeof child?.text === "string")
          .map((child) => ({ _type: child._type, text: child.text }))
      : [];

    return {
      _type: source._type,
      listItem: source.listItem,
      level: source.level,
      children,
    };
  });
}

function mapAllergens(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const rawEntries = Object.entries(value as Record<string, unknown>);
  return rawEntries.reduce<Record<string, string>>((acc, [key, raw]) => {
    if (typeof raw === "string") acc[key] = raw;
    return acc;
  }, {});
}

function mapVisibility(value: unknown) {
  const source = (value ?? {}) as { public?: unknown; enterprise?: unknown };
  return {
    public: Boolean(source.public),
    enterprise: Boolean(source.enterprise),
  };
}

export function mapListItem(raw: RawRecipeListItem): RecipeListItem {
  return {
    id: asString(raw.id),
    pluNumber: asNumber(raw.pluNumber) ?? 0,
    title: asString(raw.title, "Untitled recipe"),
    categoryPath: asStringArray(raw.categoryPath),
    portions: asNumber(raw.portions),
    portionNetWeightG: asNumber(raw.nutrition?.portionNetWeightG),
  };
}

export function mapDetail(raw: RawRecipeDetail): RecipeDetail {
  return {
    id: asString(raw.id),
    pluNumber: asNumber(raw.pluNumber) ?? 0,
    title: asString(raw.title, "Untitled recipe"),
    categoryPath: asStringArray(raw.categoryPath),
    portions: asNumber(raw.portions),
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map(mapIngredient) : [],
    method: mapMethodBlocks(raw.method),
    allergens: mapAllergens(raw.allergens),
    nutrition: {
      portionNetWeightG: asNumber(raw.nutrition?.portionNetWeightG),
    },
    visibility: mapVisibility(raw.visibility),
  };
}
