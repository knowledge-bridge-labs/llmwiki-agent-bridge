# Answer Retrieval Quality Smoke

`scripts/answer-retrieval-quality-smoke.mjs` is a local-only deterministic
integration check for a real `llmwiki-serve` source and
`llmwiki-agent-bridge`. It does not call an LLM runtime.

Run it from the bridge checkout:

```sh
node scripts/answer-retrieval-quality-smoke.mjs --serve-repo ../../llmwiki-serve --pretty
```

If the serve checkout is in the default adjacent workspace location, the
`--serve-repo` option can be omitted. `LLMWIKI_SERVE_REPO` can also point at the
serve checkout.

The smoke starts `llmwiki-serve` against `examples/sample-wiki` with SQLite
GraphStore enabled, starts a bridge with a temporary settings file, registers
two Knowledge Sources through `/settings/sources.json`, and runs fixed sample
wiki questions through:

- direct serve HTTP `/query`;
- direct serve MCP Streamable HTTP `/mcp/stream`;
- bridge `/message:send` in A2A 1.0 evidence-only mode;
- bridge MCP `llmwiki_agent_run`;
- bridge MCP source tools.

It fails on missing expected page IDs, empty citations/evidence, graph loss,
source-bundle loss, graph-neighborhood loss when graph context is requested,
A2A artifact drift, runtime calls in evidence-only mode, or local absolute path
leakage. It prints a sanitized JSON report with case IDs, statuses, counts,
page IDs, and quality-gap codes.

The patched `llmwiki-serve`/`llmwiki-agent-bridge` pair should report zero
quality gaps for the bundled sample wiki. If a source does not expose
graph-neighborhood HTTP or MCP support, the smoke reports that as a
`qualityGaps` entry instead of hiding it.
