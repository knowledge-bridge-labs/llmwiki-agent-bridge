# Graph-Guided Bridge Retrieval Tests

## Automated

- `/message:send` with `graphContext.enabled` calls `/graph/neighborhood` after
  `/query` using citation/page seeds, then merges graph and citations with
  source prefixes.
- MCP `llmwiki_agent_run` accepts the same `graphContext` option and uses the
  same source expansion path.
- Multi-source runs route seeds source-locally in selected source order.
- Unsupported or 404 graph-neighborhood expansion with `fallback: "omit"` keeps
  the run successful and emits a redacted diagnostic.
- Runtime prompt projection contains only bounded graph-context summary data
  while the artifact preserves the full merged graph.

## Manual

- Inspect runtime prompt JSON for absence of full graph nodes/edges, source
  bundles, raw source URLs, local roots, bearer tokens, and private endpoint
  canaries.
- Inspect diagnostics and trace steps for bounded source id, protocol, status,
  counts, and redaction observations only.
