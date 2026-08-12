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
"""
from __future__ import annotations

import time
from typing import Any

import requests

GBIF_SEARCH = "https://api.gbif.org/v1/occurrence/search"
CACHE_TTL = 3600
TIMEOUT = 25

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

    try:
        resp = requests.get(
            GBIF_SEARCH,
            params={
                "scientificName": scientific_name,
                "mediaType": "StillImage",
                "country": country,
                "limit": limit,
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()
    except requests.RequestException as exc:
        raise MediaUnavailable(f"GBIF request failed: {exc}") from exc

    photos = []
    for occ in raw.get("results", []):
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

    payload = {
        "scientific_name": scientific_name,
        "country": country,
        "total_with_photos": raw.get("count", 0),
        "photos": photos,
        "source": "GBIF occurrence media (live). Photos are CC-licensed; attribution shown per image.",
    }
    _cache[key] = (time.time(), payload)
    return payload
