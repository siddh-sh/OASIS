"""LangGraph orchestration for the NL Chatbot Coordinator (flow.md Phase 5).

The graph is deliberately small — two nodes and a conditional edge:

    agent  --(tool calls?)-->  tools  --> agent  --> END

That is the standard ReAct loop, and it is the right shape here because the
"agents" in flow.md's diagram are not autonomous peers negotiating with each
other; they are deterministic functions (app/ml/*) exposed as tools. Adding
a node per pipeline stage would draw a prettier diagram and buy nothing,
while multiplying the number of LLM round trips a demo has to survive.

Two guardrails, both from flow.md §15's risk table:

  * `MAX_HOPS` caps tool-calling rounds. Without it a model that keeps
    re-querying can run until the request times out — the classic agent
    failure during a live demo.
  * Every tool is typed and parameterised (see tools.py). The model cannot
    emit SQL.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from sqlalchemy.orm import Session

from app.agents.llm import get_llm_with_tools, language_instruction
from app.agents.tools import build_tools

MAX_HOPS = 4

SYSTEM_PROMPT = """You are OASIS, an assistant for Indian marine data \
(oceanographic, satellite, weather, fisheries, biodiversity, molecular/eDNA).

Rules:
- Answer ONLY from tool results. You have no knowledge of this dataset \
otherwise. If the tools do not cover something, say so plainly.
- Call ONE tool at a time and wait for its result. NEVER put a tool call \
inside another tool's arguments — arguments are plain values only.
- Tools that work on a species accept `species_name` directly (for example \
predict_catch(species_name="Indian oil sardine")). Use that instead of \
looking up an id first.
- Always state units and the time period the numbers cover.
- When a tool returns a `caveat` or a low `skill_vs_persistence`, pass that \
honesty on to the user. Do not present a weak forecast as confident.
- Cite which tool each figure came from, briefly, at the end.
- Be concise: a few short paragraphs, no preamble.
"""


class ChatState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    hops: int


def build_graph(db: Session, language: str = "en"):
    tools = build_tools(db)
    llm = get_llm_with_tools(tools)
    tool_node = ToolNode(tools)

    def agent(state: ChatState) -> dict:
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            # Today's date, so "last year" / "this month" resolve correctly.
            prompt = f"{SYSTEM_PROMPT}Today is {date.today().isoformat()}.\n{language_instruction(language)}"
            messages = [SystemMessage(content=prompt), *messages]
        return {"messages": [llm.invoke(messages)], "hops": state.get("hops", 0) + 1}

    def route(state: ChatState) -> str:
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None) and state.get("hops", 0) < MAX_HOPS:
            return "tools"
        return END

    graph = StateGraph(ChatState)
    graph.add_node("agent", agent)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", route, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()


def used_tools(messages: list[BaseMessage]) -> list[str]:
    """Which tools actually ran — surfaced to the UI as provenance."""
    return sorted({m.name for m in messages if isinstance(m, ToolMessage) and m.name})
