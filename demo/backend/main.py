"""FastAPI demo backend for the SLM Workflow Platform UI.

Provides:
  GET  /health                     — backend health check
  GET  /services                   — registered service catalog
  POST /workflow/run               — start a workflow, returns run_id
  GET  /workflow/stream/{run_id}   — SSE stream of workflow events

All workflow execution is simulated using dummy_data.py. Realistic
delays are added between steps to make the animation meaningful.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncGenerator

from copy import deepcopy

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from dummy_data import SERVICES_CATALOG, select_workflow
from config_data import get_default_pipelines, get_default_models, get_default_routing

app = FastAPI(title="SLM Workflow Demo", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory run store: run_id → (prompt, pipeline_override)
_pending_runs: dict[str, tuple[str, str | None]] = {}

# In-memory mutable config — reset on server restart
_pipelines: list = get_default_pipelines()
_models: dict = get_default_models()
_routing: dict = get_default_routing()
_services: list = deepcopy(SERVICES_CATALOG)


# ─────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────

class RunRequest(BaseModel):
    """Request body for starting a workflow run."""
    prompt: str
    pipeline: str | None = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """Format a server-sent event string.

    Args:
        event: Event type name.
        data: JSON-serialisable payload dict.

    Returns:
        SSE-formatted string ready to stream.
    """
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _stream_workflow(prompt: str, pipeline: str | None = None) -> AsyncGenerator[str, None]:
    """Generate the full SSE event stream for a workflow run.

    Simulates realistic timing: routing is fast (~300ms), service
    calls vary by service (200–900ms), with natural pauses between
    steps to make the pipeline animation visible.

    Args:
        prompt: The user's input prompt.
        pipeline: Optional pipeline name override (skips auto-routing).

    Yields:
        SSE-formatted event strings.
    """
    workflow = select_workflow(prompt, pipeline)

    # Short pause before routing starts (feels natural)
    await asyncio.sleep(0.4)

    # ── Pre-filter event ──────────────────────────────────────────
    yield _sse("prefilter", workflow.prefilter)
    await asyncio.sleep(0.25)

    # ── Route decision ────────────────────────────────────────────
    yield _sse("route_decision", workflow.route_decision)
    await asyncio.sleep(0.5)

    # ── LLM Delegation (if no steps) ─────────────────────────────
    if workflow.delegated and workflow.delegation:
        yield _sse("delegation_start", {
            "reason": workflow.delegation["reason"],
        })
        # Simulate LLM thinking time
        await asyncio.sleep(2.2)
        yield _sse("delegation_complete", {
            "content": workflow.delegation["content"],
            "model": workflow.delegation["model"],
            "cost_usd": workflow.delegation["cost_usd"],
        })
        await asyncio.sleep(0.3)
        yield _sse("workflow_complete", {
            "status": "delegated",
            "total_steps": 0,
            "total_latency_ms": 2200,
            "delegated": True,
        })
        return

    # ── Step-by-step orchestration ────────────────────────────────
    total_latency = 0

    for step in workflow.steps:
        # Announce step start with request params
        yield _sse("step_start", {
            "step_index": step.step_index,
            "service": step.service,
            "capability": step.capability,
            "params": step.params,
        })

        # Simulate realistic service call latency
        sim_latency = step.latency_ms / 1000.0
        await asyncio.sleep(sim_latency)

        # Announce step completion with response + analysis
        yield _sse("step_complete", {
            "step_index": step.step_index,
            "service": step.service,
            "capability": step.capability,
            "response": step.response,
            "analysis": step.analysis,
            "latency_ms": step.latency_ms,
        })

        total_latency += step.latency_ms

        # Brief pause between steps — gives animation time to render
        await asyncio.sleep(0.35)

    # ── Workflow complete ─────────────────────────────────────────
    yield _sse("workflow_complete", {
        "status": "success",
        "total_steps": len(workflow.steps),
        "total_latency_ms": total_latency,
        "delegated": False,
    })


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    """Health check endpoint.

    Returns:
        Status dict with service count.
    """
    return {"status": "ok", "services_count": len(SERVICES_CATALOG)}


@app.get("/services")
async def get_services() -> list:
    """Return the registered services catalog.

    Returns:
        List of service metadata dicts.
    """
    return SERVICES_CATALOG


@app.post("/workflow/run")
async def start_run(body: RunRequest) -> dict:
    """Start a new workflow run and return a run_id.

    Args:
        body: Request containing the user prompt.

    Returns:
        Dict with ``run_id`` string.
    """
    run_id = str(uuid.uuid4())
    _pending_runs[run_id] = (body.prompt, body.pipeline)
    return {"run_id": run_id}


@app.get("/workflow/stream/{run_id}")
async def stream_run(run_id: str) -> StreamingResponse:
    """Stream workflow execution events via Server-Sent Events.

    Args:
        run_id: UUID returned by POST /workflow/run.

    Returns:
        StreamingResponse with ``text/event-stream`` content type.
    """
    prompt, pipeline = _pending_runs.pop(run_id, ("review pull request", None))

    return StreamingResponse(
        _stream_workflow(prompt, pipeline),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─────────────────────────────────────────────
# Config Routes — Pipelines
# ─────────────────────────────────────────────

@app.get("/config/pipelines")
async def list_pipelines() -> list:
    """Return all pipeline configurations."""
    return _pipelines


@app.get("/config/pipelines/{name}")
async def get_pipeline(name: str) -> dict:
    """Return a single pipeline configuration by name."""
    pipeline = next((p for p in _pipelines if p["name"] == name), None)
    if pipeline is None:
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' not found")
    return pipeline


@app.put("/config/pipelines/{name}")
async def update_pipeline(name: str, body: dict) -> dict:
    """Update a pipeline configuration in-memory."""
    for i, p in enumerate(_pipelines):
        if p["name"] == name:
            _pipelines[i] = {**p, **body, "name": name}
            return _pipelines[i]
    raise HTTPException(status_code=404, detail=f"Pipeline '{name}' not found")


@app.post("/config/pipelines/{name}/steps")
async def add_step(name: str, body: dict) -> dict:
    """Append a new step to a pipeline."""
    pipeline = next((p for p in _pipelines if p["name"] == name), None)
    if pipeline is None:
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' not found")
    pipeline["steps"].append(body)
    return pipeline


@app.delete("/config/pipelines/{name}/steps/{step_id}")
async def delete_step(name: str, step_id: str) -> dict:
    """Remove a step from a pipeline by step id."""
    pipeline = next((p for p in _pipelines if p["name"] == name), None)
    if pipeline is None:
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' not found")
    pipeline["steps"] = [s for s in pipeline["steps"] if s["id"] != step_id]
    return pipeline


# ─────────────────────────────────────────────
# Config Routes — Services
# ─────────────────────────────────────────────

@app.get("/config/services")
async def list_config_services() -> list:
    """Return the full services config (with auth/transport details)."""
    return _services


@app.put("/config/services/{name}")
async def update_service(name: str, body: dict) -> dict:
    """Update a service config (e.g. toggle enabled, change auth)."""
    for i, svc in enumerate(_services):
        if svc["name"] == name:
            _services[i] = {**svc, **body, "name": name}
            return _services[i]
    raise HTTPException(status_code=404, detail=f"Service '{name}' not found")


# ─────────────────────────────────────────────
# Config Routes — Models
# ─────────────────────────────────────────────

@app.get("/config/models")
async def get_models_config() -> dict:
    """Return the model tiers and provider configuration."""
    return _models


@app.put("/config/models")
async def update_models_config(body: dict) -> dict:
    """Update the model configuration in-memory."""
    global _models
    _models = {**_models, **body}
    return _models


@app.put("/config/models/tiers/{tier}")
async def update_model_tier(tier: str, body: dict) -> dict:
    """Update a single model tier configuration."""
    if tier not in _models["tiers"]:
        raise HTTPException(status_code=404, detail=f"Tier '{tier}' not found")
    _models["tiers"][tier] = {**_models["tiers"][tier], **body}
    return _models["tiers"][tier]


# ─────────────────────────────────────────────
# Config Routes — Routing Rules
# ─────────────────────────────────────────────

@app.get("/config/routing")
async def get_routing_config() -> dict:
    """Return the SLM routing rules configuration."""
    return _routing


@app.put("/config/routing")
async def update_routing_config(body: dict) -> dict:
    """Update the routing rules in-memory (deep merge)."""
    global _routing
    # Deep merge rules
    if "rules" in body:
        for key, val in body["rules"].items():
            if key in _routing["rules"] and isinstance(val, dict):
                _routing["rules"][key] = {**_routing["rules"][key], **val}
            else:
                _routing["rules"][key] = val
    return _routing


# ─────────────────────────────────────────────
# Config Routes — Reset
# ─────────────────────────────────────────────

@app.post("/config/reset")
async def reset_config() -> dict:
    """Reset all configuration to defaults."""
    global _pipelines, _models, _routing, _services
    _pipelines = get_default_pipelines()
    _models = get_default_models()
    _routing = get_default_routing()
    _services = deepcopy(SERVICES_CATALOG)
    return {"status": "ok", "message": "Configuration reset to defaults"}
