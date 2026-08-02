# Retrieval Mode Forwarding Tests

## Acceptance Coverage

- `/message:send` without `data.retrieval` sends the same legacy request body to
  fake legacy `llmwiki-http` sources as the current implementation.
- `llmwiki_agent_run` without `retrieval` follows the same internal run path as
  `/message:send` and does not add an upstream `mode`.
- `llmwiki_context` and `llmwiki_search` without `retrieval` preserve current
  tool behavior and source request bodies.
- `data.mode` and `data.orchestrationMode` still accept only
  `evidence-only`, `delegated-runtime`, and `hybrid`.
- `data.retrieval.searchMode` accepts only `lexical`, `literal`, `vector`, and
  `hybrid`.
- The accepted `searchMode` enum is static, while runtime availability is
  decided by exact source capability strings.
- Exact capability strings are recognized case-sensitively:
  `llmwiki_retrieval_v1`,
  `llmwiki_search_mode_lexical`,
  `llmwiki_search_mode_literal`,
  `llmwiki_search_mode_vector`, and
  `llmwiki_search_mode_hybrid`.
- Capability spelling variants, casing variants, aliases, or dotted names are
  not treated as matches.
- Unknown retrieval modes and unknown retrieval fields return HTTP `400` with
  `error.code: "invalid_retrieval_intent"` or JSON-RPC `-32602`.
- Score threshold fields, draft-control fields, and any other v1 search fields
  besides `limit`, `snippetChars`, `fields`, `excludePageIds`, and
  `queryVariants` are rejected after the agent-guided lexical extension.
- `queryVariants` is accepted by the bridge schema but maps to upstream
  `query_variants` only when the source advertises exactly
  `llmwiki_agent_guided_lexical_v1`; `llmwiki_retrieval_v1` alone is not
  sufficient.
- `queryVariants` accepts at most two supplied items before normalization, and
  every item must trim to a non-empty string.
- Query channel deduplication uses Unicode NFC plus casefold comparison while
  preserving the first original spelling.
- Non-empty `queryVariants` is valid only when the effective retrieval search
  mode is `lexical`.
- The effective retrieval search mode is legacy `lexical` when `retrieval` is
  omitted, is `retrieval.searchMode` when a valid retrieval object is present,
  and is invalid when a v1 retrieval object omits `searchMode`.
- Non-empty `queryVariants` with effective `literal`, `vector`, or `hybrid`
  returns HTTP `400` or JSON-RPC `-32602` through the invalid retrieval
  contract before capability fallback and before any source fan-out.
- That invalid-retrieval path is distinct from `fallback: "none"`
  unsupported-capability failures: lexical-only `queryVariants` violations use
  `invalid_retrieval_intent`, while selected-source capability failures use
  `retrieval_mode_unsupported` for HTTP and JSON-RPC `-32602` for MCP.
- Empty or omitted `queryVariants` remains compatible for lexical, literal,
  vector, and hybrid retrieval-mode forwarding.
- Retrieval payloads containing `embedding`, `embeddings`, `vector`,
  `vectors`, `provider`, `providers`, `model`, `modelName`, `modelPath`,
  `endpoint`, `endpoints`, `baseUrl`, `baseURL`, `cache`, `cacheDir`,
  `download`, `downloads`, `apiKey`, `authorization`, `token`, `secret`,
  `password`, or similar sensitive/provider fields are rejected before source
  calls and before request I/O logging.
- Public clients cannot choose provider/model/endpoints, send embeddings, set
  cache paths, or trigger downloads through HTTP, MCP, or A2A bridge entry
  points.
- A fake new `llmwiki-http` source advertising `llmwiki_retrieval_v1` and
  `llmwiki_search_mode_vector` receives `mode: "vector"` on `/query` and
  `/search`.
- A fake new `llmwiki-http` source advertising `llmwiki_retrieval_v1` and
  `llmwiki_search_mode_hybrid` receives `mode: "hybrid"` on `/query` and
  `/search`.
- A fake new `llmwiki-http` source receives `limit` and `snippet_chars` when
  the bridge request uses `retrieval.search.limit` and
  `retrieval.search.snippetChars`.
