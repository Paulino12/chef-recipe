#!/usr/bin/env python
"""
Generate a first-pass AI image shortlist for recipe imagery.

Outputs:
  - data/ai_image_shortlist_200.csv
  - ../docs/ai-image-shortlist-200.md

The shortlist is intentionally business-priority driven:
  - 100 Hospitality recipes
  - 100 Dining recipes
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
DATA_DIR = ROOT / "data"
DOCS_DIR = REPO_ROOT / "docs"

SOURCE_PATH = DATA_DIR / "golden_samples_merged.json"
OUTPUT_CSV_PATH = DATA_DIR / "ai_image_shortlist_200.csv"
OUTPUT_MD_PATH = DOCS_DIR / "ai-image-shortlist-200.md"


@dataclass(frozen=True)
class Bucket:
    label: str
    collection: str
    category_path: tuple[str, ...]
    limit: int


HOSPITALITY_BUCKETS = [
    Bucket("Hospitality / Plated menus / Mains", "Hospitality", ("Plated menus", "Mains"), 25),
    Bucket("Hospitality / Plated menus / Starters", "Hospitality", ("Plated menus", "Starters"), 20),
    Bucket("Hospitality / Plated menus / Desserts", "Hospitality", ("Plated menus", "Desserts"), 15),
    Bucket("Hospitality / Fine dining", "Hospitality", ("Fine dining",), 10),
    Bucket("Hospitality / Events / Canapes", "Hospitality", ("Events", "Canapes"), 10),
    Bucket("Hospitality / Canapes", "Hospitality", ("Canapes",), 5),
    Bucket("Hospitality / Finger food", "Hospitality", ("Finger food",), 5),
    Bucket("Hospitality / Seasonal menus / Spring", "Hospitality", ("Seasonal menus", "Spring"), 10),
]

DINING_BUCKETS = [
    Bucket("Dining / Hot Lunch", "Dining", ("Hot Lunch",), 35),
    Bucket("Dining / Salads", "Dining", ("Salads",), 15),
    Bucket("Dining / Sandwiches", "Dining", ("Sandwiches",), 15),
    Bucket("Dining / Cakes & Desserts", "Dining", ("Cakes & Desserts",), 15),
    Bucket("Dining / Breakfast", "Dining", ("Breakfast",), 10),
    Bucket("Dining / Signature Salads", "Dining", ("Signature Salads",), 5),
    Bucket("Dining / Soups and Broths", "Dining", ("Soups and Broths",), 5),
]


PREFIX_RE = re.compile(r"^(M&O|DL|TEN|NL|BB)\b", re.I)
ENDINGS_RE = re.compile(r"(deal|base)$", re.I)
BAD_WORD_RE = re.compile(r"\b(dough|gravy)\b", re.I)


def normalize_title(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def category_matches(row: dict, bucket: Bucket) -> bool:
    category_path = [str(part).strip() for part in row.get("categoryPath") or [] if str(part).strip()]
    if (row.get("collection") or "Dining") != bucket.collection:
        return False
    if len(category_path) < len(bucket.category_path):
        return False
    return tuple(category_path[: len(bucket.category_path)]) == bucket.category_path


def is_image_candidate(row: dict) -> bool:
    title = normalize_title(row.get("title"))
    if len(title) < 8:
        return False
    if PREFIX_RE.search(title):
        return False
    if ENDINGS_RE.search(title):
        return False
    if BAD_WORD_RE.search(title):
        return False
    return True


def prompt_title(title: str) -> str:
    return (
        title.replace("Velouté", "Veloute")
        .replace("crème", "creme")
        .replace("Brulé", "Brulee")
        .strip()
    )


def build_rows(data: list[dict], buckets: list[Bucket]) -> list[dict]:
    selected: list[dict] = []
    seen_rn: set[str] = set()

    for bucket in buckets:
        matches = [
            row
            for row in data
            if category_matches(row, bucket) and is_image_candidate(row)
        ]
        matches.sort(key=lambda row: str(row.get("pluNumber") or row.get("id") or ""))

        count = 0
        for row in matches:
            rn = str(row.get("pluNumber") or row.get("id") or "").strip()
            if not rn or rn in seen_rn:
                continue
            seen_rn.add(rn)
            selected.append(
                {
                    "bucket": bucket.label,
                    "collection": bucket.collection,
                    "category": " / ".join(row.get("categoryPath") or []),
                    "rn": rn,
                    "title": normalize_title(row.get("title")),
                    "prompt_title": prompt_title(normalize_title(row.get("title"))),
                    "filename": f"{rn}.webp",
                }
            )
            count += 1
            if count >= bucket.limit:
                break

        if count < bucket.limit:
            raise SystemExit(
                f"Bucket {bucket.label} only produced {count} rows; expected {bucket.limit}."
            )

    return selected


def write_csv(rows: list[dict]) -> None:
    OUTPUT_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV_PATH.open("w", encoding="utf8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["bucket", "collection", "category", "rn", "title", "prompt_title", "filename"],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(rows: list[dict]) -> None:
    OUTPUT_MD_PATH.parent.mkdir(parents=True, exist_ok=True)
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["bucket"], []).append(row)

    lines = [
        "# AI Image Shortlist (200 Recipes)",
        "",
        "Business-priority shortlist for staged AI image generation.",
        "",
        "## Summary",
        "",
        f"- Hospitality recipes: `{sum(1 for row in rows if row['collection'] == 'Hospitality')}`",
        f"- Dining recipes: `{sum(1 for row in rows if row['collection'] == 'Dining')}`",
        f"- Total recipes: `{len(rows)}`",
        "",
        "## Naming Rule",
        "",
        "- Save each approved image as `RN.webp`",
        "",
    ]

    for bucket, bucket_rows in grouped.items():
        lines.extend([f"## {bucket}", ""])
        for row in bucket_rows:
            lines.append(
                f"- `{row['rn']}` | `{row['title']}` | `{row['category']}` | `{row['filename']}`"
            )
        lines.append("")

    OUTPUT_MD_PATH.write_text("\n".join(lines), encoding="utf8")


def main() -> None:
    if not SOURCE_PATH.exists():
        raise SystemExit(f"Missing merged dataset: {SOURCE_PATH}")

    data = json.loads(SOURCE_PATH.read_text(encoding="utf8"))
    rows = build_rows(data, HOSPITALITY_BUCKETS + DINING_BUCKETS)
    write_csv(rows)
    write_markdown(rows)

    print(f"Generated {len(rows)} shortlist rows")
    print(f"CSV: {OUTPUT_CSV_PATH}")
    print(f"Markdown: {OUTPUT_MD_PATH}")


if __name__ == "__main__":
    main()
