#!/usr/bin/env python
"""
Prototype costing-readiness analysis for recipe datasets.

This script:
1. Loads the merged recipe dataset already used by the project.
2. Loads the ingredient workbook supplied by the user.
3. Normalizes recipe ingredient labels and catalog descriptions.
4. Suggests likely catalog matches for each unique recipe ingredient item.
5. Produces a markdown report and JSON output for review.

Outputs:
  - ../docs/recipe-costing-analysis.md
  - data/costing_match_candidates.json
"""

from __future__ import annotations

import json
import re
import zipfile
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from difflib import SequenceMatcher
from typing import Iterable
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
DATA_DIR = ROOT / "data"
DOCS_DIR = REPO_ROOT / "docs"

WORKBOOK_PATH = DATA_DIR / "Recipes Ingredients.xlsx"
REPORT_PATH = DOCS_DIR / "recipe-costing-analysis.md"
MATCHES_PATH = DATA_DIR / "costing_match_candidates.json"
GROUPS_PATH = DATA_DIR / "costing_canonical_groups.json"

RECIPE_DATASET_CANDIDATES = [
    DATA_DIR / "golden_samples_merged.json",
    DATA_DIR / "golden_samples.json",
    DATA_DIR / "hospitality_golden_samples.json",
]

WORKBOOK_SHEET = "All Ingredients + Supplier"
XML_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

SUPPLIER_PHRASES = [
    "Classic Fine Foods UK Ltd",
    "Fine Foods UK Ltd",
    "Frozen Foodservice Ltd",
    "Food Service Limited",
    "Foodservice Limited",
    "Harvey & Brockless Limited",
    "Belazu Ingredient Company",
    "The Ingredient Company",
    "Peters Food Service Limited",
    "Peters Food Service",
    "Asher & Son Ltd",
    "First Choice Produce",
    "The United Fresh Consortium Lt",
    "Seafood Holdings t/a Direct Se",
    "Vegetarian Express",
    "Lomond Fine Foods",
    "Enotria Winecellars",
    "MSK Ingredients",
    "Compass Group UK and Ireland",
    "Brakes",
    "Bidfood",
    "Sysco",
    "Caterers Pride",
    "Ltd",
    "Limited",
]

TRAILING_TOKENS = {
    "BB",
    "PK",
    "PETBTL",
    "B/B",
    "FROZEN",
    "CATERING",
    "PREMIUM",
    "LTD",
    "LIMITED",
    "FOODSERVICE",
    "COMPANY",
    "UK",
}

STOP_WORDS = {
    "and",
    "bb",
    "brand",
    "classic",
    "in",
    "of",
    "the",
    "with",
    "each",
    "everyday",
    "favourites",
    "approx",
    "kg",
    "g",
    "ml",
    "l",
    "pkt",
    "pk",
    "prep",
    "tub",
    "frozen",
    "fresh",
    "x",
}

IRREGULAR_SINGULARS = {
    "leaves": "leaf",
    "tomatoes": "tomato",
    "potatoes": "potato",
    "berries": "berry",
    "chillies": "chilli",
    "chilies": "chilli",
    "limes": "lime",
    "lemons": "lemon",
    "onions": "onion",
    "shallots": "shallot",
    "carrots": "carrot",
    "aubergines": "aubergine",
    "courgettes": "courgette",
    "peppers": "pepper",
    "apples": "apple",
    "pears": "pear",
    "eggs": "egg",
}

PACK_UNIT_FACTORS = {
    "KG": 1000.0,
    "G": 1.0,
    "L": 1000.0,
    "LT": 1000.0,
    "LTR": 1000.0,
    "ML": 1.0,
    "EA": 1.0,
    "PK": 1.0,
}


@dataclass
class CatalogItem:
    supplier: str
    source_sheet: str
    code: str
    description: str
    pack_size: str
    price: float | None
    total_items: float | None
    price_per_item: float | None
    weighted_item: str
    manufacturer: str
    canonical_description: str
    searchable_text: str
    base_unit: str | None
    base_quantity: float | None
    estimated_unit_price: float | None


