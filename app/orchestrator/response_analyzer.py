"""SLM-based response analyzer.

After each service call, the SLM analyzes the response to determine:
- Is the output sufficient to continue to the next step?
- Should we retry with different params?
- Is there an error that requires escalation?

Prompts are kept minimal — the SLM only needs the output summary and
a yes/no/retry/escalate decision schema.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from app.core.interfaces import SLMProvider

logger = logging.getLogger(__name__)

_MAX_RESPONSE_CHARS: int = 300


class AnalysisDecision(BaseModel):
    """SLM analysis of a service response.

    Attributes:
        status: How to treat this response.
        summary: Very short summary of the response (for context carry-forward).
        error_hint: Brief description if status is error/escalate.
    """

    status: Literal["ok", "retry", "error", "escalate"] = Field(
        description="How the orchestrator should treat this response."
    )
    summary: str = Field(
        default="",
        description="1-2 sentence summary of the response (injected into next step context).",
    )
    error_hint: str = Field(
        default="",
        description="Short error description when status is error or escalate.",
    )


def _build_analysis_prompt(service_name: str, response_text: str) -> str:
    """Build a minimal response analysis prompt.

    Args:
        service_name: Name of the service that produced the response.
        response_text: Trimmed response text.

    Returns:
        Compact prompt for the SLM.
    """
    trimmed = response_text[:_MAX_RESPONSE_CHARS]
    if len(response_text) > _MAX_RESPONSE_CHARS:
        trimmed += "…"

    return (
        f"Service:{service_name} Response:{trimmed}\n\n"
        "Analyze. Reply JSON only.\n"
        '{"status":"ok|retry|error|escalate","summary":str,"error_hint":str}'
    )


def _parse_analysis(raw: str) -> AnalysisDecision:
    """Parse SLM analysis output.

    Defaults to ``ok`` on parse failure — a bad analysis must not
    block the orchestration loop.

    Args:
        raw: Raw SLM output string.

    Returns:
        Validated ``AnalysisDecision``. Defaults to ok=True on failure.
    """
    try:
        data = json.loads(raw.strip())
        return AnalysisDecision(**data)
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("Response analyzer returned unparseable output; defaulting to ok.")
        return AnalysisDecision(status="ok", summary=raw[:100])


class ResponseAnalyzer:
    """Uses the SLM to analyze service responses after each step.

    Args:
        slm_provider: SLM provider instance (typically the routing SLM).
    """

    def __init__(self, slm_provider: "SLMProvider") -> None:
        """Initialise with injected SLM provider."""
        self._slm = slm_provider

    def analyze(self, service_name: str, response: str) -> AnalysisDecision:
        """Analyze a service response and return an action decision.

        Args:
            service_name: Name of the service that returned the response.
            response: The raw response string from the service.

        Returns:
            ``AnalysisDecision`` indicating how to proceed.
        """
        prompt = _build_analysis_prompt(service_name, response)
        raw = self._slm.route(prompt)
        decision = _parse_analysis(raw)

        logger.debug(
            "Response analysis: service=%s status=%s",
            service_name,
            decision.status,
        )
        return decision
