"""Loads service descriptor YAML files from configs/services/.

Every .yaml file in that directory (except files starting with '_')
is validated against ServiceDescriptor and added to the registry.

Users register new services by dropping a new YAML file into the
configs/services/ directory — no Python changes required.
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.registry.service_descriptor import ServiceDescriptor

logger = logging.getLogger(__name__)

_SERVICES_DIR = Path("configs/services")


def load_service_configs(services_dir: Path = _SERVICES_DIR) -> list[ServiceDescriptor]:
    """Load and validate all service descriptor YAML files.

    Skips files whose names start with ``_`` (templates/documentation).
    Logs a warning and skips any file that fails schema validation —
    a bad service config must never crash the platform.

    Args:
        services_dir: Directory containing service YAML files.

    Returns:
        List of validated ``ServiceDescriptor`` instances for enabled services.
    """
    if not services_dir.exists():
        logger.warning("Services config directory not found: %s", services_dir)
        return []

    descriptors: list[ServiceDescriptor] = []

    for yaml_file in sorted(services_dir.glob("*.yaml")):
        if yaml_file.name.startswith("_"):
            continue  # skip templates and docs

        try:
            raw = yaml_file.read_text(encoding="utf-8")
            data = yaml.safe_load(raw)
            descriptor = ServiceDescriptor(**data)
        except (yaml.YAMLError, ValidationError, TypeError) as exc:
            logger.warning("Skipping invalid service config %s: %s", yaml_file.name, exc)
            continue

        if not descriptor.enabled:
            logger.debug("Service '%s' is disabled — skipping.", descriptor.name)
            continue

        descriptors.append(descriptor)
        logger.info("Registered service: %s (%s)", descriptor.name, descriptor.version)

    return descriptors