@dataclass
class RecipeIngredientUsage:
    item: str
    canonical_item: str
    canonical_group_key: str
    searchable_text: str
    line_count: int
    recipe_count: int
    units: list[str]
    sample_recipes: list[str]
    match_status: str
    confidence: float
    is_sub_recipe: bool
    matched_catalog_code: str | None
    matched_catalog_description: str | None
    matched_supplier: str | None
    matched_pack_size: str | None
    estimated_unit_price: float | None
    candidate_matches: list[dict]


@dataclass
class CanonicalIngredientGroup:
    canonical_group_key: str
    label_count: int
    line_count: int
    recipe_count: int
    labels: list[str]
    units: list[str]
    match_statuses: list[str]
    sample_best_match: str | None


def normalize(value: object) -> str:
    return (
        str(value or "")
        .replace("\u00A0", " ")
        .replace("\u00C2", " ")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\t", " ")
        .strip()
    )


def normalize_spaces(value: object) -> str:
    return re.sub(r"\s+", " ", normalize(value)).strip()


def remove_supplier_phrase(value: str) -> str:
    out = normalize_spaces(value)
    lower = out.lower()
    for phrase in SUPPLIER_PHRASES:
        idx = lower.find(phrase.lower())
        if idx > 0:
            out = out[:idx].strip()
            lower = out.lower()
    return out


def strip_tail(value: str) -> str:
    out = normalize_spaces(value)
    previous = ""
    while out != previous:
        previous = out
        out = (
            out.replace("© Compass Group UK and Ireland", "")
            .replace("(V)", "")
            .replace("(VG)", "")
            .replace("(VE)", "")
            .replace("(O)", "")
        )
        out = re.sub(r"\s+Ingredient\s+not\s+on\s+unit\b.*$", "", out, flags=re.I)
        out = re.sub(r"\s+Product\s+not\s+on\s+unit\b.*$", "", out, flags=re.I)
        out = re.sub(r"\s+[A-Z]{2,}[A-Z0-9-]*\d+[A-Z0-9-]*$", "", out)
        out = re.sub(r"\s+\d+(?:\.\d+)?\s?(?:KG|G|L|ML|CL|OZ|LB|EA|CM|MM)\b$", "", out, flags=re.I)
        out = re.sub(
            r"\s+\d+(?:\.\d+)?\s?[xX]\s?\d+(?:\.\d+)?\s?(?:KG|G|L|ML|CL|OZ|LB)\b$",
            "",
            out,
            flags=re.I,
        )
        out = re.sub(r"\s+\d+\s?[xX]\s?\d+\b$", "", out, flags=re.I)
        out = re.sub(r"\s+Pack\s+of\s+\d+\b$", "", out, flags=re.I)
        out = re.sub(r"\s+\d+(?:-\d+)?\s?Bulbs\b$", "", out, flags=re.I)
        out = re.sub(r"\s+\d+\/?\d*\s?N\b$", "", out, flags=re.I)
        out = re.sub(
            r"\s+\d+(?:\.\d+)?\s?(?:G|KG|ML|L)\s*\/\s*\d+(?:\.\d+)?\s?(?:G|KG|ML|L)\b$",
            "",
            out,
            flags=re.I,
        )
        out = re.sub(
            r"\s+\d+(?:\.\d+)?\s?(?:G|KG|ML|L)\s*\/\s*(?:G|KG|ML|L)\b$",
            "",
            out,
            flags=re.I,
        )
        parts = out.split(" ")
        while len(parts) > 1:
            last = re.sub(r"[^A-Za-z/]", "", parts[-1]).upper()
            if not last:
                parts.pop()
                continue
            if last in TRAILING_TOKENS:
                parts.pop()
                continue
            break
        out = " ".join(parts).rstrip(" -,/").strip()
    return normalize_spaces(out)


def clean_label(value: str) -> str:
    src = normalize_spaces(value)
    if not src:
        return ""
    return normalize_spaces(strip_tail(remove_supplier_phrase(src))) or src


def searchable_text(value: str) -> str:
    value = clean_label(value).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return normalize_spaces(value)


def tokenise(value: str) -> list[str]:
    return [token for token in searchable_text(value).split(" ") if token and token not in STOP_WORDS]


def token_key(value: str) -> str:
    return " ".join(sorted(set(tokenise(value))))


