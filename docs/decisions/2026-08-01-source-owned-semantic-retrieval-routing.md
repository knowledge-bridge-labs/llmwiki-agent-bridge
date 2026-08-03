# ADR: Source-Owned Semantic Retrieval And Capability-Based Routing

## Status

Accepted.

## Context

The bridge is a fan-out and runtime-synthesis layer. It gathers evidence from
selected Knowledge Sources, optionally calls a configured runtime, and returns a
normalized result artifact. It does not own source projections or source
indexes.

Semantic retrieval changes that boundary. Embeddings and vector indexes depend
on the source corpus, adapter, draft policy, projection signature, cache
invalidation rules, embedding model, and local storage. Those concerns are
owned by a Knowledge Source such as `llmwiki-serve`, not by the bridge.

The existing A2A-style request already has `data.mode` and
`data.orchestrationMode` for bridge orchestration. Reusing that field for
retrieval would make requests ambiguous and could break clients that already
use `mode: "evidence-only"` or `mode: "delegated-runtime"`.

## Decision

The bridge will treat semantic retrieval as source-owned. It will not embed
documents or queries, will not build a vector index, and will not add ML,
embedding, vector-store, or ANN dependencies.

Retrieval intent will be expressed through an additive namespace:
`data.retrieval` for `/message:send` and `retrieval` for MCP
`llmwiki_agent_run`, `llmwiki_context`, and `llmwiki_search`.

The v1 namespace is `schemaVersion: "llmwiki.retrieval.v1"`. It supports
`searchMode: "lexical" | "literal" | "vector" | "hybrid"` and
`fallback: "lexical" | "none"`. Search options are narrowly scoped to bounded
retrieval controls: `limit` and `snippetChars`. `snippetChars` maps to
`snippet_chars` for compatible upstream `llmwiki-serve` HTTP and MCP source
contracts. Score-threshold controls are intentionally excluded from v1 because
lexical, vector cosine, and hybrid RRF scores are not comparable.
Clients cannot select provider credentials, provider endpoints, model paths,
cache paths, download behavior, or raw embedding vectors in v1.

Historical reconciliation note: the 2026-08-02 agent-guided lexical ADR/spec
supersedes this V1 `retrieval.search` option allowlist in part by adding
`fields`, `excludePageIds`, and lexical-only `queryVariants` under its bounded
validation and capability-gating rules.

`data.mode` remains an orchestration field. It is not an alias for
`data.retrieval.searchMode`.

Sources advertise retrieval support through capabilities:

- `llmwiki_retrieval_v1`
- `llmwiki_search_mode_lexical`
- `llmwiki_search_mode_literal`
- `llmwiki_search_mode_vector`
- `llmwiki_search_mode_hybrid`

These exact, case-sensitive strings are shared with `llmwiki-serve`. The bridge
will not accept spelling variants, casing variants, aliases, or dotted names as
capability matches.

The bridge forwards any explicit retrieval mode only to sources that advertise
both `llmwiki_retrieval_v1` and the matching mode capability. For compatible
`llmwiki-serve` sources, the bridge maps the applied retrieval mode to the
existing upstream query/search `mode` field. For legacy lexical fallback, the
bridge preserves the existing request body and omits `mode`.

The bridge accepts a static request enum of `lexical`, `literal`, `vector`, and
`hybrid`, but runtime availability is source-specific. When retrieval intent is
present, the bridge resolves capabilities for every selected ready source
before any source query, search, or A2A message fan-out. Fresh safe discovery
metadata from source-bundle, manifest, MCP source-bundle, or A2A agent-card
discovery overrides inline or persisted descriptor capabilities for that
request. If fresh discovery is unavailable, inline or persisted descriptor
capabilities may be used. If no safe capability metadata is available, the
source is capability-unknown.

If a selected source cannot satisfy a requested mode and `fallback` is
`lexical`, the bridge uses the existing lexical source request and emits a
redacted diagnostic through existing diagnostics/warnings surfaces. If
`fallback` is `none`, the bridge fails before source fan-out with a sanitized,
actionable error.

The production `llmwiki_agent_result` schema is not changed. Retrieval
fallbacks and routing warnings use existing result-level diagnostics,
trace-step diagnostics, and MCP error surfaces.

The bridge validates or sanitizes retrieval payloads before request-body I/O
logging. It rejects public client attempts to send embeddings or provider
configuration, and the log redactor recursively removes retrieval-shaped
sensitive fields, including vectors, provider/model/cache/download fields,
endpoint URLs, credentials, and local paths.

## Consequences

- Existing clients and legacy sources keep the current default lexical path
  when retrieval intent is omitted.
- The bridge remains lightweight and does not inherit model download,
  embedding-cache, vector-store, GPU, or provider-credential responsibilities.
- Knowledge Sources can independently improve lexical, vector, and hybrid
  retrieval without changing bridge runtime synthesis.
- Mixed-source runs are explicit: capable sources can use vector or hybrid
  retrieval while legacy sources either fall back to lexical with diagnostics or
  block the request when the caller sets `fallback: "none"`.
- Docs and tests must clearly distinguish bridge orchestration mode from source
  retrieval mode.
- The bridge must update its public package version and changelog when this
  additive contract ships.
- The bridge stays dependency-light: no ML, embedding, vector-store, ANN,
  numeric, or provider SDK dependency should be added for this routing feature.
- Fallback diagnostics can make mixed-source behavior visible without exposing
  private source URLs, provider details, embeddings, or raw user prompts.

## Follow-ups

- Implement the contract in `src/index.mjs` and regenerate `docs/openapi.json`.
- Add old/new fake source tests for HTTP, MCP, and A2A entry paths.
- Add runtime-log canary tests proving unsafe retrieval/provider/vector fields
  are rejected or redacted before `emitIoLog`.
- Add tests proving fresh safe discovery metadata wins over stale descriptor
  capability metadata for the current request.
- Update `docs/message-send-contract.md`, README routing guidance, and examples.
- Bump `package.json`/`package-lock.json`, add a changelog entry, and verify the
  npm package contents before release.
- Coordinate with the `llmwiki-serve` contract so serve advertises retrieval
  capabilities and accepts the existing `mode` field on query/search endpoints.
- Add redaction tests for provider-shaped fields, provider/model/cache/download
  controls, endpoint URLs, credentials, local paths, and raw vectors.

## Links

- Spec: `specs/retrieval-mode-forwarding/`
- Message contract: `docs/message-send-contract.md`
- OpenAPI contract: `docs/openapi.json`
