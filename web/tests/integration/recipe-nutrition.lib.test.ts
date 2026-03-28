import { describe, expect, it } from "vitest";

import { estimateRecipeNutrition, type NutritionCatalogEntry } from "@/lib/recipeNutrition";

const catalog: NutritionCatalogEntry[] = [
  {
    foodCode: "egg-1",
    item: "Egg, raw",
    searchableText: "egg raw eggs",
    description: "Egg, raw",
    group: "Eggs",
    servingSizeG: 50,
    energyKjPer100g: 547,
    energyKcalPer100g: 131,
    fatGPer100g: 8.7,
    saturatesGPer100g: 2.7,
    sugarsGPer100g: 0.7,
    saltGPer100g: 0.31,
  },
];

describe("estimateRecipeNutrition display text precedence", () => {
  it("uses ingredient text before stale item values in unmatched review labels", () => {
    const estimate = estimateRecipeNutrition({
      ingredients: [
        {
          text: "Bananas",
          item: "Banana ripe",
          qty: 2,
          unit: "EA",
        },
      ],
      portions: 1,
      portionNetWeightG: null,
      catalog,
    });

    expect(estimate.unmatchedItems).toEqual(["Bananas"]);
  });

  it("parses leading quantity and unit text for common manual ingredient lines", () => {
    const estimate = estimateRecipeNutrition({
      ingredients: [
        {
          text: "5 Eggs",
          qty: null,
          unit: null,
          item: null,
        },
        {
          text: "1.5 Tsp Salt",
          qty: null,
          unit: null,
          item: null,
        },
      ],
      portions: 1,
      portionNetWeightG: null,
      catalog: [
        ...catalog,
        {
          foodCode: "salt-1",
          item: "Salt",
          searchableText: "salt table salt sea salt",
          description: "Salt",
          group: "Seasoning",
          servingSizeG: null,
          energyKjPer100g: 0,
          energyKcalPer100g: 0,
          fatGPer100g: 0,
          saturatesGPer100g: 0,
          sugarsGPer100g: 0,
          saltGPer100g: 100,
        },
      ],
    });

    expect(estimate.unmatchedItems).toEqual([]);
    expect(estimate.matchedIngredientCount).toBe(2);
  });
});