def singularize_token(token: str) -> str:
    token = token.strip().lower()
    if not token:
        return token
    if token in IRREGULAR_SINGULARS:
        return IRREGULAR_SINGULARS[token]
    if len(token) <= 3:
        return token
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith("oes") and len(token) > 4:
        return token[:-2]
    if token.endswith("sses") or token.endswith("uses"):
        return token
    if token.endswith("es") and len(token) > 4 and token[-3] in {"s", "x", "z"}:
        return token[:-2]
    if token.endswith("s") and len(token) > 4 and not token.endswith("ss"):
        return token[:-1]
    return token


def canonical_group_key(value: str) -> str:
    tokens = [singularize_token(token) for token in tokenise(value)]
    return " ".join(sorted(set(tokens)))


def parse_float(value: object) -> float | None:
    text = normalize_spaces(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def read_xlsx_sheet(path: Path, sheet_name: str) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as workbook:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            strings_root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for string_item in strings_root.findall("a:si", XML_NS):
                shared_strings.append("".join(node.text or "" for node in string_item.iterfind(".//a:t", XML_NS)))

        workbook_root = ET.fromstring(workbook.read("xl/workbook.xml"))
        relationships_root = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relationships_root}

        sheet_rel_id = None
        sheets_node = workbook_root.find("a:sheets", XML_NS)
        for sheet in sheets_node if sheets_node is not None else []:
            if sheet.attrib.get("name") == sheet_name:
                sheet_rel_id = sheet.attrib.get(REL_NS)
                break
        if not sheet_rel_id:
            raise ValueError(f"Sheet not found: {sheet_name}")

        sheet_target = rel_map[sheet_rel_id]
        sheet_root = ET.fromstring(workbook.read(f"xl/{sheet_target}"))

        rows: list[list[str]] = []
        for row in sheet_root.findall(".//a:sheetData/a:row", XML_NS):
            current_row: list[str] = []
            for cell in row.findall("a:c", XML_NS):
                cell_type = cell.attrib.get("t")
                value_node = cell.find("a:v", XML_NS)
                if value_node is None:
                    current_row.append("")
                elif cell_type == "s":
                    current_row.append(shared_strings[int(value_node.text or "0")])
                else:
                    current_row.append(value_node.text or "")
            rows.append(current_row)

    if not rows:
        return []

    header = [normalize_spaces(value) for value in rows[0]]
    parsed_rows: list[dict[str, str]] = []
    for row in rows[1:]:
        record = {header[index]: normalize_spaces(row[index]) if index < len(row) else "" for index in range(len(header))}
        if any(record.values()):
            parsed_rows.append(record)
    return parsed_rows


def choose_recipe_dataset() -> Path:
    for candidate in RECIPE_DATASET_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No recipe dataset JSON file found in web/data.")


def parse_pack_size(pack_size: str, total_items: float | None) -> tuple[str | None, float | None]:
    if total_items and total_items > 0:
        upper = normalize_spaces(pack_size).upper()
        if re.search(r"\b(?:KG|G)\b", upper):
            return "G", total_items * 1000
        if re.search(r"\b(?:LTR|LT|L|ML)\b", upper):
            return "ML", total_items * 1000
        return "EA", total_items

    matches = re.findall(r"(\d+(?:\.\d+)?)\s*(KG|G|LTR|LT|L|ML|EA|PK)\b", normalize_spaces(pack_size).upper())
    if not matches:
        return None, None

    total_quantity = 1.0
    chosen_unit: str | None = None
    for raw_qty, unit in matches:
        factor = PACK_UNIT_FACTORS.get(unit, 1.0)
        total_quantity *= float(raw_qty) * factor
        chosen_unit = "G" if unit in {"KG", "G"} else "ML" if unit in {"L", "ML"} else "EA"
    return chosen_unit, total_quantity


