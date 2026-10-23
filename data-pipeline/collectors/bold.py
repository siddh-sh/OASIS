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

**Keeping the most recent records.** India has ~83,000 records and the API
can neither filter nor sort by date, so taking "the first 2,000 returned"
(as this originally did) gave an arbitrary, mostly undated slice — 3 of
2,000 were from 2022 or later. Instead every page is scanned (~170 pages,
~10 minutes) and only the MAX_RECORDS newest by collection date are kept,
in a bounded heap so memory stays flat. Records without a collection date
or without a real sequence are skipped: the first can't be ranked by
recency, the second is useless to the k-mer similarity search.

BOLD's edge returns 403 to GitHub Actions runners (datacenter IPs), so the
weekly workflow's BOLD step fails there; run this from a normal machine.
"""
import heapq
from datetime import date
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
MAX_RECORDS = 2000  # newest records kept (see module docstring)

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

    # Min-heap of (date, processid, seq, record): the oldest kept record
    # sits on top, so each newer one displaces it in O(log n). One specimen
    # (processid) can carry several markers, so `seq` breaks ties before the
    # comparison ever reaches the record dicts.
    newest = []
    seq = 0
    # Submitter typos exist (a 2050-03-08 collection date was seen); a date
    # after today would otherwise outrank every genuine recent record.
    today = date.today().isoformat()
    start = 0
    total = None
    scanned = 0
    while True:
        page = fetch_page(query_id, start)
        total = page.get("recordsTotal")
        data = page.get("data", [])
        if not data:
            break
        for r in data:
            when = (r.get("collection_date_start") or "").strip()
            if not when or when[:10] > today or not (r.get("nuc") or "").strip("-"):
                continue
            seq += 1
            item = (when, r.get("processid") or "", seq, r)
            if len(newest) < MAX_RECORDS:
                heapq.heappush(newest, item)
            elif item[:3] > newest[0][:3]:
                heapq.heapreplace(newest, item)
        scanned += len(data)
        start += len(data)
        if start % 10_000 < PAGE_SIZE:
            print(f"  scanned {scanned:,} / {total:,}; oldest kept {newest[0][0] if newest else '-'}")
        if len(data) < PAGE_SIZE:
            break
        time.sleep(0.3)

    print(f"\nrecordsTotal reported by BOLD for '{QUERY}': {total}; scanned {scanned:,}")
    all_records = [r for *_, r in sorted(newest, key=lambda t: t[:3], reverse=True)]
    if all_records:
        print(f"Kept {len(all_records)} newest: {all_records[-1]['collection_date_start']} to "
              f"{all_records[0]['collection_date_start']}")

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
