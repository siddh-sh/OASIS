"""Trained-model registry.

Endpoints must not train on request: fitting the catch model takes seconds
and the ocean models tens of seconds, which would make the first call after
a Render cold start time out during a live demo. Models are therefore
trained once by `python -m app.ml.registry`, written to
`ml-models/artifacts/`, and loaded from disk at request time.

Artifacts live outside `backend/app/` deliberately (flow.md §5): they are
versioned build outputs, not application source.

If an artifact is missing the registry trains on demand and caches in
process rather than erroring — a fresh clone still works, it is just slow
once. `--check` reports which artifacts exist without training anything.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import joblib
from sqlalchemy.orm import Session

from app.ml import catch as catch_mod
from app.ml import forecast as forecast_mod

ARTIFACT_DIR = Path(__file__).resolve().parents[3] / "ml-models" / "artifacts"

# Bumped when features or training change, so a stale artifact is never
# silently served against new code.
VERSION = "v1"

_MEMORY: dict[str, Any] = {}


def _path(name: str) -> Path:
    return ARTIFACT_DIR / f"{name}_{VERSION}.joblib"


def _load_or_train(db: Session, name: str, trainer) -> Any:
    if name in _MEMORY:
        return _MEMORY[name]

    path = _path(name)
    if path.exists():
        try:
            obj = joblib.load(path)
            _MEMORY[name] = obj
            return obj
        except Exception as exc:  # noqa: BLE001 — a corrupt artifact must not be fatal
            print(f"[registry] could not load {path.name} ({exc}); retraining", file=sys.stderr)

    obj = trainer(db)
    _MEMORY[name] = obj
    return obj


def get_forecast_model(db: Session, variable: str):
    return _load_or_train(db, f"forecast_{variable}", lambda s: forecast_mod.train(s, variable))


def get_catch_model(db: Session):
    return _load_or_train(db, "catch", catch_mod.train)


def train_all(db: Session) -> dict[str, dict]:
    """Fit every model and write it to ml-models/artifacts/."""
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict] = {}

    for variable in ("sst", "chlorophyll_a"):
        name = f"forecast_{variable}"
        model = forecast_mod.train(db, variable)
        joblib.dump(model, _path(name))
        _MEMORY[name] = model
        summary[name] = model.metrics

    model = catch_mod.train(db)
    joblib.dump(model, _path("catch"))
    _MEMORY["catch"] = model
    summary["catch"] = model.metrics

    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Train and cache OASIS ML artifacts.")
    ap.add_argument("--check", action="store_true", help="report artifact status without training")
    args = ap.parse_args()

    from app.db.session import SessionLocal

    if SessionLocal is None:
        sys.exit("DATABASE_URL not configured — see docs/supabase-setup.md")

    names = ["forecast_sst", "forecast_chlorophyll_a", "catch"]
    if args.check:
        for name in names:
            p = _path(name)
            status = f"{p.stat().st_size / 1_000_000:.1f} MB" if p.exists() else "MISSING"
            print(f"  {name:26} {status}")
        return

    db = SessionLocal()
    try:
        for name, metrics in train_all(db).items():
            skill = metrics.get("skill_vs_persistence")
            skill_txt = f"{skill * 100:+.1f}% vs persistence" if skill is not None else ""
            print(f"  {name:26} trained  {skill_txt}")
        print(f"\nArtifacts written to {ARTIFACT_DIR}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
