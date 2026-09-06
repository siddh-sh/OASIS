"""Species photos from GBIF, with the sighting that produced them (§4b).

Fetched live rather than ingested, for two reasons. The URLs point at
iNaturalist's S3 bucket and other third-party hosts, so what we would be
storing is a pointer that can rot, not an image. And coverage is patchy and
changes as people upload — a snapshot taken today would drift out of date
while looking authoritative.

Every photo is returned with its licence and the person who took it. These
are Creative Commons images by named contributors; displaying one without
attribution would breach the licence, so the fields are required rather than
optional and the UI renders them.

Coverage is genuinely partial: many species in the catalogue have no
photographed occurrence in India at all. The response says how many were
found rather than quietly returning an empty list.

`photos` is restricted to sightings from the last RECENT_WINDOW_DAYS, filtered
server-side via GBIF's own `eventDate` range parameter rather than by
sampling an arbitrary page of results and checking dates client-side — the
latter silently misses genuinely recent records for any heavily-photographed
species (e.g. a common bird with thousands of matches, where an unsorted
100-row sample can easily contain none of the last N days' uploads even
though they exist). Showing a months- or years-old photo under a "recent
sightings" heading is also misleading, so an empty window means an empty
list, not a stale fallback — `total_with_photos` (a second, unfiltered
lookup, made only when the windowed one comes back empty) tells the caller
sightings exist even when none are recent, so the UI can say which is true.
The 1-hour cache means a genuinely new upload surfaces here within the hour,
not instantly, but this is a live GBIF query rather than an ingested
snapshot, so it never gets more stale than that.
"""
from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

import requests

GBIF_SEARCH = "https://api.gbif.org/v1/occurrence/search"
CACHE_TTL = 3600
TIMEOUT = 25
# 30-90 days was the accepted range for "recent" once actual upload volume
# per species was clear (a strict 7-day window left almost every species,
# including heavily-photographed ones, empty almost always) — 60 splits it.
RECENT_WINDOW_DAYS = 60

_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}


class MediaUnavailable(RuntimeError):
    """GBIF unreachable — surfaced as 503."""


def _license_label(url: str | None) -> str | None:
    if not url:
        return None
    slug = url.rstrip("/").split("/licenses/")[-1] if "/licenses/" in url else url
    return f"CC {slug.split('/')[0].upper()}" if "/" in slug or slug else url


def get_species_photos(
    scientific_name: str, country: str = "IN", limit: int = 6
) -> dict[str, Any]:
    """Recent photographed occurrences of a species, with where they were seen."""
    key = (scientific_name.lower(), country)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]

    today = datetime.now(UTC).date()
    window_start = today - timedelta(days=RECENT_WINDOW_DAYS)

    try:
        resp = requests.get(
            GBIF_SEARCH,
            params={
                "scientificName": scientific_name,
                "mediaType": "StillImage",
                "country": country,
                # Server-side recency filter — see module docstring for why
                # this replaced sampling-then-checking-dates client-side.
                "eventDate": f"{window_start.isoformat()},{today.isoformat()}",
                "limit": max(limit, 50),
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()
    except requests.RequestException as exc:
        raise MediaUnavailable(f"GBIF request failed: {exc}") from exc

    # Still no date-sort parameter on this endpoint — everything returned is
    # already within the window, but not in date order, so sort what we got.
    results = sorted(
        raw.get("results", []), key=lambda occ: occ.get("eventDate") or "", reverse=True
    )

    photos = []
    for occ in results:
        if len(photos) >= limit:
            break
        media = occ.get("media") or []
        image = next((m for m in media if m.get("identifier")), None)
        if not image:
            continue
        lat, lon = occ.get("decimalLatitude"), occ.get("decimalLongitude")
        photos.append({
            "url": image.get("identifier"),
            "license": _license_label(image.get("license")),
            "license_url": image.get("license"),
            # Required by the CC licences these are published under.
            "photographer": image.get("rightsHolder") or occ.get("recordedBy"),
            "observed_at": occ.get("eventDate"),
            "lat": lat,
            "lon": lon,
            # A coarse grid reference, which is what a field user can act on;
            # a 6-decimal coordinate is precision nobody navigates by.
            "grid_cell": f"{round(lat):.0f}N {round(lon):.0f}E" if lat is not None and lon is not None else None,
            "locality": occ.get("locality") or occ.get("stateProvince"),
            "gbif_occurrence_id": occ.get("key"),
        })

    # `raw["count"]` above is scoped to the recency window. When nothing
    # recent turned up, a second, unfiltered, limit=1 lookup (cheap — one
    # result requested) gets the all-time count instead, purely so the UI can
    # tell "nothing recent, but N exist historically" apart from "nothing has
    # ever been photographed here." Skipped on the common path where the
    # windowed query already found something, to avoid a second call.
    total_with_photos = raw.get("count", 0)
    if not photos:
        try:
            resp2 = requests.get(
                GBIF_SEARCH,
                params={
                    "scientificName": scientific_name,
                    "mediaType": "StillImage",
                    "country": country,
                    "limit": 1,
                },
                timeout=TIMEOUT,
            )
            resp2.raise_for_status()
            total_with_photos = resp2.json().get("count", 0)
        except requests.RequestException:
            pass  # best-effort — worst case the empty-state message undersells older coverage

    payload = {
        "scientific_name": scientific_name,
        "country": country,
        "total_with_photos": total_with_photos,
        "recent_window_days": RECENT_WINDOW_DAYS,
        "photos": photos,
        "source": "GBIF occurrence media (live). Photos are CC-licensed; attribution shown per image.",
    }
    _cache[key] = (time.time(), payload)
    return payload
