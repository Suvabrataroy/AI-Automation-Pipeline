"""Unit tests for the SLM routing layer.

All external provider calls are mocked at the SLMProvider interface boundary.
No infrastructure required — runs with: pytest tests/unit/test_slm_router.py
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.routing.router_schema import PreFilterDecision, RouteDecision
from app.routing.slm_router import (
    SLMRouter,
    _build_routing_prompt,
    _truncate_input,
    _MAX_INPUT_CHARS,
    _parse_route_decision,
    _parse_prefilter_decision,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_router(
    slm_raw: str,
    fallback_raw: str | None = None,
    prefilter_raw: str | None = None,
    routing_config: dict | None = None,
) -> SLMRouter:
    """Build an SLMRouter with mocked providers."""
    slm = MagicMock()
    slm.route.return_value = slm_raw

    fallback = MagicMock()
    if fallback_raw:
        fallback.route.return_value = fallback_raw

    prefilter = None
    if prefilter_raw is not None:
        prefilter = MagicMock()
        prefilter.route.return_value = prefilter_raw

    cfg = routing_config or {
        "rules": {
            "slm_threshold": {"max_complexity": "low", "min_confidence": 0.80},
            "escalation": {"on_guardrail_fail": "retry_with_llm", "max_retries": 2},
            "priority_override": {"high_priority_always_llm": True},
        }
    }
    return SLMRouter(slm, fallback, prefilter, cfg)


def _valid_decision(**overrides) -> str:
    """Return valid RouteDecision JSON string."""
    base = {
        "intent": "code_review",
        "task": "coding_workflow",
        "complexity": "low",
        "priority": "low",
        "confidence": 0.92,
        "route": "slm",
    }
    base.update(overrides)
    return json.dumps(base)


# ---------------------------------------------------------------------------
# _truncate_input
# ---------------------------------------------------------------------------

class TestTruncateInput:
    """Tests for input truncation logic."""

    def test_short_input_unchanged(self):
        """Inputs under the limit are returned as-is."""
        text = "Fix the login bug"
        assert _truncate_input(text) == text

    def test_long_input_is_clipped(self):
        """Inputs over the limit are clipped with a truncation marker."""
        text = "x" * (_MAX_INPUT_CHARS + 100)
        result = _truncate_input(text)
        assert len(result) <= _MAX_INPUT_CHARS
        assert result.endswith("…[truncated]")

    def test_exact_limit_unchanged(self):
        """Input exactly at the limit is not modified."""
        text = "y" * _MAX_INPUT_CHARS
        assert _truncate_input(text) == text


# ---------------------------------------------------------------------------
# _build_routing_prompt
# ---------------------------------------------------------------------------

class TestBuildRoutingPrompt:
    """Tests for routing prompt construction."""

    def test_prompt_contains_input(self):
        """The routing prompt embeds the truncated input text."""
        prompt = _build_routing_prompt("review my PR")
        assert "review my PR" in prompt

    def test_prompt_mentions_json_schema(self):
        """The prompt references the expected JSON schema fields."""
        prompt = _build_routing_prompt("test")
        for field in ("intent", "task", "complexity", "priority", "confidence", "route"):
            assert field in prompt


# ---------------------------------------------------------------------------
# _parse_route_decision
# ---------------------------------------------------------------------------

class TestParseRouteDecision:
    """Tests for RouteDecision JSON parsing."""

    def test_valid_json_parses(self):
        """Valid JSON produces a RouteDecision instance."""
        raw = _valid_decision()
        decision = _parse_route_decision(raw)
        assert isinstance(decision, RouteDecision)
        assert decision.intent == "code_review"

    def test_invalid_json_raises(self):
        """Malformed JSON raises ValueError."""
        with pytest.raises(ValueError, match="Invalid RouteDecision JSON"):
            _parse_route_decision("not json at all")

    def test_missing_field_raises(self):
        """JSON missing required fields raises ValueError."""
        with pytest.raises(ValueError):
            _parse_route_decision(json.dumps({"intent": "x"}))

    def test_invalid_complexity_raises(self):
        """Invalid literal value raises ValueError."""
        with pytest.raises(ValueError):
            _parse_route_decision(_valid_decision(complexity="extreme"))


# ---------------------------------------------------------------------------
# _parse_prefilter_decision
# ---------------------------------------------------------------------------

class TestParsePrefilterDecision:
    """Tests for PreFilterDecision JSON parsing."""

    def test_valid_json_parses(self):
        """Valid JSON produces a PreFilterDecision."""
        raw = json.dumps({"valid": True, "reason": ""})
        result = _parse_prefilter_decision(raw)
        assert result.valid is True

    def test_bad_json_defaults_to_valid(self):
        """Unparseable pre-filter output defaults to valid=True to avoid blocking traffic."""
        result = _parse_prefilter_decision("garbage output")
        assert result.valid is True


# ---------------------------------------------------------------------------
# SLMRouter.route — happy path
# ---------------------------------------------------------------------------

class TestSLMRouterRoute:
    """Tests for the full routing pipeline."""

    def test_low_complexity_routes_to_slm(self):
        """Low complexity + high confidence stays on SLM tier."""
        router = _make_router(_valid_decision(complexity="low", confidence=0.95))
        decision = router.route("Fix the null pointer in auth")
        assert decision.route == "slm"

    def test_high_priority_escalates_to_llm(self):
        """High priority always escalates to LLM regardless of complexity."""
        router = _make_router(_valid_decision(complexity="low", priority="high", confidence=0.95))
        decision = router.route("URGENT: production is down")
        assert decision.route == "llm"

    def test_high_complexity_escalates_to_llm(self):
        """High complexity escalates to LLM."""
        router = _make_router(_valid_decision(complexity="high", confidence=0.90))
        decision = router.route("Redesign the entire auth architecture")
        assert decision.route == "llm"

    def test_low_confidence_escalates_to_llm(self):
        """Confidence below threshold escalates to LLM."""
        router = _make_router(_valid_decision(complexity="low", confidence=0.50))
        decision = router.route("Do the thing")
        assert decision.route == "llm"

    def test_pipeline_specific_route_preserved_when_slm(self):
        """A pipeline-specific route string is kept when SLM threshold is met."""
        router = _make_router(_valid_decision(
            complexity="low", confidence=0.95, route="coding_workflow"
        ))
        decision = router.route("Review this PR")
        assert decision.route == "coding_workflow"


# ---------------------------------------------------------------------------
# SLMRouter.route — pre-filter
# ---------------------------------------------------------------------------

class TestSLMRouterPreFilter:
    """Tests for the SmolLM2 pre-filter stage."""

    def test_prefilter_blocks_invalid_request(self):
        """Pre-filter rejection short-circuits the SLM and returns rejected route."""
        pf_raw = json.dumps({"valid": False, "reason": "empty_input"})
        router = _make_router(_valid_decision(), prefilter_raw=pf_raw)
        decision = router.route("")
        assert decision.route == "rejected"
        assert decision.intent == "rejected"

    def test_prefilter_passes_valid_request(self):
        """Pre-filter pass allows SLM routing to proceed normally."""
        pf_raw = json.dumps({"valid": True, "reason": ""})
        router = _make_router(_valid_decision(complexity="low", confidence=0.95), prefilter_raw=pf_raw)
        decision = router.route("Fix the login bug")
        assert decision.route == "slm"

    def test_no_prefilter_skips_stage(self):
        """When prefilter_provider is None, the pre-filter stage is skipped."""
        router = _make_router(_valid_decision(complexity="low", confidence=0.95), prefilter_raw=None)
        decision = router.route("Fix the login bug")
        assert decision.route == "slm"


# ---------------------------------------------------------------------------
# SLMRouter.route — fallback
# ---------------------------------------------------------------------------

class TestSLMRouterFallback:
    """Tests for primary→fallback SLM cascade."""

    def test_fallback_used_when_primary_fails(self):
        """When the primary SLM raises, the fallback is called instead."""
        slm = MagicMock()
        slm.route.side_effect = RuntimeError("Ollama down")
        fallback = MagicMock()
        fallback.route.return_value = _valid_decision(complexity="low", confidence=0.92)
        cfg = {
            "rules": {
                "slm_threshold": {"max_complexity": "low", "min_confidence": 0.80},
                "priority_override": {"high_priority_always_llm": True},
            }
        }
        router = SLMRouter(slm, fallback, None, cfg)
        decision = router.route("Review this PR")
        assert decision.route == "slm"
        fallback.route.assert_called_once()

    def test_both_fail_raises_runtime_error(self):
        """When both primary and fallback fail, RuntimeError is raised."""
        slm = MagicMock()
        slm.route.side_effect = RuntimeError("primary down")
        fallback = MagicMock()
        fallback.route.side_effect = RuntimeError("fallback down")
        cfg = {"rules": {"slm_threshold": {}, "priority_override": {}}}
        router = SLMRouter(slm, fallback, None, cfg)
        with pytest.raises(RuntimeError, match="Both SLM providers failed"):
            router.route("Fix the bug")
