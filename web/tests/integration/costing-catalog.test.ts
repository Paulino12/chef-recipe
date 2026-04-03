import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listIngredientCatalogEntries } from "@/lib/api/costingCatalog";

describe("listIngredientCatalogEntries", () => {
  it("derives a unit price for single-item EA packs when the catalog only provides a pack price", async () => {
    const entries = await listIngredientCatalogEntries();
    const entry = entries.find(
      (candidate) =>
        candidate.item === "Cod: Fillet 110-140Gm (Each)" &&
        candidate.matchedSupplier === "Direct Seafood",
    );

    expect(entry).toBeDefined();
    expect(entry?.matchedPackSize).toBe("EACH");
    expect(entry?.matchedPackPrice).toBe(1.79);
    expect(entry?.estimatedUnitPrice).toBe(1.7895);
  });
});
