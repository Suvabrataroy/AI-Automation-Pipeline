"""LLM delegation logic — decides when and how to hand off to the LLM.

The SLM brain delegates to the LLM when:
- The step planner returns action == delegate_llm
- A guardrail detects the task exceeds SLM capability
- Complexity escalates mid-workflow (detected by response analyzer)

The delegation module builds a structured handoff prompt that gives the
LLM everything it needs to continue from where the SLM left off.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.core.interfaces import ModelProvider
    from app.routing.router_schema import RouteDecision

logger = logging.getLogger(__name__)

_MAX_CONTEXT_CHARS: int = 2000  # LLMs can handle more; still keep it bounded


@dataclass
class DelegationResult:
    """Result of an LLM delegation call.

    Attributes:
        content: LLM response content.
        model: Model ID that produced the response.
        cost_usd: Cost of the LLM call.
        delegated: Always True — signals brain that delegation occurred.
    """

    content: str
    model: str
    cost_usd: float
    delegated: bool = True


def _build_delegation_prompt(
    route_decision: "RouteDecision",
    user_input: dict[str, Any],
    accumulated_outputs: dict[str, Any],
    delegation_reason: str,
) -> str:
    """Build the LLM handoff prompt from SLM orchestration context.

    The LLM receives the full context — unlike the SLM, it can handle
    longer prompts. Still keep it focused to avoid wasted tokens.

    Args:
        route_decision: The original routing decision.
        user_input: Original user input dict.
        accumulated_outputs: Outputs collected by the SLM so far.
        delegation_reason: Why the SLM is delegating (for LLM context).

    Returns:
        Structured prompt for the LLM.
    """
    context_str = str(accumulated_outputs)
    if len(context_str) > _MAX_CONTEXT_CHARS:
        context_str = context_str[:_MAX_CONTEXT_CHARS] + "…[truncated]"

    return (
        f"Task: {route_decision.intent} (complexity: {route_decision.complexity})\n"
        f"Delegation reason: {delegation_reason}\n\n"
        f"User input: {user_input}\n\n"
        f"Work completed so far:\n{context_str}\n\n"
        "Continue and complete the task. Be thorough and precise."
    )


class DelegationHandler:
    """Handles LLM delegation from the SLM orchestration loop.

    When the SLM brain determines a step exceeds local model capability,
    this handler constructs a complete handoff prompt and executes the
    LLM call via the model gateway interface.

    Args:
        llm_provider: LLM provider (e.g., Anthropic claude-sonnet-4-6).
    """

    def __init__(self, llm_provider: "ModelProvider") -> None:
        """Initialise with injected LLM provider."""
        self._llm = llm_provider

    def delegate(
        self,
        route_decision: "RouteDecision",
        user_input: dict[str, Any],
        accumulated_outputs: dict[str, Any],
        reason: str = "task_complexity",
    ) -> DelegationResult:
        """Delegate current task to the LLM.

        Builds a structured handoff prompt including everything the LLM
        needs to continue the workflow from where the SLM left off.

        Args:
            route_decision: Original routing decision.
            user_input: Original user request data.
            accumulated_outputs: Context outputs from SLM steps.
            reason: Short reason for delegation (included in prompt).

        Returns:
            ``DelegationResult`` with the LLM response.
        """
        prompt = _build_delegation_prompt(
            route_decision, user_input, accumulated_outputs, reason
        )

        logger.info(
            "Delegating to LLM: intent=%s reason=%s",
            route_decision.intent,
            reason,
        )

        response = self._llm.complete(prompt)

        return DelegationResult(
            content=response.content,
            model=response.model,
            cost_usd=response.cost_usd,
        )
