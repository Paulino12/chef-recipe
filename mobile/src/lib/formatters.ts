import { MethodBlock } from "../types/recipe";

export function formatPortions(value: number | null) {
  if (value === null) return "Portions: n/a";
  return `Portions: ${value}`;
}

export function formatWeight(value: number | null) {
  if (value === null) return "n/a";
  return `${value}g`;
}

export function methodBlocksToSteps(blocks: MethodBlock[]) {
  return blocks
    .map((block, index) => {
      const text = block.children?.map((child) => child.text?.trim() ?? "").join(" ").trim() ?? "";
      if (!text) return null;
      return `${index + 1}. ${text}`;
    })
    .filter((step): step is string => Boolean(step));
}

export function formatAllergenStatus(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "contains") return "Contains";
  if (normalized === "may_contain") return "May contain";
  if (normalized === "none") return "None";
  return value;
}
