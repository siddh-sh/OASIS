"""Explainable AI + LLM Recommendation Agent — agent 5 in flow.md's diagram.

Takes a stored prediction or a detected anomaly, plus its SHAP / statistical
attribution, and writes a plain-language, actionable recommendation.

The division of labour matters: **this module computes nothing.** SHAP values
come from `app/ml/explain.py`, anomaly thresholds from `app/ml/anomalies.py`.
The LLM is handed those numbers and asked to phrase them. If the narration
were allowed to derive its own figures, a reader would have no way to tell a
model's arithmetic from the pipeline's, and the recommendation stored in the
database would stop being auditable.

Recommendations are persisted to `recommendations`, keyed to whichever of
`ml_prediction_id` / `anomaly_event_id` produced them, so the dashboard can
show them alongside the event and re-running does not re-bill the API.
"""
from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.llm import get_llm
from app.db.models import AnomalyEvent, MLPrediction, OceanographicStation, Recommendation, Species

SYSTEM_PROMPT = """You advise Indian marine researchers and fisheries \
policymakers.

You will be given a model output or a detected environmental anomaly, \
together with the exact numbers behind it. Write a short recommendation:

1. One sentence on what was found, with the numbers.
2. One or two sentences on why, using the supplied feature attributions or \
threshold comparison. Do not invent causes that are not in the data.
3. Two or three concrete, actionable next steps for a researcher or manager.
4. One sentence on how much confidence is warranted, using the supplied \
skill/severity figures. If skill is near zero, say the signal is weak.

Under 180 words. No headings, no bullet symbols, plain prose. Never state a \
number that was not given to you.
"""


def _describe_prediction(db: Session, prediction: MLPrediction) -> str:
    payload = {
        "type": "prediction",
        "model": prediction.model_name,
        "target": prediction.target_type,
        "input": prediction.input_ref,
        "predicted_value": float(prediction.predicted_value) if prediction.predicted_value is not None else None,
        "skill_vs_persistence": float(prediction.confidence) if prediction.confidence is not None else None,
    }
    shap = prediction.shap_values or {}
    if shap.get("top_features"):
        payload["top_drivers"] = shap["top_features"][:4]
        payload["attribution_note"] = (
            "Contributions are in log-tonnes, the model's target space; they are additive there."
        )
    if prediction.input_ref and "species=" in prediction.input_ref:
        try:
            species_id = int(prediction.input_ref.split("species=")[1].split(";")[0])
            row = db.execute(
                select(Species.scientific_name, Species.common_name).where(Species.species_id == species_id)
            ).first()
            if row:
                payload["species"] = {"scientific_name": row[0], "common_name": row[1]}
        except (ValueError, IndexError):
            pass
    return json.dumps(payload, default=str)


def _describe_anomaly(db: Session, event: AnomalyEvent) -> str:
    payload = {
        "type": "anomaly",
        "variable": event.variable,
        "domain": event.domain,
        "detected_at": str(event.detected_at.date()),
        "severity": event.severity,
        "observed_value": float(event.metric_value) if event.metric_value is not None else None,
        "threshold": float(event.threshold_value) if event.threshold_value is not None else None,
        "unit": "degrees_C" if event.variable == "sst" else "mg/m3",
        "method": (
            "Residual from a per-station annual harmonic baseline, scored against a "
            "MAD-scaled z. Two years of 8-day composites, so this is unusual relative "
            "to that station's own recent seasonal behaviour, not a 30-year climatology."
        ),
    }
    if event.station_id:
        row = db.execute(
            select(OceanographicStation.lat, OceanographicStation.lon).where(
                OceanographicStation.station_id == event.station_id
            )
        ).first()
        if row:
            payload["location"] = {"lat": float(row[0]), "lon": float(row[1])}
    return json.dumps(payload, default=str)


def _existing(db: Session, *, prediction_id: int | None, anomaly_id: int | None) -> Recommendation | None:
    stmt = select(Recommendation)
    stmt = (
        stmt.where(Recommendation.ml_prediction_id == prediction_id)
        if prediction_id is not None
        else stmt.where(Recommendation.anomaly_event_id == anomaly_id)
    )
    return db.scalars(stmt.order_by(Recommendation.created_at.desc()).limit(1)).first()


def recommend(db: Session, target_id: int, *, refresh: bool = False) -> dict | None:
    """Narrate prediction `target_id`, or the anomaly with that id if no such
    prediction exists. Returns None when neither is found.

    Predictions are checked first because `/predict/catch` hands the caller a
    `prediction_id` and that is the id most likely to come back here.
    """
    prediction = db.get(MLPrediction, target_id)
    event = None if prediction is not None else db.get(AnomalyEvent, target_id)
    if prediction is None and event is None:
        return None

    prediction_id = int(prediction.id) if prediction else None
    anomaly_id = int(event.id) if event else None

    if not refresh:
        cached = _existing(db, prediction_id=prediction_id, anomaly_id=anomaly_id)
        if cached:
            return {
                "id": int(cached.id),
                "ml_prediction_id": cached.ml_prediction_id,
                "anomaly_event_id": cached.anomaly_event_id,
                "narrative": cached.narrative,
                "created_at": cached.created_at,
                "cached": True,
            }

    context = _describe_prediction(db, prediction) if prediction else _describe_anomaly(db, event)
    llm = get_llm(temperature=0.2)
    narrative = llm.invoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=context)]
    ).content.strip()

    row = Recommendation(
        ml_prediction_id=prediction_id, anomaly_event_id=anomaly_id, narrative=narrative
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": int(row.id),
        "ml_prediction_id": row.ml_prediction_id,
        "anomaly_event_id": row.anomaly_event_id,
        "narrative": row.narrative,
        "created_at": row.created_at,
        "cached": False,
    }
