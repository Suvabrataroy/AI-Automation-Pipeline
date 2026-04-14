"""Unit tests for the service registry.

No filesystem access to configs/services/ — all tests use in-memory
descriptors or a temporary directory. No infrastructure required.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
import yaml

from app.registry.service_descriptor import (
    ServiceDescriptor,
    ServiceSLMConfig,
    ServiceTransport,
)
from app.registry.registry_loader import load_service_configs
from app.registry.service_registry import ServiceRegistry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_descriptor(**overrides) -> ServiceDescriptor:
    """Build a minimal valid ServiceDescriptor."""
    base = {
        "name": "test-service",
        "description": "A test service.",
        "purpose": "testing",
        "capabilities": ["cap_a", "cap_b"],
        "slm": ServiceSLMConfig(intent_keywords=["test", "demo"]),
        "transport": ServiceTransport(type="rest", url="http://test:8080"),
    }
    base.update(overrides)
    return ServiceDescriptor(**base)


def _write_service_yaml(directory: Path, name: str, data: dict) -> Path:
    """Write a service YAML file and return its path."""
    file_path = directory / f"{name}.yaml"
    file_path.write_text(yaml.dump(data), encoding="utf-8")
    return file_path


# ---------------------------------------------------------------------------
# ServiceDescriptor.token_summary
# ---------------------------------------------------------------------------

class TestTokenSummary:
    """Tests for the compact token summary format."""

    def test_format_is_correct(self):
        """Token summary follows name:caps|transport|complexity format."""
        d = _make_descriptor()
        summary = d.token_summary()
        assert summary == "test-service:cap_a,cap_b|rest|low"

    def test_caps_truncated_to_four(self):
        """Only the first 4 capabilities appear in the token summary."""
        d = _make_descriptor(capabilities=["a", "b", "c", "d", "e", "f"])
        summary = d.token_summary()
        parts = summary.split("|")[0].split(":")[1]
        assert len(parts.split(",")) == 4

    def test_mcp_transport_in_summary(self):
        """MCP transport type appears in the summary."""
        d = _make_descriptor(
            transport=ServiceTransport(type="mcp", mcp_server="github")
        )
        assert "|mcp|" in d.token_summary()


# ---------------------------------------------------------------------------
# registry_loader
# ---------------------------------------------------------------------------

class TestRegistryLoader:
    """Tests for the YAML loader."""

    def test_loads_valid_yaml(self):
        """A valid service YAML is loaded and returned."""
        data = {
            "name": "loader-test",
            "description": "Test service",
            "purpose": "testing",
            "capabilities": ["do_thing"],
            "slm": {"intent_keywords": ["test"]},
            "transport": {"type": "rest", "url": "http://test:8080"},
        }
        with tempfile.TemporaryDirectory() as tmp:
            _write_service_yaml(Path(tmp), "loader-test", data)
            results = load_service_configs(Path(tmp))
        assert len(results) == 1
        assert results[0].name == "loader-test"

    def test_template_files_skipped(self):
        """Files starting with '_' are ignored."""
        data = {
            "name": "should-not-load",
            "description": "x",
            "purpose": "x",
            "capabilities": ["x"],
            "transport": {"type": "rest", "url": "http://x:8080"},
        }
        with tempfile.TemporaryDirectory() as tmp:
            _write_service_yaml(Path(tmp), "_template", data)
            results = load_service_configs(Path(tmp))
        assert len(results) == 0

    def test_disabled_service_skipped(self):
        """Services with enabled: false are not loaded."""
        data = {
            "name": "disabled-svc",
            "description": "x",
            "purpose": "x",
            "capabilities": ["x"],
            "transport": {"type": "rest", "url": "http://x:8080"},
            "enabled": False,
        }
        with tempfile.TemporaryDirectory() as tmp:
            _write_service_yaml(Path(tmp), "disabled-svc", data)
            results = load_service_configs(Path(tmp))
        assert len(results) == 0

    def test_invalid_yaml_skipped_not_raised(self):
        """A malformed YAML file is skipped without crashing."""
        with tempfile.TemporaryDirectory() as tmp:
            bad_file = Path(tmp) / "bad.yaml"
            bad_file.write_text("{ invalid yaml: [", encoding="utf-8")
            results = load_service_configs(Path(tmp))
        assert results == []

    def test_missing_directory_returns_empty(self):
        """A non-existent directory returns an empty list."""
        results = load_service_configs(Path("/nonexistent/path"))
        assert results == []


# ---------------------------------------------------------------------------
# ServiceRegistry
# ---------------------------------------------------------------------------

class TestServiceRegistry:
    """Tests for the in-memory service registry."""

    def _registry_with(self, *descriptors: ServiceDescriptor) -> ServiceRegistry:
        """Build a registry pre-loaded with given descriptors."""
        registry = ServiceRegistry.__new__(ServiceRegistry)
        registry._services_dir = Path("nonexistent")
        registry._services = {d.name: d for d in descriptors}
        return registry

    def test_get_returns_descriptor(self):
        """get() returns the descriptor for a known service."""
        d = _make_descriptor(name="svc-a")
        reg = self._registry_with(d)
        assert reg.get("svc-a") is d

    def test_get_unknown_returns_none(self):
        """get() returns None for unknown service names."""
        reg = self._registry_with()
        assert reg.get("unknown") is None

    def test_contains_known_service(self):
        """__contains__ returns True for registered services."""
        d = _make_descriptor(name="svc-b")
        reg = self._registry_with(d)
        assert "svc-b" in reg

    def test_len_reflects_count(self):
        """__len__ returns the correct count of registered services."""
        reg = self._registry_with(
            _make_descriptor(name="a"),
            _make_descriptor(name="b"),
        )
        assert len(reg) == 2

    def test_match_intent_returns_ranked_results(self):
        """match_intent returns services sorted by keyword overlap."""
        svc_a = _make_descriptor(
            name="a",
            slm=ServiceSLMConfig(intent_keywords=["code", "review", "pr"]),
        )
        svc_b = _make_descriptor(
            name="b",
            slm=ServiceSLMConfig(intent_keywords=["notify", "slack"]),
        )
        reg = self._registry_with(svc_a, svc_b)
        results = reg.match_intent(["code", "review"])
        assert results[0].name == "a"
        assert len(results) == 1  # svc_b has no overlap

    def test_token_block_format(self):
        """token_block returns one line per service in token summary format."""
        d = _make_descriptor(name="svc", capabilities=["cap_x"])
        reg = self._registry_with(d)
        block = reg.token_block()
        assert "svc:cap_x|rest|low" in block

    def test_token_block_filtered_by_keywords(self):
        """token_block with filter_keywords only includes matching services."""
        svc_match = _make_descriptor(
            name="match",
            slm=ServiceSLMConfig(intent_keywords=["code"]),
        )
        svc_no_match = _make_descriptor(
            name="no-match",
            slm=ServiceSLMConfig(intent_keywords=["payment"]),
        )
        reg = self._registry_with(svc_match, svc_no_match)
        block = reg.token_block(filter_keywords=["code"])
        assert "match" in block
        assert "no-match" not in block
