"""
Shared rolling-window helper for all collectors.

Why this exists: hardcoded date windows make a "scheduled refresh" a lie —
it would re-fetch the same frozen range forever. Every collector computes
its window relative to today instead, so re-running (manually or on a cron)
genuinely picks up new data.

Each source publishes with its own real latency, measured live on
2026-08-01 against the actual APIs:

    NOAA SST (noaacwBLENDEDCsstDaily)      ~3 days behind
    Open-Meteo archive (ERA5 reanalysis)   ~4 days behind
    NOAA chlorophyll (VIIRS gap-filled)    ~13 days behind
    RAMA/TAO buoys (Argos + QC)            ~4 weeks behind

Asking for data newer than a source actually has produces a hard 404 from
ERDDAP ("Stop is greater than the axis maximum"), so each collector pads
its end date by that source's real lag. The pads below are deliberately a
little larger than the measured lag to absorb normal pipeline jitter — a
few missing recent days is fine, a 404 that kills the whole refresh is not.
"""
from datetime import date, timedelta

WINDOW_YEARS = 2

# source key -> real publication lag in days (see module docstring)
LAG_DAYS = {
    "noaa_sst": 5,
    "open_meteo": 6,
    "noaa_chla": 18,
    "rama_buoys": 40,
    "obis": 0,  # occurrence records are historical; no ingest lag to pad for
}


def window(source_key, window_years=WINDOW_YEARS, today=None):
    """(start, end) ISO date strings for a rolling window ending before today.

    `today` is injectable so this is testable without freezing the clock.
    """
    if source_key not in LAG_DAYS:
        raise KeyError(f"unknown source_key {source_key!r}; add it to LAG_DAYS")
    today = today or date.today()
    end = today - timedelta(days=LAG_DAYS[source_key])
    start = end - timedelta(days=round(365.25 * window_years))
    return start.isoformat(), end.isoformat()


if __name__ == "__main__":
    for key in LAG_DAYS:
        s, e = window(key)
        print(f"{key:14s} {s} -> {e}")
