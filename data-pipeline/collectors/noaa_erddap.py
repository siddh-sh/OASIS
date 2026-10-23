"""
Oceanographic + satellite-derived domain collector — NOAA ERDDAP griddap.
Real, free, no API key (a browser-like User-Agent header is required —
ERDDAP's edge/CDN 403s requests with the default python-requests UA).

Two datasets, both verified live on 2026-10-23:
  - SST:          noaacwBLENDEDsstDaily  (coastwatch.noaa.gov, 2002-present, 5km)
  - Chlorophyll:  noaacwNPPN20S3ASCIDINEOF2kmDaily (coastwatch.noaa.gov, 2018-present, 2km)

Both changed upstream in 2026 and silently broke this collector (404s):
  * SST was renamed from noaacwBLENDEDCsstDaily — same Geo-polar Blended
    Night-Only product (a stored 2024-07-27 value matches exactly), but it
    is now served in **kelvin**. It is converted back to degree_C here so
    the seed CSV and database stay in one unit.
  * The VIIRS-only gap-filled chlorophyll (nesdisVHNnoaaSNPPnoaa20chla-
    GapfilledDaily on pfeg) was retired. Its successor adds Sentinel-3A
    OLCI and a 2km grid. It is a different product — log-correlation 0.92
    with the old one at matched points, but a median ~10% lower — so it is
    loaded under its own source key and replaces the old series rather than
    being appended to it (see load_seeds.py).

Volume control: stride=8 on the time axis (~every 8th day) over the full
India bounding box keeps this to a manageable Week-1 pull while still
giving a real seasonal/climatology signal for later anomaly detection.
"""
import csv
import io
import time
from datetime import date, timedelta
from pathlib import Path

import requests

from window import window

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "oceanographic"
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120 Safari/537.36"
    )
}

# Rolling 2-year windows. SST and chlorophyll get separate windows because
# they are different products with materially different publication lags
# (~3 days vs ~13 days) — sharing one window would 404 the chlorophyll query.
_sst_start, _sst_end = window("noaa_sst")
_chla_start, _chla_end = window("noaa_chla")
# Sample every 8th *calendar* day, counted from a fixed anchor. ERDDAP's own
# time stride counts array indices, so a missing day upstream shifts every
# later sample, and a rolling start date shifts them on every run — both
# happened, leaving the stored series a mix of three different 8-day phases
# 3-5 days apart. Fetching each anchor-aligned date on its own makes every
# refresh land on the same timestamps, so the loader's ON CONFLICT DO
# NOTHING de-duplicates them instead of interleaving. (One daily request
# for the whole window, filtered afterwards, is too large: NOAA's proxy
# returns 502.)
CADENCE_DAYS = 8
CADENCE_ANCHOR = date(2024, 7, 27)  # first timestamp of the original pull
# 0.05deg native grid; a spatial stride of 15 -> ~0.75deg spacing, which keeps
# the full India bbox at a manageable file size (tens of thousands of rows,
# not tens of millions) while still resolving real coastal SST/chlorophyll
# gradients for the anomaly-detection climatology baseline.
SPACE_STRIDE = 15
LAT_RANGE = f"(6):{SPACE_STRIDE}:(23)"
LON_RANGE = f"(68):{SPACE_STRIDE}:(90)"
# The chlorophyll grid is 2km (~0.021deg) rather than ~4km, so twice the
# index stride gives the same ~0.6deg spacing and file size as before.
CHLA_STRIDE = 30
CHLA_LAT_RANGE = f"(6):{CHLA_STRIDE}:(23)"
CHLA_LON_RANGE = f"(68):{CHLA_STRIDE}:(90)"

DATASETS = [
    {
        "id": "noaacwBLENDEDsstDaily",
        "server": "https://coastwatch.noaa.gov/erddap",
        "variable": "analysed_sst",
        "window": (_sst_start, _sst_end),
        "dims": "[({t})]" + f"[{LAT_RANGE}][{LON_RANGE}]",
        "out_csv": OUT_DIR / "sst_india.csv",
    },
    {
        "id": "noaacwNPPN20S3ASCIDINEOF2kmDaily",
        "server": "https://coastwatch.noaa.gov/erddap",
        "variable": "chlor_a",
        # this dataset has an extra altitude dim: [time][altitude][latitude][longitude]
        "window": (_chla_start, _chla_end),
        "dims": "[({t})][(0.0)]" + f"[{CHLA_LAT_RANGE}][{CHLA_LON_RANGE}]",
        "out_csv": OUT_DIR / "chlorophyll_india.csv",
    },
]


def cadence_dates(start, end):
    """Anchor-aligned dates within [start, end] (ISO strings)."""
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    offset = (-(first - CADENCE_ANCHOR).days) % CADENCE_DAYS
    d = first + timedelta(days=offset)
    while d <= last:
        yield d
        d += timedelta(days=CADENCE_DAYS)


def fetch(ds, t, retries=3):
    url = f"{ds['server']}/griddap/{ds['id']}.csv?{ds['variable']}{ds['dims'].format(t=t)}"
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            # Daily resolution (filtered to the cadence afterwards) is ~8x the
            # payload of the old strided request, hence the longer timeout.
            resp = requests.get(url, headers=HEADERS, timeout=600)
            if resp.status_code != 200:
                raise requests.HTTPError(f"{resp.status_code}: {resp.text[:300]}")
            return resp.text
        except requests.RequestException as e:
            last_err = e
            print(f"  attempt {attempt} failed ({e})")
    raise last_err


def to_celsius(text):
    """Rewrite an ERDDAP CSV's kelvin value column to degree_C. ERDDAP puts
    units on the second row, so the conversion is keyed off what the server
    says rather than assumed — it is a no-op if NOAA switches back."""
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2 or rows[1][-1].strip().lower() != "kelvin":
        return text
    rows[1][-1] = "degree_C"
    for r in rows[2:]:
        try:
            r[-1] = f"{float(r[-1]) - 273.15:.2f}"
        except ValueError:
            pass  # NaN over land stays NaN
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return out.getvalue()


def fetch_window(ds):
    """One request per cadence date, stitched into a single ERDDAP-shaped
    CSV. A single-time griddap request snaps to the *nearest* available day,
    so a date NOAA skipped would silently come back as a neighbour's data
    stored under the wrong timestamp; those responses are dropped instead."""
    print(f"Fetching {ds['id']} ...")
    header, rows, skipped = None, [], []
    for d in cadence_dates(*ds["window"]):
        try:
            part = list(csv.reader(io.StringIO(to_celsius(fetch(ds, f"{d}T12:00:00Z")))))
        except requests.RequestException as e:
            print(f"  {d}: gave up ({e})")
            skipped.append(d)
            continue
        if len(part) < 3 or part[2][0][:10] != d.isoformat():
            skipped.append(d)
            continue
        header = header or part[:2]
        rows.extend(part[2:])
        time.sleep(0.2)
    print(f"  {len(rows):,} rows; dates skipped (not published, or request failed): {[str(d) for d in skipped] or 'none'}")
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows((header or []) + rows)
    return out.getvalue()


def main():
    for ds in DATASETS:
        text = fetch_window(ds)
        ds["out_csv"].write_text(text, encoding="utf-8")

        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        n_records = max(0, len(rows) - 2)  # minus header + units row
        print(f"  -> {n_records} grid-point/time records written to {ds['out_csv']}")
        if len(rows) > 2:
            print(f"  columns: {rows[0]}")
            print(f"  sample row: {rows[2]}")
        print()


if __name__ == "__main__":
    main()
