"""SLM Brain — the central local orchestrator.

The brain is the top-level controller of the platform. It:
  1. Receives a routed request (RouteDecision + user input).
  2. Runs a step-by-step orchestration loop driven by the SLM.
  3. Each loop iteration: plan next step → execute → analyze response.
  4. Delegates to LLM only when the step planner says so.
  5. Returns the accumulated result when done=True.

The SLM never sees full service documentation — only compact token
summaries. This keeps every SLM prompt under ~150 tokens, ensuring
reliable JSON output from small models.

Loop safety: capped at ``_MAX_STEPS`` to prevent infinite loops.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.orchestrator.delegation import DelegationHandler, DelegationResult
from app.orchestrator.response_analyzer import AnalysisDecision, ResponseAnalyzer
from app.orchestrator.step_planner import StepDecision, StepPlanner

if TYPE_CHECKING:
    from app.core.interfaces import ModelProvider, SLMProvider
    from app.registry.service_registry import ServiceRegistry
    from app.routing.router_schema import RouteDecision

logger = logging.getLogger(__name__)

_MAX_STEPS: int = 10          # hard cap — SLM loops never run forever
_MAX_RETRIES_PER_STEP: int = 2  # retries on response analyzer retry signal


@dataclass
class OrchestrationResult:
    """Final result returned by the SLM brain after completing a workflow.

    Attributes:
        outputs: Accumulated key→value outputs from all steps.
        steps_taken: Number of orchestration steps executed.
        delegated_to_llm: True if any step was delegated to the LLM.
        delegation_output: LLM response if delegation occurred.
        status: Final status of the orchestration run.
        error: Error message if status == failed.
    """

    outputs: dict[str, Any] = field(default_factory=dict)
    steps_taken: int = 0
    delegated_to_llm: bool = False
    delegation_output: str | None = None
    status: str = "success"   # success | failed | delegated
    error: str | None = None


class SLMBrain:
    """Central SLM orchestrator — the local brain of the platform.

    Orchestrates step-by-step service calls guided entirely by a local SLM.
    Each step costs one SLM inference (~300ms) plus the service call.
    LLM delegation is lazy — only triggered when the SLM explicitly asks.

    Args:
        slm_provider: Primary SLM for planning and analysis (Phi-3 Mini).
        llm_provider: LLM for delegation (claude-sonnet-4-6).
        registry: Centralized service registry.
        service_executor: Callable that executes a service call given
            (service_name, capability, params) and returns a string result.
    """

    def __init__(
        self,
        slm_provider: "SLMProvider",
        llm_provider: "ModelProvider",
        registry: "ServiceRegistry",
        service_executor: Any,  # Callable — avoids circular import
    ) -> None:
        """Initialise with injected dependencies."""
        self._planner = StepPlanner(slm_provider, registry)
        self._analyzer = ResponseAnalyzer(slm_provider)
        self._delegator = DelegationHandler(llm_provider)
        self._executor = service_executor

    def _execute_step(
        self,
        decision: StepDecision,
        context_outputs: dict[str, Any],
    ) -> tuple[str, str]:
        """Execute a single service call step.

        Resolves param templates against accumulated context outputs before
        calling the service executor.

        Args:
            decision: The step decision from the planner.
            context_outputs: Accumulated outputs for template resolution.

        Returns:
            Tuple of (service_name, raw_response_string).
        """
        resolved_params = {
            k: str(context_outputs.get(v, v))
            for k, v in decision.params.items()
        }

        service_name = decision.service or "unknown"
        capability = decision.capability or ""

        logger.info(
            "Executing service call: %s.%s params=%s",
            service_name,
            capability,
            list(resolved_params.keys()),
        )

        raw_response = self._executor(service_name, capability, resolved_params)
        return service_name, str(raw_response)

    def orchestrate(
        self,
        route_decision: "RouteDecision",
        user_input: dict[str, Any],
    ) -> OrchestrationResult:
        """Run the full SLM orchestration loop for a routed request.

        The loop runs until either:
        - The planner sets done=True
        - The planner requests LLM delegation
        - The step cap (_MAX_STEPS) is reached

        Args:
            route_decision: Routing decision from the SLM router.
            user_input: Original user input dictionary.

        Returns:
            ``OrchestrationResult`` with all accumulated outputs.
        """
        result = OrchestrationResult()
        context_outputs: dict[str, Any] = {"input": user_input}
        last_output: str = ""
        step_index: int = 0

        while step_index < _MAX_STEPS:
            step_index += 1

            # --- Plan next step ---
            try:
                decision: StepDecision = self._planner.plan(
                    route_decision=route_decision,
                    step_index=step_index,
                    last_output=last_output,
                    accumulated_keys=list(context_outputs.keys()),
                )
            except ValueError as exc:
                logger.error("Step planner failed at step %d: %s", step_index, exc)
                result.status = "failed"
                result.error = str(exc)
                break

            # --- Handle delegation ---
            if decision.action == "delegate_llm":
                delegation: DelegationResult = self._delegator.delegate(
                    route_decision=route_decision,
                    user_input=user_input,
                    accumulated_outputs=context_outputs,
                    reason=decision.reason,
                )
                result.delegated_to_llm = True
                result.delegation_output = delegation.content
                result.status = "delegated"
                context_outputs["llm_output"] = delegation.content
                result.outputs = context_outputs
                result.steps_taken = step_index
                break

            # --- Handle return ---
            if decision.action == "return_result" or decision.done:
                result.outputs = context_outputs
                result.steps_taken = step_index
                break

            # --- Execute service call with retry ---
            retries = 0
            while retries <= _MAX_RETRIES_PER_STEP:
                service_name, raw_response = self._execute_step(
                    decision, context_outputs
                )

                analysis: AnalysisDecision = self._analyzer.analyze(
                    service_name, raw_response
                )

                if analysis.status == "ok":
                    context_outputs[f"step_{step_index}_{service_name}"] = raw_response
                    last_output = analysis.summary or raw_response
                    break

                if analysis.status == "escalate":
                    logger.warning(
                        "Response analysis requested escalation at step %d: %s",
                        step_index,
                        analysis.error_hint,
                    )
                    delegation = self._delegator.delegate(
                        route_decision=route_decision,
                        user_input=user_input,
                        accumulated_outputs=context_outputs,
                        reason=f"escalation:{analysis.error_hint}",
                    )
                    result.delegated_to_llm = True
                    result.delegation_output = delegation.content
                    result.status = "delegated"
                    result.outputs = context_outputs
                    result.steps_taken = step_index
                    return result

                if analysis.status in ("error", "retry"):
                    retries += 1
                    logger.warning(
                        "Retrying step %d (attempt %d): %s",
                        step_index,
                        retries,
                        analysis.error_hint,
                    )
                    continue

                break  # unknown status — proceed

            else:
                # All retries exhausted
                logger.error(
                    "Step %d failed after %d retries.",
                    step_index,
                    _MAX_RETRIES_PER_STEP,
                )
                result.status = "failed"
                result.error = f"Step {step_index} max retries exceeded"
                break

        else:
            logger.warning("Orchestration hit step cap (%d).", _MAX_STEPS)
            result.status = "failed"
            result.error = f"Step cap ({_MAX_STEPS}) exceeded"

        if result.status == "success":
            result.outputs = context_outputs
            result.steps_taken = step_index

        return result
