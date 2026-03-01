#!/usr/bin/env python
"""
Extract distinct recipe images from Recipe Book PDFs and wire them into dataset
imageUrl fields.

This script:
1) scans Recipe Book.zip for the largest image on page 1 of each PDF
2) identifies the dominant repeated template image and ignores it
3) extracts only distinct recipe-specific images
4) writes them to public/recipe-book-images/<rn>.<ext>
5) updates Dining source datasets with the extracted imageUrl values
6) regenerates the merged Dining + Hospitality datasets
7) writes a manifest for review

The Recipe Book source PDFs still use legacy 93xxxxxx recipe numbers. Those are
mapped to the current 12xxxxxx recipe numbers before patching the datasets.
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from collections import Counter
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PUBLIC_DIR = ROOT / "public"
OUTPUT_DIR = PUBLIC_DIR / "recipe-book-images"
ZIP_PATH = ROOT.parent / "Recipe Book.zip"

DINING_JSON_PATH = DATA_DIR / "golden_samples.json"
DINING_NDJSON_PATH = DATA_DIR / "sanity_golden_samples_v3.ndjson"
HOSPITALITY_JSON_PATH = DATA_DIR / "hospitality_golden_samples.json"
HOSPITALITY_NDJSON_PATH = DATA_DIR / "hospitality_sanity_golden_samples.ndjson"

MERGED_JSON_PATH = DATA_DIR / "golden_samples_merged.json"
MERGED_NDJSON_PATH = DATA_DIR / "sanity_golden_samples_merged.ndjson"
MANIFEST_PATH = DATA_DIR / "recipe_book_image_manifest.json"

IMAGE_PREFIX = "/recipe-book-images"
LARGE_IMAGE_THRESHOLD = 0.03
RN_PATTERN = re.compile(r"(\d{8})")


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


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf8")


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf8")


def ensure_collection(records: list[dict], collection: str) -> list[dict]:
    enriched: list[dict] = []
    for record in records:
        row = dict(record)
        row["collection"] = row.get("collection") or collection
        enriched.append(row)
    return enriched


def map_legacy_rn(value: str) -> str:
    if value.startswith("93") and len(value) == 8:
        return f"12{value[2:]}"
    return value


def extract_rn_from_pdf_path(pdf_path: str) -> tuple[str, str]:
    match = RN_PATTERN.search(Path(pdf_path).stem)
    if not match:
        raise ValueError(f"Could not find an 8-digit recipe number in {pdf_path}")
    legacy_rn = match.group(1)
    return legacy_rn, map_legacy_rn(legacy_rn)


def scan_recipe_book(zip_path: Path) -> tuple[list[dict], str]:
    entries: list[dict] = []
    large_hashes: Counter[str] = Counter()

    with zipfile.ZipFile(zip_path) as archive:
        pdf_paths = [name for name in archive.namelist() if name.lower().endswith(".pdf")]
        for pdf_path in pdf_paths:
            payload = archive.read(pdf_path)
            doc = fitz.open(stream=payload, filetype="pdf")
            page = doc[0]
            page_area = page.rect.width * page.rect.height

            best_info = None
            best_ratio = -1.0
            for image_info in page.get_image_info(xrefs=True):
                bbox = image_info.get("bbox")
                if not bbox:
                    continue
                rect = fitz.Rect(bbox)
                ratio = (rect.width * rect.height) / page_area
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_info = image_info

            if best_info is None:
                entries.append(
                    {
                        "pdfPath": pdf_path,
                        "legacyRn": None,
                        "mappedRn": None,
                        "imageHash": None,
                        "imageExt": None,
                        "imageUrl": None,
                        "maxImageRatio": 0.0,
                        "hasLargeImage": False,
                    }
                )
                continue

            image_blob = doc.extract_image(best_info["xref"])
            digest = hashlib.sha256(image_blob["image"]).hexdigest()
            legacy_rn, mapped_rn = extract_rn_from_pdf_path(pdf_path)
            has_large_image = best_ratio >= LARGE_IMAGE_THRESHOLD
            if has_large_image:
                large_hashes[digest] += 1

            entries.append(
                {
                    "pdfPath": pdf_path,
                    "legacyRn": legacy_rn,
                    "mappedRn": mapped_rn,
                    "imageHash": digest,
                    "imageExt": image_blob.get("ext", "png"),
                    "imageBytes": image_blob["image"],
                    "maxImageRatio": round(best_ratio, 6),
                    "hasLargeImage": has_large_image,
                }
            )

    if not large_hashes:
        raise SystemExit("No large images were found in Recipe Book.zip")

    default_hash = large_hashes.most_common(1)[0][0]
    return entries, default_hash


def save_distinct_images(entries: list[dict], default_hash: str) -> dict[str, str]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image_url_by_rn: dict[str, str] = {}

    for entry in entries:
        if not entry["hasLargeImage"]:
            continue
        if entry["imageHash"] == default_hash:
            continue
        mapped_rn = entry["mappedRn"]
        ext = entry["imageExt"] or "png"
        relative_url = f"{IMAGE_PREFIX}/{mapped_rn}.{ext}"
        output_path = OUTPUT_DIR / f"{mapped_rn}.{ext}"
        output_path.write_bytes(entry["imageBytes"])
        image_url_by_rn[mapped_rn] = relative_url

    return image_url_by_rn


def patch_json_records(records: list[dict], image_url_by_rn: dict[str, str]) -> int:
    updated = 0
    for record in records:
        rn = str(record.get("pluNumber") or record.get("id") or "").strip()
        image_url = image_url_by_rn.get(rn)
        if not image_url:
            continue
        if record.get("imageUrl") == image_url:
            continue
        record["imageUrl"] = image_url
        updated += 1
    return updated


def patch_ndjson_records(records: list[dict], image_url_by_rn: dict[str, str]) -> int:
    updated = 0
    for record in records:
        rn = str(record.get("pluNumber") or record.get("_id") or "").strip()
        image_url = image_url_by_rn.get(rn)
        if not image_url:
            continue
        if record.get("imageUrl") == image_url:
            continue
        record["imageUrl"] = image_url
        updated += 1
    return updated


def rebuild_merged_datasets() -> None:
    dining_json = ensure_collection(load_json(DINING_JSON_PATH), "Dining")
    hospitality_json = ensure_collection(load_json(HOSPITALITY_JSON_PATH), "Hospitality")
    dining_ndjson = ensure_collection(load_ndjson(DINING_NDJSON_PATH), "Dining")
    hospitality_ndjson = ensure_collection(load_ndjson(HOSPITALITY_NDJSON_PATH), "Hospitality")

    write_json(MERGED_JSON_PATH, dining_json + hospitality_json)
    write_ndjson(MERGED_NDJSON_PATH, dining_ndjson + hospitality_ndjson)


def write_manifest(entries: list[dict], default_hash: str, image_url_by_rn: dict[str, str]) -> None:
    manifest = []
    for entry in entries:
        payload = {
            "pdfPath": entry["pdfPath"],
            "legacyRn": entry["legacyRn"],
            "mappedRn": entry["mappedRn"],
            "maxImageRatio": entry["maxImageRatio"],
            "imageHash": entry["imageHash"],
            "imageExt": entry["imageExt"],
            "isDefaultTemplateImage": entry["imageHash"] == default_hash if entry["imageHash"] else False,
            "imageUrl": image_url_by_rn.get(entry["mappedRn"], None),
        }
        manifest.append(payload)
    write_json(MANIFEST_PATH, manifest)


def main() -> None:
    required_paths = [
        ZIP_PATH,
        DINING_JSON_PATH,
        DINING_NDJSON_PATH,
        HOSPITALITY_JSON_PATH,
        HOSPITALITY_NDJSON_PATH,
    ]
    for path in required_paths:
        if not path.exists():
            raise SystemExit(f"Required file not found: {path}")

    entries, default_hash = scan_recipe_book(ZIP_PATH)
    image_url_by_rn = save_distinct_images(entries, default_hash)

    dining_json = load_json(DINING_JSON_PATH)
    dining_ndjson = load_ndjson(DINING_NDJSON_PATH)

    updated_json = patch_json_records(dining_json, image_url_by_rn)
    updated_ndjson = patch_ndjson_records(dining_ndjson, image_url_by_rn)

    write_json(DINING_JSON_PATH, dining_json)
    write_ndjson(DINING_NDJSON_PATH, dining_ndjson)
    rebuild_merged_datasets()
    write_manifest(entries, default_hash, image_url_by_rn)

    print(f"Default template hash: {default_hash}")
    print(f"Distinct extracted images: {len(image_url_by_rn)}")
    print(f"Updated Dining JSON records: {updated_json}")
    print(f"Updated Dining NDJSON records: {updated_ndjson}")
    print(f"Images written to: {OUTPUT_DIR}")
    print(f"Manifest written to: {MANIFEST_PATH}")
    print(f"Merged JSON rebuilt: {MERGED_JSON_PATH}")
    print(f"Merged NDJSON rebuilt: {MERGED_NDJSON_PATH}")


if __name__ == "__main__":
    main()
