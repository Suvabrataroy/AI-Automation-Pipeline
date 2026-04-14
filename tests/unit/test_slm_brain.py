"""Unit tests for the SLM brain orchestrator.

All providers and the service executor are mocked. No infrastructure needed.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, call

import pytest

from app.orchestrator.brain import OrchestrationResult, SLMBrain, _MAX_STEPS
from app.orchestrator.step_planner import StepDecision
from app.orchestrator.response_analyzer import AnalysisDecision
from app.routing.router_schema import RouteDecision


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_route_decision(**overrides) -> RouteDecision:
    """Build a valid RouteDecision."""
    base = {
        "intent": "code_review",
        "task": "coding_workflow",
        "complexity": "low",
        "priority": "low",
        "confidence": 0.92,
        "route": "slm",
    }
    base.update(overrides)
    return RouteDecision(**base)


def _step_decision_json(
    action: str = "return_result",
    service: str | None = None,
    capability: str | None = None,
    params: dict | None = None,
    done: bool = True,
    reason: str = "done",
) -> str:
    """Return a StepDecision as JSON string."""
    return json.dumps({
        "action": action,
        "service": service,
        "capability": capability,
        "params": params or {},
        "reason": reason,
        "done": done,
    })


def _analysis_json(status: str = "ok", summary: str = "looks good") -> str:
    """Return an AnalysisDecision as JSON string."""
    return json.dumps({"status": status, "summary": summary, "error_hint": ""})


def _make_brain(
    planner_responses: list[str],
    analyzer_responses: list[str] | None = None,
    executor_response: str = "service_result",
    llm_response_content: str = "llm_output",
) -> tuple[SLMBrain, MagicMock, MagicMock, MagicMock]:
    """Build SLMBrain with mocked dependencies.

    The SLM provider mock returns responses from the given lists in order.
    """
    slm = MagicMock()
    all_responses = list(planner_responses)
    if analyzer_responses:
        # interleave: plan, analyze, plan, analyze...
        interleaved = []
        for p, a in zip(planner_responses, analyzer_responses):
            interleaved.extend([p, a])
        all_responses = interleaved
    slm.route.side_effect = all_responses

    llm = MagicMock()
    llm_response = MagicMock()
    llm_response.content = llm_response_content
    llm_response.model = "claude-sonnet-4-6"
    llm_response.cost_usd = 0.001
    llm.complete.return_value = llm_response

    registry = MagicMock()
    registry.token_block.return_value = "github:code_review,pr_ops|mcp|low"

    executor = MagicMock(return_value=executor_response)

    brain = SLMBrain(
        slm_provider=slm,
        llm_provider=llm,
        registry=registry,
        service_executor=executor,
    )
    return brain, slm, llm, executor


# ---------------------------------------------------------------------------
# Happy path — immediate return
# ---------------------------------------------------------------------------

class TestSLMBrainImmediate:
    """Tests where the SLM returns done on the first step."""

    def test_returns_success_on_immediate_done(self):
        """Brain returns success when planner sets done=True on step 1."""
        brain, _, _, _ = _make_brain([_step_decision_json(done=True)])
        result = brain.orchestrate(_make_route_decision(), {"text": "hello"})
        assert result.status == "success"
        assert result.steps_taken == 1
        assert result.delegated_to_llm is False

    def test_return_result_action_stops_loop(self):
        """action=return_result also stops the loop cleanly."""
        brain, _, _, _ = _make_brain([
            _step_decision_json(action="return_result", done=False)
        ])
        result = brain.orchestrate(_make_route_decision(), {})
        assert result.status == "success"


# ---------------------------------------------------------------------------
# Service call step
# ---------------------------------------------------------------------------

class TestSLMBrainServiceCall:
    """Tests for the service call execution path."""

    def test_service_call_then_return(self):
        """Brain executes one service call then returns on second step."""
        planner = [
            _step_decision_json(
                action="call_service",
                service="github",
                capability="code_review",
                done=False,
            ),
            _step_decision_json(action="return_result", done=True),
        ]
        analyzer = [_analysis_json(status="ok")]
        brain, slm, _, executor = _make_brain(planner, analyzer)

        result = brain.orchestrate(_make_route_decision(), {"pr": 42})

        assert result.status == "success"
        assert result.steps_taken == 2
        executor.assert_called_once_with("github", "code_review", {})

    def test_service_output_stored_in_context(self):
        """Service response is stored in context outputs."""
        planner = [
            _step_decision_json(
                action="call_service", service="jira",
                capability="create_ticket", done=False,
            ),
            _step_decision_json(action="return_result", done=True),
        ]
        analyzer = [_analysis_json(status="ok", summary="ticket created")]
        brain, _, _, executor = _make_brain(
            planner, analyzer, executor_response="JIRA-123"
        )
        result = brain.orchestrate(_make_route_decision(), {})
        assert any("jira" in k for k in result.outputs.keys())


# ---------------------------------------------------------------------------
# LLM delegation
# ---------------------------------------------------------------------------

class TestSLMBrainDelegation:
    """Tests for LLM delegation path."""

    def test_delegate_llm_triggers_delegation(self):
        """action=delegate_llm causes the brain to call the LLM."""
        brain, _, llm, _ = _make_brain([
            _step_decision_json(action="delegate_llm", done=False, reason="complex")
        ])
        result = brain.orchestrate(_make_route_decision(), {})
        assert result.delegated_to_llm is True
        assert result.status == "delegated"
        assert result.delegation_output == "llm_output"
        llm.complete.assert_called_once()

    def test_escalation_from_analyzer_triggers_delegation(self):
        """Response analysis escalate status triggers LLM delegation."""
        planner = [
            _step_decision_json(
                action="call_service", service="github",
                capability="review", done=False,
            ),
        ]
        analyzer = [_analysis_json(status="escalate")]
        brain, _, llm, executor = _make_brain(planner, analyzer)
        result = brain.orchestrate(_make_route_decision(), {})
        assert result.delegated_to_llm is True
        llm.complete.assert_called_once()


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

class TestSLMBrainRetry:
    """Tests for retry-on-error logic."""

    def test_retry_then_ok(self):
        """Brain retries a service call when analyzer returns retry, then succeeds."""
        # planner called once, analyzer called twice (retry then ok)
        slm = MagicMock()
        slm.route.side_effect = [
            _step_decision_json(action="call_service", service="s", capability="c", done=False),
            _analysis_json(status="retry"),
            _analysis_json(status="ok"),
            _step_decision_json(action="return_result", done=True),
        ]
        llm = MagicMock()
        registry = MagicMock()
        registry.token_block.return_value = "s:c|rest|low"
        executor = MagicMock(return_value="ok_result")
        brain = SLMBrain(slm, llm, registry, executor)
        result = brain.orchestrate(_make_route_decision(), {})
        assert result.status == "success"
        assert executor.call_count == 2  # called twice due to retry


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------

class TestSLMBrainErrors:
    """Tests for error handling and edge cases."""

    def test_planner_parse_failure_returns_failed(self):
        """Unparseable SLM output causes status=failed without raising."""
        brain, _, _, _ = _make_brain(["not json at all"])
        result = brain.orchestrate(_make_route_decision(), {})
        assert result.status == "failed"
        assert result.error is not None

    def test_step_cap_returns_failed(self):
        """Hitting the step cap returns status=failed."""
        # Always return a call_service with done=False + ok analysis
        never_done = _step_decision_json(
            action="call_service", service="s", capability="c", done=False
        )
        ok_analysis = _analysis_json(status="ok")
        # need enough responses for _MAX_STEPS iterations × 2 (plan + analyze)
        responses = [r for _ in range(_MAX_STEPS + 1) for r in [never_done, ok_analysis]]

        slm = MagicMock()
        slm.route.side_effect = responses
        llm = MagicMock()
        registry = MagicMock()
        registry.token_block.return_value = "s:c|rest|low"
        executor = MagicMock(return_value="result")
        brain = SLMBrain(slm, llm, registry, executor)
        result = brain.orchestrate(_make_route_decision(), {})
        assert result.status == "failed"
        assert "cap" in (result.error or "").lower()
