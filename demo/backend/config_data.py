"""Dummy configuration data for the workflow config UI demo.

Provides realistic-looking pipeline, model, and routing rule configs
that the frontend config page can display and edit.
"""

from __future__ import annotations
from copy import deepcopy


# ─────────────────────────────────────────────
# Pipeline configurations
# ─────────────────────────────────────────────

_PIPELINES_BASE = [
    {
        "name": "coding_workflow",
        "description": "PR code review, Jira ticket creation, and Slack notification pipeline.",
        "tags": ["code", "github", "jira", "slack"],
        "version": "1.2",
        "trigger": {"type": "rest", "route": "slm"},
        "on_error": {"strategy": "retry", "max_attempts": 2},
        "steps": [
            {
                "id": "review_code",
                "type": "mcp_call",
                "service": "github",
                "capability": "code_review",
                "depends_on": [],
                "output_key": "review_result",
                "timeout_seconds": 30,
                "model_tier": "slm_coding",
                "on_error": "fail",
            },
            {
                "id": "create_ticket",
                "type": "mcp_call",
                "service": "jira",
                "capability": "create_ticket",
                "depends_on": ["review_code"],
                "output_key": "jira_issue",
                "timeout_seconds": 15,
                "model_tier": "slm",
                "on_error": "skip",
            },
            {
                "id": "notify_team",
                "type": "mcp_call",
                "service": "slack",
                "capability": "send_message",
                "depends_on": ["create_ticket"],
                "output_key": "slack_result",
                "timeout_seconds": 10,
                "model_tier": "slm",
                "on_error": "skip",
            },
        ],
    },
    {
        "name": "refund_workflow",
        "description": "Stripe order lookup, refund processing, and payment ops notification.",
        "tags": ["payment", "stripe", "slack"],
        "version": "1.0",
        "trigger": {"type": "rest", "route": "slm"},
        "on_error": {"strategy": "escalate_human", "max_attempts": 1},
        "steps": [
            {
                "id": "lookup_order",
                "type": "mcp_call",
                "service": "stripe",
                "capability": "lookup_order",
                "depends_on": [],
                "output_key": "order_data",
                "timeout_seconds": 10,
                "model_tier": "slm",
                "on_error": "fail",
            },
            {
                "id": "process_refund",
                "type": "mcp_call",
                "service": "stripe",
                "capability": "create_refund",
                "depends_on": ["lookup_order"],
                "output_key": "refund_result",
                "timeout_seconds": 15,
                "model_tier": "slm",
                "on_error": "escalate_human",
            },
            {
                "id": "notify_payments",
                "type": "mcp_call",
                "service": "slack",
                "capability": "send_message",
                "depends_on": ["process_refund"],
                "output_key": "notification",
                "timeout_seconds": 10,
                "model_tier": "slm",
                "on_error": "skip",
            },
        ],
    },
    {
        "name": "create_ticket_workflow",
        "description": "Create a Jira ticket from user request and notify the engineering team.",
        "tags": ["jira", "slack", "ticket"],
        "version": "1.1",
        "trigger": {"type": "rest", "route": "slm"},
        "on_error": {"strategy": "retry", "max_attempts": 2},
        "steps": [
            {
                "id": "create_jira_ticket",
                "type": "mcp_call",
                "service": "jira",
                "capability": "create_ticket",
                "depends_on": [],
                "output_key": "ticket",
                "timeout_seconds": 15,
                "model_tier": "slm",
                "on_error": "fail",
            },
            {
                "id": "notify_engineering",
                "type": "mcp_call",
                "service": "slack",
                "capability": "send_message",
                "depends_on": ["create_jira_ticket"],
                "output_key": "slack_result",
                "timeout_seconds": 10,
                "model_tier": "slm",
                "on_error": "skip",
            },
        ],
    },
    {
        "name": "analysis_workflow",
        "description": "Complex document or architecture analysis delegated to the LLM tier.",
        "tags": ["analysis", "llm", "delegation"],
        "version": "1.0",
        "trigger": {"type": "rest", "route": "llm"},
        "on_error": {"strategy": "fail", "max_attempts": 1},
        "steps": [
            {
                "id": "analyse_document",
                "type": "ai_task",
                "service": None,
                "capability": None,
                "depends_on": [],
                "output_key": "analysis",
                "timeout_seconds": 60,
                "model_tier": "llm",
                "on_error": "fail",
            },
        ],
    },
]


