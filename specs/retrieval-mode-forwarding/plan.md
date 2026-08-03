# Retrieval Mode Forwarding Plan

## Implementation

1. Add `RetrievalIntent` parsing and validation helpers.
   - Accept `data.retrieval` for `/message:send`.
   - Accept `retrieval` for MCP `llmwiki_agent_run`, `llmwiki_context`, and
     `llmwiki_search`.
   - Accept only `schemaVersion`, `searchMode`, `fallback`, and allowed
     `search` fields in v1. The base retrieval-mode contract started with
     `search.limit`/`search.snippetChars`; the agent-guided lexical extension
     supersedes that allowlist with additive `search.fields`,
     `search.excludePageIds`, and `search.queryVariants`.
   - Validate `search.queryVariants` with `maxItems: 2` before normalization,
     require every item to trim to a non-empty string, deduplicate effective
     channels by Unicode NFC plus casefold comparison, and reject non-empty
     variants unless the effective retrieval search mode is `lexical`.
   - Reject unknown fields, unknown modes, provider/model/cache/download
     fields, provider endpoints, credentials, and raw vector arrays.
   - Validate and sanitize retrieval before the first `emitIoLog` call that can
     include the parsed request body.
2. Add OpenAPI and MCP schema coverage.
   - Extend `MessageSendData`.
   - Extend the three MCP tool descriptors.
   - Regenerate `docs/openapi.json`.
   - Keep the accepted search-mode enum static:
     `lexical | literal | vector | hybrid`. Runtime source capabilities decide
     availability.
3. Add source capability resolution.
   - Lock exact case-sensitive capability strings:
     `llmwiki_retrieval_v1`,
     `llmwiki_search_mode_lexical`,
     `llmwiki_search_mode_literal`,
     `llmwiki_search_mode_vector`, and
     `llmwiki_search_mode_hybrid`.
   - Resolve capabilities for every selected ready source before any query,
     search, or A2A message fan-out when retrieval intent is present.
   - Prefer fresh safe discovery metadata from source-bundle, manifest, MCP
     source-bundle, or A2A agent-card discovery over inline or persisted
     descriptors for the current request.
   - Treat unavailable discovery and missing capabilities as
     capability-unknown.
   - Preserve existing selected-source ordering.
   - Run request-shape validation, including lexical-only query-variant
     validation, before this capability-resolution phase.
   - Resolve each source to requested mode, lexical fallback, or request error.
4. Forward retrieval intent to source calls.
   - `llmwiki-http`: add `mode` to `/query` and `/search` only when the source
     advertises retrieval support.
   - `llmwiki-http`: map `search.limit` to `limit` and `search.snippetChars` to
     `snippet_chars`.
   - MCP source: add `mode` to `llmwiki_context` and `llmwiki_search` only when
     the source advertises retrieval support.
   - MCP source: map `search.limit` to `limit` and `search.snippetChars` to
     `snippet_chars`.
   - HTTP and MCP sources: map additive lexical `search.fields` to `fields` and
     `search.excludePageIds` to `exclude_page_ids` only for compatible sources.
   - HTTP and MCP sources: map additive lexical `search.queryVariants` to
     `query_variants` only when the source advertises exactly
     `llmwiki_agent_guided_lexical_v1`; generic `llmwiki_retrieval_v1` alone is
     not sufficient.
   - A2A source: forward validated `data.retrieval` only when the source
     advertises retrieval support.
   - A2A source: forward `data.retrieval.search.queryVariants` only when the
     source also advertises exactly `llmwiki_agent_guided_lexical_v1`.
   - Preserve legacy request bodies when no retrieval intent is supplied or
     lexical fallback targets a legacy source.
   - Never forward provider/model/cache/download settings, endpoint URLs, or
     embedding vectors.
5. Add diagnostics through existing compatible surfaces.
   - Use current result-level diagnostics and trace-step diagnostics.
   - Keep diagnostics stable in selected source order.
   - For `fallback: "none"`, return HTTP `400` or JSON-RPC `-32602` before
     source fan-out.
   - For `fallback: "lexical"`, add structured warning diagnostics without
     changing the production `llmwiki_agent_result` schema.
   - Redact sensitive fields recursively and reject vector/provider payloads
     before request I/O logging.
6. Update docs and examples.
   - `docs/message-send-contract.md`
   - README routing guidance
   - `examples/message-send.local.json` only if an additive example is useful
7. Add contract, unit, and integration tests with old and new fake source nodes.
8. Prepare release metadata.
   - Bump the npm package version.
   - Add a changelog entry that names the additive retrieval forwarding
     contract.
   - Confirm package contents and generated contract artifacts before release.

## Affected Modules

- `src/index.mjs`
  - OpenAPI schema generator
  - MCP tool descriptors
  - `/message:send` request parsing
  - `emitIoLog` request-ordering and recursive redaction helpers
  - source descriptor normalization
  - source capability discovery
  - source query/search forwarding
  - diagnostics and redaction helpers
- `docs/openapi.json`
- `docs/message-send-contract.md`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `test/agent-bridge.test.mjs`
- fake source fixtures added under `test/fixtures/` if needed

No package dependency changes are expected. If an implementation adds any ML,
vector, embedding, provider, ANN, or numeric dependency to this repository, it
violates this plan.

## Rollout

1. Ship as an additive public-preview contract.
2. Keep the default path lexical and legacy-compatible.
3. Document that semantic retrieval requires source support, such as a
   compatible `llmwiki-serve` release that exposes the existing query/search
   `mode` field and retrieval capabilities.
4. Keep future retrieval modes blocked until the bridge contract names them.

## Risks

- Capability metadata can be stale when supplied inline by a client. The bridge
  must prefer fresh safe discovery metadata for the current request when
  source-bundle, manifest, MCP source-bundle, or A2A agent-card discovery
  succeeds. Discovery must stay bounded by existing source-policy and timeout
  controls.
- Legacy sources may reject an unexpected `mode` field. The bridge must omit
  `mode` when falling back to a legacy lexical request.
- Mixed-source vector/hybrid requests can look successful while some sources
  fell back to lexical. Diagnostics must make that visible without changing the
  result artifact schema.
- I/O debug logs are more verbose than safe audit logs. Validation and logging
  must include canary checks proving provider/model/cache/download fields,
  endpoint URLs, credentials, vector arrays, source URLs, and local paths are
  absent from emitted events.
- Public clients may assume a static enum means all modes are available. Docs
  and diagnostics must state that runtime support is source-specific.
