# Graph-Guided Bridge Retrieval

## Problem

One-shot bridge runs already merge citations and graph payloads returned by
selected Knowledge Sources, but they do not use those initial citations or graph
nodes to ask the source for a bounded local neighborhood. Users must call
`llmwiki_graph_neighbors` manually after the answer run when relationship-heavy
questions need adjacent decisions, dependencies, owners, or follow-ups.

The bridge needs an opt-in orchestration step that can expand source-local graph
context while preserving the existing evidence-first and private-safe runtime
contracts.

## Goals

- Add optional `graphContext` to `/message:send` data and MCP
  `llmwiki_agent_run` arguments.
- Keep graph-neighborhood expansion disabled by default.
- Derive source-local seed ids from normal query citations and graph nodes.
- Call bounded graph-neighborhood source APIs only after normal query/context
  fan-out succeeds.
- Merge neighborhood graph and citations into the existing artifact fields in
  selected source order.
- Send only a bounded graph context summary to runtime prompts, never raw full
  graph payloads, source bundles, local roots, source URLs, bearer tokens, or
  request bodies.
- Emit sanitized trace steps and diagnostics for unsupported or failed graph
  expansion.

## Non-goals

- No Cypher, graph query language, global graph store, or cross-source graph
  traversal.
- No default graph-neighborhood call for existing clients.
- No A2A graph-neighborhood source protocol in this slice.
- No exposure of raw source metadata, raw graph payloads, URLs, local paths,
  credentials, or query text in diagnostics or logs.
- No change to the standalone `llmwiki_graph_neighbors` source tool contract.

## Requirements

1. `data.graphContext` and MCP `llmwiki_agent_run` arguments accept:
   `enabled`, `seedFrom`, `depth`, `direction`, `relations`, `limit`, and
   `fallback`.
2. When absent or disabled, the bridge produces the same source calls and
   artifact shape as before.
3. When enabled, defaults are: `seedFrom: ["citations", "graph"]`, `depth: 1`,
   `direction: "both"`, no relation filter, `limit: 40`, and
   `fallback: "omit"`.
4. `limit` is clamped to the one-shot maximum of 120. `depth` is clamped to the
   existing graph-neighbor maximum. `fallback` accepts only `omit` or `error`.
5. Seed ids are derived per source, source prefixes are stripped before
   upstream calls, duplicate ids are removed, and unrelated source-prefixed ids
   are ignored.
6. HTTP Knowledge Sources use `GET /graph/neighborhood`. MCP Knowledge Sources
   use `llmwiki_graph_neighbors`. A2A sources are omitted unless a future
   source protocol explicitly supports graph neighborhoods.
7. With `fallback: "omit"`, unsupported or failed graph-neighborhood expansion
   keeps the run successful and records redacted graph-context diagnostics and
   trace steps.
8. With `fallback: "error"`, unsupported or failed expansion stops before the
   runtime call and returns a sanitized `400`/`502` bridge error depending on
   the failure class.
9. Runtime prompts include bounded graph context summary counts and small node
   previews only. Artifact `graph` preserves the merged graph.

## Compatibility

The contract is additive and opt-in. Existing clients that omit `graphContext`
receive the same query/runtime behavior. Clients that enable it may see
additional citations, graph nodes, graph edges, trace steps, and diagnostics.