def load_catalog() -> list[CatalogItem]:
    rows = read_xlsx_sheet(WORKBOOK_PATH, WORKBOOK_SHEET)
    catalog: list[CatalogItem] = []
    for row in rows:
        description = row.get("Description", "")
        if not description:
            continue

        price = parse_float(row.get("Price"))
        total_items = parse_float(row.get("Total Items"))
        price_per_item = parse_float(row.get("Price per Item"))
        base_unit, base_quantity = parse_pack_size(row.get("Pack Size", ""), total_items)

        estimated_unit_price = None
        if price is not None and base_quantity and base_quantity > 0:
            estimated_unit_price = price / base_quantity
        elif price_per_item is not None:
            estimated_unit_price = price_per_item

        catalog.append(
            CatalogItem(
                supplier=row.get("Supplier", ""),
                source_sheet=row.get("Source Sheet", ""),
                code=row.get("Code", ""),
                description=description,
                pack_size=row.get("Pack Size", ""),
                price=price,
                total_items=total_items,
                price_per_item=price_per_item,
                weighted_item=row.get("Weighted Item", ""),
                manufacturer=row.get("Manufacturer", ""),
                canonical_description=clean_label(description),
                searchable_text=searchable_text(description),
                base_unit=base_unit,
                base_quantity=base_quantity,
                estimated_unit_price=estimated_unit_price,
            )
        )
    return catalog


def load_recipe_ingredients(recipe_dataset: Path) -> tuple[list[dict], list[dict]]:
    with recipe_dataset.open("r", encoding="utf-8") as handle:
        recipes = json.load(handle)

    usages_by_item: dict[str, dict] = {}
    ingredient_lines: list[dict] = []

    for recipe in recipes:
        recipe_title = normalize_spaces(recipe.get("title"))
        for ingredient in recipe.get("ingredients", []) or []:
            item = normalize_spaces(ingredient.get("item"))
            text = normalize_spaces(ingredient.get("text"))
            unit = normalize_spaces(ingredient.get("unit")).upper()

            if not item:
                continue

            entry = usages_by_item.setdefault(
                item,
                {
                    "item": item,
                    "canonical_item": clean_label(item),
                    "canonical_group_key": canonical_group_key(item),
                    "searchable_text": searchable_text(item),
                    "line_count": 0,
                    "recipe_titles": set(),
                    "units": Counter(),
                    "is_sub_recipe": False,
                },
            )
            entry["line_count"] += 1
            if recipe_title:
                entry["recipe_titles"].add(recipe_title)
            if unit:
                entry["units"][unit] += 1
            if unit == "PTN" or re.search(r"\bPTN\b", text, flags=re.I):
                entry["is_sub_recipe"] = True

            ingredient_lines.append(
                {
                    "item": item,
                    "canonical_item": entry["canonical_item"],
                    "canonical_group_key": entry["canonical_group_key"],
                    "searchable_text": entry["searchable_text"],
                    "unit": unit,
                    "qty": ingredient.get("qty"),
                    "recipe_title": recipe_title,
                    "is_sub_recipe": entry["is_sub_recipe"],
                }
            )

    ingredient_usage_rows: list[dict] = []
    for value in usages_by_item.values():
        ingredient_usage_rows.append(
            {
                "item": value["item"],
                "canonical_item": value["canonical_item"],
                "canonical_group_key": value["canonical_group_key"],
                "searchable_text": value["searchable_text"],
                "line_count": value["line_count"],
                "recipe_count": len(value["recipe_titles"]),
                "units": [unit for unit, _count in value["units"].most_common()],
                "sample_recipes": sorted(value["recipe_titles"])[:5],
                "is_sub_recipe": value["is_sub_recipe"],
            }
        )

    ingredient_usage_rows.sort(key=lambda row: (-row["line_count"], row["item"]))
    return ingredient_usage_rows, ingredient_lines


def score_candidate(recipe_tokens: list[str], catalog_tokens: list[str]) -> float:
    if not recipe_tokens or not catalog_tokens:
        return 0.0

    recipe_set = set(recipe_tokens)
    catalog_set = set(catalog_tokens)
    intersection = recipe_set & catalog_set
    if not intersection:
        return 0.0

    coverage_recipe = len(intersection) / len(recipe_set)
    coverage_catalog = len(intersection) / len(catalog_set)
    jaccard = len(intersection) / len(recipe_set | catalog_set)

    recipe_text = " ".join(recipe_tokens)
    catalog_text = " ".join(catalog_tokens)
    phrase_similarity = SequenceMatcher(None, recipe_text, catalog_text).ratio()

    return round(
        (coverage_recipe * 0.45)
        + (coverage_catalog * 0.2)
        + (jaccard * 0.15)
        + (phrase_similarity * 0.2),
        4,
    )


