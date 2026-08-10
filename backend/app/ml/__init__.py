"""Deterministic ML layer (flow.md Phase 4).

Everything here is plain pandas/scikit-learn/XGBoost with no LLM involvement.
Phase 5's agents wrap these functions as tools and narrate their output —
they do not reimplement them. Keeping the numeric work here, callable and
testable on its own, is what makes the agent layer thin enough to trust.
"""
