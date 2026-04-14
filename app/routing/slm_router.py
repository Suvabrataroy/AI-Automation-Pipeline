"""SLM-based request router.

Routing pipeline:
  1. SmolLM2 360M pre-filter  (optional, ~10 ms) — drops junk early.
  2. Phi-3 Mini primary SLM   (~300 ms)          — produces RouteDecision JSON.
  3. Anthropic Haiku fallback  (API)              — used when local SLM fails.

Design constraints applied (per engineering notes):
- Routing prompts are hard-capped at 200 tokens of input text.
- Ollama JSON mode (format: json) is always requested for local models.
- Routing SLM and guardrail SLM are separate tiers with independent timeouts.
- The pre-filter is a separate pass that can be toggled via models.yaml.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from app.core.interfaces import SLMProvider
from app.routing.router_schema import PreFilterDecision, RouteDecision

if TYPE_CHECKING:
    from app.core.interfaces import SecretProvider

logger = logging.getLogger(__name__)

# Routing prompts must stay under this limit; SLMs degrade above ~300 tokens.
_MAX_INPUT_CHARS: int = 600  # ~150 tokens at 4 chars/token — safe margin
_TRUNCATION_SUFFIX: str = "…[truncated]"


def _truncate_input(text: str) -> str:
    """Truncate input text to the routing-safe character limit.

    Args:
        text: Raw user input string.

    Returns:
        Text clipped to ``_MAX_INPUT_CHARS`` with a truncation marker if needed.
    """
    if len(text) <= _MAX_INPUT_CHARS:
        return text
    clip = _MAX_INPUT_CHARS - len(_TRUNCATION_SUFFIX)
    return text[:clip] + _TRUNCATION_SUFFIX


def _build_routing_prompt(input_text: str) -> str:
    """Build a minimal routing prompt for the SLM.

    Kept intentionally terse — Phi-3 Mini's JSON reliability drops above
    ~300 input tokens, so we strip everything except the essential signal.

    Args:
        input_text: Already-truncated user request text.

    Returns:
        Prompt string that asks the model for a JSON RouteDecision.
    """
    return (
        "Classify the request below. Reply with valid JSON only — no extra text.\n"
        'Schema: {"intent": str, "task": str, "complexity": "low"|"medium"|"high", '
        '"priority": "low"|"medium"|"high", "confidence": float 0-1, "route": str}\n\n'
        f"Request: {input_text}"
    )


def _build_prefilter_prompt(input_text: str) -> str:
    """Build a minimal pre-filter prompt for SmolLM2 360M.

    Args:
        input_text: Already-truncated user request text.

    Returns:
        Prompt string that asks the model for a JSON PreFilterDecision.
    """
    return (
        "Is this a valid, in-domain AI workflow request? Reply JSON only.\n"
        'Schema: {"valid": true|false, "reason": str}\n\n'
        f"Request: {input_text}"
    )


def _parse_route_decision(raw: str) -> RouteDecision:
    """Parse and validate a RouteDecision from raw model output.

    Args:
        raw: Raw string output from the SLM.

    Returns:
        Validated ``RouteDecision`` instance.

    Raises:
        ValueError: If the output cannot be parsed or validated.
    """
    try:
        data = json.loads(raw.strip())
        return RouteDecision(**data)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid RouteDecision JSON: {exc!r} — raw='{raw[:200]}'") from exc


def _parse_prefilter_decision(raw: str) -> PreFilterDecision:
    """Parse and validate a PreFilterDecision from raw model output.

    Args:
        raw: Raw string output from the pre-filter model.

    Returns:
        Validated ``PreFilterDecision`` instance. Defaults to valid=True
        on parse failure so a bad pre-filter never blocks real traffic.
    """
    try:
        data = json.loads(raw.strip())
        return PreFilterDecision(**data)
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("Pre-filter returned unparseable output; defaulting to valid=True.")
        return PreFilterDecision(valid=True, reason="parse_error")


class SLMRouter:
    """Routes incoming requests to the appropriate pipeline using SLMs.

    Uses a two-stage architecture:
    - Optional SmolLM2 360M pre-filter for cheap junk rejection.
    - Phi-3 Mini (or Haiku fallback) for full intent classification.

    Args:
        slm_provider: Primary SLM provider (local Ollama).
        fallback_provider: Fallback provider (Anthropic Haiku) used when
            the primary SLM fails or returns invalid JSON.
        prefilter_provider: Optional SmolLM2 360M provider. Pass ``None``
            to disable the pre-filter stage.
        routing_config: Dict loaded from ``configs/routing_rules.yaml``.
    """

    def __init__(
        self,
        slm_provider: SLMProvider,
        fallback_provider: SLMProvider,
        prefilter_provider: SLMProvider | None,
        routing_config: dict,
    ) -> None:
        """Initialise the router with injected providers and config."""
        self._slm = slm_provider
        self._fallback = fallback_provider
        self._prefilter = prefilter_provider
        self._cfg = routing_config

    def _should_use_llm(self, decision: RouteDecision) -> bool:
        """Apply routing rules from config to decide SLM vs LLM.

        Args:
            decision: The route decision produced by the SLM.

        Returns:
            True if the request should be escalated to the LLM tier.
        """
        rules = self._cfg.get("rules", {})
        slm_threshold = rules.get("slm_threshold", {})
        priority_override = rules.get("priority_override", {})

        max_complexity = slm_threshold.get("max_complexity", "low")
        min_confidence = float(slm_threshold.get("min_confidence", 0.80))
        high_priority_always_llm = priority_override.get("high_priority_always_llm", True)

        complexity_rank = {"low": 0, "medium": 1, "high": 2}
        complexity_ok = (
            complexity_rank.get(decision.complexity, 2)
            <= complexity_rank.get(max_complexity, 0)
        )

        if high_priority_always_llm and decision.priority == "high":
            return True
        if complexity_ok and decision.confidence >= min_confidence:
            return False
        return True

    def _run_prefilter(self, input_text: str) -> PreFilterDecision:
        """Run the SmolLM2 360M pre-filter stage.

        Args:
            input_text: Truncated request text.

        Returns:
            ``PreFilterDecision`` with valid=True if request should proceed.
        """
        prompt = _build_prefilter_prompt(input_text)
        raw = self._prefilter.route(prompt)  # type: ignore[union-attr]
        return _parse_prefilter_decision(raw)

    def _run_slm(self, input_text: str) -> RouteDecision:
        """Run the primary SLM routing stage with Haiku fallback.

        Args:
            input_text: Truncated request text.

        Returns:
            Validated ``RouteDecision``.

        Raises:
            RuntimeError: If both primary and fallback SLMs fail.
        """
        prompt = _build_routing_prompt(input_text)

        try:
            raw = self._slm.route(prompt)
            return _parse_route_decision(raw)
        except Exception as primary_exc:  # noqa: BLE001
            logger.warning(
                "Primary SLM failed (%s); falling back to Haiku.", primary_exc
            )

        try:
            raw = self._fallback.route(prompt)
            return _parse_route_decision(raw)
        except Exception as fallback_exc:  # noqa: BLE001
            raise RuntimeError(
                f"Both SLM providers failed. primary={primary_exc!r} "
                f"fallback={fallback_exc!r}"
            ) from fallback_exc

    def route(self, input_text: str) -> RouteDecision:
        """Route a request to the appropriate pipeline.

        Applies the full two-stage routing pipeline:
        pre-filter → SLM classification → rule-based tier escalation.

        Args:
            input_text: Raw user request string.

        Returns:
            Final ``RouteDecision`` with ``route`` set to a pipeline name
            or ``'slm'`` / ``'llm'`` tier label.
        """
        truncated = _truncate_input(input_text)

        if self._prefilter is not None:
            pf = self._run_prefilter(truncated)
            if not pf.valid:
                logger.info("Pre-filter rejected request: %s", pf.reason)
                return RouteDecision(
                    intent="rejected",
                    task="none",
                    complexity="low",
                    priority="low",
                    confidence=1.0,
                    route="rejected",
                )

        decision = self._run_slm(truncated)

        if self._should_use_llm(decision):
            decision.route = "llm"
        else:
            if decision.route not in ("slm", "llm"):
                pass  # keep pipeline-specific route as-is
            else:
                decision.route = "slm"

        logger.info(
            "Routed request: intent=%s complexity=%s priority=%s "
            "confidence=%.2f route=%s",
            decision.intent,
            decision.complexity,
            decision.priority,
            decision.confidence,
            decision.route,
        )
        return decision