def build_match_candidates(
    ingredient_rows: list[dict],
    catalog: list[CatalogItem],
) -> list[RecipeIngredientUsage]:
    exact_by_search = defaultdict(list)
    exact_by_token_key = defaultdict(list)
    catalog_token_cache: list[tuple[CatalogItem, list[str]]] = []

    for item in catalog:
        exact_by_search[item.searchable_text].append(item)
        exact_by_token_key[token_key(item.description)].append(item)
        catalog_token_cache.append((item, tokenise(item.description)))

    usage_rows: list[RecipeIngredientUsage] = []
    for ingredient in ingredient_rows:
        search = ingredient["searchable_text"]
        exact_matches = exact_by_search.get(search, [])
        token_key_matches = exact_by_token_key.get(token_key(ingredient["item"]), [])
        top_candidates: list[tuple[float, CatalogItem]] = []

        if exact_matches:
            chosen = exact_matches[0]
            candidate_matches = [
                {
                    "score": 1.0,
                    "catalogCode": match.code,
                    "description": match.description,
                    "supplier": match.supplier,
                    "packSize": match.pack_size,
                    "estimatedUnitPrice": match.estimated_unit_price,
                }
                for match in exact_matches[:5]
            ]
            usage_rows.append(
                RecipeIngredientUsage(
                    item=ingredient["item"],
                    canonical_item=ingredient["canonical_item"],
                    canonical_group_key=ingredient["canonical_group_key"],
                    searchable_text=search,
                    line_count=ingredient["line_count"],
                    recipe_count=ingredient["recipe_count"],
                    units=ingredient["units"],
                    sample_recipes=ingredient["sample_recipes"],
                    match_status="exact",
                    confidence=1.0,
                    is_sub_recipe=ingredient["is_sub_recipe"],
                    matched_catalog_code=chosen.code,
                    matched_catalog_description=chosen.description,
                    matched_supplier=chosen.supplier,
                    matched_pack_size=chosen.pack_size,
                    estimated_unit_price=chosen.estimated_unit_price,
                    candidate_matches=candidate_matches,
                )
            )
            continue

        if token_key_matches:
            deduped_matches = []
            seen_token_key_matches: set[tuple[str, str]] = set()
            for match in token_key_matches:
                dedupe_key = (match.code, match.description)
                if dedupe_key in seen_token_key_matches:
                    continue
                seen_token_key_matches.add(dedupe_key)
                deduped_matches.append(match)
            chosen = deduped_matches[0]
            candidate_matches = [
                {
                    "score": 0.97,
                    "catalogCode": match.code,
                    "description": match.description,
                    "supplier": match.supplier,
                    "packSize": match.pack_size,
                    "estimatedUnitPrice": match.estimated_unit_price,
                }
                for match in deduped_matches[:5]
            ]
            usage_rows.append(
                RecipeIngredientUsage(
                    item=ingredient["item"],
                    canonical_item=ingredient["canonical_item"],
                    canonical_group_key=ingredient["canonical_group_key"],
                    searchable_text=search,
                    line_count=ingredient["line_count"],
                    recipe_count=ingredient["recipe_count"],
                    units=ingredient["units"],
                    sample_recipes=ingredient["sample_recipes"],
                    match_status="high_confidence" if not ingredient["is_sub_recipe"] else "sub_recipe",
                    confidence=0.97 if not ingredient["is_sub_recipe"] else 0.97,
                    is_sub_recipe=ingredient["is_sub_recipe"],
                    matched_catalog_code=chosen.code,
                    matched_catalog_description=chosen.description,
                    matched_supplier=chosen.supplier,
                    matched_pack_size=chosen.pack_size,
                    estimated_unit_price=chosen.estimated_unit_price,
                    candidate_matches=candidate_matches,
                )
            )
            continue

        recipe_tokens = tokenise(ingredient["item"])
        seen_candidates: set[tuple[str, str]] = set()
        for catalog_item, catalog_tokens in catalog_token_cache:
            score = score_candidate(recipe_tokens, catalog_tokens)
            if score < 0.35:
                continue
            dedupe_key = (catalog_item.code, catalog_item.description)
            if dedupe_key in seen_candidates:
                continue
            seen_candidates.add(dedupe_key)
            top_candidates.append((score, catalog_item))

        top_candidates.sort(key=lambda pair: (-pair[0], pair[1].description))
        top_candidates = top_candidates[:5]

        candidate_matches = [
            {
                "score": score,
                "catalogCode": candidate.code,
                "description": candidate.description,
                "supplier": candidate.supplier,
                "packSize": candidate.pack_size,
                "estimatedUnitPrice": candidate.estimated_unit_price,
            }
            for score, candidate in top_candidates
        ]

        best_score = top_candidates[0][0] if top_candidates else 0.0
        if ingredient["is_sub_recipe"]:
            match_status = "sub_recipe"
        elif best_score >= 0.92:
            match_status = "high_confidence"
        elif best_score >= 0.72:
            match_status = "review"
        elif best_score >= 0.35:
            match_status = "low_confidence"
        else:
            match_status = "unmatched"

        best = top_candidates[0][1] if top_candidates else None
        usage_rows.append(
            RecipeIngredientUsage(
                item=ingredient["item"],
                canonical_item=ingredient["canonical_item"],
                canonical_group_key=ingredient["canonical_group_key"],
                searchable_text=search,
                line_count=ingredient["line_count"],
                recipe_count=ingredient["recipe_count"],
                units=ingredient["units"],
                sample_recipes=ingredient["sample_recipes"],
                match_status=match_status,
                confidence=best_score,
                is_sub_recipe=ingredient["is_sub_recipe"],
                matched_catalog_code=best.code if best else None,
                matched_catalog_description=best.description if best else None,
                matched_supplier=best.supplier if best else None,
                matched_pack_size=best.pack_size if best else None,
                estimated_unit_price=best.estimated_unit_price if best else None,
                candidate_matches=candidate_matches,
            )
        )

    usage_rows.sort(key=lambda row: (-row.line_count, row.item))
    return usage_rows


