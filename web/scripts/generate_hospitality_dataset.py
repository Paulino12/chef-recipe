#!/usr/bin/env python
"""
Generate staged Hospitality recipe datasets from the Hospitality PDF folder.

Outputs:
  - data/hospitality_golden_samples.json
  - data/hospitality_sanity_golden_samples.ndjson
  - ../docs/hospitality-import-review.md

This does not modify the current Dining dataset. It only creates Hospitality
staging files so the data can be reviewed before any merge/import step.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pdfplumber


ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
DATA_DIR = ROOT / "data"
DOCS_DIR = REPO_ROOT / "docs"
HOSPITALITY_DIR = REPO_ROOT / "Hospitality"
DINING_JSON_PATH = DATA_DIR / "golden_samples.json"

OUTPUT_JSON_PATH = DATA_DIR / "hospitality_golden_samples.json"
OUTPUT_NDJSON_PATH = DATA_DIR / "hospitality_sanity_golden_samples.ndjson"
OUTPUT_REVIEW_PATH = DOCS_DIR / "hospitality-import-review.md"

PLACEHOLDER_IMAGE_URL = "/recipe-placeholder.svg"

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

ALLERGEN_DEFAULTS = {
    "gluten": "none",
    "crustaceans": "none",
    "eggs": "none",
    "fish": "none",
    "peanuts": "none",
    "soya": "none",
    "milk": "none",
    "nuts": "none",
    "celery": "none",
    "mustard": "none",
    "sesame": "none",
    "sulphites": "none",
    "lupin": "none",
    "molluscs": "none",
}

ALLERGEN_KEYWORDS = {
    "gluten": [
        "cereals with gluten",
        "gluten",
        "wheat",
        "rye",
        "barley",
        "oats",
        "spelt",
        "kamut",
    ],
    "crustaceans": ["crustaceans"],
    "eggs": ["eggs", "egg"],
    "fish": ["fish"],
    "peanuts": ["peanuts", "peanut"],
    "soya": ["soybeans", "soybean", "soya", "soy"],
    "milk": ["milk"],
    "nuts": [
        "nuts",
        "nut",
        "almond",
        "hazelnut",
        "walnut",
        "cashew",
        "pecan",
        "pistachio",
        "macadamia",
        "brazil",
    ],
    "celery": ["celery"],
    "mustard": ["mustard"],
    "sesame": ["sesame"],
    "sulphites": ["sulphites", "sulfites", "sulphur dioxide"],
    "lupin": ["lupin"],
    "molluscs": ["molluscs", "mollusc"],
}

NAVIGATION_LINE_PREFIXES = (
    "welcome",
    "home",
    "menu planning",
    "recipes",
    "shopping list",
    "local pricing",
    "allergen builder",
    "printing",
    "reports",
    "feedback",
    "print preview",
    "print recipe",
    "select sub recipes",
    "logout",
)

UPPERCASE_TITLE_KEEP_WORDS = {
    "BBQ",
    "BLT",
    "GF",
    "VG",
}

TITLE_REPLACEMENTS = [
    ("Jersrey", "Jersey"),
    ("crÃ¨me", "creme"),
    ("Mu n", "Muffin"),
    ("con t", "Confit"),
    ("tru e", "truffle"),
    ("Tuffled", "Truffled"),
    ("cauli ower", "cauliflower"),
    ("sesane", "sesame"),
    ("persimon", "persimmon"),
    ("hallioumi", "halloumi"),
    ("Seatrout", "Sea Trout"),
]

TEXT_REPLACEMENTS = [
    (" nely ", " finely "),
    (" llet ", " fillet "),
    (" lling ", " filling "),
    (" sh sauce ", " fish sauce "),
    (" sh bones ", " fish bones "),
    (" akes ", " flakes "),
    (" caui ower ", " cauliflower "),
    (" orets ", " florets "),
    (" emulshion ", " emulsion "),
    (" ne crumble ", " fine crumble "),
]


@dataclass
class ParsedRecipe:
    source_path: str
    filename: str
    title_raw: str
    title: str
    title_prefix_removed: bool
    original_plu: str | None
    mapped_plu: str | None
    category_path: list[str]
    collection: str
    portions: float | int | None
    portion_net_weight_g: float | int | None
    ingredients: list[dict]
    method_steps: list[str]
    method_text: str
    allergens: dict
    nutrition: dict
    source_pdf_path: str


def normalize(value: object) -> str:
    return (
        str(value or "")
        .replace("\u00A0", " ")
        .replace("\u00C2", " ")
        .replace("\x00", " ")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\t", " ")
        .replace("•", " ")
        .replace("â€¢", " ")
        .strip()
    )


def normalize_spaces(value: object) -> str:
    return re.sub(r"\s+", " ", normalize(value)).strip()


def apply_text_replacements(value: str) -> str:
    out = f" {normalize_spaces(value)} "
    for source, target in TEXT_REPLACEMENTS:
        out = out.replace(source, target)
    return normalize_spaces(out)


def normalize_comparable(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", normalize_spaces(value).lower()).strip()


def try_number(value: str | None) -> float | int | None:
    if not value:
        return None
    if "." in value:
        try:
            number = float(value)
        except ValueError:
            return None
        return int(number) if number.is_integer() else number
    try:
        return int(value)
    except ValueError:
        return None


def format_qty(value: float | int | None) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def stable_key(*parts: object, length: int = 16) -> str:
    digest = hashlib.sha1("::".join(map(str, parts)).encode("utf8")).hexdigest()
    return digest[:length]


def remove_supplier_phrase(value: str) -> str:
    out = value
    lower = out.lower()
    for phrase in SUPPLIER_PHRASES:
        idx = lower.find(phrase.lower())
        if idx > 0:
            out = out[:idx].strip()
            lower = out.lower()
    return out


def strip_tail(value: str) -> str:
    out = value
    prev = None
    while out != prev:
        prev = out
        out = (
            out.replace("Ingredient not on unit", "")
            .replace("Product not on unit", "")
            .strip()
        )
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

        parts = out.split()
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
    return out


def clean_ingredient_item(item: str) -> str:
    src = normalize_spaces(item)
    if not src:
        return src
    cleaned = normalize_spaces(strip_tail(remove_supplier_phrase(src)))
    return cleaned or src


def build_method_blocks(recipe_id: str, steps: list[str]) -> list[dict]:
    blocks = []
    for index, step in enumerate(steps, start=1):
        blocks.append(
            {
                "_type": "block",
                "_key": stable_key(recipe_id, "method", index),
                "style": "normal",
                "listItem": "number",
                "level": 1,
                "markDefs": [],
                "children": [
                    {
                        "_type": "span",
                        "_key": stable_key(recipe_id, "method", index, "span"),
                        "text": step,
                        "marks": [],
                    }
                ],
            }
        )
    return blocks


def group_words_into_lines(words: Iterable[dict], tolerance: float = 3.5) -> list[tuple[float, str]]:
    rows: list[tuple[float, list[dict]]] = []
    for word in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        top = float(word["top"])
        if rows and abs(rows[-1][0] - top) <= tolerance:
            rows[-1][1].append(word)
        else:
            rows.append((top, [word]))

    lines: list[tuple[float, str]] = []
    for top, row_words in rows:
        text = " ".join(w["text"] for w in sorted(row_words, key=lambda w: w["x0"]))
        text = normalize_spaces(text)
        if text:
            lines.append((top, text))
    return lines


def find_header_top(page: pdfplumber.page.Page, header: str) -> float | None:
    words = [w for w in page.extract_words(use_text_flow=False) if normalize_spaces(w["text"]).lower() == header.lower()]
    if not words:
        return None
    return min(float(w["top"]) for w in words)


def extract_title(page: pdfplumber.page.Page, file_stem: str) -> tuple[str, bool]:
    words = page.extract_words(use_text_flow=False)
    lines = group_words_into_lines(words)

    title_line = ""
    for top, line in lines:
        comp = normalize_comparable(line)
        if top > 220:
            break
        if not comp:
            continue
        if any(comp.startswith(prefix) for prefix in NAVIGATION_LINE_PREFIXES):
            continue
        if comp.startswith("plu number") or comp.startswith("recipe price"):
            continue
        if re.fullmatch(r"\d{8}", line):
            continue
        if len(comp) < 3:
            continue
        title_line = line
        break

    filename_candidate = normalize_spaces(re.sub(r"\b\d{8,10}\b", "", file_stem).strip(" -"))
    use_filename_title = bool(filename_candidate) and not re.search(r"\b\d{8,10}\b", file_stem)

    if use_filename_title:
        title_line = filename_candidate
    elif not title_line:
        title_line = file_stem

    cleaned_title, removed = strip_uppercase_prefix(title_line, file_stem)
    cleaned_title = apply_title_replacements(cleaned_title)
    return cleaned_title, removed


def apply_title_replacements(title: str) -> str:
    out = normalize_spaces(title)
    for source, target in TITLE_REPLACEMENTS:
        out = out.replace(source, target)
    return normalize_spaces(out)


def strip_uppercase_prefix(title: str, file_stem: str) -> tuple[str, bool]:
    raw = normalize_spaces(title)
    if not raw:
        return raw, False

    file_without_number = normalize_spaces(re.sub(r"\b93\d{6}\b", "", file_stem).strip(" -"))
    file_norm = normalize_comparable(file_without_number)

    parts = raw.split()
    if len(parts) < 2:
        return raw, False

    candidate_count = 0
    for token in parts[:3]:
        normalized_token = re.sub(r"[^A-Z&/-]", "", token)
        if not normalized_token:
            break
        if normalized_token in UPPERCASE_TITLE_KEEP_WORDS:
            break
        if re.fullmatch(r"[A-Z]{2,5}", normalized_token):
            candidate_count += 1
            continue
        break

    if candidate_count == 0:
        return raw, False

    stripped = normalize_spaces(" ".join(parts[candidate_count:]))
    if not stripped:
        return raw, False

    # Compact uppercase prefixes are site/location/menu codes in this dataset.
    if candidate_count >= 1:
        return stripped, True

    # If the filename carries a natural language title, trust that to validate the removal.
    if file_norm:
        stripped_norm = normalize_comparable(stripped)
        raw_norm = normalize_comparable(raw)

        def leading_token_score(left: str, right: str) -> int:
            left_tokens = left.split()
            right_tokens = right.split()
            score = 0
            for a, b in zip(left_tokens, right_tokens):
                if a != b:
                    break
                score += 1
            return score

        stripped_score = leading_token_score(stripped_norm, file_norm)
        raw_score = leading_token_score(raw_norm, file_norm)

        if stripped_norm == file_norm and raw_norm != file_norm:
            return stripped, True
        if raw_norm == file_norm:
            return raw, False
        if stripped_score > raw_score:
            return stripped, True
        if file_norm.startswith(stripped_norm) or stripped_norm.startswith(file_norm):
            if not (file_norm.startswith(raw_norm) or raw_norm.startswith(file_norm)):
                return stripped, True

    # Numeric filename only: remove compact uppercase site codes at the start.
    if re.fullmatch(r"93\d{6}", normalize_spaces(file_stem)):
        return stripped, True

    return raw, False


def extract_metadata(text: str, file_stem: str) -> tuple[str | None, float | int | None, float | int | None]:
    flat = normalize_spaces(text)
    plu_match = re.search(r"\bPLU\s+Number\s+(\d{8,10})\b", flat, flags=re.I)
    filename_plu_match = re.search(r"\b(\d{8,10})\b", file_stem)
    plu = plu_match.group(1) if plu_match else (filename_plu_match.group(1) if filename_plu_match else None)

    portions_match = re.search(r"\bPortions\s+(\d+(?:\.\d+)?)\b", flat, flags=re.I)
    portion_weight_match = re.search(
        r"\bPortion\s+Net\s+Weight\s+(\d+(?:\.\d+)?)\s*g\b",
        flat,
        flags=re.I,
    )

    return plu, try_number(portions_match.group(1) if portions_match else None), try_number(
        portion_weight_match.group(1) if portion_weight_match else None
    )


def extract_nutrition(text: str, portion_weight_g: float | int | None) -> dict:
    flat = normalize_spaces(text)

    nutrition = {
        "portionNetWeightG": portion_weight_g or 0,
        "perServing": {},
        "per100g": {},
        "riPercent": {},
    }

    serving_match = re.search(
        r"Energy\s+Fat\s+Saturates\s+Sugars\s+Salt\s+"
        r"(\d+(?:\.\d+)?)kJ\s+"
        r"(\d+(?:\.\d+)?)g\s+"
        r"(\d+(?:\.\d+)?)g\s+"
        r"(\d+(?:\.\d+)?)g\s+"
        r"(\d+(?:\.\d+)?)g\s+"
        r"(\d+(?:\.\d+)?)kcal\s+"
        r"(\d+(?:\.\d+)?)%\s+"
        r"(\d+(?:\.\d+)?)%\s+"
        r"(\d+(?:\.\d+)?)%\s+"
        r"(\d+(?:\.\d+)?)%\s+"
        r"(\d+(?:\.\d+)?)%",
        flat,
        flags=re.I,
    )

    if serving_match:
        nutrition["perServing"] = {
            "energyKj": try_number(serving_match.group(1)),
            "fatG": try_number(serving_match.group(2)),
            "saturatesG": try_number(serving_match.group(3)),
            "sugarsG": try_number(serving_match.group(4)),
            "saltG": try_number(serving_match.group(5)),
            "energyKcal": try_number(serving_match.group(6)),
        }
        nutrition["riPercent"] = {
            "energy": try_number(serving_match.group(7)),
            "fat": try_number(serving_match.group(8)),
            "saturates": try_number(serving_match.group(9)),
            "sugars": try_number(serving_match.group(10)),
            "salt": try_number(serving_match.group(11)),
        }

    per_100_match = re.search(
        r"Typical\s+values\s+per\s+100g;?\s+Energy\s+(\d+(?:\.\d+)?)kJ/(\d+(?:\.\d+)?)kcal",
        flat,
        flags=re.I,
    )
    if per_100_match:
        nutrition["per100g"] = {
            "energyKj": try_number(per_100_match.group(1)),
            "energyKcal": try_number(per_100_match.group(2)),
        }

    return nutrition


def extract_allergens(text: str) -> dict:
    allergens = dict(ALLERGEN_DEFAULTS)
    match = re.search(r"Allergens\s+(.*?)\s+(?:©\s+Compass|Page\s+\d+\s+of\d+|PLU\s+Number\b)", text, flags=re.I | re.S)
    block = match.group(1) if match else ""
    block_norm = normalize_comparable(block.replace("MC = May Contain", ""))
    if not block_norm:
        return allergens

    for key, keywords in ALLERGEN_KEYWORDS.items():
        if any(keyword in block_norm for keyword in keywords):
            allergens[key] = "contains"

    return allergens


def extract_column_text(page: pdfplumber.page.Page, bbox: tuple[float, float, float, float]) -> str:
    try:
        cropped = page.crop(bbox)
        text = cropped.extract_text() or ""
        return text
    except Exception:
        return ""


def extract_ingredients_and_method(pdf_path: Path) -> tuple[list[dict], list[str], str]:
    with pdfplumber.open(str(pdf_path)) as pdf:
        page = pdf.pages[0]
        header_top = find_header_top(page, "Ingredients")
        if header_top is None:
            full_text = "\n".join((p.extract_text() or "") for p in pdf.pages)
            return [], [], normalize_spaces(full_text)

        top = header_top + 12
        bottom = page.height - 30
        left_text = extract_column_text(page, (0, top, 190, bottom))
        middle_text = extract_column_text(page, (200, top, 390, bottom))

    ingredient_lines = [normalize_spaces(line) for line in left_text.splitlines()]
    method_lines = [normalize_spaces(line) for line in middle_text.splitlines()]

    ingredients: list[dict] = []
    current: dict | None = None
    ingredient_start = re.compile(r"^(\d+(?:\.\d+)?)\s+([A-Z]{1,4})\s+(.+)$")

    for line in ingredient_lines:
        if not line or line.lower() == "ingredients":
            continue
        match = ingredient_start.match(line)
        if match:
            if current:
                ingredients.append(current)
            qty = try_number(match.group(1))
            unit = match.group(2)
            raw_item = match.group(3)
            current = {
                "qty": qty,
                "unit": unit,
                "raw_item": raw_item,
            }
            continue
        if current:
            current["raw_item"] = normalize_spaces(f"{current['raw_item']} {line}")

    if current:
        ingredients.append(current)

    cleaned_ingredients = []
    for index, ingredient in enumerate(ingredients):
        item = clean_ingredient_item(ingredient["raw_item"])
        qty = ingredient["qty"]
        unit = ingredient["unit"]
        cleaned_ingredients.append(
            {
                "text": normalize_spaces(f"{format_qty(qty)} {unit} {item}"),
                "qty": qty,
                "unit": unit,
                "item": item,
                "_type": "ingredientLine",
                "_key": stable_key(pdf_path.name, "ingredient", index),
            }
        )

    steps: list[str] = []
    current_step = ""
    saw_method_none = False

    for line in method_lines:
        if not line or line.lower() == "method":
            continue
        if line.lower() == "method: none" or line.lower() == "none":
            saw_method_none = True
            steps = []
            current_step = ""
            break

        line = re.sub(r"^Method:\s*", "", line, flags=re.I).strip()
        start_match = re.match(r"^(\d+)\.\s*(.*)$", line)
        if start_match:
            if current_step:
                steps.append(normalize_spaces(current_step))
            current_step = normalize_spaces(start_match.group(2))
            continue
        if current_step:
            current_step = normalize_spaces(f"{current_step} {line}")

    if current_step and not saw_method_none:
        steps.append(normalize_spaces(current_step))

    method_text = normalize_spaces(" ".join(f"{index}. {step}" for index, step in enumerate(steps, start=1)))
    return cleaned_ingredients, steps, method_text


def infer_category_path(pdf_path: Path) -> list[str]:
    relative = pdf_path.relative_to(HOSPITALITY_DIR)
    parts = list(relative.parts[:-1])
    return parts


def map_original_plu(value: str | None) -> str | None:
    if not value:
        return None
    if re.fullmatch(r"93\d{6}", value):
        return f"12{value[2:]}"
    if re.fullmatch(r"12\d{6}", value):
        return value
    return value


def build_source_pdf_path(category_path: list[str], original_filename: str, mapped_plu: str | None) -> str:
    filename = original_filename
    if mapped_plu and re.search(r"\b\d+\.pdf$", original_filename):
        filename = re.sub(r"\b\d+\.pdf$", f"{mapped_plu}.pdf", original_filename)
    return "/".join(["Hospitality", *category_path, filename])


def parse_pdf(pdf_path: Path) -> ParsedRecipe:
    file_stem = pdf_path.stem
    with pdfplumber.open(str(pdf_path)) as pdf:
        full_text = "\n".join((page.extract_text() or "") for page in pdf.pages)
        title, title_prefix_removed = extract_title(pdf.pages[0], file_stem)

    original_plu, portions, portion_weight_g = extract_metadata(full_text, file_stem)
    ingredients, steps, method_text = extract_ingredients_and_method(pdf_path)
    category_path = infer_category_path(pdf_path)

    return ParsedRecipe(
        source_path=str(pdf_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        filename=pdf_path.name,
        title_raw=title,
        title=title,
        title_prefix_removed=title_prefix_removed,
        original_plu=original_plu,
        mapped_plu=None,
        category_path=category_path,
        collection="Hospitality",
        portions=portions,
        portion_net_weight_g=portion_weight_g,
        ingredients=ingredients,
        method_steps=steps,
        method_text=method_text,
        allergens=extract_allergens(full_text),
        nutrition=extract_nutrition(full_text, portion_weight_g),
        source_pdf_path="",
    )


def resolve_recipe_numbers(recipes: list[ParsedRecipe], existing_ids: set[str]) -> tuple[int, int]:
    used = set(existing_ids)
    assigned_without_source = 0
    collisions = 0

    next_generated = max([12273873] + [int(value) for value in used if re.fullmatch(r"12\d{6}", value)]) + 1

    for recipe in recipes:
        desired = map_original_plu(recipe.original_plu)
        if desired and re.fullmatch(r"12\d{6}", desired) and desired not in used:
            recipe.mapped_plu = desired
            used.add(desired)
            continue

        if desired and desired not in used and re.fullmatch(r"\d{8,10}", desired):
            recipe.mapped_plu = desired
            used.add(desired)
            continue

        if desired:
            collisions += 1

        while str(next_generated) in used:
            next_generated += 1
        recipe.mapped_plu = str(next_generated)
        used.add(recipe.mapped_plu)
        next_generated += 1
        assigned_without_source += 1

    return assigned_without_source, collisions


def recipe_to_json(recipe: ParsedRecipe) -> dict:
    assert recipe.mapped_plu is not None
    cleaned_steps = [apply_text_replacements(step) for step in recipe.method_steps]
    cleaned_method_text = apply_text_replacements(recipe.method_text)
    return {
        "id": recipe.mapped_plu,
        "pluNumber": int(recipe.mapped_plu),
        "title": recipe.title,
        "collection": recipe.collection,
        "categoryPath": recipe.category_path,
        "portions": recipe.portions or 0,
        "ingredients": [
            {
                "text": line["text"],
                "qty": line["qty"],
                "unit": line["unit"],
                "item": line["item"],
            }
            for line in recipe.ingredients
        ],
        "method": {
            "steps": [
                {"number": index, "text": step}
                for index, step in enumerate(cleaned_steps, start=1)
            ],
            "text": cleaned_method_text,
        },
        "allergens": recipe.allergens,
        "nutrition": recipe.nutrition,
        "portionNetWeightG": recipe.portion_net_weight_g or 0,
        "visibility": {"public": False, "enterprise": False},
        "source": {"pdfPath": recipe.source_pdf_path},
        "imageUrl": PLACEHOLDER_IMAGE_URL,
    }


def recipe_to_ndjson(recipe: ParsedRecipe) -> dict:
    assert recipe.mapped_plu is not None
    cleaned_steps = [apply_text_replacements(step) for step in recipe.method_steps]
    cleaned_method_text = apply_text_replacements(recipe.method_text)
    return {
        "_id": recipe.mapped_plu,
        "_type": "recipe",
        "pluNumber": int(recipe.mapped_plu),
        "title": recipe.title,
        "collection": recipe.collection,
        "categoryPath": recipe.category_path,
        "portions": recipe.portions or 0,
        "ingredients": recipe.ingredients,
        "method": build_method_blocks(recipe.mapped_plu, cleaned_steps),
        "methodText": cleaned_method_text,
        "allergens": recipe.allergens,
        "nutrition": recipe.nutrition,
        "visibility": {"public": False, "enterprise": False},
        "source": {"pdfPath": recipe.source_pdf_path},
        "imageUrl": PLACEHOLDER_IMAGE_URL,
    }


def write_review(
    recipes: list[ParsedRecipe],
    assigned_without_source: int,
    collisions: int,
) -> None:
    by_top_category = Counter(recipe.category_path[0] if recipe.category_path else "Uncategorised" for recipe in recipes)
    no_original_plu = [recipe for recipe in recipes if not recipe.original_plu]
    prefix_removed = [recipe for recipe in recipes if recipe.title_prefix_removed]

    lines = [
        "# Hospitality Import Review",
        "",
        "This file is generated from the `Hospitality/` PDF folder.",
        "It is a staging report only. Current Dining data is not modified by this step.",
        "",
        "## Summary",
        "",
        f"- Total Hospitality PDFs: `{len(recipes)}`",
        f"- Recipes with PLU/RN found in PDF or filename: `{len(recipes) - len(no_original_plu)}`",
        f"- Recipes assigned generated RN because no usable source RN existed or a collision occurred: `{assigned_without_source}`",
        f"- RN collisions resolved: `{collisions}`",
        f"- Titles with uppercase prefix removed: `{len(prefix_removed)}`",
        "",
        "## Counts By Top-Level Category",
        "",
    ]

    for category, count in sorted(by_top_category.items()):
        lines.append(f"- `{category}`: `{count}`")

    lines.extend(
        [
            "",
            "## Titles With Removed Prefixes",
            "",
        ]
    )
    if prefix_removed:
        for recipe in prefix_removed[:80]:
            lines.append(f"- `{recipe.title}` from `{recipe.source_path}`")
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Recipes Without Source RN",
            "",
        ]
    )
    if no_original_plu:
        for recipe in no_original_plu[:80]:
            lines.append(f"- `{recipe.title}` -> assigned `{recipe.mapped_plu}` from `{recipe.source_path}`")
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Sample Records",
            "",
        ]
    )

    for recipe in recipes[:10]:
        lines.append(
            f"- RN `{recipe.mapped_plu}` | `{recipe.title}` | "
            f"`{' / '.join(recipe.category_path)}` | `{recipe.source_path}`"
        )

    OUTPUT_REVIEW_PATH.write_text("\n".join(lines) + "\n", encoding="utf8")


def main() -> None:
    if not HOSPITALITY_DIR.exists():
        raise SystemExit(f"Hospitality folder not found: {HOSPITALITY_DIR}")
    if not DINING_JSON_PATH.exists():
        raise SystemExit(f"Dining dataset not found: {DINING_JSON_PATH}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    dining_recipes = json.loads(DINING_JSON_PATH.read_text(encoding="utf8"))
    existing_ids = {str(recipe["id"]) for recipe in dining_recipes}
    existing_ids.update(str(recipe["pluNumber"]) for recipe in dining_recipes)

    pdf_paths = sorted(HOSPITALITY_DIR.rglob("*.pdf"))
    recipes = [parse_pdf(path) for path in pdf_paths]

    assigned_without_source, collisions = resolve_recipe_numbers(recipes, existing_ids)

    for recipe in recipes:
        recipe.source_pdf_path = build_source_pdf_path(
            recipe.category_path,
            recipe.filename,
            recipe.mapped_plu,
        )

    json_records = [recipe_to_json(recipe) for recipe in recipes]
    ndjson_records = [recipe_to_ndjson(recipe) for recipe in recipes]

    OUTPUT_JSON_PATH.write_text(json.dumps(json_records, indent=2) + "\n", encoding="utf8")
    OUTPUT_NDJSON_PATH.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in ndjson_records) + "\n",
        encoding="utf8",
    )

    write_review(recipes, assigned_without_source, collisions)

    print(f"Generated {len(recipes)} Hospitality recipes.")
    print(f"JSON: {OUTPUT_JSON_PATH}")
    print(f"NDJSON: {OUTPUT_NDJSON_PATH}")
    print(f"Review: {OUTPUT_REVIEW_PATH}")


if __name__ == "__main__":
    main()
