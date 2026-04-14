# CLAUDE.md — AI Workflow Orchestration Platform

> This file is the single source of truth for Claude Code when working on this codebase.
> Read it fully before writing, editing, or deleting any file.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Summary](#2-architecture-summary)
3. [Repository Structure](#3-repository-structure)
4. [Configuration Files (User-Owned)](#4-configuration-files-user-owned)
5. [Platform Core Modules](#5-platform-core-modules)
6. [gRPC Transport](#6-grpc-transport)
7. [REST Transport](#7-rest-transport)
8. [Vault Secret Resolution](#8-vault-secret-resolution)
9. [MCP Integration Layer](#9-mcp-integration-layer)
10. [Workflow Engine & Executors](#10-workflow-engine--executors)
11. [SLM Routing Layer](#11-slm-routing-layer)
12. [Model Gateway](#12-model-gateway)
13. [Guardrails](#13-guardrails)
14. [Memory & Storage](#14-memory--storage)
15. [Observability](#15-observability)
16. [API Layer](#16-api-layer)
17. [Pipeline YAML Schema](#17-pipeline-yaml-schema)
18. [Step Type Reference](#18-step-type-reference)
19. [Protobuf Contract](#19-protobuf-contract)
20. [Environment Variables](#20-environment-variables)
21. [Running Locally](#21-running-locally)
22. [Testing Strategy](#22-testing-strategy)
23. [Adding a New Pipeline](#23-adding-a-new-pipeline)
24. [Adding a New MCP Server](#24-adding-a-new-mcp-server)
25. [Adding a New Model Provider](#25-adding-a-new-model-provider)
26. [Engineering Rules](#26-engineering-rules)
27. [Build Order](#27-build-order)

---

## 1. Project Overview

This is a **production-grade AI workflow orchestration platform** where:

- **Small Language Models (SLMs)** handle intent detection, routing, classification, and guardrails.
- **Large Language Models (LLMs)** handle complex reasoning, generation, and analysis.
- **Pipelines are pure YAML** — users never write Python to create a new workflow.
- **MCP servers** provide plug-and-play third-party integrations (GitHub, Jira, Slack, Stripe, etc.).
- **Vault** resolves all secrets at runtime — no credentials ever live in code or plain env vars in production.
- **gRPC and REST** are both first-class inbound and outbound transports.

### Design Philosophy

> Pipelines are data. Infrastructure is code. Users own YAML. The platform owns Python.

- A new pipeline = one new `.yaml` file in `configs/pipelines/`.
- A new integration = one new entry in `configs/mcp_servers.yaml`.
- A new secret = one new entry in Vault + a `{{ secret:path }}` reference in YAML.
- A new model provider = one new file in `app/gateway/providers/`.
- **No other files change** for any of the above.

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                          │
│   REST (FastAPI)  │  gRPC (WorkflowService)  │  Queue       │
│                   Unified Input Bus                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                     PLATFORM CORE                           │
│  Config Loader → SLM Router → Model Gateway                 │
│  Workflow Engine (DAG)                                      │
│  Executors: ai_task | mcp_call | rest_call | grpc_call      │
│  Guardrails → Memory → Observability                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   VAULT SECRET PROVIDER                     │
│   HashiCorp Vault | AWS Secrets Manager | GCP | env         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    OUTBOUND ZONE                            │
│  MCPClient (GitHub, Jira, Slack, Stripe, ...)               │
│  REST executor (any HTTP endpoint)                          │
│  gRPC executor (any proto service)                          │
└─────────────────────────────────────────────────────────────┘
```

**Cross-cutting concern:** Vault runs as a vertical layer — every component that needs a secret calls `SecretProvider.get(path)`, never `os.getenv()` directly (except `env_fallback.py`).

---

## 3. Repository Structure

```
ai-workflow-platform/
│
├── configs/                          # USER-OWNED — only place users edit
│   ├── pipelines/                    # one .yaml per workflow
│   │   ├── coding_workflow.yaml
│   │   ├── customer_support.yaml
│   │   ├── refund.yaml
│   │   └── document_processing.yaml
│   ├── mcp_servers.yaml              # MCP server registry
│   ├── models.yaml                   # model providers, tiers, costs
│   ├── routing_rules.yaml            # SLM routing thresholds
│   └── vault.yaml                    # Vault provider selection + config
│
├── proto/
│   └── workflow.proto                # source-of-truth protobuf definition
│
├── app/
│   ├── main.py                       # FastAPI + gRPC server startup
│   ├── config.py                     # loads all YAML configs at startup
│   │
│   ├── core/
│   │   ├── interfaces.py             # ALL abstract base classes
│   │   ├── exceptions.py             # domain exceptions
│   │   └── context.py                # WorkflowContext dataclass
│   │
│   ├── vault/
│   │   ├── provider.py               # SecretProvider ABC
│   │   ├── hashicorp.py
│   │   ├── aws_secrets.py
│   │   ├── gcp_secrets.py
│   │   ├── env_fallback.py
│   │   └── resolver.py               # resolves {{ secret:X }} in YAML strings
│   │
│   ├── transport/
│   │   ├── unified_bus.py            # normalises all input → WorkflowRequest
│   │   ├── rest/
│   │   │   ├── router.py
│   │   │   └── webhook_handler.py
│   │   └── grpc/
│   │       ├── server.py
│   │       ├── servicer.py
│   │       └── proto/
│   │           ├── workflow.proto    # copy of /proto/workflow.proto
│   │           ├── workflow_pb2.py   # generated — DO NOT EDIT
│   │           └── workflow_pb2_grpc.py  # generated — DO NOT EDIT
│   │
│   ├── loader/
│   │   ├── pipeline_loader.py        # reads configs/pipelines/*.yaml
│   │   ├── schema_validator.py       # validates pipeline schema at startup
│   │   └── step_resolver.py          # maps step type string → executor class
│   │
│   ├── routing/
│   │   ├── slm_router.py
│   │   ├── router_schema.py          # RouteDecision pydantic model
│   │   └── providers/
│   │       ├── base.py               # SLMProvider ABC
│   │       ├── local_slm.py
│   │       └── api_slm.py
│   │
│   ├── gateway/
│   │   ├── model_gateway.py
│   │   ├── cost_tracker.py
│   │   └── providers/
│   │       ├── base.py               # ModelProvider ABC
│   │       ├── anthropic_provider.py
│   │       ├── openai_provider.py
│   │       └── local_provider.py
│   │
│   ├── workflow/
│   │   ├── engine.py                 # DAG executor
│   │   ├── step.py                   # WorkflowStep + StepResult models
│   │   ├── registry.py               # pipeline registry
│   │   └── executor/
│   │       ├── base.py               # StepExecutor ABC
│   │       ├── ai_executor.py
│   │       ├── mcp_executor.py
│   │       ├── rest_executor.py
│   │       ├── grpc_executor.py
│   │       └── logic_executor.py
│   │
│   ├── mcp/
│   │   ├── client.py                 # MCPClient.invoke(server, tool, params)
│   │   ├── registry.py               # loads mcp_servers.yaml
│   │   ├── session.py                # connection pool
│   │   ├── tool_discovery.py         # fetches tool manifest per server
│   │   └── auth.py                   # all tokens fetched via Vault
│   │
│   ├── guardrails/
│   │   ├── validator.py
│   │   ├── hallucination.py
│   │   └── policy.py
│   │
│   ├── memory/
│   │   ├── store.py                  # MemoryStore ABC
│   │   ├── redis_store.py
│   │   └── in_memory_store.py
│   │
│   ├── observability/
│   │   ├── logger.py                 # structured per-step logging
│   │   └── metrics.py                # latency + cost aggregation
│   │
│   └── api/
│       └── routes/
│           ├── process.py            # POST /process
│           ├── status.py             # GET /status/{id}
│           ├── metrics.py            # GET /metrics
│           ├── pipelines.py          # GET /pipelines
│           └── mcp.py                # GET /mcp/servers, GET /mcp/tools
│
├── tests/
│   ├── unit/
│   │   ├── test_vault_resolver.py
│   │   ├── test_grpc_servicer.py
│   │   ├── test_rest_executor.py
│   │   ├── test_slm_router.py
│   │   ├── test_model_gateway.py
│   │   ├── test_workflow_engine.py
│   │   └── test_guardrails.py
│   └── integration/
│       ├── test_grpc_end_to_end.py
│       ├── test_mcp_pipeline_steps.py
│       └── test_api_endpoints.py
│
├── scripts/
│   ├── generate_proto.sh             # runs protoc to regenerate pb2 files
│   └── seed_vault.sh                 # seeds local Vault dev server with test secrets
│
├── docker-compose.yml                # includes Vault dev, Redis, Postgres
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

---

## 4. Configuration Files (User-Owned)

### `configs/vault.yaml`

Declares which secret backend to use. Platform reads this first, before any other config.

```yaml
provider: hashicorp   # hashicorp | aws | gcp | env

hashicorp:
  address: "{{ env:VAULT_ADDR }}"
  token_env: VAULT_TOKEN
  mount_path: secret
  kv_version: 2

aws:
  region: us-east-1
  # uses ambient IAM role — no token in config

gcp:
  project_id: my-gcp-project

# provider: env → reads from .env / process environment (local dev only)
```

### `configs/mcp_servers.yaml`

Each entry is a plug-and-play MCP server. Add an entry here; the platform connects and discovers tools automatically at startup. No Python changes needed.

```yaml
servers:
  - name: github
    url: https://mcp.github.com/sse
    auth:
      type: bearer
      token: "{{ secret:github/token }}"

  - name: jira
    url: https://mcp.atlassian.com/sse
    auth:
      type: oauth2
      token: "{{ secret:jira/oauth_token }}"

  - name: slack
    url: https://mcp.slack.com/mcp
    auth:
      type: bearer
      token: "{{ secret:slack/bot_token }}"

  - name: stripe
    url: https://mcp.stripe.com/sse
    auth:
      type: api_key
      key: "{{ secret:stripe/secret_key }}"

  - name: s3
    url: https://mcp.aws.amazon.com/s3
    auth:
      type: aws_sigv4
      access_key: "{{ secret:aws/access_key_id }}"
      secret_key: "{{ secret:aws/secret_access_key }}"
```

### `configs/models.yaml`

Controls which model handles what. Pipelines reference `slm` or `llm` tier — this file decides what that means.

```yaml
tiers:
  slm:
    primary:
      provider: local
      model: phi-3-mini
    fallback:
      provider: anthropic
      model: claude-haiku-4-5
  llm:
    primary:
      provider: anthropic
      model: claude-sonnet-4-6
    fallback:
      provider: openai
      model: gpt-4o

providers:
  anthropic:
    api_key: "{{ secret:anthropic/api_key }}"
  openai:
    api_key: "{{ secret:openai/api_key }}"
  local:
    base_url: http://localhost:11434   # Ollama

cost_per_1k_tokens:
  claude-sonnet-4-6: 0.003
  claude-haiku-4-5: 0.00025
  gpt-4o: 0.005
  phi-3-mini: 0.0
```

### `configs/routing_rules.yaml`

Tune routing behaviour without touching code.

```yaml
rules:
  slm_threshold:
    max_complexity: low          # low | medium | high
    min_confidence: 0.80         # float 0.0–1.0
  escalation:
    on_guardrail_fail: retry_with_llm
    max_retries: 2
    on_max_retries_exceeded: escalate_human
  priority_override:
    high_priority_always_llm: true
```

---

## 5. Platform Core Modules

### `app/core/interfaces.py`

Every concrete implementation depends only on these ABCs. This file is the seam that makes the system pluggable. **Never import concrete classes directly across module boundaries — always depend on an interface.**

Key ABCs to implement:

```python
class SecretProvider(ABC):
    @abstractmethod
    def get(self, path: str) -> str: ...

class ModelProvider(ABC):
    @abstractmethod
    def complete(self, prompt: str, **kwargs) -> ModelResponse: ...

class SLMProvider(ABC):
    @abstractmethod
    def route(self, input_text: str) -> RouteDecision: ...

class StepExecutor(ABC):
    @abstractmethod
    async def execute(self, step: WorkflowStep, context: WorkflowContext) -> StepResult: ...

class MCPAdapter(ABC):
    @abstractmethod
    async def invoke(self, tool: str, params: dict) -> dict: ...

class MemoryStore(ABC):
    @abstractmethod
    async def get(self, key: str) -> Any: ...
    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...
```

### `app/core/context.py`

`WorkflowContext` is the single object threaded through every step execution. It carries inputs, accumulated outputs, metadata, and the resolved secret provider.

```python
@dataclass
class WorkflowContext:
    request_id: str
    pipeline_name: str
    input: dict
    outputs: dict              # keyed by step output_key
    secrets: SecretProvider
    metadata: dict
    started_at: datetime
    cost_usd: float = 0.0
    step_results: list[StepResult] = field(default_factory=list)
```

Template strings in YAML (`{{ input.pr_number }}`, `{{ review_comments }}`) are resolved against this context at step execution time.

---

## 6. gRPC Transport

### Proto Definition (`proto/workflow.proto`)

```protobuf
syntax = "proto3";
package workflow;

service WorkflowService {
  // Synchronous: wait for full pipeline result
  rpc Process (WorkflowRequest) returns (WorkflowResponse);

  // Streaming: receive step-by-step events as pipeline executes
  rpc ProcessStream (WorkflowRequest) returns (stream StepEvent);

  // Poll for status of an already-submitted request
  rpc GetStatus (StatusRequest) returns (StatusResponse);
}

message WorkflowRequest {
  string pipeline    = 1;            // matches pipeline name in configs/pipelines/
  string input_json  = 2;            // JSON-serialised pipeline input
  string request_id  = 3;            // idempotency key (UUID)
  map<string, string> meta = 4;      // arbitrary caller metadata
}

message WorkflowResponse {
  string request_id  = 1;
  string status      = 2;            // success | failed | partial
  string output_json = 3;
  repeated StepEvent steps = 4;
}

message StepEvent {
  string step_id     = 1;
  string status      = 2;            // pending | running | done | failed
  string output      = 3;
  int64  latency_ms  = 4;
  float  cost_usd    = 5;
}

message StatusRequest  { string request_id = 1; }
message StatusResponse {
  string request_id  = 1;
  string status      = 2;
  repeated StepEvent steps = 3;
}
```

### Regenerating Stubs

```bash
bash scripts/generate_proto.sh
# runs: python -m grpc_tools.protoc -I./proto \
#         --python_out=app/transport/grpc/proto \
#         --grpc_python_out=app/transport/grpc/proto \
#         proto/workflow.proto
```

**Never hand-edit `workflow_pb2.py` or `workflow_pb2_grpc.py`.** Always regenerate from `workflow.proto`.

### gRPC Server Startup (`app/transport/grpc/server.py`)

The gRPC server starts alongside FastAPI on a separate port (default `50051`). Both are started in `app/main.py` using `asyncio.gather`.

### Outbound gRPC (`app/workflow/executor/grpc_executor.py`)

Used for `grpc_call` steps in pipelines. Manages a channel pool. Authenticates via Vault-resolved credentials.

---

## 7. REST Transport

### Inbound (`app/transport/rest/`)

FastAPI handles inbound REST. All routes normalise their payloads through `UnifiedInputBus` before reaching the workflow engine — so the engine never knows whether a request arrived via REST or gRPC.

### Outbound (`app/workflow/executor/rest_executor.py`)

Handles `rest_call` steps — used for any HTTP endpoint that is not MCP-compliant. Supports:

- Any HTTP method (GET, POST, PUT, PATCH, DELETE)
- Header injection (including Vault-resolved auth tokens)
- JSON and form-encoded bodies
- Response mapping to `output_key`
- Retry with exponential backoff

Pipeline YAML example:

```yaml
- id: call_legacy_api
  type: rest_call
  url: "https://internal.company.com/api/v2/deploy"
  method: POST
  headers:
    Authorization: "Bearer {{ secret:deploy/token }}"
    X-Request-ID: "{{ context.request_id }}"
  body:
    repo: "{{ input.repo }}"
    sha:  "{{ input.sha }}"
  output_key: deploy_result
  timeout_seconds: 30
  retry:
    max_attempts: 3
    backoff_seconds: 2
```

---

## 8. Vault Secret Resolution

### How It Works

1. `app/config.py` reads `configs/vault.yaml` at startup.
2. Instantiates the appropriate `SecretProvider` concrete class.
3. `app/vault/resolver.py` walks every loaded YAML config and replaces `{{ secret:PATH }}` tokens with live values from Vault.
4. The resolved values are stored in-process — no secrets are written to disk or logs.

### Secret Reference Syntax

| Syntax | Resolved by |
|---|---|
| `{{ secret:github/token }}` | Vault at path `secret/github/token` |
| `{{ secret:stripe/secret_key }}` | Vault at path `secret/stripe/secret_key` |
| `{{ env:VAULT_ADDR }}` | Process environment variable (used in vault.yaml only) |

### `app/vault/resolver.py`

```python
def resolve(value: str, provider: SecretProvider) -> str:
    """Replace all {{ secret:X }} and {{ env:X }} tokens in a string."""
```

Call this on every string value when loading YAML. It is idempotent — strings without tokens are returned unchanged.

### Adding a Secret (HashiCorp Vault)

```bash
vault kv put secret/github token="ghp_xxxx"
vault kv put secret/stripe secret_key="sk_live_xxxx"
vault kv put secret/anthropic api_key="sk-ant-xxxx"
```

Then reference as `{{ secret:github/token }}` in any YAML. No code changes.

### Local Dev

Set `provider: env` in `configs/vault.yaml`. All `{{ secret:X }}` references resolve via `os.getenv(X.replace("/", "_").upper())`. Example: `{{ secret:github/token }}` → `os.getenv("GITHUB_TOKEN")`.

---

## 9. MCP Integration Layer

### `app/mcp/client.py`

Single call-site for all MCP tool invocations. Workflow steps never import vendor SDKs.

```python
class MCPClient:
    async def invoke(
        self,
        server: str,           # matches name in mcp_servers.yaml
        tool: str,             # tool name from server's manifest
        params: dict,
        context: WorkflowContext,
    ) -> dict: ...
```

### `app/mcp/registry.py`

Loads `configs/mcp_servers.yaml` at startup. Resolves all `{{ secret:X }}` tokens via Vault before storing credentials. Registers server adapters.

### `app/mcp/tool_discovery.py`

On first connection to each server, fetches the tool manifest (list of available tools + their input schemas). Caches in memory. Used by `schema_validator.py` to validate `mcp_call` steps in pipeline YAMLs at startup — fail fast, not at runtime.

### `app/mcp/session.py`

Maintains a connection pool (SSE or WebSocket) per server. Handles reconnect with exponential backoff. Max pool size configurable per server in `mcp_servers.yaml`.

### Adding a New MCP Server

1. Add an entry to `configs/mcp_servers.yaml`.
2. Add the secret to Vault.
3. Restart the platform (or hit `POST /mcp/reload` if live reload is enabled).

**No Python changes required.**

---

## 10. Workflow Engine & Executors

### `app/workflow/engine.py`

The DAG executor. Responsibilities:

- Load pipeline definition from registry.
- Resolve `depends_on` into an execution graph.
- Execute steps with no dependencies immediately.
- Fan out parallel steps (`parallel: true`) using `asyncio.gather`.
- Evaluate `condition` expressions before executing a step.
- Pass `WorkflowContext` through every step, accumulating outputs.
- Emit `StepEvent` records for observability and gRPC streaming.

### `app/workflow/step.py`

```python
class StepType(str, Enum):
    AI_TASK   = "ai_task"
    MCP_CALL  = "mcp_call"
    REST_CALL = "rest_call"
    GRPC_CALL = "grpc_call"
    LOGIC     = "logic"
    CONDITION = "condition"

@dataclass
class WorkflowStep:
    id: str
    type: StepType
    depends_on: list[str]
    parallel: bool
    condition: str | None      # Python expression evaluated against context
    output_key: str | None
    config: dict               # type-specific config (prompt, server, url, etc.)
    retry: RetryConfig | None
    on_error: str | None

@dataclass
class StepResult:
    step_id: str
    status: str                # done | failed | skipped
    output: Any
    latency_ms: int
    cost_usd: float
    error: str | None
```

### `app/workflow/executor/base.py`

```python
class StepExecutor(ABC):
    @abstractmethod
    async def execute(
        self,
        step: WorkflowStep,
        context: WorkflowContext,
    ) -> StepResult: ...
```

### Executor Responsibilities

| Executor | Handles | Key behaviour |
|---|---|---|
| `ai_executor.py` | `ai_task` | calls Model Gateway, applies Guardrails to output |
| `mcp_executor.py` | `mcp_call` | calls MCPClient, maps response to output_key |
| `rest_executor.py` | `rest_call` | outbound HTTP, resolves secrets in headers/body |
| `grpc_executor.py` | `grpc_call` | outbound gRPC, manages channel pool |
| `logic_executor.py` | `logic` | calls a named Python function from a registry |

### Template Resolution

All string values in step config are template-rendered against `WorkflowContext` before execution:

```
{{ input.pr_number }}     → context.input["pr_number"]
{{ review_comments }}     → context.outputs["review_comments"]
{{ context.request_id }}  → context.request_id
{{ secret:deploy/token }} → resolved via Vault (at config load time, not execution time)
```

---

## 11. SLM Routing Layer

### `app/routing/router_schema.py`

```python
class RouteDecision(BaseModel):
    intent: str
    task: str
    complexity: Literal["low", "medium", "high"]
    priority: Literal["low", "medium", "high"]
    confidence: float          # 0.0 – 1.0
    route: str                 # pipeline name or "slm" | "llm"
```

### `app/routing/slm_router.py`

Routing decision logic:

```
IF complexity == "low" AND confidence > routing_rules.slm_threshold.min_confidence
  → handle via SLM pipeline
ELIF priority == "high" AND routing_rules.priority_override.high_priority_always_llm
  → escalate to LLM
ELSE
  → escalate to LLM
```

The thresholds are read from `configs/routing_rules.yaml` — not hardcoded.

---

## 12. Model Gateway

### `app/gateway/model_gateway.py`

Single call-site for all model completions. Responsibilities:

- Select model based on tier (`slm` / `llm`) from `configs/models.yaml`.
- Execute primary provider.
- On failure, execute fallback provider.
- Retry up to `max_retries` with exponential backoff.
- Record cost via `cost_tracker.py`.
- Return a normalised `ModelResponse`.

### `app/gateway/providers/base.py`

```python
class ModelProvider(ABC):
    @abstractmethod
    def complete(self, prompt: str, **kwargs) -> ModelResponse: ...

@dataclass
class ModelResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
```

### Adding a New Provider

1. Create `app/gateway/providers/myprovider.py` implementing `ModelProvider`.
2. Add an entry under `providers:` in `configs/models.yaml` with its API key as a Vault secret reference.
3. Register it in the provider factory in `model_gateway.py`.

No other files change.

---

## 13. Guardrails

Every LLM output passes through guardrails before being written to `WorkflowContext.outputs`.

### `app/guardrails/validator.py`

Orchestrator. Runs all enabled checks in sequence. On any failure:

1. Retry with the fallback model (up to `routing_rules.escalation.max_retries`).
2. If still failing, emit a `GuardrailViolation` event and apply `on_max_retries_exceeded` strategy.

### `app/guardrails/hallucination.py`

Uses SLM to score whether the LLM output is grounded in the provided context. Configurable threshold.

### `app/guardrails/policy.py`

Checks output against a set of policy rules (configurable). Default rules: no PII in output, no confidential data patterns, response within expected length bounds.

---

## 14. Memory & Storage

### `app/memory/store.py`

```python
class MemoryStore(ABC):
    async def get(self, key: str) -> Any: ...
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def search(self, query: str, top_k: int = 5) -> list[Any]: ...  # vector search
```

The platform uses `RedisStore` in production and `InMemoryStore` as a fallback (and in tests). Swap via environment variable `MEMORY_BACKEND=redis|memory`.

### What Is Stored

| Key pattern | Contents | TTL |
|---|---|---|
| `request:{id}` | Full `WorkflowContext` at completion | 24h |
| `step:{id}:{step_id}` | Individual `StepResult` | 24h |
| `pipeline:{name}:stats` | Aggregate metrics | forever |
| `memory:interaction:{id}` | Past interaction for memory-augmented prompts | configurable |

---

## 15. Observability

### `app/observability/logger.py`

Structured JSON logging. Every log entry includes:

```json
{
  "timestamp": "...",
  "level": "INFO",
  "request_id": "...",
  "pipeline": "...",
  "step_id": "...",
  "event": "step_completed",
  "latency_ms": 142,
  "cost_usd": 0.0012,
  "model": "claude-sonnet-4-6"
}
```

Never log secret values. The `resolver.py` redacts `{{ secret:X }}` in log output.

### `app/observability/metrics.py`

In-process aggregation. Exposed at `GET /metrics`. Tracks:

- Total requests, success rate, error rate
- Latency p50/p95/p99 per pipeline
- Cost per pipeline, per model, per day
- MCP call counts and latency per server
- Guardrail failure rates

---

## 16. API Layer

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/process` | Submit a workflow request |
| `GET` | `/status/{request_id}` | Poll workflow status |
| `GET` | `/metrics` | Aggregated platform metrics |
| `GET` | `/pipelines` | List all loaded pipelines |
| `GET` | `/pipelines/{name}` | Pipeline definition + step graph |
| `GET` | `/mcp/servers` | List registered MCP servers + health |
| `GET` | `/mcp/servers/{name}/tools` | List available tools for a server |
| `POST` | `/mcp/servers/{name}/test` | Health-check a specific server |

### gRPC Endpoints

See [Section 6](#6-grpc-transport). gRPC listens on port `50051` by default (`GRPC_PORT` env var).

### `POST /process` Request / Response

```json
// Request
{
  "pipeline": "coding_workflow",
  "input": {
    "pr_number": 42,
    "pr_description": "Adds OAuth2 login",
    "diff": "...",
    "repo": "org/repo",
    "sha": "abc123",
    "jira_key": "ENG-999"
  },
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "pipeline": "coding_workflow",
  "outputs": {
    "intent": { "complexity": "high", "task": "code_review" },
    "review_comments": "Found 2 issues: ...",
    "deploy_result": { "status": "triggered" }
  },
  "steps": [
    { "step_id": "detect_intent", "status": "done", "latency_ms": 120, "cost_usd": 0.0001 },
    { "step_id": "review_code",   "status": "done", "latency_ms": 3200, "cost_usd": 0.0089 }
  ],
  "total_latency_ms": 4100,
  "total_cost_usd": 0.0090
}
```

---

## 17. Pipeline YAML Schema

Full schema reference for `configs/pipelines/*.yaml`:

```yaml
# Required top-level fields
name: string                        # unique pipeline identifier
description: string                 # human-readable description

# Optional trigger configuration
trigger:
  type: rest | grpc | webhook | queue
  # grpc-specific
  service: WorkflowService
  method: Process
  # webhook-specific
  source: github | stripe | custom
  event: pull_request.opened
  # queue-specific
  topic: string

# Steps array — the pipeline DAG
steps:
  - id: string                      # unique within pipeline
    type: ai_task | mcp_call | rest_call | grpc_call | logic | condition
    depends_on: [step_id, ...]      # empty list = starts immediately
    parallel: bool                  # default false; runs concurrently with siblings
    condition: string               # Python expression; skip step if false
    output_key: string              # key written to WorkflowContext.outputs
    timeout_seconds: int            # default 30
    retry:
      max_attempts: int
      backoff_seconds: float
    on_error: skip | fail | retry | escalate_human

# Error handling at pipeline level
on_error:
  strategy: retry | fail | escalate_human
  max_attempts: int
  fallback: step_id                 # step to run on final failure

# Optional metadata
tags: [string, ...]
version: string
```

---

## 18. Step Type Reference

### `ai_task`

```yaml
- id: summarise
  type: ai_task
  model_tier: slm | llm
  prompt: "Summarise this: {{ input.document }}"
  system_prompt: "You are a concise summariser."   # optional
  output_key: summary
  max_tokens: 500                                   # optional
```

### `mcp_call`

```yaml
- id: create_ticket
  type: mcp_call
  server: jira                      # must match name in mcp_servers.yaml
  tool: create_issue                # must exist in server's tool manifest
  params:
    project: ENG
    summary: "{{ review_comments }}"
    priority: "{{ intent.priority }}"
  output_key: jira_issue
```

### `rest_call`

```yaml
- id: call_internal_api
  type: rest_call
  url: "https://api.internal.com/v1/resource"
  method: POST                      # GET | POST | PUT | PATCH | DELETE
  headers:
    Authorization: "Bearer {{ secret:internal/token }}"
  body:
    field: "{{ input.value }}"
  output_key: api_result
  timeout_seconds: 30
```

### `grpc_call`

```yaml
- id: call_build_service
  type: grpc_call
  address: "build.internal:50051"
  proto: build.proto                # must exist in proto/ directory
  service: BuildService
  method: TriggerBuild
  params:
    repo: "{{ input.repo }}"
    sha: "{{ input.sha }}"
  output_key: build_result
  tls: true                         # default true
```

### `logic`

```yaml
- id: transform_data
  type: logic
  function: transform.normalise_pr_diff   # dotted path to Python function
  params:
    diff: "{{ input.diff }}"
  output_key: normalised_diff
```

### `condition`

```yaml
- id: check_complexity
  type: condition
  expression: "{{ intent.complexity }} in ['medium', 'high']"
  on_true: review_code              # step id to run
  on_false: skip_to_notify          # step id to run
```

---

## 19. Protobuf Contract

Source of truth: `proto/workflow.proto`. See [Section 6](#6-grpc-transport) for full definition.

**Rules:**

- Field numbers are permanent. Never reuse a field number.
- Add new fields as optional with new numbers.
- Run `bash scripts/generate_proto.sh` after any change.
- Commit generated `*_pb2.py` files — do not add them to `.gitignore`.

---

## 20. Environment Variables

```bash
# Server
HOST=0.0.0.0
PORT=8000
GRPC_PORT=50051
ENV=development          # development | staging | production

# Vault (only used when vault.yaml provider: hashicorp)
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=dev-root-token

# Storage
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/workflows
REDIS_URL=redis://localhost:6379/0
MEMORY_BACKEND=redis     # redis | memory

# Local dev secrets (only when vault.yaml provider: env)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GITHUB_TOKEN=ghp_xxx
SLACK_BOT_TOKEN=xoxb-xxx
STRIPE_SECRET_KEY=sk_live_xxx
JIRA_TOKEN=xxx

# Observability
LOG_LEVEL=INFO           # DEBUG | INFO | WARNING | ERROR
LOG_FORMAT=json          # json | text
```

Copy `.env.example` to `.env` for local development.

---

## 21. Running Locally

### Prerequisites

- Python 3.11+
- Docker + Docker Compose
- `grpc_tools` (`pip install grpcio-tools`)

### Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo>
cd ai-workflow-platform
pip install -r requirements.txt

# 2. Start infrastructure (Vault dev, Redis, PostgreSQL)
docker-compose up -d

# 3. Configure environment
cp .env.example .env
# edit .env with your API keys

# 4. Seed Vault with test secrets (local dev only)
bash scripts/seed_vault.sh

# 5. Generate gRPC stubs
bash scripts/generate_proto.sh

# 6. Start the platform
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# gRPC server starts automatically on port 50051
```

### Test the REST API

```bash
curl -X POST http://localhost:8000/process \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline": "coding_workflow",
    "input": {
      "pr_number": 1,
      "pr_description": "Fix null pointer in auth module",
      "diff": "- if user != null\n+ if user is not None",
      "repo": "org/repo",
      "sha": "abc123"
    }
  }'
```

### Test the gRPC API

```bash
grpcurl -plaintext -d '{
  "pipeline": "coding_workflow",
  "input_json": "{\"pr_number\": 1}",
  "request_id": "test-001"
}' localhost:50051 workflow.WorkflowService/Process
```

### `docker-compose.yml` Services

| Service | Port | Purpose |
|---|---|---|
| `postgres` | 5432 | Workflow state storage |
| `redis` | 6379 | Memory store + queue |
| `vault` | 8200 | HashiCorp Vault dev server |

---

## 22. Testing Strategy

### Unit Tests

Each module has a corresponding test file. Mock all external calls (Vault, MCP, model providers). Use `pytest` + `pytest-asyncio`.

```bash
pytest tests/unit/ -v
```

### Integration Tests

Require running infrastructure (`docker-compose up -d`). Use real Vault dev server, real Redis.

```bash
pytest tests/integration/ -v
```

### Key Test Cases

| Test file | What it verifies |
|---|---|
| `test_vault_resolver.py` | `{{ secret:X }}` tokens resolve correctly; missing secrets raise |
| `test_grpc_servicer.py` | gRPC Process and ProcessStream RPCs return correct responses |
| `test_rest_executor.py` | Outbound REST calls, retry logic, header injection |
| `test_slm_router.py` | Routing decisions at threshold boundaries |
| `test_workflow_engine.py` | DAG execution order, parallel steps, condition evaluation |
| `test_guardrails.py` | Hallucination and policy checks trigger retries correctly |
| `test_grpc_end_to_end.py` | Full pipeline via gRPC from request to response |

### Mocking Pattern

```python
# Always mock at the interface boundary, not at the implementation
@pytest.fixture
def mock_secret_provider():
    provider = Mock(spec=SecretProvider)
    provider.get.side_effect = lambda path: f"test-secret-for-{path}"
    return provider
```

---

## 23. Adding a New Pipeline

1. Create `configs/pipelines/my_pipeline.yaml` following the schema in [Section 17](#17-pipeline-yaml-schema).
2. Ensure all referenced MCP servers exist in `mcp_servers.yaml`.
3. Ensure all `{{ secret:X }}` references exist in Vault.
4. Restart the platform (or `POST /pipelines/reload` if live reload is on).
5. Call `GET /pipelines/my_pipeline` to verify it loaded and all steps validated.
6. Submit a test request via `POST /process`.

**No Python changes required.**

---

## 24. Adding a New MCP Server

1. Add the server entry to `configs/mcp_servers.yaml`.
2. Add the secret to Vault:
   ```bash
   vault kv put secret/myservice token="xxxx"
   ```
3. Restart the platform.
4. Verify: `GET /mcp/servers/myservice/tools` — should list the server's available tools.
5. Use `type: mcp_call` + `server: myservice` in any pipeline YAML.

**No Python changes required.**

---

## 25. Adding a New Model Provider

1. Create `app/gateway/providers/myprovider.py`:
   ```python
   class MyProvider(ModelProvider):
       def complete(self, prompt: str, **kwargs) -> ModelResponse:
           # call your provider's API
           ...
   ```
2. Add to the provider factory in `app/gateway/model_gateway.py`.
3. Add an entry in `configs/models.yaml`:
   ```yaml
   providers:
     myprovider:
       api_key: "{{ secret:myprovider/api_key }}"
   ```
4. Add the secret to Vault.
5. Reference `provider: myprovider` under a model tier in `models.yaml`.

---

## 26. Engineering Rules

These rules are non-negotiable. Claude Code must follow them in every file it generates or modifies.

### Code Quality

- All functions and classes must have docstrings.
- All function signatures must have type hints.
- No `Any` types except in `WorkflowContext.outputs` and `StepResult.output` (these are intentionally dynamic).
- Maximum function length: 50 lines. Split beyond that.
- Maximum file length: 300 lines. Split beyond that.

### Dependencies

- Cross-module imports go through `core/interfaces.py` — never import concrete classes across module boundaries.
- The `vault/` module must not import from `workflow/`, `mcp/`, `gateway/`, or `routing/`.
- The `core/` module must not import from any other app module.
- Circular imports are a hard failure.

### Secrets

- Never call `os.getenv()` outside of `app/vault/env_fallback.py`.
- Never log a secret value. The resolver redacts `{{ secret:X }}` in logs.
- Never hardcode credentials, tokens, or API keys anywhere.

### Configuration

- Never hardcode model names, pipeline names, thresholds, or provider URLs in Python. All of these live in YAML configs.
- Python code reads config values — it never defines them.

### Error Handling

- Every executor's `execute()` method must catch its own errors and return a `StepResult` with `status="failed"` rather than raising. The engine handles propagation.
- External calls (HTTP, gRPC, MCP) must have timeouts. Default 30 seconds.
- All retries must use exponential backoff with jitter.

### Testing

- Every new module needs a corresponding unit test file.
- No test may call a real external API (Vault dev server and local Redis are acceptable).
- Test files must be runnable with `pytest tests/unit/` without any infrastructure running.

---

## 27. Build Order

Implement modules in this order. Each module is fully testable before the next begins.

| # | Module | Depends on |
|---|---|---|
| 1 | `core/interfaces.py`, `core/exceptions.py`, `core/context.py` | nothing |
| 2 | `vault/` — all providers + resolver | `core/interfaces.py` |
| 3 | `loader/` — pipeline loader, schema validator, step resolver | `core/`, `vault/` |
| 4 | `transport/` — REST inbound, gRPC inbound, unified bus | `core/`, `loader/` |
| 5 | `routing/` — SLM router + providers | `core/`, `vault/` |
| 6 | `gateway/` — model gateway + providers + cost tracker | `core/`, `vault/` |
| 7 | `mcp/` — client, registry, session, auth, tool discovery | `core/`, `vault/` |
| 8 | `workflow/engine.py` + all executors | all above |
| 9 | `guardrails/` | `gateway/`, `routing/` |
| 10 | `memory/` | `core/` |
| 11 | `observability/` | `core/` |
| 12 | `api/routes/` | all above |
| 13 | `tests/` — unit then integration | all above |

---

*This document is the ground truth. When in doubt, refer here before writing code.*
