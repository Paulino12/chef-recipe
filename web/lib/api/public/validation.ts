export const PUBLIC_API_COLLECTIONS = ["Dining", "Hospitality"] as const;
export const PUBLIC_API_ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soya",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type PublicRecipeCollection = (typeof PUBLIC_API_COLLECTIONS)[number];
export type PublicAllergenSlug = (typeof PUBLIC_API_ALLERGENS)[number];
export type PublicAllergenStatus = "contains" | "may_contain" | "none" | "unknown";
export type PublicRecipeSort = "title" | "updated_at" | "rn";
export type PublicRecipeOrder = "asc" | "desc";

export function parsePublicRecipeId(value: string) {
  const trimmed = value.trim();
  const raw = trimmed.startsWith("rn_") ? trimmed.slice(3) : trimmed;
  if (!/^\d+$/.test(raw)) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function isPublicRecipeCollection(value: string): value is PublicRecipeCollection {
  return value === "Dining" || value === "Hospitality";
}

export function isPublicAllergenSlug(value: string): value is PublicAllergenSlug {
  return PUBLIC_API_ALLERGENS.includes(value as PublicAllergenSlug);
}

export function isPublicRecipeSort(value: string): value is PublicRecipeSort {
  return value === "title" || value === "updated_at" || value === "rn";
}

export function isPublicRecipeOrder(value: string): value is PublicRecipeOrder {
  return value === "asc" || value === "desc";
}