- A compatible lexical `llmwiki-http` source receives additive `fields` and
  `exclude_page_ids`; it receives `query_variants` only when it also advertises
  `llmwiki_agent_guided_lexical_v1`.
- A fake legacy `llmwiki-http` source without retrieval capabilities receives
  no `mode` field when a vector request uses `fallback: "lexical"`.
- A vector request with `fallback: "none"` and any selected legacy source fails
  before fan-out, returns HTTP `400` or JSON-RPC `-32602`, and reports a
  sanitized actionable error.
- A lexical request with retrieval intent and a capability-unknown source uses
  legacy lexical fallback with a diagnostic when `fallback: "lexical"` and
  fails before fan-out when `fallback: "none"`.
- A selected source whose fresh safe source-bundle/manifest/MCP
  source-bundle/A2A agent-card metadata conflicts with inline or persisted
  capabilities is routed according to the fresh metadata for that request.
- A selected source with failed discovery and no descriptor capabilities is
  treated as capability-unknown, not as vector/hybrid-capable.
- Mixed old/new source runs with `fallback: "lexical"` return diagnostics in
  selected source order, not response completion order.
- MCP fake source tools advertising retrieval capabilities receive
  `mode: "vector"` or `mode: "hybrid"` in `llmwiki_context` and
  `llmwiki_search` arguments.
- MCP fake source tools receive `limit` and `snippet_chars` when the bridge
  request uses `retrieval.search.limit` and `retrieval.search.snippetChars`.
- MCP fake source tools receive additive `fields` and `exclude_page_ids` only
  for compatible sources; they receive `query_variants` only with exact
  `llmwiki_agent_guided_lexical_v1`.
- Legacy MCP fake source tools receive no `mode` during lexical fallback.
- A fake A2A source advertising `llmwiki_retrieval_v1` receives validated
  `data.retrieval` with only allowed v1 fields; a legacy A2A source receives
  legacy `data.query` only during lexical fallback.
- A fake A2A source receives `data.retrieval.search.queryVariants` only when it
  also advertises exactly `llmwiki_agent_guided_lexical_v1`.
- Result artifact fields remain unchanged; retrieval diagnostics appear only in
  existing result-level diagnostics, trace-step diagnostics, or MCP error
  surfaces.
- HTTP, MCP, and A2A source-protocol `fallback: "none"`
  unsupported-capability failures do not call any source query/search/message
  endpoint.
- Audit and I/O logging tests include canaries proving provider credentials,
  provider/model/cache/download field values, endpoint URLs, local paths, raw
  user query text from rejected requests, and vector arrays are not emitted.
- Runtime-log canary tests exercise sensitive fields nested inside
  `data.retrieval`, adjacent to `data.retrieval`, and in error objects so the
  recursive redactor is covered.
- Generated `docs/openapi.json` matches `src/index.mjs`.
- `package.json` and `package-lock.json` contain no ML, embedding, vector-store,
  ANN, numeric, or provider SDK dependency added by this bridge feature.
- Changelog and package version are updated when the implementation ships.

## Fake Source Strategy

- `legacy-http-source`: accepts current `/query` and `/search` bodies and fails
  the test if `mode` is present.
- `retrieval-http-source`: advertises retrieval capabilities through safe
  manifest/source-bundle metadata and records incoming `mode` values.
- `retrieval-http-conflict-source`: declares stale inline capabilities but
  returns fresh safe discovery metadata with a different supported mode, proving
  fresh metadata wins for the request.
- `unknown-http-source`: fails discovery and has no descriptor capabilities,
  proving capability-unknown fallback/error behavior.
- `legacy-mcp-source`: exposes `llmwiki_context` and `llmwiki_search` but no
  retrieval capabilities; fails the test if `mode` is present.
- `retrieval-mcp-source`: advertises retrieval capabilities and records tool
  arguments.
- `legacy-a2a-source`: accepts current `{ data: { query } }` messages only.
- `retrieval-a2a-source`: advertises `llmwiki_retrieval_v1` and records
  forwarded `data.retrieval`.

## Commands

```sh
npm run lint
npm run contracts:check
node --test test/agent-bridge.test.mjs
npm run check
git diff --check
```
