"use client";

import Link from "next/link";
import { useState } from "react";

import { ClearableInput } from "@/components/ui/clearable-input";
import { Input } from "@/components/ui/input";
import {
  applyCatalogEntryToRecipeCostLine,
  calculateCatalogLineCost,
  calculateRecipeCostTotals,
  calculateSubRecipeLineCost,
  formatRecipeCostMoney,
  type IngredientCatalogCandidate,
  type IngredientCatalogEntry,
  type RecipeCostLine,
  type ResolvedSubRecipeCosting,
  type ResolvedSubRecipeTarget,
} from "@/lib/recipeCosting";

type RecipeCostingEditorProps = {
  initialLines: RecipeCostLine[];
  initialPortions: number | null;
  currency: string;
  sourceRecipeId?: string | null;
  ingredientCatalog: IngredientCatalogEntry[];
  subRecipeCostings: Array<ResolvedSubRecipeCosting | null>;
  subRecipeTargets: Array<ResolvedSubRecipeTarget | null>;
};

type IngredientCatalogSuggestion = {
  entry: IngredientCatalogEntry;
  supplier: string;
  description: string;
  catalogCode: string;
  packSize: string;
  packPrice: number | null;
  estimatedUnitPrice: number | null;
  score: number;
};

const MAX_CATALOG_SUGGESTIONS = 15;

function parseMoneyInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function parseNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10000) / 10000;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toCatalogSuggestion(
  entry: IngredientCatalogEntry,
  candidate: IngredientCatalogCandidate | null,
  score: number,
): IngredientCatalogSuggestion {
  return {
    entry,
    supplier: candidate?.supplier || entry.matchedSupplier,
    description: candidate?.description || entry.matchedCatalogDescription,
    catalogCode: candidate?.catalogCode || entry.matchedCatalogCode,
    packSize: candidate?.packSize || entry.matchedPackSize,
    packPrice: candidate?.packPrice ?? entry.matchedPackPrice,
    estimatedUnitPrice: candidate?.estimatedUnitPrice ?? entry.estimatedUnitPrice,
    score,
  };
}

function applySuggestionToRecipeCostLine(
  line: RecipeCostLine,
  suggestion: IngredientCatalogSuggestion,
) {
  return applyCatalogEntryToRecipeCostLine(line, {
    ...suggestion.entry,
    matchedSupplier: suggestion.supplier,
    matchedCatalogDescription: suggestion.description,
    matchedCatalogCode: suggestion.catalogCode,
    matchedPackSize: suggestion.packSize,
    matchedPackPrice: suggestion.packPrice,
    estimatedUnitPrice: suggestion.estimatedUnitPrice,
  });
}

