"""SLM-based step planner — the decision layer of the local brain.

The step planner asks the SLM one question at each orchestration cycle:
  "Given these services and this context, what should I do next?"

The SLM receives a compact, token-efficient prompt:
  [services]       — compact token block (~5 tokens per service)
  [context]        — intent, step counter, last output summary
  [instructions]   — schema for the JSON response

Total prompt is designed to stay under 150 tokens so Phi-3 Mini
produces reliable JSON with format: json constrained decoding.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from app.core.interfaces import SLMProvider
    from app.registry.service_registry import ServiceRegistry
    from app.routing.router_schema import RouteDecision

logger = logging.getLogger(__name__)

# Hard cap on the last_output injected into the SLM context.
# Long outputs from services are summarized before injection.
_MAX_LAST_OUTPUT_CHARS: int = 200


class StepDecision(BaseModel):
    """Decision produced by the SLM at each orchestration step.

    The SLM chooses exactly one action per step. The brain executes
    that action, collects the result, then calls the planner again.

    Attributes:
        action: What to do next.
        service: Service name to call (only when action == call_service).
        capability: Which capability/tool to invoke on the service.
        params: Key→template mappings for the call (values from context).
        reason: Very short reason (1 sentence max — token budget).
        done: True signals the brain to stop the loop and return.
    """

    action: Literal["call_service", "delegate_llm", "return_result"] = Field(
        description="Next action for the orchestrator."
    )
    service: str | None = Field(
        default=None,
        description="Service name when action is call_service.",
    )
    capability: str | None = Field(
        default=None,
        description="Capability/tool name to invoke on the service.",
    )
    params: dict[str, str] = Field(
        default_factory=dict,
        description="Param key to context-path mappings.",
    )
    reason: str = Field(
        default="",
        description="Short reason for this decision.",
    )
    done: bool = Field(
        default=False,
        description="True = orchestration complete, return accumulated results.",
    )


def _summarise_output(output: str) -> str:
    """Trim service output to fit the SLM context budget.

    Args:
        output: Raw service output string.

    Returns:
        Output trimmed to ``_MAX_LAST_OUTPUT_CHARS`` with ellipsis if needed.
    """
    if len(output) <= _MAX_LAST_OUTPUT_CHARS:
        return output
    return output[:_MAX_LAST_OUTPUT_CHARS] + "…"


def _build_planner_prompt(
    service_token_block: str,
    intent: str,
    step_index: int,
    last_output: str,
    accumulated_keys: list[str],
) -> str:
    """Build the compact orchestration prompt for the SLM step planner.

    Designed to stay under 150 tokens total. The SLM sees:
    - Registered services as compact tokens
    - Current intent + step counter
    - Summary of the last output
    - Keys already collected
    - JSON schema for its response

    Args:
        service_token_block: Compact service registry summary.
        intent: Detected intent string from the routing decision.
        step_index: Current step number (1-based).
        last_output: Trimmed output from the previous step (empty on step 1).
        accumulated_keys: Output keys collected so far.

    Returns:
        Prompt string for the SLM.
    """
    collected = ",".join(accumulated_keys) if accumulated_keys else "none"
    last = last_output if last_output else "none"

    return (
        f"Services:\n{service_token_block}\n\n"
        f"Intent:{intent} Step:{step_index} Collected:{collected}\n"
        f"LastOutput:{last}\n\n"
        "Decide next action. Reply JSON only.\n"
        '{"action":"call_service|delegate_llm|return_result",'
        '"service":str|null,"capability":str|null,'
        '"params":{},"reason":str,"done":bool}'
    )


def _parse_step_decision(raw: str) -> StepDecision:
    """Parse and validate a StepDecision from SLM output.

    Args:
        raw: Raw string output from the SLM.

    Returns:
        Validated ``StepDecision``.

    Raises:
        ValueError: If the output cannot be parsed.
    """
    try:
        data = json.loads(raw.strip())
        return StepDecision(**data)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise ValueError(
            f"Invalid StepDecision JSON: {exc!r} — raw='{raw[:200]}'"
        ) from exc


class StepPlanner:
    """Asks the SLM what to do next at each orchestration cycle.

    One planner instance is shared across the orchestration loop. It
    maintains no state — all context is passed per call.

    Args:
        slm_provider: The SLM provider to use for planning decisions.
        registry: Service registry for building the token block.
    """

    def __init__(
        self,
        slm_provider: "SLMProvider",
        registry: "ServiceRegistry",
    ) -> None:
        """Initialise with injected SLM and registry."""
        self._slm = slm_provider
        self._registry = registry

    def plan(
        self,
        route_decision: "RouteDecision",
        step_index: int,
        last_output: str,
        accumulated_keys: list[str],
    ) -> StepDecision:
        """Ask the SLM what to do at the current orchestration step.

        Builds a compact prompt from the service registry filtered by the
        route intent keywords, then parses the SLM's JSON decision.

        Args:
            route_decision: The routing decision from the SLM router.
            step_index: Current step number (1-based, for prompt context).
            last_output: Raw output from the previous step (will be trimmed).
            accumulated_keys: Output keys collected in previous steps.

        Returns:
            Validated ``StepDecision`` for this step.

        Raises:
            ValueError: If the SLM produces unparseable output after trimming.
        """
        token_block = self._registry.token_block(
            filter_keywords=route_decision.intent.split("_")
        )
        trimmed_output = _summarise_output(last_output)

        prompt = _build_planner_prompt(
            service_token_block=token_block,
            intent=route_decision.intent,
            step_index=step_index,
            last_output=trimmed_output,
            accumulated_keys=accumulated_keys,
        )

        raw = self._slm.route(prompt)
        decision = _parse_step_decision(raw)

        logger.debug(
            "Step %d decision: action=%s service=%s capability=%s done=%s",
            step_index,
            decision.action,
            decision.service,
            decision.capability,
            decision.done,
        )
        return decision
