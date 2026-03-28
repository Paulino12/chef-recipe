import { describe, expect, it } from "vitest";

import { calculateCatalogLineCost } from "@/lib/recipeCosting";

describe("calculateCatalogLineCost unit normalization", () => {
  it("prices each-based aliases like 'each'", () => {
    expect(calculateCatalogLineCost(12, "each", 0.35)).toBe(4.2);
  });

  it("prices piece-based aliases like 'pcs'", () => {
    expect(calculateCatalogLineCost(6, "pcs", 0.5)).toBe(3);
  });

  it("converts litre aliases into millilitre-based pricing", () => {
    expect(calculateCatalogLineCost(1.5, "ltrs", 0.002)).toBe(3);
  });
});