function findCatalogMatches(
  catalog: IngredientCatalogEntry[],
  searchTerm: string,
  selectedItem: string,
) {
  const normalizedQuery = normalizeSearchText(searchTerm);
  if (!normalizedQuery) return [] as IngredientCatalogSuggestion[];

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const suggestions = [...catalog]
    .flatMap((entry) => {
      const baseHaystacks = [
        normalizeSearchText(entry.item),
        normalizeSearchText(entry.canonicalItem),
        normalizeSearchText(entry.searchableText),
        normalizeSearchText(entry.matchedCatalogDescription),
      ];

      let baseScore = 0;
      for (const haystack of baseHaystacks) {
        if (!haystack) continue;
        if (haystack === normalizedQuery) baseScore = Math.max(baseScore, 120);
        else if (haystack.startsWith(normalizedQuery)) baseScore = Math.max(baseScore, 105);
        else if (tokens.every((token) => haystack.includes(token))) baseScore = Math.max(baseScore, 92);
        else if (haystack.includes(normalizedQuery)) baseScore = Math.max(baseScore, 84);
      }

      if (baseScore === 0) return [] as IngredientCatalogSuggestion[];

      const baseConfidenceBoost =
        (entry.item === selectedItem ? 4 : 0) +
        Math.round((entry.confidence ?? 0) * 10) +
        Math.min(entry.lineCount, 25) / 10;

      const variants = [
        toCatalogSuggestion(entry, null, baseScore + baseConfidenceBoost),
        ...entry.candidateMatches.map((candidate) => {
          const candidateHaystacks = [
            normalizeSearchText(candidate.description),
            normalizeSearchText(candidate.supplier),
            normalizeSearchText(`${entry.item} ${candidate.description} ${candidate.supplier}`),
          ];

          let candidateScore = baseScore;
          for (const haystack of candidateHaystacks) {
            if (!haystack) continue;
            if (haystack === normalizedQuery) candidateScore = Math.max(candidateScore, 118);
            else if (haystack.startsWith(normalizedQuery)) candidateScore = Math.max(candidateScore, 103);
            else if (tokens.every((token) => haystack.includes(token))) candidateScore = Math.max(candidateScore, 94);
            else if (haystack.includes(normalizedQuery)) candidateScore = Math.max(candidateScore, 86);
          }

          candidateScore += candidate.score ?? 0;
          return toCatalogSuggestion(entry, candidate, candidateScore + baseConfidenceBoost);
        }),
      ];

      const deduped = new Map<string, IngredientCatalogSuggestion>();
      for (const variant of variants) {
        const key = [
          variant.entry.item,
          variant.supplier,
          variant.description,
          variant.catalogCode,
        ].join("|");
        const current = deduped.get(key);
        if (!current || variant.score > current.score) {
          deduped.set(key, variant);
        }
      }

      return [...deduped.values()];
    })
    .filter((suggestion) => suggestion.score > 0)
    .sort((a, b) => b.score - a.score);

  const bySupplier = new Map<string, IngredientCatalogSuggestion[]>();
  for (const suggestion of suggestions) {
    const supplierKey = suggestion.supplier || "Unknown supplier";
    const current = bySupplier.get(supplierKey) ?? [];
    current.push(suggestion);
    bySupplier.set(supplierKey, current);
  }
  const supplierGroups = [...bySupplier.values()].sort(
    (a, b) => (b[0]?.score ?? 0) - (a[0]?.score ?? 0),
  );

  const selected: IngredientCatalogSuggestion[] = [];
  const selectedKeys = new Set<string>();

  for (let round = 0; selected.length < MAX_CATALOG_SUGGESTIONS; round += 1) {
    let addedInRound = false;
    for (const supplierSuggestions of supplierGroups) {
      const candidate = supplierSuggestions[round];
      if (!candidate) continue;
      const key = [
        candidate.entry.item,
        candidate.supplier,
        candidate.description,
        candidate.catalogCode,
      ].join("|");
      if (selectedKeys.has(key)) continue;
      selected.push(candidate);
      selectedKeys.add(key);
      addedInRound = true;
      if (selected.length >= MAX_CATALOG_SUGGESTIONS) break;
    }
    if (!addedInRound) break;
  }

  if (selected.length < MAX_CATALOG_SUGGESTIONS) {
    for (const suggestion of suggestions) {
      const key = [
        suggestion.entry.item,
        suggestion.supplier,
        suggestion.description,
        suggestion.catalogCode,
      ].join("|");
      if (selectedKeys.has(key)) continue;
      selected.push(suggestion);
      selectedKeys.add(key);
      if (selected.length >= MAX_CATALOG_SUGGESTIONS) break;
    }
  }

  return selected;
}

