import json
import re
from datetime import datetime
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.functions import ST_AsGeoJSON, ST_Contains
from geoalchemy2.types import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.agents.llm import LANGUAGE_PATTERN, LLMNotConfigured, language_instruction, llm_available
from app.db.models import Region, Species, SpeciesOccurrence, SpeciesVernacularName
from app.db.session import get_db
from app.schemas.common import BBox
from app.schemas.species import (
    SpeciesOccurrenceOut,
    SpeciesOccurrencesPage,
    SpeciesOut,
    SpeciesPage,
)
from app.services.geo import bbox_filter
from app.services.species_media import MediaUnavailable, get_species_photos

router = APIRouter(prefix="/api/species", tags=["species"])


def _non_ascii_count(name: str) -> int:
    return sum(1 for ch in name if ord(ch) > 127)


# Rough Devanagari → Latin, only to pair a native-script name with the
# romanised spelling FishBase lists beside it (बांगदा ↔ "Bangada"). Not a
# transliteration scheme — just close enough for a similarity ratio.
_DEVANAGARI = {
    **dict.fromkeys("कक़", "k"), "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh",
    "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ड़": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh",
    "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "ऴ": "l", "व": "v", "श": "sh", "ष": "sh",
    "स": "s", "ह": "h",
}
_VOWELS = {
    "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
    "ं": "n", "ँ": "n", "ॉ": "o", "ॅ": "e",
}


def _romanise(name: str) -> str:
    out: list[str] = []
    for i, ch in enumerate(name):
        if ch in _DEVANAGARI:
            out.append(_DEVANAGARI[ch])
            nxt = name[i + 1] if i + 1 < len(name) else ""
            if nxt not in _VOWELS and nxt != "्" and nxt != "़":
                out.append("a")  # inherent vowel
        elif ch in _VOWELS:
            out.append(_VOWELS[ch])
    return "".join(out)


# Invisible formatting characters that some source rows carry (e.g. U+206E
# in a Tamil FishBase entry). ZWJ/ZWNJ (U+200C/D) are kept: Indic scripts
# need them to shape conjuncts correctly.
_INVISIBLE = re.compile("[\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]")


def _clean(name: str) -> str:
    return _INVISIBLE.sub("", name).strip()


def _latin_key(text: str) -> str:
    return "".join(c for c in text.lower() if c.isalpha()).replace("w", "v").replace("ee", "i").replace("oo", "u")


# Source label of phonetic renderings of the English name ("Wahoo" → वाहू);
# used only when no recorded regional name exists.
TRANSLITERATION = "Transliteration"


def _best_vernacular_name(candidates: list[tuple[str, str]]) -> tuple[str, str] | None:
    """Pick the name a reader of the language would recognise, from the
    (name, source) rows recorded for one species and language, in the order
    the source listed them.

    Romanised-only entries ("Tiger" for a prawn) are never chosen: a name
    shown as Marathi must actually be in Marathi script. Then: a curated
    Wikidata name wins; else, for Devanagari, a name whose romanised spelling
    FishBase also lists — the established market name appears in both
    scripts (बांगदा / Bangada) while one-off local variants usually appear
    once — preferring the pairing listed earliest. Picking simply the most
    non-Latin characters, as this used to, chose obscure variants
    (काउळागीदार over बांगदा for Indian mackerel).
    """
    native = [c for c in candidates if _non_ascii_count(c[0]) > 0 and c[1] != TRANSLITERATION]
    if not native:
        # No recorded name in this language: fall back to the English name
        # written phonetically in its script (transliterate_common_names.py),
        # which is labelled as such wherever it is shown.
        return next((c for c in candidates if c[1] == TRANSLITERATION), None)
    curated = [c for c in native if c[1] == "Wikidata"]
    if curated:
        return curated[0]

    romanised = [_latin_key(name) for name, _ in candidates if _non_ascii_count(name) == 0]
    best: tuple[int, float, int] | None = None
    best_candidate = None
    for idx, (name, source) in enumerate(native):
        key = _latin_key(_romanise(name))
        if not key:
            continue
        for rank, roman in enumerate(romanised):
            ratio = SequenceMatcher(None, key, roman).ratio()
            if ratio >= 0.75:
                score = (rank, -ratio, idx)  # earliest romanised pairing, closest match, earliest native
                if best is None or score < best:
                    best, best_candidate = score, (name, source)
    if best_candidate:
        return best_candidate
    return max(native, key=lambda c: (_non_ascii_count(c[0]), -len(c[0])))


