# SLM Workflow Platform

> **Production-grade AI workflow orchestration — where Small Language Models do the routing and Large Language Models do the reasoning.**

  Most AI systems treat every request the same: send it to the biggest, most expensive model available and wait. This platform takes a        
  different approach.                                                                                                                    
  A lightweight Small Language Model — running locally in under 300 ms — reads each incoming request, classifies its intent, scores its       
  complexity, and decides which pipeline to run. Simple, well-defined tasks never leave the local machine. Only genuinely complex work —
  analysis, generation, multi-step reasoning — gets escalated to a Large Language Model like Claude or GPT-4o.                                                                               
  The result is a system that is fast where speed matters, powerful where power is needed, and cost-efficient by default. A code review that  
  used to hit a $0.005/1k-token LLM now resolves through a free local model at 350 ms. A nuanced architecture analysis that needs deep
  reasoning still gets Claude Sonnet — but only when nothing smaller could do the job.                                                        
                                                            
  Workflows are described entirely in YAML. No Python, no deployments, no rebuilds — a new workflow is a new file. The platform reads it at   
  startup, validates every step against registered service manifests, and executes it as a directed acyclic graph: parallel where possible,
  conditional where needed, with automatic retries, fallback providers, and human escalation paths built in.

Pipelines are pure YAML. Infrastructure is Python. Users never write code to create a workflow.

---

## Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Architecture](#architecture)
4. [Model Strategy](#model-strategy)
5. [Demo App](#demo-app)
6. [Repository Structure](#repository-structure)
7. [Platform Modules](#platform-modules)
8. [Configuration Reference](#configuration-reference)
9. [Pipeline YAML Schema](#pipeline-yaml-schema)
10. [Step Type Reference](#step-type-reference)
11. [MCP Integrations](#mcp-integrations)
12. [Vault & Secrets](#vault--secrets)
13. [gRPC Transport](#grpc-transport)
14. [Adding a Pipeline](#adding-a-pipeline)
15. [Adding an MCP Server](#adding-an-mcp-server)
16. [Adding a Model Provider](#adding-a-model-provider)
17. [Running Locally](#running-locally)
18. [Testing](#testing)
19. [Engineering Rules](#engineering-rules)
20. [Build Order](#build-order)

---

## Overview

The SLM Workflow Platform is an AI orchestration engine that separates concerns by model size:

| Layer | Model | Latency | Role |
|-------|-------|---------|------|
| Pre-filter | SmolLM2 360M | < 10 ms | Drop malformed / out-of-domain requests before routing |
| SLM Routing | Phi-3 Mini (3.8B) | ~300 ms | Intent classification, complexity scoring, pipeline routing |
| SLM Guardrail | Gemma 2 2B | ~400 ms | Output safety checks, hallucination scoring |
| SLM Coding | Qwen2.5-Coder 3B | ~350 ms | Code-specific analysis and review tasks |
| LLM Reasoning | Claude Sonnet 4.6 | ~3–8 s | Complex reasoning, generation, analysis |

Every model tier has an API fallback (Anthropic, Groq, Together AI) so the system degrades gracefully when local inference is unavailable.

Workflows are described entirely in YAML. The platform reads them at startup, validates their steps against registered MCP server manifests, and executes them as DAGs — in sequence or parallel, with conditional branching, retries, and human escalation paths.

---

## Design Philosophy

> **Pipelines are data. Infrastructure is code. Users own YAML. The platform owns Python.**

- A new workflow = one new `.yaml` file in `configs/pipelines/`
- A new integration = one new entry in `configs/mcp_servers.yaml`
- A new secret = one new entry in Vault + a `{{ secret:path }}` reference in YAML
- A new model provider = one new file in `app/gateway/providers/`
- **No other files change** for any of the above

This separation means domain experts can build and modify workflows without touching the codebase, and the platform team can evolve infrastructure without breaking existing pipelines.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                          INPUT LAYER                           │
│    REST (FastAPI)  │  gRPC (WorkflowService)  │  Queue         │
│                        Unified Input Bus                       │
└───────────────────────────────┬────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────┐
│                        PLATFORM CORE                           │
│                                                                │
│   SmolLM2 Pre-filter (220 MB, <10 ms)                          │
│         ↓                                                      │
│   Phi-3 Mini SLM Router  →  RouteDecision                      │
│         ↓                                                      │
│   Pipeline Registry  →  DAG Engine                             │
│         ↓                                                      │
│   Executors:  ai_task │ mcp_call │ rest_call │ grpc_call       │
│         ↓                                                      │
│   Gemma 2 Guardrails  →  Policy + Hallucination Check          │
│         ↓                                                      │
│   Memory Store (Redis / in-process)                            │
│   Observability (structured JSON logs + metrics)               │
└───────────────────────────────┬────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────┐
│                    VAULT SECRET LAYER                          │
│       HashiCorp Vault │ AWS Secrets Manager │ GCP │ env        │
└───────────────────────────────┬────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────┐
│                       OUTBOUND ZONE                            │
│   MCPClient  →  GitHub │ Jira │ Slack │ Stripe │ S3            │
│   REST Executor  →  any HTTP endpoint                          │
│   gRPC Executor  →  any proto service                          │
└────────────────────────────────────────────────────────────────┘
```

**Request lifecycle:**

```
User prompt
  → SmolLM2 pre-filter           (~10 ms)   reject obvious noise
  → Phi-3 Mini SLM router        (~300 ms)  produce RouteDecision
  → Pipeline registry lookup     (<1 ms)    load matching YAML
  → DAG engine                              execute steps in order
      → MCP call / REST call / gRPC call / AI task
      → Gemma 2 guardrail check            on each LLM output
  → Memory store                           persist results 24 h
  → Stream StepEvents to caller            via SSE or gRPC stream
```

---

## Model Strategy

All model configuration lives in `configs/models.yaml` — nothing is hardcoded in Python.

### Tiers

| Tier key | Primary (local) | Fallback (API) | Used for |
|---|---|---|---|
| `slm` | `phi3:mini` via Ollama | `claude-haiku-4-5` | Routing, orchestration decisions |
| `slm_guardrail` | `gemma2:2b` via Ollama | `llama-3.1-8b-instant` via Groq | Safety + hallucination checks |
| `slm_coding` | `qwen2.5-coder:3b` via Ollama | `Qwen/Qwen2.5-7B-Instruct-Turbo` via Together | Code review, diff analysis |
| `llm` | `claude-sonnet-4-6` via Anthropic | `gpt-4o` via OpenAI | Complex reasoning, generation |

### Pre-filter

`smollm2:360m` runs at 220 MB in <10 ms to gate requests before the full routing SLM. Enable or disable it with a single flag in `configs/models.yaml`:

```yaml
pre_filter:
  enabled: true
  model: smollm2:360m
  timeout_ms: 10
```

### SLM Routing Notes

- Keep routing prompts under 200 tokens — Phi-3 Mini degrades in JSON reliability above ~300 input tokens
- Use constrained decoding (`format: json` in Ollama) for near-100% valid `RouteDecision` JSON output
- The routing SLM and guardrail SLM are separate tiers intentionally — different latency profiles, different failure modes, tuned independently
- Fallback to API is automatic and transparent — the `ModelGateway` handles retry + fallback without pipeline changes

### Cost Table (defaults)

| Model | USD / 1k tokens |
|---|---|
| `claude-sonnet-4-6` | $0.003 |
| `gpt-4o` | $0.005 |
| `claude-haiku-4-5` | $0.00025 |
| `llama-3.1-8b-instant` (Groq) | $0.0001 |
| `Qwen/Qwen2.5-7B-Instruct-Turbo` (Together) | $0.0002 |
| All local Ollama models | **Free** |

---

## Demo App

A fully functional interactive demo with a dark-themed React UI and a FastAPI backend using simulated workflow data. Run it to explore the platform's capabilities before wiring up real infrastructure.

```
demo/
├── frontend/          React 18 + Vite 5 + Tailwind CSS
└── backend/           FastAPI + simulated SSE workflow execution
```

### Quick Start

```bash
cd demo
start.bat          # starts both servers (Windows)

# or manually:
# terminal 1 — backend
cd demo/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# terminal 2 — frontend
cd demo/frontend
npm install
npm run dev        # http://localhost:5173
```

### What the Demo Shows

**Workflow Page** — Enter a prompt or click a quick-start button. Watch the pipeline execute step-by-step with realistic timing. Click any step to inspect its full request/response payload.

**Configure Page** — Four-tab config editor: Pipelines · Services · Models · Routing Rules. All edits persist in-memory for the session.

**Live Config Drawer** — Click **Configure** in the Pipeline Flow header to open a slide-in panel _without leaving the workflow view_. Edit steps, model tiers, and routing thresholds, then run the next workflow immediately with the updated config.

**Pipeline Selector** — In the prompt area, choose **Auto-route** (SLM decides) or force a specific pipeline: Code Review · Refund · Create Ticket · Analysis.

### Demo Pipelines

| Pipeline | Steps | Services |
|---|---|---|
| `coding_workflow` | review_code → create_ticket → notify_team | GitHub, Jira, Slack |
| `refund_workflow` | lookup_order → process_refund → notify_payments | Stripe, Slack |
| `create_ticket_workflow` | create_jira_ticket → notify_engineering | Jira, Slack |
| `analysis_workflow` | analyse_document (LLM delegation) | — |

### Demo API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Backend health check |
| `GET` | `/services` | Registered service catalog |
| `POST` | `/workflow/run` | Start a run, returns `run_id` |
| `GET` | `/workflow/stream/{run_id}` | SSE stream of step events |
| `GET` | `/config/pipelines` | List all pipeline configs |
| `PUT` | `/config/pipelines/{name}` | Update pipeline metadata |
| `POST` | `/config/pipelines/{name}/steps` | Add step to pipeline |
| `DELETE` | `/config/pipelines/{name}/steps/{step_id}` | Remove a step |
| `GET` | `/config/services` | List MCP service configs |
| `PUT` | `/config/services/{name}` | Toggle service / update auth |
| `GET` | `/config/models` | Get model tier config |
| `PUT` | `/config/models/tiers/{tier}` | Update a model tier |
| `GET` | `/config/routing` | Get routing rules |
| `PUT` | `/config/routing` | Update routing rules |
| `POST` | `/config/reset` | Reset all config to defaults |

---

## Repository Structure

```
.
├── configs/                          # USER-OWNED — edit these, not Python
│   ├── pipelines/                    # one .yaml per workflow
│   │   ├── coding_workflow.yaml
│   │   ├── customer_support.yaml
│   │   ├── refund.yaml
│   │   └── document_processing.yaml
│   ├── services/                     # service descriptors
│   │   ├── github.yaml
│   │   ├── jira.yaml
│   │   └── slack.yaml
│   ├── mcp_servers.yaml              # MCP server registry (URLs + auth)
│   ├── models.yaml                   # model tiers, providers, costs
│   ├── routing_rules.yaml            # SLM routing thresholds
│   └── vault.yaml                    # Vault backend selection
│
├── proto/
│   └── workflow.proto                # canonical protobuf contract
│
├── app/
│   ├── main.py                       # FastAPI + gRPC server startup
│   ├── config.py                     # loads all YAML at startup
│   ├── core/
│   │   ├── interfaces.py             # ALL abstract base classes
│   │   ├── exceptions.py             # domain exceptions
│   │   └── context.py                # WorkflowContext dataclass
│   ├── vault/                        # secret providers + resolver
│   ├── loader/                       # pipeline loader + schema validator
│   ├── transport/                    # REST + gRPC inbound + unified bus
│   ├── routing/                      # SLM router + providers
│   ├── gateway/                      # model gateway + providers + cost tracker
│   ├── mcp/                          # MCP client, registry, session, auth
│   ├── workflow/                     # DAG engine + all executors
│   ├── orchestrator/                 # SLM brain, delegation, step planning
│   ├── registry/                     # service registry + descriptors
│   ├── guardrails/                   # validator, hallucination, policy
│   ├── memory/                       # Redis + in-memory stores
│   ├── observability/                # structured logger + metrics
│   └── api/routes/                   # FastAPI route handlers
│
├── tests/
│   ├── unit/                         # pytest, no external deps required
│   └── integration/                  # requires Docker infra running
│
├── demo/                             # interactive demo (see Demo App section)
├── scripts/
│   ├── generate_proto.sh             # regenerate pb2 files from workflow.proto
│   └── seed_vault.sh                 # seed local Vault dev server
├── docker-compose.yml                # Vault dev + Redis + PostgreSQL
├── Dockerfile
├── requirements.txt
└── CLAUDE.md                         # AI assistant ground truth for this repo
```

---

## Platform Modules

### `app/core/` — Interfaces & Context

All cross-module communication passes through interfaces defined here. **Never import a concrete class across module boundaries** — always depend on an ABC from this package.

```python
class SecretProvider(ABC):
    def get(self, path: str) -> str: ...

class ModelProvider(ABC):
    def complete(self, prompt: str, **kwargs) -> ModelResponse: ...

class SLMProvider(ABC):
    def route(self, input_text: str) -> RouteDecision: ...

class StepExecutor(ABC):
    async def execute(self, step: WorkflowStep, context: WorkflowContext) -> StepResult: ...

class MCPAdapter(ABC):
    async def invoke(self, tool: str, params: dict) -> dict: ...

class MemoryStore(ABC):
    async def get(self, key: str) -> Any: ...
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...
```

`WorkflowContext` is the single object threaded through every step. It accumulates outputs keyed by `output_key`, carries the resolved secret provider, and tracks cost.

### `app/routing/` — SLM Router

Converts a free-text prompt into a `RouteDecision`:

```python
@dataclass
class RouteDecision:
    intent: str
    task: str
    complexity: Literal["low", "medium", "high"]
    priority: Literal["low", "medium", "high"]
    confidence: float          # 0.0 – 1.0
    route: str                 # pipeline name | "slm" | "llm"
```

Routing logic (configured via `routing_rules.yaml`, not hardcoded):

```
IF complexity == "low" AND confidence > min_confidence
  → SLM pipeline
ELIF priority == "high" AND high_priority_always_llm
  → LLM tier
ELSE
  → LLM tier
```

Providers: `LocalSLMProvider` (Ollama), `AnthropicSLMProvider`, `GroqSLMProvider`, `TogetherSLMProvider`.

### `app/orchestrator/` — SLM Brain

The main execution loop. Coordinates intent detection, step planning, delegation decisions, and response analysis. Built on top of the routing layer.

### `app/gateway/` — Model Gateway

Single call-site for all model completions. Handles:
- Tier-based model selection from `configs/models.yaml`
- Primary → fallback provider switching on failure
- Exponential backoff with jitter
- Cost tracking per request

### `app/mcp/` — MCP Integration

```python
class MCPClient:
    async def invoke(self, server: str, tool: str, params: dict, context: WorkflowContext) -> dict
```

On startup, connects to each server in `mcp_servers.yaml`, fetches the tool manifest, and validates all `mcp_call` steps in loaded pipelines against it — fail fast at boot, not at runtime.

### `app/workflow/` — DAG Engine + Executors

Executes a pipeline as a directed acyclic graph:

| Executor | Step type | Behaviour |
|---|---|---|
| `AIExecutor` | `ai_task` | Calls Model Gateway, runs Guardrails on output |
| `MCPExecutor` | `mcp_call` | Calls MCPClient, maps response to `output_key` |
| `RESTExecutor` | `rest_call` | Outbound HTTP, resolves secrets in headers/body, exponential backoff |
| `GRPCExecutor` | `grpc_call` | Outbound gRPC, manages channel pool |
| `LogicExecutor` | `logic` | Calls a named Python function from a registry |

Parallel steps use `asyncio.gather`. Conditions are evaluated as Python expressions against `WorkflowContext`.

### `app/vault/` — Secret Resolution

All `{{ secret:X }}` tokens in YAML are replaced with live values at startup. Secrets are never written to disk, logs, or environment variables.

```
{{ secret:github/token }}      → Vault path secret/github/token
{{ secret:anthropic/api_key }} → Vault path secret/anthropic/api_key
{{ env:VAULT_ADDR }}           → process environment (vault.yaml only)
```

Backend options: `hashicorp` · `aws` · `gcp` · `env` (local dev)

---

## Configuration Reference

### `configs/vault.yaml`

```yaml
provider: hashicorp   # hashicorp | aws | gcp | env

hashicorp:
  address: "{{ env:VAULT_ADDR }}"
  token_env: VAULT_TOKEN
  mount_path: secret
  kv_version: 2
```

Set `provider: env` for local development — secrets resolve from environment variables.

### `configs/models.yaml`

```yaml
tiers:
  slm:
    primary:  { provider: local,     model: phi3:mini,         timeout_ms: 300 }
    fallback: { provider: anthropic, model: claude-haiku-4-5              }
  slm_guardrail:
    primary:  { provider: local,     model: gemma2:2b,          timeout_ms: 400 }
    fallback: { provider: groq,      model: llama-3.1-8b-instant           }
  slm_coding:
    primary:  { provider: local,     model: qwen2.5-coder:3b,   timeout_ms: 350 }
    fallback: { provider: together,  model: Qwen/Qwen2.5-7B-Instruct-Turbo }
  llm:
    primary:  { provider: anthropic, model: claude-sonnet-4-6              }
    fallback: { provider: openai,    model: gpt-4o                         }

pre_filter:
  enabled: true
  model: smollm2:360m
  timeout_ms: 10

providers:
  anthropic: { api_key: "{{ secret:anthropic/api_key }}" }
  openai:    { api_key: "{{ secret:openai/api_key }}" }
  groq:      { api_key: "{{ secret:groq/api_key }}" }
  together:  { api_key: "{{ secret:together/api_key }}" }
  local:     { base_url: http://localhost:11434, format: json }
```

### `configs/routing_rules.yaml`

```yaml
rules:
  slm_threshold:
    max_complexity: low        # route to SLM only if complexity ≤ this
    min_confidence: 0.80       # require at least this confidence score
  escalation:
    on_guardrail_fail: retry_with_llm
    max_retries: 2
    on_max_retries_exceeded: escalate_human
  priority_override:
    high_priority_always_llm: true
```

### `configs/mcp_servers.yaml`

```yaml
servers:
  - name: github
    url: https://mcp.github.com/sse
    auth: { type: bearer, token: "{{ secret:github/token }}" }

  - name: jira
    url: https://mcp.atlassian.com/sse
    auth: { type: oauth2, token: "{{ secret:jira/oauth_token }}" }

  - name: slack
    url: https://mcp.slack.com/mcp
    auth: { type: bearer, token: "{{ secret:slack/bot_token }}" }

  - name: stripe
    url: https://mcp.stripe.com/sse
    auth: { type: api_key, key: "{{ secret:stripe/secret_key }}" }

  - name: s3
    url: https://mcp.aws.amazon.com/s3
    auth:
      type: aws_sigv4
      access_key: "{{ secret:aws/access_key_id }}"
      secret_key: "{{ secret:aws/secret_access_key }}"
```

---

## Pipeline YAML Schema

```yaml
name: my_workflow              # unique identifier
description: "What this does"
version: "1.0"
tags: [code, github]

trigger:
  type: rest | grpc | webhook | queue

steps:
  - id: step_name              # unique within pipeline
    type: ai_task | mcp_call | rest_call | grpc_call | logic | condition
    depends_on: [other_step]   # empty = start immediately
    parallel: false            # true = run concurrently with siblings
    condition: "{{ intent.complexity }} == 'high'"
    output_key: result_var     # written to WorkflowContext.outputs
    timeout_seconds: 30
    retry:
      max_attempts: 3
      backoff_seconds: 2
    on_error: skip | fail | retry | escalate_human

on_error:
  strategy: retry | fail | escalate_human
  max_attempts: 2
  fallback: fallback_step_id
```

### Template Variables

All string values in step config are rendered against `WorkflowContext` before execution:

```
{{ input.pr_number }}       → context.input["pr_number"]
{{ review_comments }}       → context.outputs["review_comments"]
{{ context.request_id }}    → context.request_id
{{ secret:deploy/token }}   → resolved by Vault at config load time
```

---

## Step Type Reference

### `ai_task` — LLM/SLM call

```yaml
- id: summarise
  type: ai_task
  model_tier: slm | llm
  prompt: "Summarise this PR: {{ input.diff }}"
  system_prompt: "You are a concise technical writer."
  output_key: summary
  max_tokens: 500
```

### `mcp_call` — MCP server tool

```yaml
- id: create_ticket
  type: mcp_call
  server: jira                       # matches name in mcp_servers.yaml
  tool: create_issue                 # must exist in server's tool manifest
  params:
    project: ENG
    summary: "{{ review_comments }}"
    priority: "{{ intent.priority }}"
  output_key: jira_issue
```

### `rest_call` — HTTP endpoint

```yaml
- id: call_internal_api
  type: rest_call
  url: "https://api.internal.com/v1/deploy"
  method: POST
  headers:
    Authorization: "Bearer {{ secret:deploy/token }}"
    X-Request-ID: "{{ context.request_id }}"
  body:
    repo: "{{ input.repo }}"
    sha:  "{{ input.sha }}"
  output_key: deploy_result
  timeout_seconds: 30
  retry: { max_attempts: 3, backoff_seconds: 2 }
```

### `grpc_call` — gRPC service

```yaml
- id: trigger_build
  type: grpc_call
  address: "build.internal:50051"
  proto: build.proto
  service: BuildService
  method: TriggerBuild
  params:
    repo: "{{ input.repo }}"
    sha:  "{{ input.sha }}"
  output_key: build_result
  tls: true
```

### `logic` — Python function

```yaml
- id: normalise_diff
  type: logic
  function: transform.normalise_pr_diff  # dotted path to Python function
  params:
    diff: "{{ input.diff }}"
  output_key: normalised_diff
```

### `condition` — Branch control

```yaml
- id: check_complexity
  type: condition
  expression: "{{ intent.complexity }} in ['medium', 'high']"
  on_true: review_code
  on_false: skip_to_notify
```

---

## MCP Integrations

| Service | Purpose | Key capabilities |
|---|---|---|
| **GitHub** | Code operations | `code_review`, `pr_ops`, `issue_ops`, `code_search` |
| **Jira** | Ticket management | `create_ticket`, `get_ticket`, `update_ticket`, `search_tickets` |
| **Slack** | Notifications | `send_message`, `post_channel`, `create_thread` |
| **Stripe** | Payment operations | `lookup_order`, `create_refund`, `list_charges` |
| **AWS S3** | Object storage | `upload_file`, `download_file`, `list_objects` |

Each MCP server authenticates via a secret reference resolved at runtime from Vault. Tokens never appear in code or plain environment variables in production.

---

## Vault & Secrets

### Local Development

Set `provider: env` in `configs/vault.yaml`. All `{{ secret:X }}` tokens map to environment variables:

```
{{ secret:github/token }}      →  os.getenv("GITHUB_TOKEN")
{{ secret:anthropic/api_key }} →  os.getenv("ANTHROPIC_API_KEY")
{{ secret:slack/bot_token }}   →  os.getenv("SLACK_BOT_TOKEN")
```

Copy `.env.example` to `.env` and fill in your keys.

### Production (HashiCorp Vault)

```bash
vault kv put secret/github         token="ghp_xxxx"
vault kv put secret/jira           oauth_token="xxxx"
vault kv put secret/slack          bot_token="xoxb-xxxx"
vault kv put secret/stripe         secret_key="sk_live_xxxx"
vault kv put secret/anthropic      api_key="sk-ant-xxxx"
vault kv put secret/openai         api_key="sk-xxxx"
```

Switch `provider: env` → `provider: hashicorp` in `configs/vault.yaml`. No code changes.

### Rules

- `os.getenv()` is only permitted in `app/vault/env_fallback.py`
- Secret values are never written to logs — the resolver redacts `{{ secret:X }}` in all log output
- Secrets are never written to disk

---

## gRPC Transport

The platform exposes a gRPC service alongside the REST API, listening on port `50051` by default.

### Proto Contract (`proto/workflow.proto`)

```protobuf
service WorkflowService {
  rpc Process (WorkflowRequest) returns (WorkflowResponse);
  rpc ProcessStream (WorkflowRequest) returns (stream StepEvent);
  rpc GetStatus (StatusRequest) returns (StatusResponse);
}

message WorkflowRequest {
  string pipeline    = 1;
  string input_json  = 2;
  string request_id  = 3;
  map<string, string> meta = 4;
}
```

### Regenerating Stubs

```bash
bash scripts/generate_proto.sh
```

**Never hand-edit** `workflow_pb2.py` or `workflow_pb2_grpc.py`. Always regenerate from `workflow.proto`.

### Field Number Rules

Field numbers in protobuf are permanent. Once published:
- Never reuse a field number
- Add new fields as optional with new numbers
- Commit generated `*_pb2.py` files — do not gitignore them

### Test gRPC

```bash
grpcurl -plaintext -d '{
  "pipeline": "coding_workflow",
  "input_json": "{\"pr_number\": 42}",
  "request_id": "test-001"
}' localhost:50051 workflow.WorkflowService/Process
```

---

## Adding a Pipeline

1. Create `configs/pipelines/my_pipeline.yaml` — see [Pipeline YAML Schema](#pipeline-yaml-schema)
2. Ensure all referenced MCP servers exist in `mcp_servers.yaml`
3. Ensure all `{{ secret:X }}` references are in Vault
4. Restart the platform (or `POST /pipelines/reload` if live reload is enabled)
5. Verify: `GET /pipelines/my_pipeline`
6. Test: `POST /process` with `"pipeline": "my_pipeline"`

**No Python changes required.**

---

## Adding an MCP Server

1. Add an entry to `configs/mcp_servers.yaml`:
   ```yaml
   - name: linear
     url: https://mcp.linear.app/sse
     auth: { type: bearer, token: "{{ secret:linear/token }}" }
   ```
2. Add the secret to Vault:
   ```bash
   vault kv put secret/linear token="lin_api_xxxx"
   ```
3. Restart the platform
4. Verify tools are discovered: `GET /mcp/servers/linear/tools`
5. Use `server: linear` in any pipeline step

**No Python changes required.**

---

## Adding a Model Provider

1. Create `app/gateway/providers/myprovider.py`:
   ```python
   class MyProvider(ModelProvider):
       """ModelProvider implementation for MyService."""

       def complete(self, prompt: str, **kwargs) -> ModelResponse:
           ...
   ```
2. Register it in the provider factory in `app/gateway/model_gateway.py`
3. Add to `configs/models.yaml`:
   ```yaml
   providers:
     myprovider:
       api_key: "{{ secret:myprovider/api_key }}"
   ```
4. Add the secret to Vault
5. Reference `provider: myprovider` in any model tier

---

## Running Locally

### Prerequisites

- Python 3.11+
- Docker + Docker Compose
- [Ollama](https://ollama.ai) (for local SLM inference)
- `grpcio-tools` (`pip install grpcio-tools`)

### Platform

```bash
# 1. Clone and install
git clone <repo>
cd ai-workflow-platform
pip install -r requirements.txt

# 2. Start infrastructure (Vault dev, Redis, PostgreSQL)
docker-compose up -d

# 3. Pull local models (takes a few minutes on first run)
ollama pull smollm2:360m
ollama pull phi3:mini
ollama pull gemma2:2b
ollama pull qwen2.5-coder:3b

# 4. Configure secrets
cp .env.example .env
# edit .env with your API keys
# OR seed the Vault dev server:
bash scripts/seed_vault.sh

# 5. Generate gRPC stubs
bash scripts/generate_proto.sh

# 6. Start
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# gRPC starts automatically on port 50051
```

### Test REST

```bash
curl -X POST http://localhost:8000/process \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline": "coding_workflow",
    "input": {
      "pr_number": 42,
      "repo": "org/repo",
      "sha": "abc123",
      "pr_description": "Add OAuth2 rate limiting"
    }
  }'
```

### Environment Variables

```bash
# Server
HOST=0.0.0.0
PORT=8000
GRPC_PORT=50051
ENV=development          # development | staging | production

# Vault
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=dev-root-token

# Storage
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/workflows
REDIS_URL=redis://localhost:6379/0
MEMORY_BACKEND=redis     # redis | memory

# Local dev secrets (when vault.yaml provider: env)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GITHUB_TOKEN=ghp_xxx
SLACK_BOT_TOKEN=xoxb-xxx
STRIPE_SECRET_KEY=sk_live_xxx
JIRA_TOKEN=xxx

# Observability
LOG_LEVEL=INFO
LOG_FORMAT=json          # json | text
```

### Docker Compose Services

| Service | Port | Purpose |
|---|---|---|
| `postgres` | 5432 | Workflow state persistence |
| `redis` | 6379 | Memory store + pub/sub queue |
| `vault` | 8200 | HashiCorp Vault dev server |

---

## Testing

### Unit Tests

No infrastructure required. All external calls are mocked at the interface boundary.

```bash
pytest tests/unit/ -v
```

### Integration Tests

Require `docker-compose up -d`. Uses real Vault dev server and Redis.

```bash
pytest tests/integration/ -v
```

### Key Test Files

| File | What it covers |
|---|---|
| `test_vault_resolver.py` | `{{ secret:X }}` token resolution; missing secrets raise correctly |
| `test_slm_router.py` | Routing decisions at threshold boundaries; confidence edge cases |
| `test_model_gateway.py` | Primary/fallback switching; cost accumulation; retry logic |
| `test_workflow_engine.py` | DAG execution order; parallel steps; condition evaluation; on_error paths |
| `test_guardrails.py` | Hallucination scores trigger retry; policy violations escalate |
| `test_grpc_servicer.py` | `Process` and `ProcessStream` RPCs return correct proto messages |
| `test_rest_executor.py` | Outbound HTTP; header injection; exponential backoff |
| `test_grpc_end_to_end.py` | Full pipeline from gRPC request to streamed `StepEvent` response |

### Mocking Pattern

```python
# Mock at the interface boundary — never at the implementation
@pytest.fixture
def mock_secret_provider():
    provider = Mock(spec=SecretProvider)
    provider.get.side_effect = lambda path: f"test-secret-for-{path}"
    return provider

@pytest.fixture
def mock_model_gateway():
    gateway = Mock(spec=ModelGateway)
    gateway.complete.return_value = ModelResponse(
        content="Mocked response", model="test", input_tokens=10,
        output_tokens=20, cost_usd=0.0, latency_ms=50,
    )
    return gateway
```

---

## Engineering Rules

These are enforced for all files in `app/`.

### Code Quality

- All functions and classes **must have docstrings**
- All function signatures **must have type hints**
- No `Any` types except in `WorkflowContext.outputs` and `StepResult.output` (intentionally dynamic)
- Maximum function length: **50 lines**
- Maximum file length: **300 lines**

### Dependencies

- Cross-module imports go through `app/core/interfaces.py` — never import concrete classes across module boundaries
- `vault/` must not import from `workflow/`, `mcp/`, `gateway/`, or `routing/`
- `core/` must not import from any other app module
- Circular imports are a hard failure

### Secrets

- `os.getenv()` is only permitted in `app/vault/env_fallback.py`
- Secret values are never logged
- Credentials are never hardcoded

### Configuration

- Model names, pipeline names, thresholds, provider URLs — all in YAML, never hardcoded in Python
- Python reads config values; it never defines them

### Error Handling

- Every executor's `execute()` must catch its own errors and return `StepResult(status="failed")` — never raise to the engine
- All external calls (HTTP, gRPC, MCP) must have timeouts (default 30 s)
- All retries use exponential backoff with jitter

---

## Build Order

Modules are implemented in dependency order. Each is fully testable before the next begins.

| # | Module | Status | Depends on |
|---|---|---|---|
| 1 | `core/` — interfaces, exceptions, context | ⏳ In progress | — |
| 2 | `vault/` — all providers + resolver | ⏳ Pending | `core/` |
| 3 | `loader/` — pipeline loader, schema validator, step resolver | ⏳ Pending | `core/`, `vault/` |
| 4 | `transport/` — REST + gRPC + unified bus | ⏳ Pending | `core/`, `loader/` |
| 5 | `routing/` — SLM router + providers | ✅ Done | `core/`, `vault/` |
| 6 | `gateway/` — model gateway + providers + cost tracker | ⏳ Pending | `core/`, `vault/` |
| 7 | `mcp/` — client, registry, session, auth, tool discovery | ⏳ Pending | `core/`, `vault/` |
| 8 | `workflow/` — DAG engine + all executors | ⏳ Pending | all above |
| 9 | `guardrails/` — validator, hallucination, policy | ⏳ Pending | `gateway/`, `routing/` |
| 10 | `memory/` — Redis + in-memory stores | ⏳ Pending | `core/` |
| 11 | `observability/` — structured logger + metrics | ⏳ Pending | `core/` |
| 12 | `api/routes/` — all REST endpoints | ⏳ Pending | all above |
| 13 | `tests/` — unit then integration | ⏳ Pending | all above |

> The `orchestrator/` and `registry/` modules are already implemented and sit alongside the routing layer. They will be fully integrated once `core/interfaces.py` is in place.

---

## Observability

Every log entry is structured JSON:

```json
{
  "timestamp": "2026-04-14T10:23:41Z",
  "level": "INFO",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline": "coding_workflow",
  "step_id": "review_code",
  "event": "step_completed",
  "latency_ms": 842,
  "cost_usd": 0.0031,
  "model": "qwen2.5-coder:3b"
}
```

`GET /metrics` exposes in-process aggregations:
- Request counts, success rate, error rate
- Latency p50 / p95 / p99 per pipeline
- Cost per pipeline · per model · per day
- MCP call counts and latency per server
- Guardrail failure rates

---

## License

See [LICENSE](LICENSE).
