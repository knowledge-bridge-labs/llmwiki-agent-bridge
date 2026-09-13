# Spec: Answer Retrieval Quality Smoke

## Status

Draft.

## Problem

Local integration checks cover bridge contracts with mocks, but they do not
verify that a real `llmwiki-serve` sample source produces adequate deterministic
evidence through both the direct source path and the bridge path. A maintainer
needs a no-runtime smoke that can catch retrieval regressions, source-registry
breakage, citation loss, graph payload loss, A2A artifact drift, and local path
leakage before subjective LLM answer evaluation is involved.

## Goals

- Start a real local `llmwiki-serve` sample source with SQLite GraphStore
  enabled.
- Start a local bridge with settings persistence and registered Knowledge
  Sources.
- Exercise direct `llmwiki-serve` HTTP `/query` and MCP Streamable HTTP
  `/mcp/stream` context calls.
- Exercise bridge `/message:send` in explicit A2A 1.0 evidence-only mode using
  a registered `llmwiki-http` source.
- Exercise bridge MCP `llmwiki_agent_run` and source tools using a registered
  MCP source whose URL is the source `/mcp/stream` endpoint.
- Assert deterministic evidence quality for a small domain-specific query set:
  expected page IDs, non-empty citations/evidence, graph nodes/edges, source
  bundle metadata, and cross-mode alignment.
- Assert public artifacts do not expose local absolute paths.
- Report deterministic quality gaps without making external LLM calls.

## Non-Goals

- Do not call OpenAI, Hermes, DeepAgents, or any other external runtime.
- Do not grade answer prose subjectively.
- Do not mutate wiki source files or bridge runtime configuration outside the
  temporary test config.
- Do not change bridge or serve core implementation in this slice.
- Do not publish, tag, push, or commit.

## Requirements

- `REQ-001`: The smoke starts `uv run llmwiki-serve serve examples/sample-wiki`
  from a caller-supplied or auto-detected serve checkout.
- `REQ-002`: The serve process uses `--graph-store sqlite` and a temporary
  SQLite file; the smoke confirms the store is created.
- `REQ-003`: The bridge is started locally with a temporary config path,
  `sourcePolicy: "private-http"`, no runtime call, and I/O logging disabled.
- `REQ-004`: The smoke registers both a `llmwiki-http` source and an MCP source
  at `/mcp/stream` through `/settings/sources.json`.
- `REQ-005`: Direct HTTP and direct MCP stream context calls for each query
  return answerable context with expected page IDs and no draft-page leakage.
- `REQ-006`: Direct HTTP and direct MCP stream context page IDs align for each
  query.
- `REQ-007`: Bridge evidence-only artifacts contain non-empty citations,
  non-empty source bundle metadata, graph nodes, graph edges, expected page IDs,
  and no runtime call step.
- `REQ-008`: Bridge `/message:send` requests with the current A2A version return
  the wrapped A2A task shape with `llmwiki_agent_result`.
- `REQ-009`: Bridge MCP `llmwiki_agent_run` returns
  `structuredContent.llmwiki_agent_result` with evidence aligned to the direct
  source result.
- `REQ-010`: Bridge MCP source tools use the registered MCP source and return
  context/source-bundle data aligned to the direct source result.
- `REQ-011`: The serialized public artifacts scanned by the smoke do not
  contain the serve checkout path, bridge checkout path, temp path, or local
  absolute path patterns.
- `REQ-012`: The smoke emits a sanitized JSON report with case IDs, statuses,
  counts, observed page IDs, and quality-gap codes only.

## Compatibility

This is a local maintenance script and documentation addition. It does not
change public HTTP, MCP, A2A, source-registry, runtime, package, or OpenAPI
contracts.
