"""API-backed SLM providers for routing fallback (Anthropic Haiku, Groq, Together).

These are used when the local Ollama SLM fails or times out.
All providers share the same interface: send prompt, return raw string.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.interfaces import SecretProvider

logger = logging.getLogger(__name__)

import anthropic

from app.routing.providers.base import SLMProviderBase


class AnthropicSLMProvider(SLMProviderBase):
    """Anthropic Haiku as SLM routing fallback.

    Used when the primary local SLM fails. Haiku is cheap and fast
    enough (~200 ms) to serve as a reliable fallback without blowing
    the routing latency budget.

    Args:
        api_key: Anthropic API key (resolved from Vault).
        model: Model ID, defaults to ``claude-haiku-4-5``.
        max_tokens: Output token cap.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "claude-haiku-4-5",
        max_tokens: int = 256,
    ) -> None:
        """Initialise with resolved API credentials."""
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model
        self._max_tokens = max_tokens

    def route(self, prompt: str) -> str:
        """Send routing prompt to Anthropic and return raw response text.

        Args:
            prompt: The routing prompt.

        Returns:
            Raw text content from the model response.

        Raises:
            RuntimeError: On API error.
        """
        try:
            message = self._client.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return message.content[0].text
        except anthropic.APIError as exc:
            raise RuntimeError(f"Anthropic API error: {exc}") from exc


class GroqSLMProvider(SLMProviderBase):
    """Groq API provider for guardrail SLM fallback (llama-3.1-8b-instant).

    Args:
        api_key: Groq API key (resolved from Vault).
        model: Model ID.
        max_tokens: Output token cap.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "llama-3.1-8b-instant",
        max_tokens: int = 256,
    ) -> None:
        """Initialise with resolved API credentials."""
        # Import lazily to avoid hard dependency when Groq is not configured
        try:
            from groq import Groq  # type: ignore[import-untyped]
            self._client = Groq(api_key=api_key)
        except ImportError as exc:
            raise RuntimeError(
                "groq package not installed. Run: pip install groq"
            ) from exc
        self._model = model
        self._max_tokens = max_tokens

    def route(self, prompt: str) -> str:
        """Send routing prompt to Groq and return raw response text.

        Args:
            prompt: The routing prompt.

        Returns:
            Raw text content from the model response.

        Raises:
            RuntimeError: On API error.
        """
        try:
            completion = self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=self._max_tokens,
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            return completion.choices[0].message.content or ""
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Groq API error: {exc}") from exc


class TogetherSLMProvider(SLMProviderBase):
    """Together AI provider for coding SLM fallback (Qwen2.5-7B).

    Args:
        api_key: Together API key (resolved from Vault).
        model: Model ID.
        max_tokens: Output token cap.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "Qwen/Qwen2.5-7B-Instruct-Turbo",
        max_tokens: int = 256,
    ) -> None:
        """Initialise with resolved API credentials."""
        try:
            from together import Together  # type: ignore[import-untyped]
            self._client = Together(api_key=api_key)
        except ImportError as exc:
            raise RuntimeError(
                "together package not installed. Run: pip install together"
            ) from exc
        self._model = model
        self._max_tokens = max_tokens

    def route(self, prompt: str) -> str:
        """Send routing prompt to Together AI and return raw response text.

        Args:
            prompt: The routing prompt.

        Returns:
            Raw text content from the model response.

        Raises:
            RuntimeError: On API error.
        """
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=self._max_tokens,
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content or ""
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Together API error: {exc}") from exc
