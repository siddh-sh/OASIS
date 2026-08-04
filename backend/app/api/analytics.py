"""Prediction/forecast/anomaly/explainability/correlation endpoints.

Stubbed with 501 in Phase 1 so the OpenAPI schema is complete from the
start; real implementations land in Phase 4 (predict/forecast/anomalies/
explain) and Phase 6 (correlation — Should-Have)."""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/predict/catch")
def predict_catch():
    raise HTTPException(501, "fish-stock/catch prediction not implemented yet (Phase 4)")


@router.get("/forecast/ocean-conditions")
def forecast_ocean_conditions(station_id: int, horizon: int = 7):
    raise HTTPException(501, "ocean-condition forecasting not implemented yet (Phase 4)")


@router.get("/anomalies")
def list_anomalies(region: str | None = None, domain: str | None = None):
    raise HTTPException(501, "anomaly detection not implemented yet (Phase 4)")


@router.get("/explain/{prediction_id}")
def explain_prediction(prediction_id: int):
    raise HTTPException(501, "SHAP explanation lookup not implemented yet (Phase 4)")


@router.get("/recommendation/{prediction_or_anomaly_id}")
def get_recommendation(prediction_or_anomaly_id: int):
    raise HTTPException(501, "recommendation lookup not implemented yet (Phase 5)")


@router.get("/correlation")
def correlation(var1: str, var2: str, region: str | None = None):
    raise HTTPException(501, "correlation studio not implemented yet (Phase 6)")
