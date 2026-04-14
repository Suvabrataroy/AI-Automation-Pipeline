"""Centralized SLM service registry.

The registry is the single source of truth for all registered services.
The SLM brain queries it to:
  1. Get compact token summaries for its decision context.
  2. Resolve a service name to its full descriptor for execution.
  3. Look up which services match a given intent or capability.

The registry is loaded once at startup from configs/services/*.yaml.
A reload endpoint (POST /registry/reload) triggers a hot-reload at runtime.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator

from app.registry.registry_loader import load_service_configs
from app.registry.service_descriptor import ServiceDescriptor

logger = logging.getLogger(__name__)

# Max services shown in SLM context — beyond this we filter by relevance.
_MAX_TOKEN_SUMMARY_SERVICES: int = 12


class ServiceRegistry:
    """Manages the set of all registered services and their metadata.

    The registry exposes:
    - ``get(name)`` — resolve a service by name.
    - ``token_block()`` — compact multi-line summary for SLM prompt injection.
    - ``match_intent(keywords)`` — find services whose keywords overlap.
    - ``reload()`` — hot-reload from disk.

    Args:
        services_dir: Directory to load service YAML files from.
    """

    def __init__(self, services_dir: Path = Path("configs/services")) -> None:
        """Initialise and load all service descriptors."""
        self._services_dir = services_dir
        self._services: dict[str, ServiceDescriptor] = {}
        self.reload()

    def reload(self) -> int:
        """Reload all service descriptors from disk.

        Returns:
            Number of services successfully loaded.
        """
        descriptors = load_service_configs(self._services_dir)
        self._services = {d.name: d for d in descriptors}
        logger.info("Service registry loaded %d services.", len(self._services))
        return len(self._services)

    def get(self, name: str) -> ServiceDescriptor | None:
        """Return a service descriptor by name.

        Args:
            name: Unique service name as declared in its YAML config.

        Returns:
            ``ServiceDescriptor`` if found, else ``None``.
        """
        return self._services.get(name)

    def all_services(self) -> Iterator[ServiceDescriptor]:
        """Iterate over all registered (enabled) services.

        Yields:
            Each registered ``ServiceDescriptor``.
        """
        yield from self._services.values()

    def match_intent(self, keywords: list[str]) -> list[ServiceDescriptor]:
        """Find services whose intent keywords overlap with the given keywords.

        Used by the SLM brain to filter the registry before building the
        token block — so the SLM only sees relevant services.

        Args:
            keywords: Intent keywords from the routing decision or user input.

        Returns:
            Services sorted by number of keyword matches (descending).
        """
        keyword_set = {k.lower() for k in keywords}
        scored: list[tuple[int, ServiceDescriptor]] = []

        for svc in self._services.values():
            svc_keywords = {k.lower() for k in svc.slm.intent_keywords}
            overlap = len(keyword_set & svc_keywords)
            if overlap > 0:
                scored.append((overlap, svc))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [svc for _, svc in scored]

    def token_block(self, filter_keywords: list[str] | None = None) -> str:
        """Build the compact token block injected into SLM orchestration prompts.

        Each line is one service summary: ``name:caps|transport|complexity``.
        If ``filter_keywords`` is given, only matching services are included.
        Capped at ``_MAX_TOKEN_SUMMARY_SERVICES`` to respect SLM context limits.

        Args:
            filter_keywords: Optional intent keywords to pre-filter services.

        Returns:
            Multi-line string of compact service token summaries.
        """
        if filter_keywords:
            services = self.match_intent(filter_keywords)[:_MAX_TOKEN_SUMMARY_SERVICES]
        else:
            services = list(self._services.values())[:_MAX_TOKEN_SUMMARY_SERVICES]

        return "\n".join(svc.token_summary() for svc in services)

    def __len__(self) -> int:
        """Return the number of registered services."""
        return len(self._services)

    def __contains__(self, name: str) -> bool:
        """Check if a service name is registered."""
        return name in self._services
