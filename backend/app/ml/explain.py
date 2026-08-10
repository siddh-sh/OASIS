"""Explainability — SHAP attributions for a stored prediction (flow.md Phase 4).

Turns a model output into per-feature contributions, which is what Phase 5's
Explainable AI + LLM Recommendation Agent narrates. The agent does not
compute attributions itself; it reads what this module wrote to
`ml_predictions.shap_values`. Keeping the numbers here and the prose there is
the whole point of the split — the explanation stays reproducible even if the
LLM phrasing changes.

`shap.TreeExplainer` supports scikit-learn's HistGradientBoostingRegressor
directly (verified against shap 0.46), so no model-agnostic sampling
fallback is needed and attributions are exact rather than approximated.

Contributions are stored in the model's own target space — log-tonnes for
catch, the raw variable for ocean forecasts — with `base_value` alongside, so
`base_value + sum(contributions)` reconstructs the model output exactly. A
consumer that wants tonnage must exponentiate the total, not the individual
terms: SHAP values are additive in log space and do not survive being
exponentiated one by one. That trap is easy to fall into and would produce
confident, wrong narration.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import shap
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MLPrediction

# Explainers are expensive to construct and hold no request state, so they
# are cached per fitted model object.
_EXPLAINER_CACHE: dict[int, shap.TreeExplainer] = {}


def _explainer(model: Any) -> shap.TreeExplainer:
    key = id(model)
    if key not in _EXPLAINER_CACHE:
        _EXPLAINER_CACHE[key] = shap.TreeExplainer(model)
    return _EXPLAINER_CACHE[key]


def attribute(model: Any, features: pd.DataFrame) -> dict[str, Any]:
    """Per-feature SHAP contributions for a single feature row."""
    if len(features) != 1:
        raise ValueError(f"expected exactly one feature row, got {len(features)}")

    explainer = _explainer(model)
    values = np.asarray(explainer.shap_values(features))[0]
    base = float(np.asarray(explainer.expected_value).reshape(-1)[0])

    contributions = {col: float(v) for col, v in zip(features.columns, values, strict=True)}
    ranked = sorted(contributions.items(), key=lambda kv: abs(kv[1]), reverse=True)

    return {
        "base_value": base,
        "contributions": contributions,
        # Pre-ranked so a caller (or an LLM) does not have to re-derive
        # "which feature mattered most" and risk getting it wrong.
        "top_features": [
            {"feature": name, "contribution": value, "direction": "increased" if value > 0 else "decreased"}
            for name, value in ranked
        ],
        "model_output": base + float(values.sum()),
    }


def store_prediction(
    db: Session,
    *,
    model_name: str,
    target_type: str,
    input_ref: str,
    predicted_value: float,
    confidence: float | None = None,
    shap_payload: dict[str, Any] | None = None,
) -> int:
    """Persist a prediction plus its attribution, returning the new row id.

    The id is what `/api/analytics/explain/{id}` and the recommendation
    agent later resolve against.
    """
    row = MLPrediction(
        model_name=model_name,
        target_type=target_type,
        input_ref=input_ref,
        predicted_value=predicted_value,
        confidence=confidence,
        shap_values=shap_payload,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return int(row.id)


def load_explanation(db: Session, prediction_id: int) -> dict[str, Any] | None:
    """Fetch a stored prediction and its attribution, or None if absent."""
    row = db.scalar(select(MLPrediction).where(MLPrediction.id == prediction_id))
    if row is None:
        return None
    return {
        "prediction_id": int(row.id),
        "model_name": row.model_name,
        "target_type": row.target_type,
        "input_ref": row.input_ref,
        "predicted_value": float(row.predicted_value) if row.predicted_value is not None else None,
        "confidence": float(row.confidence) if row.confidence is not None else None,
        "created_at": row.created_at,
        "explanation": row.shap_values,
    }