# ─────────────────────────────────────────────
# Model configuration
# ─────────────────────────────────────────────

_MODELS_BASE = {
    "tiers": {
        "slm": {
            "label": "SLM — Routing & Orchestration",
            "primary": {"provider": "local", "model": "phi3:mini", "timeout_ms": 300, "max_tokens": 256},
            "fallback": {"provider": "anthropic", "model": "claude-haiku-4-5", "timeout_ms": 2000, "max_tokens": 256},
        },
        "slm_guardrail": {
            "label": "SLM Guardrail",
            "primary": {"provider": "local", "model": "gemma2:2b", "timeout_ms": 400, "max_tokens": 128},
            "fallback": {"provider": "groq", "model": "llama-3.1-8b-instant", "timeout_ms": 1500, "max_tokens": 128},
        },
        "slm_coding": {
            "label": "SLM Coding",
            "primary": {"provider": "local", "model": "qwen2.5-coder:3b", "timeout_ms": 350, "max_tokens": 512},
            "fallback": {"provider": "together", "model": "Qwen/Qwen2.5-7B-Instruct-Turbo", "timeout_ms": 2000, "max_tokens": 512},
        },
        "llm": {
            "label": "LLM — Complex Reasoning",
            "primary": {"provider": "anthropic", "model": "claude-sonnet-4-6", "timeout_ms": 30000, "max_tokens": 4096},
            "fallback": {"provider": "openai", "model": "gpt-4o", "timeout_ms": 30000, "max_tokens": 4096},
        },
    },
    "pre_filter": {
        "enabled": True,
        "provider": "local",
        "model": "smollm2:360m",
        "timeout_ms": 10,
        "max_tokens": 8,
    },
    "providers": {
        "anthropic": {"api_key": "{{ secret:anthropic/api_key }}"},
        "openai": {"api_key": "{{ secret:openai/api_key }}"},
        "groq": {"api_key": "{{ secret:groq/api_key }}"},
        "together": {"api_key": "{{ secret:together/api_key }}"},
        "local": {"base_url": "http://localhost:11434", "format": "json"},
    },
    "cost_per_1k_tokens": {
        "claude-sonnet-4-6": 0.003,
        "claude-haiku-4-5": 0.00025,
        "gpt-4o": 0.005,
        "phi3:mini": 0.0,
        "gemma2:2b": 0.0,
        "qwen2.5-coder:3b": 0.0,
        "llama-3.1-8b-instant": 0.0001,
        "Qwen/Qwen2.5-7B-Instruct-Turbo": 0.0002,
        "smollm2:360m": 0.0,
    },
}


# ─────────────────────────────────────────────
# Routing rules
# ─────────────────────────────────────────────

_ROUTING_BASE = {
    "rules": {
        "slm_threshold": {
            "max_complexity": "low",
            "min_confidence": 0.80,
        },
        "escalation": {
            "on_guardrail_fail": "retry_with_llm",
            "max_retries": 2,
            "on_max_retries_exceeded": "escalate_human",
        },
        "priority_override": {
            "high_priority_always_llm": True,
        },
    }
}


# ─────────────────────────────────────────────
# Mutable in-memory state (deepcopy on load)
# ─────────────────────────────────────────────

def get_default_pipelines() -> list:
    """Return a fresh deepcopy of the default pipeline configs."""
    return deepcopy(_PIPELINES_BASE)


def get_default_models() -> dict:
    """Return a fresh deepcopy of the default model config."""
    return deepcopy(_MODELS_BASE)


def get_default_routing() -> dict:
    """Return a fresh deepcopy of the default routing rules."""
    return deepcopy(_ROUTING_BASE)