def vernacular_names(db: Session, species_ids: list[int], language: str) -> dict[int, str]:
    """Best sourced regional-language name per species, for a batch of ids in
    one query. Species with no name in `language` are simply absent — the
    caller falls back to the English common name, never a translation."""
    if not species_ids:
        return {}
    rows = db.execute(
        select(SpeciesVernacularName.species_id, SpeciesVernacularName.name, SpeciesVernacularName.source)
        .where(
            SpeciesVernacularName.species_id.in_(species_ids),
            SpeciesVernacularName.language_code == language,
        )
        .order_by(SpeciesVernacularName.id)  # the order the source listed them
    ).all()
    by_species: dict[int, list[tuple[str, str]]] = {}
    for species_id, name, source in rows:
        by_species.setdefault(species_id, []).append((name, source))
    picked = {sid: _best_vernacular_name(c) for sid, c in by_species.items()}
    return {sid: _clean(p[0]) for sid, p in picked.items() if p}


@router.get("", response_model=SpeciesPage)
def list_species(
    q: str | None = Query(default=None, description="substring match on scientific or common name"),
    kingdom: str | None = None,
    language: str | None = Query(
        default=None, description="attach each item's vernacular name in this language, where one exists"
    ),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Species)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Species.scientific_name.ilike(like)) | (Species.common_name.ilike(like)))
    if kingdom:
        stmt = stmt.where(Species.kingdom == kingdom)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    # Species with a common name first (110 of 1,482 have one) — otherwise an
    # unfiltered, alphabetical-by-scientific-name list buries them at random
    # and a non-researcher view mode never gets to show what it has.
    rows = db.scalars(
        stmt.order_by(Species.common_name.is_(None), Species.scientific_name).limit(limit).offset(offset)
    ).all()
    items = [SpeciesOut.model_validate(r) for r in rows]

    # One extra query for the whole page rather than one per row — the
    # sidebar list renders up to 50 species at once, and a per-item lookup
    # would mean 50 extra round trips just to populate it in the current
    # language.
    if language and items:
        names = vernacular_names(db, [i.species_id for i in items], language)
        for item in items:
            item.vernacular_name = names.get(item.species_id)

    return SpeciesPage(items=items, total=total or 0, limit=limit, offset=offset)


