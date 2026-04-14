"""Abstract base class for SLM providers used in routing."""

from abc import ABC, abstractmethod


class SLMProviderBase(ABC):
    """Base class for SLM providers that produce routing outputs.

    All concrete implementations (local Ollama, Anthropic Haiku, Groq, etc.)
    must implement ``route`` to return raw model output as a string.
    The router layer is responsible for parsing and validating the output.
    """

    @abstractmethod
    def route(self, prompt: str) -> str:
        """Send a prompt to the underlying SLM and return raw output.

        Args:
            prompt: The routing prompt, already truncated to safe length.

        Returns:
            Raw string output from the model. Expected to be valid JSON
            for the ``RouteDecision`` schema, but validation happens upstream.

        Raises:
            RuntimeError: On network failure, timeout, or model error.
        """
        ...
