slm.primary → Phi-3 Mini (local, Ollama)  ·  slm.fallback → Claude Haiku 4.5 (API)  ·  guardrail SLM → Gemma 2 2B IT  ·  coding intent override → Qwen2.5-Coder 3B  ·  pre-filter (optional) → SmolLM2 360M



tiers:

&#x20; slm:

&#x20;   primary:

&#x20;     provider: local

&#x20;     model: phi3:mini          # Ollama model tag

&#x20;     max\_tokens: 256           # routing prompts are short — cap hard

&#x20;     timeout\_ms: 300

&#x20;   fallback:

&#x20;     provider: anthropic

&#x20;     model: claude-haiku-4-5   # API fallback when local fails



&#x20; slm\_guardrail:                # separate tier for guardrail checks

&#x20;   primary:

&#x20;     provider: local

&#x20;     model: gemma2:2b

&#x20;     timeout\_ms: 400

&#x20;   fallback:

&#x20;     provider: groq

&#x20;     model: llama-3.1-8b-instant



&#x20; slm\_coding:                   # override for coding\_workflow.yaml

&#x20;   primary:

&#x20;     provider: local

&#x20;     model: qwen2.5-coder:3b

&#x20;     timeout\_ms: 350

&#x20;   fallback:

&#x20;     provider: together

&#x20;     model: Qwen/Qwen2.5-7B-Instruct-Turbo



&#x20; llm:

&#x20;   primary:

&#x20;     provider: anthropic

&#x20;     model: claude-sonnet-4-6

&#x20;   fallback:

&#x20;     provider: openai

&#x20;     model: gpt-4o



A few practical notes on the SLM routing prompt design — these models are small, so the prompt structure matters far more than with an LLM:

Keep routing prompts under 200 tokens. Phi-3 Mini degrades in JSON reliability above \~300 input tokens. Strip everything except the essential signal — intent classification doesn't need the full document, just a summary or first 100 chars.

Use constrained decoding whenever your inference server supports it. Ollama supports JSON mode (format: json). Force it for the routing layer — you'll get near-100% valid RouteDecision JSON instead of the \~85% you get from free-form generation at 3.8B scale.

Separate the routing SLM from the guardrail SLM. They have different latency profiles and different failure modes. Routing needs speed; guardrails need accuracy. Running them as two model tiers (slm vs slm\_guardrail) lets you tune independently without coupling.

The SmolLM2 360M pre-filter is optional but worth it at scale. At 220 MB and sub-10ms, it sits in front of Phi-3 Mini and drops requests that are obviously empty, malformed, or out of domain. Saves the full routing SLM inference for real traffic.Sonnet 4.6

