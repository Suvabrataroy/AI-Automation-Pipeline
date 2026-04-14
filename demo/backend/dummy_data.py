"""Dummy workflow data for the SLM orchestration demo.

Four realistic workflows covering the main platform use-cases:
1. Code review → Jira ticket → Slack notification
2. Payment refund via Stripe → Slack notification
3. Jira ticket status lookup
4. Document analysis (LLM delegation)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MockStep:
    """A single mock step in a workflow."""

    step_index: int
    service: str
    capability: str
    params: dict[str, Any]
    response: dict[str, Any]
    analysis: dict[str, str]
    latency_ms: int


@dataclass
class MockWorkflow:
    """A complete mock workflow with route decision and steps."""

    name: str
    route_decision: dict[str, Any]
    prefilter: dict[str, Any]
    steps: list[MockStep]
    delegated: bool = False
    delegation: dict[str, Any] | None = None


# ─────────────────────────────────────────────
# Workflow 1 — Code Review + Jira + Slack
# ─────────────────────────────────────────────

CODING_WORKFLOW = MockWorkflow(
    name="coding_workflow",
    route_decision={
        "intent": "code_review",
        "task": "coding_workflow",
        "complexity": "low",
        "priority": "medium",
        "confidence": 0.94,
        "route": "slm",
    },
    prefilter={"valid": True, "reason": ""},
    steps=[
        MockStep(
            step_index=1,
            service="github",
            capability="code_review",
            params={
                "pr_number": 42,
                "repo": "acme-corp/api-gateway",
                "sha": "a1b2c3d4e5f6",
                "include_diff": True,
            },
            response={
                "pr_title": "feat: Add OAuth2 rate limiting",
                "author": "sarah-dev",
                "files_changed": 7,
                "additions": 142,
                "deletions": 38,
                "issues": [
                    {
                        "line": 87,
                        "file": "src/auth/middleware.py",
                        "severity": "medium",
                        "message": "Token validation missing expiry check",
                    },
                    {
                        "line": 203,
                        "file": "src/auth/middleware.py",
                        "severity": "low",
                        "message": "Consider caching decoded tokens to reduce latency",
                    },
                ],
                "approved": False,
                "score": 0.71,
            },
            analysis={
                "status": "ok",
                "summary": "2 issues found in OAuth2 middleware",
            },
            latency_ms=842,
        ),
        MockStep(
            step_index=2,
            service="jira",
            capability="create_ticket",
            params={
                "project": "ENG",
                "summary": "Security: Missing expiry check in OAuth2 middleware",
                "description": "Identified during PR #42 review. Token validation at src/auth/middleware.py:87 does not check token expiry, which may allow expired tokens to authenticate.",
                "priority": "Medium",
                "labels": ["security", "pr-review", "oauth2"],
                "linked_pr": 42,
            },
            response={
                "id": "ENG-2891",
                "key": "ENG-2891",
                "url": "https://acme.atlassian.net/browse/ENG-2891",
                "status": "To Do",
                "assignee": None,
                "created": "2026-04-09T10:23:41Z",
            },
            analysis={
                "status": "ok",
                "summary": "Ticket ENG-2891 created successfully",
            },
            latency_ms=312,
        ),
        MockStep(
            step_index=3,
            service="slack",
            capability="send_message",
            params={
                "channel": "#engineering-reviews",
                "text": "📋 PR #42 reviewed by SLM Brain. 2 issues found → Ticket ENG-2891 created.",
                "blocks": [
                    {"type": "section", "text": "PR #42: *feat: Add OAuth2 rate limiting*"},
                    {"type": "section", "text": "🔴 2 issues · Ticket: ENG-2891"},
                ],
            },
            response={
                "ok": True,
                "ts": "1712659421.234567",
                "channel": "C04XXXXXXXXXXX",
                "message": {"text": "PR #42 reviewed — 2 issues found"},
            },
            analysis={
                "status": "ok",
                "summary": "Notification sent to #engineering-reviews",
            },
            latency_ms=198,
        ),
    ],
)


# ─────────────────────────────────────────────
# Workflow 2 — Refund Processing
# ─────────────────────────────────────────────

REFUND_WORKFLOW = MockWorkflow(
    name="refund_workflow",
    route_decision={
        "intent": "payment_ops",
        "task": "refund_workflow",
        "complexity": "low",
        "priority": "high",
        "confidence": 0.91,
        "route": "slm",
    },
    prefilter={"valid": True, "reason": ""},
    steps=[
        MockStep(
            step_index=1,
            service="stripe",
            capability="lookup_order",
            params={
                "order_id": "ORD-7823",
                "expand": ["customer", "line_items"],
            },
            response={
                "order_id": "ORD-7823",
                "customer": {
                    "id": "cus_xxxxxxxxxxxxx",
                    "email": "james.wilson@example.com",
                    "name": "James Wilson",
                },
                "amount": 149.99,
                "currency": "usd",
                "status": "delivered",
                "items": [{"name": "Pro Plan - Monthly", "amount": 149.99, "qty": 1}],
                "payment_intent": "pi_3OxXXXXXXXXXXXXX",
                "created": "2026-03-15T08:12:00Z",
            },
            analysis={
                "status": "ok",
                "summary": "Order ORD-7823 found — $149.99 — delivered",
            },
            latency_ms=278,
        ),
        MockStep(
            step_index=2,
            service="stripe",
            capability="create_refund",
            params={
                "payment_intent": "pi_3OxXXXXXXXXXXXXX",
                "amount": 14999,
                "reason": "customer_request",
                "metadata": {"order_id": "ORD-7823", "initiated_by": "slm-brain"},
            },
            response={
                "id": "re_3OxYYYYYYYYYYYYY",
                "amount": 14999,
                "currency": "usd",
                "status": "succeeded",
                "payment_intent": "pi_3OxXXXXXXXXXXXXX",
                "reason": "customer_request",
                "created": 1712659421,
            },
            analysis={
                "status": "ok",
                "summary": "Refund of $149.99 processed successfully",
            },
            latency_ms=445,
        ),
        MockStep(
            step_index=3,
            service="slack",
            capability="send_message",
            params={
                "channel": "#payments-ops",
                "text": "✅ Refund processed for ORD-7823 — $149.99 — James Wilson (james.wilson@example.com)",
            },
            response={
                "ok": True,
                "ts": "1712659423.456789",
                "channel": "C05XXXXXXXXXXX",
            },
            analysis={
                "status": "ok",
                "summary": "Refund notification sent to #payments-ops",
            },
            latency_ms=187,
        ),
    ],
)


# ─────────────────────────────────────────────
# Workflow 3a — Create Jira Ticket
# ─────────────────────────────────────────────

CREATE_TICKET_WORKFLOW = MockWorkflow(
    name="create_ticket_workflow",
    route_decision={
        "intent": "ticket_creation",
        "task": "create_ticket_workflow",
        "complexity": "low",
        "priority": "medium",
        "confidence": 0.93,
        "route": "slm",
    },
    prefilter={"valid": True, "reason": ""},
    steps=[
        MockStep(
            step_index=1,
            service="jira",
            capability="create_ticket",
            params={
                "project": "ENG",
                "summary": "Develop login screen UI",
                "description": (
                    "Design and implement the login screen with the following requirements:\n"
                    "- Email and password input fields\n"
                    "- 'Remember me' checkbox\n"
                    "- Forgot password link\n"
                    "- OAuth2 social login buttons (Google, GitHub)\n"
                    "- Responsive layout for mobile and desktop"
                ),
                "issue_type": "Story",
                "priority": "Medium",
                "labels": ["frontend", "auth", "ui"],
                "story_points": 5,
            },
            response={
                "id": "ENG-2892",
                "key": "ENG-2892",
                "url": "https://acme.atlassian.net/browse/ENG-2892",
                "summary": "Develop login screen UI",
                "status": "To Do",
                "issue_type": "Story",
                "priority": "Medium",
                "assignee": None,
                "reporter": "slm-brain",
                "labels": ["frontend", "auth", "ui"],
                "story_points": 5,
                "created": "2026-04-09T11:04:22Z",
                "sprint": "Sprint 48",
            },
            analysis={
                "status": "ok",
                "summary": "Ticket ENG-2892 created — Develop login screen UI",
            },
            latency_ms=318,
        ),
        MockStep(
            step_index=2,
            service="slack",
            capability="send_message",
            params={
                "channel": "#engineering",
                "text": (
                    "📋 New ticket created by SLM Brain: *ENG-2892 — Develop login screen UI*\n"
                    "Priority: Medium | Sprint: 48 | Labels: frontend, auth, ui\n"
                    "https://acme.atlassian.net/browse/ENG-2892"
                ),
            },
            response={
                "ok": True,
                "ts": "1712663062.112233",
                "channel": "C04XXXXXXXXXXX",
                "message": {"text": "New ticket ENG-2892 created — Develop login screen UI"},
            },
            analysis={
                "status": "ok",
                "summary": "Team notified in #engineering",
            },
            latency_ms=204,
        ),
    ],
)


# ─────────────────────────────────────────────
# Workflow 3b — Ticket Status Lookup
# ─────────────────────────────────────────────

TICKET_WORKFLOW = MockWorkflow(
    name="ticket_workflow",
    route_decision={
        "intent": "ticket_ops",
        "task": "ticket_workflow",
        "complexity": "low",
        "priority": "low",
        "confidence": 0.97,
        "route": "slm",
    },
    prefilter={"valid": True, "reason": ""},
    steps=[
        MockStep(
            step_index=1,
            service="jira",
            capability="get_ticket",
            params={
                "ticket_id": "ENG-456",
                "fields": ["status", "assignee", "priority", "sprint", "labels", "comments"],
            },
            response={
                "id": "ENG-456",
                "summary": "Optimize database query performance in reports module",
                "status": "In Progress",
                "assignee": {
                    "name": "Alex Chen",
                    "email": "alex.chen@acme.com",
                    "avatar": "https://avatar.acme.com/alex",
                },
                "priority": "High",
                "sprint": "Sprint 47",
                "labels": ["performance", "backend", "postgres"],
                "updated": "2026-04-08T16:45:00Z",
                "comment_count": 8,
                "story_points": 5,
            },
            analysis={
                "status": "ok",
                "summary": "Ticket ENG-456 is In Progress — assigned to Alex Chen",
            },
            latency_ms=234,
        ),
    ],
)


# ─────────────────────────────────────────────
# Workflow 4 — LLM Delegation (complex analysis)
# ─────────────────────────────────────────────

ANALYSIS_WORKFLOW = MockWorkflow(
    name="analysis_workflow",
    route_decision={
        "intent": "document_analysis",
        "task": "analysis_workflow",
        "complexity": "high",
        "priority": "medium",
        "confidence": 0.88,
        "route": "llm",
    },
    prefilter={"valid": True, "reason": ""},
    steps=[],
    delegated=True,
    delegation={
        "reason": "task_complexity — complexity:high exceeds SLM capability threshold",
        "model": "claude-sonnet-4-6",
        "cost_usd": 0.0089,
        "content": (
            "## Security Architecture Review\n\n"
            "**Executive Summary:** The proposed microservices architecture demonstrates "
            "solid foundational design, with three priority recommendations:\n\n"
            "1. **API Gateway Authentication** — Implement mutual TLS between services. "
            "The current bearer token approach creates a single point of compromise.\n\n"
            "2. **Secret Rotation** — Vault leases should be set to 1h for service accounts "
            "rather than the current 24h. Reduces blast radius of credential exposure.\n\n"
            "3. **Network Segmentation** — Database tier should be isolated in a separate "
            "subnet with no direct internet egress. Current topology allows lateral movement "
            "from compromised service pods.\n\n"
            "The SLM routing layer design is well-considered — separating routing and guardrail "
            "SLMs prevents latency coupling and allows independent tuning."
        ),
    },
)


# ─────────────────────────────────────────────
# Routing logic
# ─────────────────────────────────────────────

_WORKFLOW_MAP: dict[str, "MockWorkflow"] = {}  # populated after class definitions


def select_workflow(prompt: str, pipeline: str | None = None) -> "MockWorkflow":
    """Select the appropriate mock workflow based on prompt intent and keywords.

    Order matters — more specific intents are checked before generic ones so
    "create a jira ticket" never accidentally matches the status-lookup path.

    Args:
        prompt: User's input prompt string.
        pipeline: Optional pipeline name to force a specific workflow.

    Returns:
        The matching ``MockWorkflow`` instance.
    """
    if pipeline and pipeline in _WORKFLOW_MAP:
        return _WORKFLOW_MAP[pipeline]

    lower = prompt.lower()

    # Creation verbs — checked first to distinguish "create ticket" from "lookup ticket"
    creation_verbs = ["create", "add", "make", "build", "develop", "open", "raise",
                      "log", "submit", "file", "write", "new ticket", "new issue"]

    ticket_nouns    = ["ticket", "jira", "issue", "story", "task", "eng-", "proj-"]
    lookup_markers  = ["status", "status of", "what is", "show me", "find", "get",
                       "check", "look up", "details of"]
    refund_keywords = ["refund", "payment", "order", "charge", "stripe", "billing"]
    analysis_keywords = ["analyze", "analyse", "summarize", "summarise", "document",
                         "architecture", "security recommendation", "report"]

    has_creation_verb = any(v in lower for v in creation_verbs)
    has_ticket_noun   = any(n in lower for n in ticket_nouns)
    has_lookup_marker = any(m in lower for m in lookup_markers)

    # 1. Ticket creation — must match a creation verb + ticket noun
    if has_creation_verb and has_ticket_noun:
        return CREATE_TICKET_WORKFLOW

    # 2. Refund / payment operations
    if any(kw in lower for kw in refund_keywords):
        return REFUND_WORKFLOW

    # 3. Ticket status lookup — ticket noun present without a creation verb
    if has_ticket_noun and (has_lookup_marker or not has_creation_verb):
        return TICKET_WORKFLOW

    # 4. Complex analysis — delegate to LLM
    if any(kw in lower for kw in analysis_keywords):
        return ANALYSIS_WORKFLOW

    # 5. Default — code review workflow
    return CODING_WORKFLOW


# Populate map after all workflow instances are defined
_WORKFLOW_MAP.update({
    "coding_workflow": CODING_WORKFLOW,
    "refund_workflow": REFUND_WORKFLOW,
    "create_ticket_workflow": CREATE_TICKET_WORKFLOW,
    "analysis_workflow": ANALYSIS_WORKFLOW,
})


SERVICES_CATALOG = [
    {
        "name": "github",
        "description": "GitHub operations — PR review, issue management, code search",
        "purpose": "code_ops",
        "capabilities": ["code_review", "pr_ops", "issue_ops", "code_search"],
        "transport_type": "mcp",
        "slm_tier": "slm_coding",
        "enabled": True,
    },
    {
        "name": "jira",
        "description": "Jira operations — ticket creation, status updates, sprint management",
        "purpose": "ticket_ops",
        "capabilities": ["create_ticket", "get_ticket", "update_ticket", "search_tickets"],
        "transport_type": "mcp",
        "slm_tier": "slm",
        "enabled": True,
    },
    {
        "name": "slack",
        "description": "Slack messaging — send notifications, post to channels, create threads",
        "purpose": "notification",
        "capabilities": ["send_message", "post_channel", "create_thread"],
        "transport_type": "mcp",
        "slm_tier": "slm",
        "enabled": True,
    },
    {
        "name": "stripe",
        "description": "Stripe — payment processing, refunds, subscription management",
        "purpose": "payment_ops",
        "capabilities": ["lookup_order", "create_refund", "list_charges", "update_subscription"],
        "transport_type": "mcp",
        "slm_tier": "slm",
        "enabled": True,
    },
    {
        "name": "s3",
        "description": "AWS S3 — object storage, file upload/download, bucket management",
        "purpose": "data_ops",
        "capabilities": ["upload_file", "download_file", "list_objects", "delete_object"],
        "transport_type": "mcp",
        "slm_tier": "slm",
        "enabled": True,
    },
]
