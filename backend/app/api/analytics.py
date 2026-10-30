"""Prediction / forecast / anomaly / explainability endpoints (flow.md Phase 4).

Backed by app/ml/, which is plain scikit-learn with no LLM involvement.
Phase 5's agents call these same functions as tools and narrate the result;
the numbers are produced here so they stay reproducible.

`/recommendation/{id}` (Phase 5) narrates these via the LLM; `/correlation`
(Phase 6) joins domains on a shared monthly grain. Nothing here is 501 any
more.
"""
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.explainable_recommendation_agent import recommend
from app.agents.llm import LANGUAGE_PATTERN, LLMNotConfigured, llm_available
from app.api.species import vernacular_names
from app.db.models import AnomalyEvent, Region, Species
from app.db.session import get_db
from app.ml import registry
from app.ml.anomalies import detect_catch_decline
from app.ml.catch import CATCH_FEATURES, predict_next_year
from app.ml.correlation import available_variables, correlate
from app.ml.explain import attribute, load_explanation, store_prediction
from app.ml.features import DEFAULT_CATCH_SOURCE, STEP_DAYS
from app.ml.forecast import forecast_station
from app.schemas.analytics import (
    AnomalyEventOut,
    CatchDeclineOut,
    CatchPredictionOut,
    ExplanationOut,
    ModelSkill,
    OceanForecastOut,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

FORECASTABLE = ("sst", "chlorophyll_a")

_SKILL_NOTE = (
    "Skill is 1 - RMSE/RMSE_persistence on a temporal holdout. Values near 0 "
    "mean the model is no better than assuming no change, which is a strong "
    "baseline for autocorrelated series."
)


@router.get("/predict/catch", response_model=CatchPredictionOut)
def predict_catch(
    species_id: int = Query(description="species_id with Sea Around Us catch history"),
    region_id: int | None = Query(default=None, description="EEZ region; omit for the first available"),
    target_year: int | None = Query(
        default=None,
        ge=2020,
        le=2040,
        description=(
            "Year to forecast; defaults to next calendar year. "
            "Rolled forward from the source's last year of data."
        ),
    ),
    source: str = Query(
        default=DEFAULT_CATCH_SOURCE,
        pattern="^(FAO|SAU)$",
        description="FAO (reported landings, to 2024) | SAU (reconstructed catch, to 2019)",
    ),
    db: Session = Depends(get_db),
):
    """Catch for a species in a future year, with SHAP attribution.

    The prediction is persisted to `ml_predictions` and the returned
    `prediction_id` resolves via `/explain/{prediction_id}`.
    """
    model = registry.get_catch_model(db, source)
    results = predict_next_year(db, model, species_id, region_id, target_year, source)
    if not results:
        raise HTTPException(
            404,
            f"no {source} catch history usable for species_id={species_id}"
            + (f" in region_id={region_id}" if region_id is not None else "")
            + " — needs at least 6 consecutive annual observations",
        )

    result = results[0]
    features = pd.DataFrame([result["features"]])[CATCH_FEATURES]
    explanation = attribute(model.model, features)

    prediction_id = store_prediction(
        db,
        model_name=f"catch_hgb_{source.lower()}_v1",
        target_type="catch_tonnes",
        input_ref=(
            f"species={result['species_id']};region={result['region_id']};"
            f"year={result['year']};source={source}"
        ),
        predicted_value=result["predicted_tonnes"],
        confidence=model.metrics["skill_vs_persistence"],
        shap_payload=explanation,
    )

    return CatchPredictionOut(
        prediction_id=prediction_id,
        species_id=result["species_id"],
        region_id=result["region_id"],
        year=result["year"],
        predicted_tonnes=result["predicted_tonnes"],
        last_observed_year=result["last_observed_year"],
        last_observed_tonnes=result["last_observed_tonnes"],
        horizon_years=result["horizon_years"],
        source=source,
        path=result["path"],
        skill=ModelSkill(
            rmse=model.metrics["rmse_log"],
            baseline_rmse=model.metrics["baseline_rmse_log"],
            skill_vs_persistence=model.metrics["skill_vs_persistence"],
            n_test=model.n_test,
            note="RMSE is in log-tonnes (the model's target space). " + _SKILL_NOTE,
        ),
        top_features=explanation["top_features"],
    )


@router.get("/forecast/ocean-conditions", response_model=OceanForecastOut)
def forecast_ocean_conditions(
    station_id: int,
    variable: str = Query(default="sst", description="sst | chlorophyll_a"),
    horizon: int = Query(default=3, ge=1, le=10, description="8-day composites ahead"),
    db: Session = Depends(get_db),
):
    """Recursive short-horizon forecast for one station.

    Capped at 10 steps: each prediction feeds the next, so error compounds
    and a long horizon would return confident nonsense.
    """
    if variable not in FORECASTABLE:
        raise HTTPException(422, f"variable must be one of {list(FORECASTABLE)}")

    model = registry.get_forecast_model(db, variable)
    points = forecast_station(db, model, station_id, horizon=horizon)
    if not points:
        raise HTTPException(
            404,
            f"station_id={station_id} has no usable {variable} history "
            "(satellite chlorophyll covers fewer stations than SST)",
        )

    return OceanForecastOut(
        station_id=station_id,
        variable=variable,
        horizon=horizon,
        step_days=STEP_DAYS,
        points=points,
        skill=ModelSkill(
            rmse=model.metrics["rmse"],
            baseline_rmse=model.metrics["baseline_rmse"],
            skill_vs_persistence=model.metrics["skill_vs_persistence"],
            n_test=model.n_test,
            note=_SKILL_NOTE,
        ),
    )


@router.get("/anomalies", response_model=list[AnomalyEventOut])
def list_anomalies(
    region: str | None = Query(default=None, description="region name"),
    domain: str | None = None,
    variable: str | None = Query(default=None, description="sst | chlorophyll_a"),
    severity: str | None = Query(default=None, description="low | medium | high | critical"),
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Detected anomalies, most recent and most severe first."""
    stmt = select(AnomalyEvent)
    if region:
        stmt = stmt.join(Region, Region.region_id == AnomalyEvent.region_id).where(Region.name == region)
    if domain:
        stmt = stmt.where(AnomalyEvent.domain == domain)
    if variable:
        stmt = stmt.where(AnomalyEvent.variable == variable)
    if severity:
        stmt = stmt.where(AnomalyEvent.severity == severity)
    if start_date is not None:
        stmt = stmt.where(AnomalyEvent.detected_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date is not None:
        stmt = stmt.where(AnomalyEvent.detected_at <= datetime.combine(end_date, datetime.max.time()))

    rows = db.scalars(stmt.order_by(AnomalyEvent.detected_at.desc(), AnomalyEvent.id).limit(limit)).all()
    return [AnomalyEventOut.model_validate(r) for r in rows]


@router.get("/anomalies/catch-decline", response_model=list[CatchDeclineOut])
def catch_decline(
    limit: int = Query(default=20, ge=1, le=200),
    language: str | None = Query(default=None, description="attach each species' name in this language"),
    db: Session = Depends(get_db),
):
    """Species whose catch is trending down over the last decade of record.

    Separate from `/anomalies` because this is a trend over 70 years of
    annual data, not a point excursion in a satellite time series — the two
    answer different questions and mixing them in one feed would be
    misleading.
    """
    df = detect_catch_decline(db)
    if df.empty:
        return []

    declining = df[df["pct_per_year"] < 0].head(limit)
    names = dict(
        db.execute(
            select(Species.species_id, Species.scientific_name).where(
                Species.species_id.in_([int(s) for s in declining["species_id"]])
            )
        ).all()
    )
    commons = dict(
        db.execute(
            select(Species.species_id, Species.common_name).where(
                Species.species_id.in_([int(s) for s in declining["species_id"]])
            )
        ).all()
    )

    regional = (
        vernacular_names(db, [int(s) for s in declining["species_id"]], language) if language else {}
    )

    return [
        CatchDeclineOut(
            species_id=int(r.species_id),
            scientific_name=names.get(int(r.species_id)),
            common_name=commons.get(int(r.species_id)),
            vernacular_name=regional.get(int(r.species_id)),
            slope_tonnes_per_year=float(r.slope_tonnes_per_year),
            pct_per_year=float(r.pct_per_year),
            n_years=int(r.n_years),
        )
        for r in declining.itertuples()
    ]


@router.get("/explain/{prediction_id}", response_model=ExplanationOut)
def explain_prediction(prediction_id: int, db: Session = Depends(get_db)):
    """SHAP attribution for a previously stored prediction.

    Contributions are additive in the model's target space; for catch that is
    log-tonnes, so they must be summed before exponentiating, never
    exponentiated individually.
    """
    payload = load_explanation(db, prediction_id)
    if payload is None:
        raise HTTPException(404, f"no prediction with id={prediction_id}")
    return ExplanationOut(**payload)


@router.get("/recommendation/{prediction_or_anomaly_id}")
def recommendation(
    prediction_or_anomaly_id: int,
    refresh: bool = Query(default=False, description="regenerate instead of returning the stored narrative"),
    language: str = Query(default="en", pattern=LANGUAGE_PATTERN, description="language to write the narrative in"),
    db: Session = Depends(get_db),
):
    """Plain-language recommendation for a prediction or an anomaly.

    The id is resolved against `ml_predictions` first, then `anomaly_events`
    — `/predict/catch` hands back a `prediction_id`, so that is the id most
    likely to arrive here. Narratives are cached in `recommendations`; pass
    `refresh=true` to regenerate.
    """
    if not llm_available():
        raise HTTPException(
            503,
            "No LLM configured. Set LLM_API_KEY in .env — any OpenAI-compatible "
            "provider works (console.groq.com is free).",
        )
    try:
        payload = recommend(db, prediction_or_anomaly_id, refresh=refresh, language=language)
    except LLMNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        # A key being present (llm_available(), above) doesn't mean the
        # configured model is actually valid — e.g. LLM_MODEL pointing at a
        # since-deprecated model name fails here, not at the "is a key set"
        # check. Surfaced as a clean 503 rather than a raw 500, same reasoning
        # as the chatbot's own fallback for the identical failure mode (see
        # nl_chatbot_coordinator._fallback_answer).
        raise HTTPException(503, f"LLM call failed: {exc}") from exc
    if payload is None:
        raise HTTPException(
            404, f"no ml_prediction or anomaly_event with id={prediction_or_anomaly_id}"
        )
    return payload


@router.get("/correlation/variables")
def correlation_variables():
    """The fixed set of correlatable variables. A registry, not free-form
    column names — the same no-user-supplied-SQL rule the agent tools follow."""
    return available_variables()


@router.get("/correlation")
def correlation(
    var1: str = Query(description="see /correlation/variables"),
    var2: str = Query(description="see /correlation/variables"),
    region: str | None = Query(default=None, description="weather variables only"),
    db: Session = Depends(get_db),
):
    """Cross-domain correlation over a common monthly grain.

    Returns Pearson and Spearman with a p-value and the scatter points, plus
    `notes` spelling out the limits — ~25 overlapping months, and coefficients
    computed on spatial means rather than per-location.
    """
    try:
        return correlate(db, var1, var2, region)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