export function RecipeCostingEditor({
  initialLines,
  initialPortions,
  currency,
  sourceRecipeId,
  ingredientCatalog,
  subRecipeCostings,
  subRecipeTargets,
}: RecipeCostingEditorProps) {
  const [lines, setLines] = useState<RecipeCostLine[]>(initialLines);
  const [portions, setPortions] = useState<number | null>(initialPortions);
  const [openLines, setOpenLines] = useState<boolean[]>(
    initialLines.map((line, index) => index === 0 || Boolean(line.matchedItem || line.lineCost !== null)),
  );
  const [searchTerms, setSearchTerms] = useState<string[]>(
    initialLines.map((line) => line.matchedItem || line.item || line.text || ""),
  );
  const [searchTouched, setSearchTouched] = useState<boolean[]>(
    initialLines.map(() => false),
  );
  const totals = calculateRecipeCostTotals(lines, portions);

  return (
    <div className="space-y-4">
      <input type="hidden" name="costLines" value={JSON.stringify(lines)} />
      <input type="hidden" name="recipePortions" value={portions ?? ""} />
      <input type="hidden" name="sourceRecipeId" value={sourceRecipeId ?? ""} />

      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total recipe cost
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatRecipeCostMoney(totals.totalCost, currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Cost per portion
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatRecipeCostMoney(totals.costPerPortion, currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Portions
            </p>
            <div className="mt-2">
              <Input
                id="recipe-portions"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={portions ?? ""}
                onChange={(event) => {
                  setPortions(parseNumberInput(event.target.value));
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {lines.length > 0 ? (
        <div className="space-y-3">
          {lines.map((line, index) => {
            const subRecipe = subRecipeCostings[index] ?? null;
            const subRecipeTarget = subRecipeTargets[index] ?? null;
            const isSubRecipeLine = (line.unit ?? "").toUpperCase() === "PTN";
            const matches =
              searchTouched[index] && (searchTerms[index] ?? "").trim()
                ? findCatalogMatches(
                    ingredientCatalog,
                    searchTerms[index] ?? "",
                    line.matchedItem,
                  )
                : [];

            return (
              <section
                key={`${line.text}-${index}`}
                className="rounded-xl border border-border/70 bg-background/60 p-4"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenLines((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index ? !value : value,
                      ),
                    );
                  }}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{line.text || "Unnamed ingredient"}</p>
                    <p className="text-xs text-muted-foreground">
                      {subRecipe
                        ? `${subRecipe.recipeTitle} (sub-recipe)`
                        : subRecipeTarget
                          ? `${subRecipeTarget.recipeTitle} (sub-recipe)`
                        : line.matchedItem || "No catalog ingredient selected"} |{" "}
                      {formatRecipeCostMoney(line.lineCost, currency)}
                    </p>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {openLines[index] ? "Hide" : "Show"}
                  </span>
                </button>

                {openLines[index] ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.25fr)_minmax(0,0.55fr)]">
                      <div>
                        <label
                          htmlFor={`line-qty-${index}`}
                          className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          Quantity
                        </label>
                        <Input
                          id={`line-qty-${index}`}
                          type="number"
                          inputMode="decimal"
                          step="0.0001"
                          value={line.qty ?? ""}
                          onChange={(event) => {
                            const nextQty = parseNumberInput(event.target.value);
                            setLines((current) =>
                              current.map((entry, currentIndex) => {
                                if (currentIndex !== index) return entry;
                                return {
                                  ...entry,
                                  qty: nextQty,
                                  lineCost:
                                    subRecipe?.costPerPortion !== null &&
                                    subRecipe?.costPerPortion !== undefined
                                      ? calculateSubRecipeLineCost(
                                          nextQty,
                                          subRecipe.costPerPortion,
                                        )
                                      : entry.estimatedUnitPrice !== null &&
                                          entry.estimatedUnitPrice !== undefined
                                        ? calculateCatalogLineCost(
                                            nextQty,
                                            entry.unit,
                                            entry.estimatedUnitPrice,
                                          )
                                        : entry.lineCost,
                                };
                              }),
                            );
                          }}
                        />
                      </div>

                      {subRecipe ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-emerald-700">
                                Sub-recipe costing
                              </p>
                              <p className="mt-1 font-medium">{subRecipe.recipeTitle}</p>
                            </div>
                            <Link
                              href={`/owner/costing/${encodeURIComponent(subRecipe.recipeId)}`}
                              className="text-xs font-medium text-emerald-800 underline underline-offset-4"
                            >
                              Open
                            </Link>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-emerald-700">
                                Cost per portion
                              </p>
                              <p className="mt-1 font-medium">
                                {formatRecipeCostMoney(subRecipe.costPerPortion, subRecipe.currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-emerald-700">
                                Saved total
                              </p>
                              <p className="mt-1 font-medium">
                                {formatRecipeCostMoney(subRecipe.totalCost, subRecipe.currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-emerald-700">
                                Costing portions
                              </p>
                              <p className="mt-1 font-medium">
                                {subRecipe.recipePortions ?? "-"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label
                            htmlFor={`catalog-search-${index}`}
                            className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                          >
                            Ingredient
                          </label>
                            <ClearableInput
                              id={`catalog-search-${index}`}
                              value={searchTerms[index] ?? ""}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setSearchTerms((current) =>
                                current.map((term, currentIndex) =>
                                  currentIndex === index ? nextValue : term,
                                ),
                              );
                              setSearchTouched((current) =>
                                current.map((value, currentIndex) =>
                                  currentIndex === index ? true : value,
                                ),
                              );
                            }}
                            placeholder="Type to search the ingredient data"
                          />
                          {matches.length > 0 ? (
                            <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-background/70 p-2">
                              {matches.map((match) => (
                                <button
                                  key={`${match.entry.item}-${match.catalogCode}-${match.supplier}`}
                                  type="button"
                                  onClick={() => {
                                    setLines((current) =>
                                      current.map((entry, currentIndex) =>
                                        currentIndex === index
                                          ? applySuggestionToRecipeCostLine(entry, match)
                                          : entry,
                                      ),
                                    );
                                    setSearchTerms((current) =>
                                      current.map((term, currentIndex) =>
                                        currentIndex === index ? match.entry.item : term,
                                      ),
                                    );
                                    setSearchTouched((current) =>
                                      current.map((value, currentIndex) =>
                                        currentIndex === index ? false : value,
                                      ),
                                    );
                                  }}
                                  className="block w-full rounded-md border border-border/60 bg-background/90 px-3 py-2 text-left text-sm hover:bg-accent"
                                >
                                  <span className="block font-medium">{match.entry.item}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {match.description || "No catalog description"} |{" "}
                                    {match.supplier || "Unknown supplier"}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {isSubRecipeLine ? (
                            subRecipeTarget ? (
                              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                                <p className="font-medium">
                                  {subRecipeTarget.recipeTitle} is a PTN sub-recipe, but it does not
                                  have a saved costing yet.
                                </p>
                                <p className="mt-1 text-xs text-amber-800">
                                  Open the recipe or jump straight into costing it, then come back and
                                  this line can auto-fill from that saved sub-recipe costing.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Link
                                    href={`/recipes/${encodeURIComponent(subRecipeTarget.recipeId)}?from=owner`}
                                    className="text-xs font-medium text-amber-900 underline underline-offset-4"
                                  >
                                    Open recipe
                                  </Link>
                                  <Link
                                    href={`/owner/costing/${encodeURIComponent(subRecipeTarget.recipeId)}`}
                                    className="text-xs font-medium text-amber-900 underline underline-offset-4"
                                  >
                                    Cost sub-recipe
                                  </Link>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-amber-700">
                                PTN sub-recipe detected, but there is no saved sub-recipe costing yet.
                                Enter a manual line cost or cost the sub-recipe first.
                              </p>
                            )
                          ) : null}
                        </div>
                      )}

                      <div>
                        <label
                          htmlFor={`line-cost-${index}`}
                          className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          Line cost
                        </label>
                        <Input
                          id={`line-cost-${index}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={line.lineCost ?? ""}
                          onChange={(event) => {
                            const nextValue = parseMoneyInput(event.target.value);
                            setLines((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index ? { ...entry, lineCost: nextValue } : entry,
                              ),
                            );
                          }}
                        />
                      </div>
                    </div>

                    {!subRecipe && (line.matchedItem || line.matchedCatalogDescription) ? (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-sky-700">
                              Selected ingredient
                            </p>
                            <p className="mt-1 font-medium">
                              {line.matchedItem || line.matchedCatalogDescription || "Not selected"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-sky-700">
                              Catalog description
                            </p>
                            <p className="mt-1 font-medium">
                              {line.matchedCatalogDescription || "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-sky-700">
                              Supplier / pack
                            </p>
                            <p className="mt-1 font-medium">
                              {line.matchedSupplier || "-"}
                              {line.matchedPackSize ? ` | ${line.matchedPackSize}` : ""}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-sky-700">
                              Pack price / Unit price
                            </p>
                            <p className="mt-1 font-medium">
                              {line.matchedPackPrice !== null
                                ? formatRecipeCostMoney(line.matchedPackPrice, currency)
                                : "-"}
                              {" / "}
                              {line.estimatedUnitPrice !== null
                                ? formatRecipeCostMoney(line.estimatedUnitPrice, currency)
                                : "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
          No ingredients were found for this recipe, so there is nothing to cost yet.
        </div>
      )}
    </div>
  );
}