@router.get("/occurrences", response_model=SpeciesOccurrencesPage)
def list_occurrences(
    bbox: str | None = Query(default=None, description="min_lon,min_lat,max_lon,max_lat"),
    species_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(SpeciesOccurrence)
    if species_id is not None:
        stmt = stmt.where(SpeciesOccurrence.species_id == species_id)
    if start_date is not None:
        stmt = stmt.where(SpeciesOccurrence.occurred_at >= start_date)
    if end_date is not None:
        stmt = stmt.where(SpeciesOccurrence.occurred_at <= end_date)
    parsed_bbox = BBox.parse(bbox)
    geo_clause = bbox_filter(SpeciesOccurrence.geom, parsed_bbox)
    if geo_clause is not None:
        stmt = stmt.where(geo_clause)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(SpeciesOccurrence.id).limit(limit).offset(offset)).all()
    return SpeciesOccurrencesPage(
        items=[SpeciesOccurrenceOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset
    )


@router.get("/{species_id}", response_model=SpeciesOut)
def get_species(species_id: int, db: Session = Depends(get_db)):
    row = db.get(Species, species_id)
    if row is None:
        raise HTTPException(404, "species not found")
    return SpeciesOut.model_validate(row)


@router.get("/{species_id}/photos")
def species_photos(species_id: int, limit: int = Query(default=6, ge=1, le=20), db: Session = Depends(get_db)):
    """Recent photographed sightings of this species in India (§4b).

    Live from GBIF rather than stored: the URLs point at third-party hosts, so
    ingesting them would preserve a pointer that can rot, not an image.
    Coverage is genuinely partial — many species have no photographed Indian
    occurrence — and `total_with_photos` says so instead of returning a bare
    empty list.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")
    try:
        return get_species_photos(species.scientific_name, limit=limit)
    except MediaUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/{species_id}/vernacular-names")
def species_vernacular_names(species_id: int, db: Session = Depends(get_db)):
    """Regional-language common names, one per language available.

    Sourced from FishBase/SeaLifeBase/Wikidata by
    `data-pipeline/cleaning/load_vernacular_names.py` — never machine-
    translated from the English common_name, which would produce a generic
    translated phrase rather than the term actually used locally (see that
    script's docstring). Coverage is genuinely partial and skewed toward
    well-known finfish; a language missing here means no source had a name
    for this species in it, not an oversight.

    Where a species/language pair has several recorded spellings, one is
    chosen by `_best_vernacular_name` — native script only, curated names
    first, then the established name FishBase lists in both scripts.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")

    rows = db.execute(
        select(SpeciesVernacularName.language_code, SpeciesVernacularName.name, SpeciesVernacularName.source)
        # "_none" is the loader's sentinel for "checked, nothing found" (see
        # load_vernacular_names.py) — real data only.
        .where(SpeciesVernacularName.species_id == species_id, SpeciesVernacularName.language_code != "_none")
        .order_by(SpeciesVernacularName.id)
    ).all()

    by_language: dict[str, list[tuple[str, str]]] = {}
    for language_code, name, source in rows:
        by_language.setdefault(language_code, []).append((name, source))

    names = {}
    for language_code, candidates in by_language.items():
        picked = _best_vernacular_name(candidates)
        if picked:
            names[language_code] = {"name": _clean(picked[0]), "source": picked[1]}

    return {"names": names}


@router.get("/{species_id}/regions")
def species_regions(species_id: int, db: Session = Depends(get_db)):
    """Which coastal state(s) this species' occurrences fall within.

    Point-in-polygon against `regions.geom` — not a stored relationship,
    since `species_occurrences` only carries lat/lon, not a region_id. Only
    the 9 coastal states have a boundary loaded (simplified from GADM, see
    `data-pipeline/cleaning/load_seeds.py:load_region_boundaries`); the EEZ
    regions and "Open Indian Ocean" have none, so open-water occurrences
    simply match no region rather than a fabricated one.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")

    region_geom = cast(Region.geom, Geometry(srid=4326))
    occ_geom = cast(SpeciesOccurrence.geom, Geometry(srid=4326))

    rows = db.execute(
        select(
            Region.region_id,
            Region.name,
            func.count(SpeciesOccurrence.id),
            ST_AsGeoJSON(Region.geom),
        )
        .join(SpeciesOccurrence, ST_Contains(region_geom, occ_geom))
        .where(SpeciesOccurrence.species_id == species_id, Region.geom.isnot(None))
        .group_by(Region.region_id, Region.name, Region.geom)
        .order_by(func.count(SpeciesOccurrence.id).desc())
    ).all()

    def polygon_latlon(geojson_str: str) -> list[list[float]]:
        # GeoJSON is [lon, lat]; the frontend map wants [lat, lon].
        ring = json.loads(geojson_str)["coordinates"][0]
        return [[lat, lon] for lon, lat in ring]

    return {
        "regions": [
            {
                "region_id": region_id,
                "name": name,
                "occurrence_count": count,
                "polygon": polygon_latlon(geojson_str),
            }
            for region_id, name, count, geojson_str in rows
        ]
    }


@router.get("/{species_id}/context")
def species_context(
    species_id: int,
    language: str = Query(default="en", pattern=LANGUAGE_PATTERN, description="language for the explanation"),
    db: Session = Depends(get_db),
):
    """Why this species turns up where it does, from its own occurrence records.

    Summarises the environmental conditions actually recorded alongside the
    sightings — OBIS ships sst/sss/bathymetry per record — then has the LLM
    phrase it. The numbers are computed here; the model only narrates them,
    the same split as the Phase-5 recommendation agent.

    **No relocation forecast is returned, deliberately.** The doc asks for
    one. The occurrence data is two years of opportunistic OBIS/GBIF records,
    where apparent movement between years tracks who went looking far more
    than it tracks the fish. A "predicted future range" built on that would be
    an artefact of sampling effort wearing the costume of a model, and it is
    the same reason the Phase-4 anomaly work refused a species-decline
    detector. Doing it properly needs either tagging data or a species
    distribution model trained on environmental covariates — neither is in
    this platform.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")

    stats = db.execute(
        select(
            func.count(SpeciesOccurrence.id),
            func.avg(SpeciesOccurrence.sst),
            func.min(SpeciesOccurrence.sst),
            func.max(SpeciesOccurrence.sst),
            func.avg(SpeciesOccurrence.sss),
            func.avg(SpeciesOccurrence.bathymetry),
            func.min(SpeciesOccurrence.lat),
            func.max(SpeciesOccurrence.lat),
            func.min(SpeciesOccurrence.lon),
            func.max(SpeciesOccurrence.lon),
        ).where(SpeciesOccurrence.species_id == species_id)
    ).one()

    n, sst_avg, sst_min, sst_max, sss_avg, bathy_avg, lat0, lat1, lon0, lon1 = stats
    if not n:
        raise HTTPException(404, f"no occurrence records for species_id={species_id}")

    def num(v):
        return round(float(v), 2) if v is not None else None

    evidence = {
        "scientific_name": species.scientific_name,
        "common_name": species.common_name,
        "n_occurrences": int(n),
        "sst_c": {"mean": num(sst_avg), "min": num(sst_min), "max": num(sst_max)},
        "salinity_psu_mean": num(sss_avg),
        "seabed_depth_m_mean": num(bathy_avg),
        "latitude_range": [num(lat0), num(lat1)],
        "longitude_range": [num(lon0), num(lon1)],
    }

    if not llm_available():
        return {**evidence, "explanation": None,
                "note": "Set LLM_API_KEY to get a plain-language explanation of these figures."}

    from langchain_core.messages import HumanMessage, SystemMessage

    from app.agents.llm import get_llm

    prompt = (
        "You explain marine species distribution to Indian fishing communities. "
        "Given the recorded conditions where a species was observed, write 3-4 short "
        "sentences on what those conditions suggest about where and why it is found. "
        "Use ONLY the numbers given. Do not invent migration routes, seasons or "
        "spawning behaviour that the data does not show. If the sample is small, say so. "
        "Plain language, no headings."
    )
    try:
        explanation = get_llm(temperature=0.2).invoke(
            [SystemMessage(content=prompt + language_instruction(language)), HumanMessage(content=str(evidence))]
        ).content.strip()
    except LLMNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc

    return {
        **evidence,
        "explanation": explanation,
        "relocation_forecast": None,
        "relocation_note": (
            "Not provided. Two years of opportunistic occurrence records cannot "
            "distinguish real range shift from changes in observer effort; a "
            "prediction from them would reflect who went looking, not the fish. "
            "This needs tagging data or a species distribution model."
        ),
    }
