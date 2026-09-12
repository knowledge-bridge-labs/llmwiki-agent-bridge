# ADR: Graph-Guided Bridge Retrieval

## Status

Accepted.

## Context

`llmwiki-agent-bridge` one-shot runs gather evidence from selected Knowledge
Sources, merge citations, merge graph payloads, and optionally call a runtime.
The bridge also exposes a read-only `llmwiki_graph_neighbors` source tool, but
that tool requires a separate host-agent call.

With `llmwiki-serve` graph store support, graph neighborhoods are useful as
nearby evidence around pages already selected by normal retrieval. This belongs
in the bridge only as an opt-in orchestration step because graph expansion can
increase source calls, artifact size, and prompt pressure.

## Decision

Add optional `graphContext` to `/message:send` data and MCP
`llmwiki_agent_run` arguments.

When `graphContext.enabled` is true, the bridge derives source-local seed ids
from the citations and graph nodes returned by the normal source query phase,
then asks each HTTP or MCP Knowledge Source for a bounded graph neighborhood.
The returned graph and citations are normalized with existing source-prefixing
rules and merged into the answer artifact in selected source order.

The default `fallback` is `omit`: unsupported, absent, or failed neighborhood
expansion records a sanitized diagnostic and the run continues. `fallback:
"error"` makes expansion failures fatal before the runtime call.

Runtime prompts receive only a bounded graph context summary with counts and
small node/citation previews. Full graph payloads remain artifact data and are
not inlined into prompts.

## Consequences

- Relationship-heavy one-shot answers can include adjacent source evidence
  without requiring an explicit second graph-neighbor tool call.
- Existing clients are unaffected because graph expansion is disabled unless
  requested.
- The bridge remains a retrieval orchestrator, not a graph query engine.
- Source-local routing preserves source boundaries and avoids cross-source graph
  traversal.
- Future A2A graph-neighborhood support should be added as an explicit source
  capability and remain bounded by the same prompt redaction rules.

## Links

- Spec: `specs/graph-guided-bridge-retrieval/`
- Related ADR: `docs/decisions/2026-09-12-knowledge-gateway-positioning.md`
