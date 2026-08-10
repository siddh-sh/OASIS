"""Agentic layer (flow.md Phase 5).

Thin, tool-constrained LLM orchestration over the deterministic work done
elsewhere. Mapping to the pipeline diagram in flow.md 3.1:

  Agent 1  Data Integration and Cleaning  -> data-pipeline/cleaning/load_seeds.py
  Agent 2  Feature Engineering/Analytics  -> app/ml/features.py
  Agent 3  Prediction and Forecasting     -> app/ml/forecast.py, app/ml/catch.py
  Agent 4  Risk and Anomaly Detection     -> app/ml/anomalies.py
  Agent 5  Explainable AI + Recommendation-> agents/explainable_recommendation_agent.py
  Agent 6  NL Chatbot Coordinator         -> agents/nl_chatbot_coordinator.py, agents/graph.py

Agents 1-4 are deterministic and live outside this package on purpose: the
LLM selects and narrates, it never computes. agents/tools.py is the only
surface through which the model can reach them, and every tool takes typed
arguments rather than free-form SQL.
"""
