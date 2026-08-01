"""
Molecular / eDNA domain collector — BOLD Systems Data Portal API (v5,
portal.boldsystems.org — the old v4.boldsystems.org public API referenced
in most docs/tutorials is now offline; this is the real, currently-live
replacement, reverse-engineered live for this project via its openapi.json).

Real, free, no API key. Requires a browser-like User-Agent (default
python-requests UA gets a non-JSON response from the edge).

Query language: semicolon-delimited "scope:subscope:value" triplets
(scopes: tax, geo, ids, bin, recordsetcode). Two-step flow:
  1. GET /api/query?query=...        -> {query_id}
  2. GET /api/documents/{query_id}?length=N&start=OFFSET -> {data, recordsTotal}
"""
import csv
import json
import time
from pathlib import Path

import requests

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "molecular"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BASE = "https://portal.boldsystems.org"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120 Safari/537.36"
    )
}

QUERY = "geo:country:India"
PAGE_SIZE = 500
MAX_RECORDS = 2000  # Week-1 volume cap

FIELDS = [
    "processid",
    "record_id",
    "bin_uri",
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "identification",
    "identification_rank",
    "country/ocean",
    "province/state",
    "coord",
    "collection_date_start",
    "marker_code",
    "nuc_basecount",
    "insdc_acs",
    "nuc",
]


def get_query_id():
    r = requests.get(
        f"{BASE}/api/query",
        params={"query": QUERY, "extent": "full"},
        headers=HEADERS,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["query_id"]


def fetch_page(query_id, start, length=PAGE_SIZE, retries=3):
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(
                f"{BASE}/api/documents/{query_id}",
                params={"length": length, "start": start},
                headers=HEADERS,
                timeout=90,
            )
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            wait = attempt * 5
            print(f"    attempt {attempt} failed ({e}); retrying in {wait}s ...")
            time.sleep(wait)
    raise RuntimeError("failed after retries")


def main():
    print(f"Query: {QUERY}")
    query_id = get_query_id()
    print(f"query_id: {query_id}")

    all_records = []
    start = 0
    total = None
    while len(all_records) < MAX_RECORDS:
        print(f"Fetching BOLD records start={start} ...")
        page = fetch_page(query_id, start)
        total = page.get("recordsTotal")
        data = page.get("data", [])
        if not data:
            break
        all_records.extend(data)
        start += len(data)
        if len(data) < PAGE_SIZE:
            break
        time.sleep(0.3)

    print(f"\nrecordsTotal reported by BOLD for '{QUERY}': {total}")
    all_records = all_records[:MAX_RECORDS]

    raw_path = OUT_DIR / "bold_raw.json"
    raw_path.write_text(json.dumps(all_records), encoding="utf-8")

    csv_path = OUT_DIR / "molecular_records_bold.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in all_records:
            writer.writerow({k: r.get(k) for k in FIELDS})

    print(f"Fetched: {len(all_records)}")
    print(f"Raw JSON: {raw_path}")
    print(f"CSV: {csv_path}")

    import collections

    classes = collections.Counter(r.get("class") for r in all_records)
    print("Class distribution (top 10):", classes.most_common(10))

    with_seq = sum(1 for r in all_records if r.get("nuc") and r["nuc"].strip("-"))
    print(f"Records with a real (non-blank) nucleotide sequence: {with_seq}/{len(all_records)}")


if __name__ == "__main__":
    main()