def aggregate_line_coverage(ingredient_lines: list[dict], matches: dict[str, RecipeIngredientUsage]) -> dict[str, int]:
    summary = Counter()
    for line in ingredient_lines:
        match = matches.get(line["item"])
        if not match:
            summary["unmatched"] += 1
            continue
        summary[match.match_status] += 1
    return dict(summary)


def format_percentage(value: float) -> str:
    return f"{value * 100:.1f}%"


def top_rows(rows: Iterable[RecipeIngredientUsage], status: str, limit: int = 15) -> list[RecipeIngredientUsage]:
    filtered = [row for row in rows if row.match_status == status]
    filtered.sort(key=lambda row: (-row.line_count, row.item))
    return filtered[:limit]


def build_canonical_groups(matches: list[RecipeIngredientUsage]) -> list[CanonicalIngredientGroup]:
    groups: dict[str, dict] = {}
    for match in matches:
        key = match.canonical_group_key or match.searchable_text or match.item.lower()
        entry = groups.setdefault(
            key,
            {
                "canonical_group_key": key,
                "labels": set(),
                "line_count": 0,
                "recipe_count": 0,
                "units": Counter(),
                "match_statuses": Counter(),
                "best_match": None,
                "best_score": -1.0,
            },
        )
        entry["labels"].add(match.item)
        entry["line_count"] += match.line_count
        entry["recipe_count"] += match.recipe_count
        for unit in match.units:
            entry["units"][unit] += 1
        entry["match_statuses"][match.match_status] += 1
        if match.confidence > entry["best_score"] and match.matched_catalog_description:
            entry["best_score"] = match.confidence
            entry["best_match"] = match.matched_catalog_description

    result: list[CanonicalIngredientGroup] = []
    for entry in groups.values():
        result.append(
            CanonicalIngredientGroup(
                canonical_group_key=entry["canonical_group_key"],
                label_count=len(entry["labels"]),
                line_count=entry["line_count"],
                recipe_count=entry["recipe_count"],
                labels=sorted(entry["labels"])[:12],
                units=[unit for unit, _count in entry["units"].most_common()],
                match_statuses=[status for status, _count in entry["match_statuses"].most_common()],
                sample_best_match=entry["best_match"],
            )
        )

    result.sort(key=lambda row: (-row.line_count, row.canonical_group_key))
    return result


