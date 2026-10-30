"""Response shapes for the Phase-4 analytics endpoints.

Every predictive response carries its own skill score against a persistence
baseline. That is deliberate: two of the three models barely beat
persistence on this data (see app/ml/forecast.py and app/ml/catch.py), and a
number shipped without that context invites a reader — or a Phase-5 agent
narrating it — to trust it more than it deserves.
"""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AnomalyEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain: str
    region_id: int | None
    station_id: int | None
    variable: str
    detected_at: datetime
    severity: str | None
    metric_value: float | None
    threshold_value: float | None


class ModelSkill(BaseModel):
    """Holdout performance, always paired with the persistence baseline."""

    rmse: float
    baseline_rmse: float
    skill_vs_persistence: float
    n_test: int
    note: str


class ForecastPoint(BaseModel):
    timestamp: datetime
    predicted_value: float
    step: int


class OceanForecastOut(BaseModel):
    station_id: int
    variable: str
    horizon: int
    step_days: int
    points: list[ForecastPoint]
    skill: ModelSkill


class FeatureContribution(BaseModel):
    feature: str
    contribution: float
    direction: str


class CatchForecastPoint(BaseModel):
    year: int
    predicted_tonnes: float


class CatchPredictionOut(BaseModel):
    prediction_id: int
    species_id: int
    region_id: int
    year: int
    predicted_tonnes: float
    last_observed_year: int
    last_observed_tonnes: float
    # Years rolled forward from the last real observation to `year`; the
    # holdout skill below only describes a 1-year horizon.
    horizon_years: int
    path: list[CatchForecastPoint]
    # FAO (reported landings) or SAU (reconstructed catch); see
    # app.ml.features.CATCH_SOURCES.
    source: str
    skill: ModelSkill
    top_features: list[FeatureContribution]


class ExplanationOut(BaseModel):
    # `model_name` mirrors the ml_predictions column; pydantic reserves the
    # "model_" prefix for its own attributes, so the namespace guard is
    # cleared rather than renaming a database column to suit the library.
    model_config = ConfigDict(protected_namespaces=())

    prediction_id: int
    model_name: str
    target_type: str
    input_ref: str | None
    predicted_value: float | None
    confidence: float | None
    created_at: datetime
    explanation: dict | None


class CatchDeclineOut(BaseModel):
    species_id: int
    scientific_name: str | None
    common_name: str | None
    # Regional name (or phonetic rendering) in the requested language.
    vernacular_name: str | None = None
    slope_tonnes_per_year: float
    pct_per_year: float
    n_years: int
    window_end_year: date | None = None
