"""Local Ollama SLM provider for routing and pre-filtering.

Always requests JSON mode (``format: json``) to enable constrained decoding.
This raises valid-JSON rate from ~85% to near-100% at 3.8B scale.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.routing.providers.base import SLMProviderBase

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL: str = "http://localhost:11434"
_GENERATE_ENDPOINT: str = "/api/generate"


class LocalSLMProvider(SLMProviderBase):
    """Calls a locally-running Ollama server for SLM inference.

    Uses Ollama's ``format: json`` constrained decoding so the model is
    forced to produce valid JSON, eliminating most parse failures at small
    model scales.

    Args:
        model: Ollama model tag, e.g. ``"phi3:mini"`` or ``"smollm2:360m"``.
        base_url: Ollama server base URL.
        max_tokens: Hard cap on output tokens. Routing prompts need very
            few tokens; capping prevents rambling.
        timeout_ms: Request timeout in milliseconds.
    """

    def __init__(
        self,
        model: str,
        base_url: str = _DEFAULT_BASE_URL,
        max_tokens: int = 256,
        timeout_ms: int = 300,
    ) -> None:
        """Initialise provider with model config."""
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._max_tokens = max_tokens
        self._timeout = timeout_ms / 1000.0  # httpx uses seconds

    def _build_payload(self, prompt: str) -> dict[str, Any]:
        """Build the Ollama /api/generate request body.

        Args:
            prompt: The routing prompt string.

        Returns:
            Dict payload for the Ollama generate API.
        """
        return {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            "format": "json",         # constrained decoding — critical for small models
            "options": {
                "num_predict": self._max_tokens,
                "temperature": 0.0,   # deterministic — routing must be consistent
            },
        }

    def route(self, prompt: str) -> str:
        """Send prompt to Ollama and return raw response text.

        Args:
            prompt: Routing or pre-filter prompt.

        Returns:
            Raw JSON string from the model.

        Raises:
            RuntimeError: On HTTP error or timeout.
        """
        url = self._base_url + _GENERATE_ENDPOINT
        payload = self._build_payload(prompt)

        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data.get("response", "")
        except httpx.TimeoutException as exc:
            raise RuntimeError(
                f"Ollama timeout after {self._timeout}s for model '{self._model}'"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Ollama HTTP {exc.response.status_code} for model '{self._model}'"
            ) from exc
        except httpx.RequestError as exc:
            raise RuntimeError(
                f"Ollama connection error for model '{self._model}': {exc}"
            ) from exc
