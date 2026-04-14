"""Service descriptor models for the centralized SLM service registry.

Each registered service has:
- Full metadata (for documentation and validation)
- A compact token summary (for SLM decision-making — must stay terse)

Token summary format: ``name:cap1,cap2|transport|host_type``
Example: ``github:code_review,pr_ops|mcp|local``

This compact form lets the SLM scan all registered services in ~5 tokens
per service, keeping the full orchestration context under 150 tokens.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ServiceTransport(BaseModel):
    """Transport configuration for a registered service.

    Attributes:
        type: Protocol used to call the service.
        url: Base URL for rest/grpc transports.
        mcp_server: MCP server name (matches mcp_servers.yaml) for mcp transport.
        grpc_address: Host:port for grpc transport.
    """

    type: Literal["rest", "grpc", "mcp"] = Field(
        description="Transport protocol for service calls."
    )
    url: str | None = Field(default=None, description="Base URL (rest/grpc).")
    mcp_server: str | None = Field(
        default=None, description="MCP server name for mcp transport."
    )
    grpc_address: str | None = Field(
        default=None, description="host:port for grpc transport."
    )


class ServiceSLMConfig(BaseModel):
    """SLM configuration for a service — controls how the brain routes to it.

    Attributes:
        model_tier: Which SLM tier owns routing decisions for this service.
        intent_keywords: Short keywords the SLM matches against. Keep to ≤6 words.
        typical_complexity: Expected complexity so the brain can pre-plan delegation.
    """

    model_tier: str = Field(
        default="slm",
        description="Model tier used when orchestrating this service.",
    )
    intent_keywords: list[str] = Field(
        default_factory=list,
        description="Short intent keywords. Kept ≤6 items to stay token-efficient.",
    )
    typical_complexity: Literal["low", "medium", "high"] = Field(
        default="low",
        description="Typical request complexity for this service.",
    )


class ServiceDockerConfig(BaseModel):
    """Docker configuration for self-hosted service deployment.

    Attributes:
        image: Full Docker image reference.
        port: Exposed service port.
        env: Environment variable names (values resolved via Vault).
        volumes: Optional volume mounts.
    """

    image: str = Field(description="Docker image reference.")
    port: int = Field(description="Service port.")
    env: dict[str, str] = Field(
        default_factory=dict,
        description="Env var name → Vault secret path or literal value.",
    )
    volumes: list[str] = Field(default_factory=list)


class ServiceDescriptor(BaseModel):
    """Full descriptor for a service registered with the SLM brain.

    Users create one YAML file per service following the template at
    ``configs/services/_template.yaml``. The registry loader validates
    each file against this schema at startup.

    Attributes:
        name: Unique service identifier. Used as the key in the registry.
        version: Semver string.
        description: One-sentence human description.
        purpose: Domain category — maps to SLM intent taxonomy.
        capabilities: List of capability names this service exposes.
        slm: SLM routing config for this service.
        transport: How to call the service.
        docker: Optional Docker config for self-hosted deployment.
        enabled: Set to false to soft-disable without removing the file.
    """

    name: str = Field(description="Unique service name.")
    version: str = Field(default="1.0", description="Service version.")
    description: str = Field(description="One-sentence description.")
    purpose: str = Field(
        description="Domain category matching SLM intent taxonomy."
    )
    capabilities: list[str] = Field(
        description="List of capability names this service exposes."
    )
    slm: ServiceSLMConfig = Field(
        default_factory=ServiceSLMConfig,
        description="SLM routing config.",
    )
    transport: ServiceTransport = Field(description="Transport config.")
    docker: ServiceDockerConfig | None = Field(
        default=None, description="Docker config for self-hosted deployment."
    )
    enabled: bool = Field(default=True, description="False = soft-disabled.")

    def token_summary(self) -> str:
        """Return the compact token summary for SLM context injection.

        Format: ``name:cap1,cap2|transport|complexity``

        This compact string is what the SLM sees — not the full descriptor.
        Keep capabilities to ≤4 to stay under the per-service token budget.

        Returns:
            Compact token string, e.g. ``github:code_review,pr_ops|mcp|low``.
        """
        caps = ",".join(self.capabilities[:4])
        transport = self.transport.type
        complexity = self.slm.typical_complexity
        return f"{self.name}:{caps}|{transport}|{complexity}"
