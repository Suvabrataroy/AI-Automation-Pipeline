"""Pydantic models for SLM routing decisions."""

from typing import Literal
from pydantic import BaseModel, Field


class RouteDecision(BaseModel):
    """Output schema produced by the SLM routing layer.

    Constrained to a fixed set of literals so downstream code never
    needs to handle unexpected string values.
    """

    intent: str = Field(
        description="Short label for the detected intent, e.g. 'code_review'."
    )
    task: str = Field(
        description="Canonical task name that maps to a pipeline, e.g. 'coding_workflow'."
    )
    complexity: Literal["low", "medium", "high"] = Field(
        description="Estimated complexity of the request."
    )
    priority: Literal["low", "medium", "high"] = Field(
        description="Urgency / business priority of the request."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Model confidence in this routing decision (0.0–1.0).",
    )
    route: str = Field(
        description="Target pipeline name, or 'slm' / 'llm' tier label."
    )


class PreFilterDecision(BaseModel):
    """Output schema from the SmolLM2 360M pre-filter.

    Runs before the main SLM router to drop obviously invalid requests
    at sub-10 ms cost, saving full SLM inference for real traffic.
    """

    valid: bool = Field(
        description="True if the request is worth forwarding to the SLM router."
    )
    reason: str = Field(
        default="",
        description="Short reason for rejection (empty string when valid=True).",
    )
