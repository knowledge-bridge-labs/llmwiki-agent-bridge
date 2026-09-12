# Graph-Guided Bridge Retrieval Plan

## Implementation

1. Add public schema helpers for `GraphContextOptions` and expose them on
   `/message:send` data plus MCP `llmwiki_agent_run`.
2. Parse `graphContext` in the A2A/MCP one-shot request path with conservative
   defaults and bounds.
3. After normal source evidence fan-out, derive per-source seeds from source
   citations and graph nodes.
4. Call a shared graph-neighborhood orchestration helper for HTTP and MCP
   sources, reusing existing graph-neighbor source plumbing.
5. Merge normalized neighborhood graph/citations into per-source results and
   aggregate artifact graph/citations in source order.
6. Add redacted graph-context trace steps and diagnostics for unsupported,
   unavailable, or failed expansion.
7. Extend runtime evidence-bundle projection with a bounded graph context
   summary only.
8. Update contract docs and generated OpenAPI.

## Affected Files

- `src/index.mjs`
- `test/agent-bridge.test.mjs`
- `docs/message-send-contract.md`
- `docs/openapi.json`
- `docs/decisions/2026-09-12-graph-guided-bridge-retrieval.md`
- `specs/graph-guided-bridge-retrieval/`

## Risks

- Source seed ids can be source-prefixed or local. The bridge must route them
  source-locally and avoid calling the wrong source.
- Graph-neighborhood sources can return large graph payloads. Runtime prompts
  must stay bounded and summary-only.
- Unsupported sources should not turn a default run into a failure. Expansion is
  opt-in and `fallback: "omit"` remains the default.
- Diagnostics and logs must not include user query text, raw URLs, local paths,
  bearer tokens, or upstream response bodies.