def top_variant_groups(groups: list[CanonicalIngredientGroup], limit: int = 15) -> list[CanonicalIngredientGroup]:
    rows = [group for group in groups if group.label_count > 1]
    rows.sort(key=lambda row: (-row.label_count, -row.line_count, row.canonical_group_key))
    return rows[:limit]


def render_table(rows: list[RecipeIngredientUsage], include_candidate: bool = True) -> list[str]:
    output = [
        "| Ingredient | Lines | Status | Confidence | Best candidate | Sample recipes |",
        "| --- | ---: | --- | ---: | --- | --- |",
    ]
    for row in rows:
        candidate = row.matched_catalog_description or "-"
        if include_candidate and row.matched_supplier:
            candidate = f"{candidate} ({row.matched_supplier})"
        output.append(
            "| "
            + " | ".join(
                [
                    row.item.replace("|", "/"),
                    str(row.line_count),
                    row.match_status,
                    f"{row.confidence:.2f}",
                    candidate.replace("|", "/"),
                    ", ".join(row.sample_recipes[:2]).replace("|", "/") or "-",
                ]
            )
            + " |"
        )
    return output


def write_report(
    recipe_dataset: Path,
    ingredient_rows: list[dict],
    ingredient_lines: list[dict],
    catalog: list[CatalogItem],
    matches: list[RecipeIngredientUsage],
    groups: list[CanonicalIngredientGroup],
) -> None:
    match_map = {match.item: match for match in matches}
    line_coverage = aggregate_line_coverage(ingredient_lines, match_map)
    unique_counts = Counter(match.match_status for match in matches)

    unique_total = len(matches)
    canonical_total = len(groups)
    line_total = len(ingredient_lines)
    costable_unique = unique_counts["exact"] + unique_counts["high_confidence"]
    costable_lines = line_coverage.get("exact", 0) + line_coverage.get("high_confidence", 0)
    review_unique = unique_counts["review"] + unique_counts["low_confidence"]
    review_lines = line_coverage.get("review", 0) + line_coverage.get("low_confidence", 0)

    report_lines = [
        "# Recipe Costing Analysis",
        "",
        "Prototype analysis comparing recipe ingredient labels against the imported purchasing workbook.",
        "",
        "## Inputs",
        "",
        f"- Recipe dataset: `{recipe_dataset.relative_to(ROOT)}`",
        f"- Pricing workbook: `{WORKBOOK_PATH.relative_to(ROOT)}`",
        f"- Catalog sheet: `{WORKBOOK_SHEET}`",
        f"- Catalog rows analysed: `{len(catalog):,}`",
        f"- Unique recipe ingredient labels: `{unique_total:,}`",
        f"- Canonical ingredient groups: `{canonical_total:,}`",
        f"- Ingredient lines analysed: `{line_total:,}`",
        "",
        "## Canonical Grouping",
        "",
        "This prototype now separates exact stored labels from normalized ingredient concepts.",
        "",
        "- `raw label`: the exact ingredient name stored on a recipe",
        "- `canonical group`: a conservative normalized grouping used to collapse obvious variants such as singular/plural",
        "",
        f"- Label reduction after canonical grouping: `{unique_total - canonical_total:,}` fewer labels ({format_percentage((unique_total - canonical_total) / unique_total) if unique_total else '0.0%'})",
        "",
        "### Example Variant Groups",
        "",
        "| Canonical group | Labels | Lines | Example raw labels |",
        "| --- | ---: | ---: | --- |",
        *[
            f"| {group.canonical_group_key} | {group.label_count} | {group.line_count} | {', '.join(group.labels[:4]).replace('|', '/')} |"
            for group in top_variant_groups(groups, 12)
        ],
        "",
        "## Readiness Summary",
        "",
        f"- Immediately costable unique items (`exact` + `high_confidence`): `{costable_unique:,}` ({format_percentage(costable_unique / unique_total) if unique_total else '0.0%'})",
        f"- Review queue unique items (`review` + `low_confidence`): `{review_unique:,}` ({format_percentage(review_unique / unique_total) if unique_total else '0.0%'})",
        f"- Unmatched unique items: `{unique_counts['unmatched']:,}` ({format_percentage(unique_counts['unmatched'] / unique_total) if unique_total else '0.0%'})",
        f"- Sub-recipe unique items (`PTN`): `{unique_counts['sub_recipe']:,}` ({format_percentage(unique_counts['sub_recipe'] / unique_total) if unique_total else '0.0%'})",
        "",
        f"- Immediately costable ingredient lines: `{costable_lines:,}` ({format_percentage(costable_lines / line_total) if line_total else '0.0%'})",
        f"- Review queue ingredient lines: `{review_lines:,}` ({format_percentage(review_lines / line_total) if line_total else '0.0%'})",
        f"- Unmatched ingredient lines: `{line_coverage.get('unmatched', 0):,}` ({format_percentage(line_coverage.get('unmatched', 0) / line_total) if line_total else '0.0%'})",
        f"- Sub-recipe ingredient lines: `{line_coverage.get('sub_recipe', 0):,}` ({format_percentage(line_coverage.get('sub_recipe', 0) / line_total) if line_total else '0.0%'})",
        "",
        "## Interpretation",
        "",
        "- `exact`: normalized recipe label matched a catalog description exactly.",
        "- `high_confidence`: strong token overlap; likely safe to auto-map after spot checks.",
        "- `review`: candidate exists, but should be confirmed by a human before costing.",
        "- `low_confidence`: likely alias work needed before this becomes dependable.",
        "- `unmatched`: no useful candidate found from the current workbook.",
        "- `sub_recipe`: `PTN` line; should be costed by rolling up another recipe rather than matching directly to the supplier catalog.",
        "",
        "## Top Review Candidates",
        "",
        *render_table(top_rows(matches, "review", 12)),
        "",
        "## Top Unmatched Ingredients",
        "",
        *render_table(top_rows(matches, "unmatched", 12), include_candidate=False),
        "",
        "## Top Sub-Recipe Lines",
        "",
        *render_table(top_rows(matches, "sub_recipe", 12), include_candidate=False),
        "",
        "## Recommendation",
        "",
        "Use this output to create a maintained alias table:",
        "",
        "- Auto-accept `exact` items.",
        "- Promote selected `high_confidence` items after a quick review.",
        "- Work through the `review` queue and save confirmed mappings.",
        "- Route `sub_recipe` items through recursive recipe costing.",
        "- Keep `unmatched` items in a manual queue until a new catalog row or alias is added.",
        "",
        "The JSON output in `web/data/costing_match_candidates.json` is intended to seed that alias table.",
        "",
        "The grouped output in `web/data/costing_canonical_groups.json` shows where several raw labels can be maintained as one ingredient concept.",
        "",
    ]

    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")


