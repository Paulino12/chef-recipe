import { describe, expect, it } from "vitest";

import {
  isPublicAllergenSlug,
  parsePublicRecipeId,
} from "@/lib/api/public/validation";

describe("public recipe helpers", () => {
  it("parses rn-based external ids", () => {
    expect(parsePublicRecipeId("rn_12086068")).toBe(12086068);
    expect(parsePublicRecipeId("12086068")).toBe(12086068);
    expect(parsePublicRecipeId(" rn_42 ")).toBe(42);
  });

  it("rejects invalid public ids", () => {
    expect(parsePublicRecipeId("")).toBeNull();
    expect(parsePublicRecipeId("abc")).toBeNull();
    expect(parsePublicRecipeId("rn_12a")).toBeNull();
    expect(parsePublicRecipeId("0")).toBeNull();
  });

  it("validates supported allergen filters", () => {
    expect(isPublicAllergenSlug("gluten")).toBe(true);
    expect(isPublicAllergenSlug("milk")).toBe(true);
    expect(isPublicAllergenSlug("caffeine")).toBe(false);
  });
});
