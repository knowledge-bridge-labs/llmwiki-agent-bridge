# Retrieval Mode Forwarding Tasks

> This checklist records the completed base retrieval-mode-forwarding work.
> The agent-guided lexical extension supersedes the v1 `search` allowlist with
> `fields`, `excludePageIds`, and `queryVariants`; its detailed implementation
> status is tracked in `specs/agent-guided-lexical-workflow/tasks.md`.
> That extension defines `queryVariants` as `maxItems: 2` before normalization,
> non-empty after trimming, NFC plus casefold deduplicated, and lexical-only.
> Existing evidence for the split error and no-fanout behavior is in
> `test/agent-bridge.test.mjs`: invalid retrieval/query-variant cases,
> `retrieval_mode_unsupported`, and HTTP/MCP/A2A source-protocol no-fanout
> coverage.

- [x] Create the retrieval forwarding spec.
- [x] Create the source-owned retrieval ADR.
- [x] Lock exact capability constants shared with serve:
  `llmwiki_retrieval_v1` and
  `llmwiki_search_mode_lexical|literal|vector|hybrid`.
- [x] Add `RetrievalIntent` OpenAPI schema and MCP input schemas.
- [x] Keep static accepted search modes clear while treating source support as
  runtime capability availability.
- [x] Implement retrieval intent validation for `schemaVersion`, `searchMode`,
  `fallback`, and allowed `search` fields: `limit`, `snippetChars`, `fields`,
  `excludePageIds`, and `queryVariants`.
- [x] Reject unsafe retrieval/provider fields, including embedding/vector
  arrays, provider/model/cache/download controls, endpoint URLs, and
  credential-like fields.
- [x] Validate or sanitize retrieval before request-body `emitIoLog` events.
- [x] Add recursive I/O log redaction for retrieval-shaped sensitive fields
  outside the `retrieval` object.
- [x] Resolve source retrieval capabilities deterministically before fan-out
  when retrieval intent is present.
- [x] Prefer fresh safe source-bundle/manifest/MCP source-bundle/A2A agent-card
  metadata over inline or persisted descriptors for the current request.
- [x] Implement capability-unknown handling: lexical fallback plus diagnostic
  only when `fallback=lexical`, and request failure before fan-out when
  `fallback=none`.
- [x] Forward `mode` to capable `llmwiki-http` `/query` and `/search` calls.
- [x] Map bridge `search.snippetChars` to serve `snippet_chars` and
  `search.limit` to `limit` for HTTP sources.
- [x] Map bridge `search.fields`, source-routed `search.excludePageIds`, and
  exact-capability-gated `search.queryVariants` to `fields`,
  `exclude_page_ids`, and `query_variants` for HTTP sources.
- [x] Forward `mode` to capable MCP `llmwiki_context` and `llmwiki_search`
  calls.
- [x] Map bridge `search.snippetChars` to MCP source `snippet_chars` and
  `search.limit` to `limit`.
- [x] Map bridge `search.fields`, source-routed `search.excludePageIds`, and
  exact-capability-gated `search.queryVariants` to `fields`,
  `exclude_page_ids`, and `query_variants` for MCP source tools.
- [x] Forward validated `data.retrieval` to capable A2A sources.
- [x] Forward `data.retrieval.search.queryVariants` to A2A sources only when
  they advertise exact `llmwiki_agent_guided_lexical_v1`.
- [x] Reject or omit any public client attempt to choose provider/model,
  endpoint, cache, download behavior, or embeddings.
- [x] Add lexical fallback diagnostics through existing diagnostics surfaces.
- [x] Return HTTP `400` with `error.code: "invalid_retrieval_intent"` and
  JSON-RPC `-32602` for invalid retrieval payloads and lexical-only
  `queryVariants` violations before source fan-out.
- [x] Return HTTP `400` with `error.code: "retrieval_mode_unsupported"` and
  JSON-RPC `-32602` for `fallback=none` unsupported-capability failures before
  source fan-out.
- [x] Preserve legacy request bodies when retrieval intent is omitted.
- [x] Preserve old-source fallback distinctions: truly legacy or
  capability-unknown sources keep the old single-primary-query lexical request
  shape, while lexical-capable sources that lack only guided lexical support
  keep supported lexical options but omit `query_variants` with diagnostics.
- [x] Preserve Korean and non-Latin Unicode plus exact identifiers during
  query-variant validation, deduplication, and forwarding.
- [x] Normalize strict Serve `retrieval_guidance` to public camelCase
  `retrievalGuidance` without partially forwarding malformed guidance.
- [x] Add old-source, new-source, and mixed-source tests.
- [x] Add fresh-discovery-overrides-descriptor capability tests.
- [x] Add source-protocol no-fanout tests for `fallback=none` unsupported or
  unknown HTTP, MCP, and A2A sources.
- [x] Add runtime-log canary tests for provider fields, model names, endpoints,
  cache/download fields, credentials, local paths, and vector arrays.
- [x] Add redaction tests for provider fields, credentials, and vector arrays.
- [x] Add tests proving the bridge has no ML/vector dependency and package lock
  does not gain one.
- [x] Update message contract docs, README routing guidance, and examples.
- [x] Regenerate OpenAPI and run contract checks.
- [x] Bump package version and lockfile version for the additive public
  contract.
- [x] Add changelog entry for retrieval forwarding.
- [x] Verify npm package contents include updated public docs and generated
  contracts.
- [ ] Re-run final release gates from a clean commit and record publish or
  install-smoke evidence before public release claims.
