#!/usr/bin/env python
"""
Standalone recipe costing prototype.

This script does not modify the app or recipe data. It reads:
  - the merged recipe dataset
  - the generated ingredient match candidates

It then calculates conservative recipe costs using only trusted mappings:
  - exact
  - high_confidence

Sub-recipes (`PTN`) are resolved via a best-effort title lookup and rolled up
from their own batch cost when possible.

Outputs:
  - ../docs/recipe-costing-prototype.md
  - data/recipe_cost_prototype.json
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
DATA_DIR = ROOT / "data"
DOCS_DIR = REPO_ROOT / "docs"

RECIPE_DATASET_CANDIDATES = [
    DATA_DIR / "golden_samples_merged.json",
    DATA_DIR / "golden_samples.json",
    DATA_DIR / "hospitality_golden_samples.json",
]
MATCHES_PATH = DATA_DIR / "costing_match_candidates.json"
REPORT_PATH = DOCS_DIR / "recipe-costing-prototype.md"
OUTPUT_PATH = DATA_DIR / "recipe_cost_prototype.json"

TRUSTED_STATUSES = {"exact", "high_confidence"}


@dataclass
class CostedLine:
    item: str
    qty: float | None
    unit: str
    line_type: str
    status: str
    matched_catalog_description: str | None
    estimated_unit_price: float | None
    line_cost: float | None
    notes: str | None


@dataclass
class RecipeCostSummary:
    recipe_id: str
    title: str
    portions: float | int | None
    collection: str | None
    ingredient_count: int
    costed_lines: int
    unresolved_lines: int
    sub_recipe_lines: int
    coverage_ratio: float
    batch_cost: float | None
    portion_cost: float | None
    unresolved_items: list[str]
    trusted_only: bool
    lines: list[CostedLine]


def normalize(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\u00A0", " ").replace("\u00C2", " ")).strip()


def normalize_text(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", normalize(value).lower()).strip()


def token_key(value: object) -> str:
    return " ".join(sorted(set(normalize_text(value).split())))


def infer_pack_dimension(pack_size: object) -> str | None:
    upper = normalize(pack_size).upper()
    if not upper:
        return None
    if re.search(r"\b(?:KG|G)\b", upper):
        return "mass"
    if re.search(r"\b(?:LTR|LT|L|ML)\b", upper):
        return "volume"
    if re.search(r"\bEA\b", upper):
        return "count"
    return None


def choose_recipe_dataset() -> Path:
    for candidate in RECIPE_DATASET_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No recipe dataset JSON file found in web/data.")


def load_data() -> tuple[list[dict], dict[str, dict]]:
    recipe_dataset = choose_recipe_dataset()
    with recipe_dataset.open("r", encoding="utf-8") as handle:
        recipes = json.load(handle)
    with MATCHES_PATH.open("r", encoding="utf-8") as handle:
        matches = json.load(handle)["items"]
    matches_by_item = {row["item"]: row for row in matches}
    return recipes, matches_by_item


def build_recipe_lookup(recipes: list[dict]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for recipe in recipes:
        title = normalize(recipe.get("title"))
        if not title:
            continue
        norm = normalize_text(title)
        tkey = token_key(title)
        for key in {title, norm, tkey}:
            if key and key not in lookup:
                lookup[key] = str(recipe.get("id"))
    return lookup


def convert_qty_to_catalog_base(qty: float | int | None, recipe_unit: str, estimated_unit_price: float | None) -> tuple[float | None, str | None]:
    if qty is None or estimated_unit_price is None:
        return None, "missing_qty_or_price"

    unit = normalize(recipe_unit).upper()
    amount = float(qty)

    if unit == "G":
        return amount, None
    if unit == "KG":
        return amount * 1000.0, None
    if unit == "ML":
        return amount, None
    if unit == "L":
        return amount * 1000.0, None
    if unit == "EA":
        return amount, None
    if unit == "PTN":
        return amount, None
    return None, f"unsupported_unit:{unit or 'blank'}"


def recipe_unit_dimension(recipe_unit: object) -> str | None:
    unit = normalize(recipe_unit).upper()
    if unit in {"G", "KG"}:
        return "mass"
    if unit in {"ML", "L"}:
        return "volume"
    if unit == "EA":
        return "count"
    if unit == "PTN":
        return "portion"
    return None


def resolve_sub_recipe_id(item: str, recipe_lookup: dict[str, str]) -> str | None:
    candidates = [
        normalize(item),
        normalize_text(item),
        token_key(item),
    ]
    for candidate in candidates:
        if candidate and candidate in recipe_lookup:
            return recipe_lookup[candidate]
    return None


def round_money(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 4)


def build_recipe_index(recipes: list[dict]) -> dict[str, dict]:
    return {str(recipe.get("id")): recipe for recipe in recipes}


def main() -> None:
    recipes, matches_by_item = load_data()
    recipe_lookup = build_recipe_lookup(recipes)
    recipe_index = build_recipe_index(recipes)

    @lru_cache(maxsize=None)
    def cost_recipe(recipe_id: str, stack: tuple[str, ...] = ()) -> RecipeCostSummary:
        recipe = recipe_index[recipe_id]
        lines: list[CostedLine] = []
        batch_total = 0.0
        costed_lines = 0
        unresolved_lines = 0
        sub_recipe_lines = 0
        unresolved_items: list[str] = []

        for ingredient in recipe.get("ingredients", []) or []:
            item = normalize(ingredient.get("item"))
            unit = normalize(ingredient.get("unit")).upper()
            qty = ingredient.get("qty")
            match = matches_by_item.get(item)

            if unit == "PTN":
                sub_recipe_lines += 1
                sub_recipe_id = resolve_sub_recipe_id(item, recipe_lookup)
                if not sub_recipe_id:
                    unresolved_lines += 1
                    unresolved_items.append(item)
                    lines.append(
                        CostedLine(
                            item=item,
                            qty=qty,
                            unit=unit,
                            line_type="sub_recipe",
                            status="unresolved",
                            matched_catalog_description=None,
                            estimated_unit_price=None,
                            line_cost=None,
                            notes="no_sub_recipe_match",
                        )
                    )
                    continue
                if sub_recipe_id in stack:
                    unresolved_lines += 1
                    unresolved_items.append(item)
                    lines.append(
                        CostedLine(
                            item=item,
                            qty=qty,
                            unit=unit,
                            line_type="sub_recipe",
                            status="unresolved",
                            matched_catalog_description=None,
                            estimated_unit_price=None,
                            line_cost=None,
                            notes="recursive_cycle",
                        )
                    )
                    continue

                sub_summary = cost_recipe(sub_recipe_id, stack + (recipe_id,))
                if not sub_summary.batch_cost or not sub_summary.portions:
                    unresolved_lines += 1
                    unresolved_items.append(item)
                    lines.append(
                        CostedLine(
                            item=item,
                            qty=qty,
                            unit=unit,
                            line_type="sub_recipe",
                            status="unresolved",
                            matched_catalog_description=sub_summary.title,
                            estimated_unit_price=None,
                            line_cost=None,
                            notes="sub_recipe_not_costable",
                        )
                    )
                    continue

                amount, note = convert_qty_to_catalog_base(qty, unit, 1.0)
                if amount is None:
                    unresolved_lines += 1
                    unresolved_items.append(item)
                    lines.append(
                        CostedLine(
                            item=item,
                            qty=qty,
                            unit=unit,
                            line_type="sub_recipe",
                            status="unresolved",
                            matched_catalog_description=sub_summary.title,
                            estimated_unit_price=None,
                            line_cost=None,
                            notes=note,
                        )
                    )
                    continue

                portion_cost = sub_summary.batch_cost / float(sub_summary.portions)
                line_cost = amount * portion_cost
                batch_total += line_cost
                costed_lines += 1
                lines.append(
                    CostedLine(
                        item=item,
                        qty=qty,
                        unit=unit,
                        line_type="sub_recipe",
                        status="costed",
                        matched_catalog_description=sub_summary.title,
                        estimated_unit_price=round_money(portion_cost),
                        line_cost=round_money(line_cost),
                        notes=f"rolled_up_from_recipe:{sub_recipe_id}",
                    )
                )
                continue

            if not match:
                unresolved_lines += 1
                unresolved_items.append(item)
                lines.append(
                    CostedLine(
                        item=item,
                        qty=qty,
                        unit=unit,
                        line_type="ingredient",
                        status="unresolved",
                        matched_catalog_description=None,
                        estimated_unit_price=None,
                        line_cost=None,
                        notes="no_match_record",
                    )
                )
                continue

            if match.get("match_status") not in TRUSTED_STATUSES:
                unresolved_lines += 1
                unresolved_items.append(item)
                lines.append(
                    CostedLine(
                        item=item,
                        qty=qty,
                        unit=unit,
                        line_type="ingredient",
                        status="unresolved",
                        matched_catalog_description=match.get("matched_catalog_description"),
                        estimated_unit_price=match.get("estimated_unit_price"),
                        line_cost=None,
                        notes=f"untrusted_match_status:{match.get('match_status')}",
                    )
                )
                continue

            pack_dimension = infer_pack_dimension(match.get("matched_pack_size"))
            unit_dimension = recipe_unit_dimension(unit)
            if pack_dimension and unit_dimension and pack_dimension != unit_dimension:
                unresolved_lines += 1
                unresolved_items.append(item)
                lines.append(
                    CostedLine(
                        item=item,
                        qty=qty,
                        unit=unit,
                        line_type="ingredient",
                        status="unresolved",
                        matched_catalog_description=match.get("matched_catalog_description"),
                        estimated_unit_price=match.get("estimated_unit_price"),
                        line_cost=None,
                        notes=f"unit_dimension_mismatch:{unit_dimension}->{pack_dimension}",
                    )
                )
                continue

            amount, note = convert_qty_to_catalog_base(qty, unit, match.get("estimated_unit_price"))
            if amount is None:
                unresolved_lines += 1
                unresolved_items.append(item)
                lines.append(
                    CostedLine(
                        item=item,
                        qty=qty,
                        unit=unit,
                        line_type="ingredient",
                        status="unresolved",
                        matched_catalog_description=match.get("matched_catalog_description"),
                        estimated_unit_price=match.get("estimated_unit_price"),
                        line_cost=None,
                        notes=note,
                    )
                )
                continue

            line_cost = amount * float(match["estimated_unit_price"])
            batch_total += line_cost
            costed_lines += 1
            lines.append(
                CostedLine(
                    item=item,
                    qty=qty,
                    unit=unit,
                    line_type="ingredient",
                    status="costed",
                    matched_catalog_description=match.get("matched_catalog_description"),
                    estimated_unit_price=round_money(match.get("estimated_unit_price")),
                    line_cost=round_money(line_cost),
                    notes=match.get("match_status"),
                )
            )

        ingredient_count = len(recipe.get("ingredients", []) or [])
        coverage_ratio = (costed_lines / ingredient_count) if ingredient_count else 0.0
        batch_cost = round_money(batch_total) if costed_lines else None
        portions = recipe.get("portions")
        portion_cost = round_money(batch_total / float(portions)) if batch_cost is not None and portions else None

        return RecipeCostSummary(
            recipe_id=str(recipe.get("id")),
            title=normalize(recipe.get("title")),
            portions=portions,
            collection=recipe.get("collection"),
            ingredient_count=ingredient_count,
            costed_lines=costed_lines,
            unresolved_lines=unresolved_lines,
            sub_recipe_lines=sub_recipe_lines,
            coverage_ratio=round(coverage_ratio, 4),
            batch_cost=batch_cost,
            portion_cost=portion_cost,
            unresolved_items=sorted(set(unresolved_items))[:25],
            trusted_only=True,
            lines=lines,
        )

    summaries = [cost_recipe(str(recipe.get("id"))) for recipe in recipes]
    fully_costed = [row for row in summaries if row.ingredient_count > 0 and row.unresolved_lines == 0 and row.batch_cost is not None]
    partial_costed = [row for row in summaries if row.costed_lines > 0 and row.unresolved_lines > 0]
    unresolved = [row for row in summaries if row.costed_lines == 0]

    fully_costed.sort(key=lambda row: (-row.batch_cost if row.batch_cost else 0, row.title))
    partial_costed.sort(key=lambda row: (-row.coverage_ratio, row.title))
    unresolved.sort(key=lambda row: (-row.ingredient_count, row.title))

    sample_recipes = fully_costed[:5] + partial_costed[:5]
    payload = {
        "trustedStatuses": sorted(TRUSTED_STATUSES),
        "recipeCount": len(summaries),
        "fullyCostedCount": len(fully_costed),
        "partiallyCostedCount": len(partial_costed),
        "unresolvedCount": len(unresolved),
        "recipes": [asdict(summary) for summary in summaries],
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    report_lines = [
        "# Recipe Costing Prototype",
        "",
        "Conservative standalone recipe cost calculation using only trusted ingredient matches.",
        "",
        "## Rules",
        "",
        "- Trusted ingredient matches: `exact`, `high_confidence`",
        "- Other ingredient matches are left unresolved",
        "- Supported unit conversions: `G`, `KG`, `ML`, `L`, `EA`",
        "- `PTN` lines attempt sub-recipe rollup using recipe title matching",
        "- No app code or recipe source data is modified",
        "",
        "## Summary",
        "",
        f"- Recipes analysed: `{len(summaries):,}`",
        f"- Fully costed recipes: `{len(fully_costed):,}`",
        f"- Partially costed recipes: `{len(partial_costed):,}`",
        f"- Recipes with no trusted cost coverage: `{len(unresolved):,}`",
        f"- Output JSON: `web/data/recipe_cost_prototype.json`",
        "",
        "## Sample Fully Costed Recipes",
        "",
        "| Recipe | Portions | Batch cost | Portion cost | Coverage |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]

    for recipe in fully_costed[:10]:
        report_lines.append(
            f"| {recipe.title.replace('|', '/')} | {recipe.portions} | "
            f"{recipe.batch_cost if recipe.batch_cost is not None else '-'} | "
            f"{recipe.portion_cost if recipe.portion_cost is not None else '-'} | "
            f"{recipe.coverage_ratio * 100:.1f}% |"
        )

    report_lines.extend(
        [
            "",
            "## Sample Partial Recipes",
            "",
            "| Recipe | Costed lines | Unresolved lines | Batch cost | Coverage | Unresolved items |",
            "| --- | ---: | ---: | ---: | ---: | --- |",
        ]
    )

    for recipe in partial_costed[:10]:
        report_lines.append(
            f"| {recipe.title.replace('|', '/')} | {recipe.costed_lines} | {recipe.unresolved_lines} | "
            f"{recipe.batch_cost if recipe.batch_cost is not None else '-'} | {recipe.coverage_ratio * 100:.1f}% | "
            f"{', '.join(recipe.unresolved_items[:4]).replace('|', '/')} |"
        )

    report_lines.extend(
        [
            "",
            "## Detailed Samples",
            "",
        ]
    )

    for sample in sample_recipes:
        report_lines.extend(
            [
                f"### {sample.title}",
                "",
                f"- Recipe id: `{sample.recipe_id}`",
                f"- Portions: `{sample.portions}`",
                f"- Batch cost: `{sample.batch_cost}`",
                f"- Portion cost: `{sample.portion_cost}`",
                f"- Coverage: `{sample.coverage_ratio * 100:.1f}%`",
                "",
                "| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |",
                "| --- | ---: | --- | --- | --- | ---: | --- |",
            ]
        )
        for line in sample.lines[:20]:
            report_lines.append(
                f"| {line.item.replace('|', '/')} | {line.qty if line.qty is not None else '-'} | {line.unit or '-'} | "
                f"{line.status} | {(line.matched_catalog_description or '-').replace('|', '/')} | "
                f"{line.line_cost if line.line_cost is not None else '-'} | {(line.notes or '-').replace('|', '/')} |"
            )
        report_lines.append("")

    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")

    print(
        json.dumps(
            {
                "recipeCount": len(summaries),
                "fullyCostedCount": len(fully_costed),
                "partiallyCostedCount": len(partial_costed),
                "unresolvedCount": len(unresolved),
                "reportPath": str(REPORT_PATH.relative_to(REPO_ROOT)),
                "outputPath": str(OUTPUT_PATH.relative_to(ROOT)),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
