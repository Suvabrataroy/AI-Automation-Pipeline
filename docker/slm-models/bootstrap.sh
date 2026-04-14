#!/bin/sh
# Pulls all SLM models required by the platform.
# Runs once via docker compose ollama-bootstrap service.
# Re-running is safe — Ollama skips already-pulled models.

set -e

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
BASE="$OLLAMA_HOST/api/pull"

pull_model() {
  MODEL="$1"
  echo "Pulling model: $MODEL"
  curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$MODEL\", \"stream\": false}" \
    | grep -o '"status":"[^"]*"' \
    || true
  echo "Done: $MODEL"
}

echo "=== SLM Platform Model Bootstrap ==="
echo "Ollama host: $OLLAMA_HOST"

pull_model "smollm2:360m"         # pre-filter  — 220 MB — pull first (fastest)
pull_model "phi3:mini"            # routing SLM — 2.3 GB
pull_model "gemma2:2b"            # guardrail   — 1.6 GB
pull_model "qwen2.5-coder:3b"     # coding      — 1.9 GB

echo "=== All models ready ==="
