"""The tool surface the chatbot is allowed to reach (flow.md Phase 5).

Every tool takes **typed arguments** and runs a fixed, parameterised query or
a Phase-4 function. The model never writes SQL. That is the mitigation
flow.md §15 asks for against "NL->SQL generating incorrect or unsafe
queries", and it is also what keeps answers reproducible: the numbers come
from the same code paths the REST API serves, so chat and dashboard cannot
disagree.

Tools are built per-request via `build_tools(db)` so each closes over the
caller's session rather than reaching for a global one.

Results are returned as compact dicts, not prose. Summarising is the
coordinator's job; a tool that editorialises makes it impossible to tell
whether a wrong answer came from the data or the model.
"""
from __future__ import annotations

import re
from datetime import date

from langchain_core.tools import StructuredTool
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.embeddings import retrieve
from app.db.models import (
    AnomalyEvent,
    FisheriesCatch,
    OceanographicReading,
    OceanographicStation,
    Region,
    Species,
    WeatherObservation,
)
from app.ml import registry
from app.ml.anomalies import detect_catch_decline
from app.ml.catch import predict_next_year
from app.ml.forecast import forecast_station

MAX_ROWS = 25


def build_tools(db: Session) -> list[StructuredTool]:
    def _lexical_species(query: str, limit: int = 5) -> list[dict]:
        """Substring match on scientific and common name.

        Tried before vector search because embeddings are genuinely bad at
        exact identifiers: with a 384-dim general-purpose model, the query
        "Harpadon nehereus" did not retrieve *Harpadon nehereus*. Names are a
        lexical problem, so they get a lexical lookup; semantics only handles
        the "which prawns do you have" style of question.
        """
        # Punctuation-insensitive: every run of non-alphanumeric characters
        # becomes a wildcard, so "Bombay duck" matches the stored
        # "Bombay-duck" and "Penaeus  monodon" matches "Penaeus monodon".
        # Users do not guess hyphenation, and the source data is inconsistent
        # about it.
        tokens = [t for t in re.split(r"[^A-Za-z0-9]+", query.strip()) if t]
        if not tokens:
            return []
        pattern = "%" + "%".join(tokens) + "%"
        rows = db.execute(
            select(Species.species_id, Species.scientific_name, Species.common_name, Species.family)
            .where(Species.scientific_name.ilike(pattern) | Species.common_name.ilike(pattern))
            .order_by(func.length(Species.scientific_name))
            .limit(limit)
        ).all()
        return [
            {"species_id": r[0], "scientific_name": r[1], "common_name": r[2],
             "family": r[3], "match": "name"}
            for r in rows
        ]

    def search_species(query: str) -> list[dict]:
        """Find species by name, common name or description. Use this to turn a
        name a user typed into a species_id before calling other tools."""
        lexical = _lexical_species(query)
        if lexical:
            return lexical

        hits = retrieve(db, query, k=5)
        ids = [int(h["source_id"]) for h in hits if h["source_table"] == "species"]
        if not ids:
            return []
        rows = db.execute(
            select(Species.species_id, Species.scientific_name, Species.common_name, Species.family)
            .where(Species.species_id.in_(ids))
        ).all()
        by_id = {r[0]: r for r in rows}
        return [
            {
                "species_id": i,
                "scientific_name": by_id[i][1],
                "common_name": by_id[i][2],
                "family": by_id[i][3],
                "match": "semantic",
                "match_score": round(h["similarity"], 3),
            }
            for h, i in ((h, int(h["source_id"])) for h in hits)
            if i in by_id
        ]

    def ocean_conditions_summary(
        variable: str = "sst", start_date: date | None = None, end_date: date | None = None
    ) -> dict:
        """Average/min/max of an ocean variable across all stations, optionally
        over a date range. variable must be 'sst' or 'chlorophyll_a'."""
        col = {"sst": OceanographicReading.sst, "chlorophyll_a": OceanographicReading.chlorophyll_a}.get(variable)
        if col is None:
            return {"error": "variable must be 'sst' or 'chlorophyll_a'"}
        stmt = select(
            func.count(col), func.avg(col), func.min(col), func.max(col),
            func.min(OceanographicReading.timestamp), func.max(OceanographicReading.timestamp),
        ).where(col.is_not(None))
        if start_date:
            stmt = stmt.where(OceanographicReading.timestamp >= start_date)
        if end_date:
            stmt = stmt.where(OceanographicReading.timestamp <= end_date)
        n, avg, lo, hi, t0, t1 = db.execute(stmt).one()
        if not n:
            return {"variable": variable, "n_readings": 0, "note": "no readings in that range"}
        return {
            "variable": variable,
            "n_readings": int(n),
            "mean": round(float(avg), 3),
            "min": round(float(lo), 3),
            "max": round(float(hi), 3),
            "unit": "degrees_C" if variable == "sst" else "mg/m3",
            "period": [str(t0.date()), str(t1.date())],
        }

    def list_recent_anomalies(variable: str | None = None, severity: str | None = None) -> list[dict]:
        """Detected marine-heatwave / bloom anomalies, most recent first.
        variable: 'sst' or 'chlorophyll_a'. severity: low|medium|high|critical."""
        stmt = select(AnomalyEvent)
        if variable:
            stmt = stmt.where(AnomalyEvent.variable == variable)
        if severity:
            stmt = stmt.where(AnomalyEvent.severity == severity)
        rows = db.scalars(stmt.order_by(AnomalyEvent.detected_at.desc()).limit(MAX_ROWS)).all()
        return [
            {
                "id": r.id, "variable": r.variable, "station_id": r.station_id,
                "detected_at": str(r.detected_at.date()), "severity": r.severity,
                "value": round(float(r.metric_value), 3) if r.metric_value is not None else None,
                "threshold": round(float(r.threshold_value), 3) if r.threshold_value is not None else None,
            }
            for r in rows
        ]

    def anomaly_hotspots() -> dict:
        """Which dates had the most anomalies detected — use this to describe
        events rather than listing individual station readings."""
        rows = db.execute(
            select(
                func.date(AnomalyEvent.detected_at).label("d"),
                AnomalyEvent.variable,
                func.count().label("n"),
            )
            .group_by("d", AnomalyEvent.variable)
            .order_by(func.count().desc())
            .limit(10)
        ).all()
        return {
            "top_dates": [{"date": str(d), "variable": v, "n_stations": int(n)} for d, v, n in rows],
            "note": "Many stations flagged on one date indicates a spatially coherent event, not noise.",
        }

    def forecast_ocean(station_id: int, variable: str = "sst", horizon: int = 3) -> dict:
        """Forecast SST or chlorophyll for a station, N 8-day steps ahead."""
        if variable not in ("sst", "chlorophyll_a"):
            return {"error": "variable must be 'sst' or 'chlorophyll_a'"}
        model = registry.get_forecast_model(db, variable)
        points = forecast_station(db, model, station_id, horizon=min(horizon, 10))
        if not points:
            return {"error": f"station {station_id} has no usable {variable} history"}
        return {
            "station_id": station_id,
            "variable": variable,
            "points": [{"date": str(p["timestamp"].date()), "value": round(p["predicted_value"], 3)} for p in points],
            "skill_vs_persistence": round(model.metrics["skill_vs_persistence"], 3),
            "caveat": (
                "Skill near 0 means the model is no better than assuming no change. "
                "For SST that is the case; say so if asked how reliable this is."
            ),
        }

    def _resolve_species(species_id: int | None, species_name: str | None) -> int | None:
        """Accept either an id or a name so the model never has to chain tools.

        Small models (llama-3.3 among them) reliably mangle a two-step
        lookup-then-use sequence, emitting a nested call like
        `predict_catch(species_id="<function=search_species>...")` which the
        provider rejects outright. Taking a name directly removes the class
        of failure rather than hoping the prompt prevents it.
        """
        if species_id is not None:
            return species_id
        if not species_name:
            return None
        lexical = _lexical_species(species_name, limit=1)
        if lexical:
            return int(lexical[0]["species_id"])
        hits = retrieve(db, species_name, k=1)
        return int(hits[0]["source_id"]) if hits and hits[0]["source_table"] == "species" else None

    def predict_catch(species_id: int | None = None, species_name: str | None = None) -> dict:
        """Next-year catch tonnage for a species, with the drivers behind it.
        Pass species_name (e.g. 'Indian oil sardine') OR species_id — not both."""
        species_id = _resolve_species(species_id, species_name)
        if species_id is None:
            return {"error": "provide species_id or species_name"}
        model = registry.get_catch_model(db)
        results = predict_next_year(db, model, species_id)
        if not results:
            return {"error": f"species {species_id} lacks enough annual catch history"}
        r = results[0]
        return {
            "species_id": r["species_id"], "year": r["year"],
            "predicted_tonnes": round(r["predicted_tonnes"], 1),
            "last_observed_tonnes": round(r["last_observed_tonnes"], 1),
            "skill_vs_persistence": round(model.metrics["skill_vs_persistence"], 3),
            "caveat": "Sea Around Us data ends in 2019, so this is a historical-method demo, not a live forecast.",
        }

    def catch_history(species_id: int | None = None, species_name: str | None = None) -> dict:
        """Annual catch series for a species across the Indian EEZs.
        Pass species_name OR species_id."""
        species_id = _resolve_species(species_id, species_name)
        if species_id is None:
            return {"error": "provide species_id or species_name"}
        rows = db.execute(
            select(FisheriesCatch.catch_date, func.sum(FisheriesCatch.catch_weight_kg))
            .where(FisheriesCatch.species_id == species_id)
            .group_by(FisheriesCatch.catch_date)
            .order_by(FisheriesCatch.catch_date.desc())
            .limit(MAX_ROWS)
        ).all()
        if not rows:
            return {"species_id": species_id, "years": [], "note": "no catch records"}
        return {
            "species_id": species_id,
            "years": [{"year": d.year, "tonnes": round(float(w) / 1000, 1)} for d, w in rows],
            "source": "Sea Around Us reconstruction (includes estimated discards and unreported catch)",
        }

    def declining_species() -> list[dict]:
        """Species whose catch is trending down over their last decade of record."""
        df = detect_catch_decline(db)
        if df.empty:
            return []
        worst = df[df["pct_per_year"] < 0].head(10)
        names = dict(
            db.execute(
                select(Species.species_id, Species.scientific_name).where(
                    Species.species_id.in_([int(s) for s in worst["species_id"]])
                )
            ).all()
        )
        return [
            {
                "species_id": int(r.species_id),
                "scientific_name": names.get(int(r.species_id)),
                "pct_change_per_year": round(float(r.pct_per_year), 1),
            }
            for r in worst.itertuples()
        ]

    def weather_summary(region: str | None = None) -> dict:
        """Recent weather at the coastal anchor points, optionally one region."""
        stmt = select(
            func.count(), func.avg(WeatherObservation.temp_max_c),
            func.avg(WeatherObservation.precipitation_mm),
            func.max(WeatherObservation.obs_date),
        )
        if region:
            stmt = stmt.join(Region, Region.region_id == WeatherObservation.region_id).where(Region.name == region)
        n, tmax, precip, latest = db.execute(stmt).one()
        return {
            "region": region or "all coastal anchors",
            "n_observations": int(n or 0),
            "mean_max_temp_c": round(float(tmax), 2) if tmax else None,
            "mean_daily_precip_mm": round(float(precip), 2) if precip else None,
            "latest_date": str(latest) if latest else None,
        }

    def dataset_overview() -> dict:
        """What data OASIS holds — use this for 'what can you tell me about' questions."""
        counts = {
            "ocean_readings": db.scalar(select(func.count()).select_from(OceanographicReading)),
            "stations": db.scalar(select(func.count()).select_from(OceanographicStation)),
            "species": db.scalar(select(func.count()).select_from(Species)),
            "fisheries_catch_rows": db.scalar(select(func.count()).select_from(FisheriesCatch)),
            "weather_observations": db.scalar(select(func.count()).select_from(WeatherObservation)),
            "anomalies_detected": db.scalar(select(func.count()).select_from(AnomalyEvent)),
        }
        return {
            "row_counts": {k: int(v or 0) for k, v in counts.items()},
            "domains": ["oceanographic", "satellite", "weather", "fisheries", "biodiversity", "molecular"],
            "sources": ["NOAA", "Open-Meteo", "OBIS", "GBIF", "FAO/OWID", "Sea Around Us", "BOLD"],
        }

    return [
        StructuredTool.from_function(f)
        for f in (
            search_species, ocean_conditions_summary, list_recent_anomalies, anomaly_hotspots,
            forecast_ocean, predict_catch, catch_history, declining_species,
            weather_summary, dataset_overview,
        )
    ]
