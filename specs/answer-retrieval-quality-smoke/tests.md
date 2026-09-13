# Tests: Answer Retrieval Quality Smoke

## Acceptance Criteria

- The smoke starts a local `llmwiki-serve` sample source with SQLite GraphStore
  enabled and confirms the temporary SQLite store exists.
- Direct HTTP `/query` returns answerable context for:
  - `required label copy release readiness`;
  - `when should requester packet be returned`;
  - `artwork review handoff readiness`.
- Direct HTTP evidence includes the expected approved page IDs and excludes
  `draft-note`.
- Direct MCP Streamable HTTP `llmwiki_context` returns evidence page IDs aligned
  with direct HTTP for the same queries.
- The bridge registry accepts both registered sources and `/sources?probe=1`
  reports them without local path leakage.
- Bridge `/message:send` with `A2A-Version: 1.0`, `mode: "evidence-only"`, and
  a registered `llmwiki-http` source returns a wrapped A2A task containing
  `llmwiki_agent_result`.
- Bridge MCP `llmwiki_agent_run` with a registered `/mcp/stream` source returns
  `structuredContent.llmwiki_agent_result`.
- Bridge result artifacts include non-empty citations, graph nodes, graph
  edges, source bundles, trace steps, expected page IDs, and no
  `runtime-chat-completions` step.
- Public artifacts scanned by the smoke do not contain local absolute paths,
  temp paths, checkout paths, credentials, or key-like tokens.

## Commands

```sh
node scripts/answer-retrieval-quality-smoke.mjs --serve-repo ../llmwiki-serve --pretty
node --check scripts/answer-retrieval-quality-smoke.mjs
npm test -- --test-name-pattern "MCP 2026-07-28|Graph-guided|source bundle|A2A-Version"
```
