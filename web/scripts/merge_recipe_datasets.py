#!/usr/bin/env python
"""
Merge the current Dining dataset with the staged Hospitality dataset.

Outputs:
  - data/golden_samples_merged.json
  - data/sanity_golden_samples_merged.ndjson

This preserves the original Dining data while producing a merged dataset with
explicit collection values for both umbrellas.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

DINING_JSON_PATH = DATA_DIR / "golden_samples.json"
DINING_NDJSON_PATH = DATA_DIR / "sanity_golden_samples_v3.ndjson"
HOSPITALITY_JSON_PATH = DATA_DIR / "hospitality_golden_samples.json"
HOSPITALITY_NDJSON_PATH = DATA_DIR / "hospitality_sanity_golden_samples.ndjson"

OUTPUT_JSON_PATH = DATA_DIR / "golden_samples_merged.json"
OUTPUT_NDJSON_PATH = DATA_DIR / "sanity_golden_samples_merged.ndjson"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf8"))


def load_ndjson(path: Path):
    rows = []
    for line in path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def ensure_collection(records: list[dict], collection: str) -> list[dict]:
    enriched: list[dict] = []
    for record in records:
        row = dict(record)
        row["collection"] = row.get("collection") or collection
        enriched.append(row)
    return enriched


def assert_unique(records: list[dict], key_name: str) -> None:
    seen: set[str] = set()
    duplicates: list[str] = []
    for record in records:
        value = str(record.get(key_name, "")).strip()
        if not value:
            continue
        if value in seen:
            duplicates.append(value)
            continue
        seen.add(value)
    if duplicates:
        preview = ", ".join(duplicates[:10])
        raise SystemExit(f"Duplicate {key_name} values found after merge: {preview}")


def main() -> None:
    for path in [DINING_JSON_PATH, DINING_NDJSON_PATH, HOSPITALITY_JSON_PATH, HOSPITALITY_NDJSON_PATH]:
        if not path.exists():
            raise SystemExit(f"Required dataset not found: {path}")

    dining_json = ensure_collection(load_json(DINING_JSON_PATH), "Dining")
    hospitality_json = ensure_collection(load_json(HOSPITALITY_JSON_PATH), "Hospitality")

    dining_ndjson = ensure_collection(load_ndjson(DINING_NDJSON_PATH), "Dining")
    hospitality_ndjson = ensure_collection(load_ndjson(HOSPITALITY_NDJSON_PATH), "Hospitality")

    merged_json = dining_json + hospitality_json
    merged_ndjson = dining_ndjson + hospitality_ndjson

    assert_unique(merged_json, "id")
    assert_unique(merged_json, "pluNumber")
    assert_unique(merged_ndjson, "_id")
    assert_unique(merged_ndjson, "pluNumber")

    OUTPUT_JSON_PATH.write_text(json.dumps(merged_json, indent=2) + "\n", encoding="utf8")
    OUTPUT_NDJSON_PATH.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in merged_ndjson) + "\n",
        encoding="utf8",
    )

    print(f"Merged recipes: {len(merged_json)}")
    print(f"JSON: {OUTPUT_JSON_PATH}")
    print(f"NDJSON: {OUTPUT_NDJSON_PATH}")


if __name__ == "__main__":
    main()