def write_json(matches: list[RecipeIngredientUsage]) -> None:
    payload = {
        "generatedFromWorkbook": str(WORKBOOK_PATH.relative_to(ROOT)),
        "items": [asdict(match) for match in matches],
    }
    MATCHES_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_groups_json(groups: list[CanonicalIngredientGroup]) -> None:
    payload = {
        "generatedFromWorkbook": str(WORKBOOK_PATH.relative_to(ROOT)),
        "groups": [asdict(group) for group in groups],
    }
    GROUPS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    recipe_dataset = choose_recipe_dataset()
    ingredient_rows, ingredient_lines = load_recipe_ingredients(recipe_dataset)
    catalog = load_catalog()
    matches = build_match_candidates(ingredient_rows, catalog)
    groups = build_canonical_groups(matches)

    write_report(recipe_dataset, ingredient_rows, ingredient_lines, catalog, matches, groups)
    write_json(matches)
    write_groups_json(groups)

    counts = Counter(match.match_status for match in matches)
    print(
        json.dumps(
            {
                "recipeDataset": recipe_dataset.name,
                "catalogRows": len(catalog),
                "uniqueIngredientLabels": len(matches),
                "canonicalIngredientGroups": len(groups),
                "ingredientLines": len(ingredient_lines),
                "statusCounts": counts,
                "reportPath": str(REPORT_PATH.relative_to(REPO_ROOT)),
                "matchesPath": str(MATCHES_PATH.relative_to(ROOT)),
                "groupsPath": str(GROUPS_PATH.relative_to(ROOT)),
            },
            indent=2,
            default=dict,
        )
    )


if __name__ == "__main__":
    main()
