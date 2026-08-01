"""
Oceanographic + satellite-derived domain collector — NOAA ERDDAP griddap.
Real, free, no API key (a browser-like User-Agent header is required —
ERDDAP's edge/CDN 403s requests with the default python-requests UA).

Two datasets, both verified live with real 2024-07-30..2026-07-25 coverage:
  - SST:          noaacwBLENDEDCsstDaily          (coastwatch.noaa.gov, 2002-present, 5km)
  - Chlorophyll:  nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily (coastwatch.pfeg.noaa.gov, 2018-present, ~4km)

Volume control: stride=8 on the time axis (~every 8th day) over the full
India bounding box keeps this to a manageable Week-1 pull while still
giving a real seasonal/climatology signal for later anomaly detection.
"""
import csv
import io
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
START = f"{_sst_start}T00:00:00Z"
END = f"{_sst_end}T00:00:00Z"
CHLA_START = f"{_chla_start}T00:00:00Z"
CHLA_END = f"{_chla_end}T00:00:00Z"
TIME_STRIDE = 8
# 0.05deg native grid; a spatial stride of 15 -> ~0.75deg spacing, which keeps
# the full India bbox at a manageable file size (tens of thousands of rows,
# not tens of millions) while still resolving real coastal SST/chlorophyll
# gradients for the anomaly-detection climatology baseline.
SPACE_STRIDE = 15
LAT_RANGE = f"(6):{SPACE_STRIDE}:(23)"
LON_RANGE = f"(68):{SPACE_STRIDE}:(90)"

DATASETS = [
    {
        "id": "noaacwBLENDEDCsstDaily",
        "server": "https://coastwatch.noaa.gov/erddap",
        "variable": "analysed_sst",
        "dims": f"[({START}):{TIME_STRIDE}:({END})][{LAT_RANGE}][{LON_RANGE}]",
        "out_csv": OUT_DIR / "sst_india.csv",
    },
    {
        "id": "nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily",
        "server": "https://coastwatch.pfeg.noaa.gov/erddap",
        "variable": "chlor_a",
        # this dataset has an extra altitude dim: [time][altitude][latitude][longitude]
        "dims": f"[({CHLA_START}):{TIME_STRIDE}:({CHLA_END})][(0.0)][{LAT_RANGE}][{LON_RANGE}]",
        "out_csv": OUT_DIR / "chlorophyll_india.csv",
    },
]


def fetch(ds, retries=3):
    url = f"{ds['server']}/griddap/{ds['id']}.csv?{ds['variable']}{ds['dims']}"
    print(f"Fetching {ds['id']} ...")
    print(f"  URL: {url}")
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=180)
            if resp.status_code != 200:
                raise requests.HTTPError(f"{resp.status_code}: {resp.text[:300]}")
            return resp.text
        except requests.RequestException as e:
            last_err = e
            print(f"  attempt {attempt} failed ({e})")
    raise last_err


def main():
    for ds in DATASETS:
        text = fetch(ds)
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
