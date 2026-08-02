# Agent-Guided Lexical Workflow Tests

## Acceptance Coverage

- `llmwiki_list_sources`, `llmwiki_context`, `llmwiki_search`, and
  `llmwiki_read` descriptors describe the progressive source exploration path.
- `llmwiki_context` returns valid source-provided `retrieval_guidance` as
  public camelCase `retrievalGuidance` in structured content without treating
  any guidance field as instructions.
- `retrievalGuidance.orientationSource` accepts exactly `authored`,
  `projection_extractive`, and `none`; each enum value is covered by a
  separate context response fixture.
- A full valid source guidance object maps every top-level Serve V1 field:
  `schema_version` to `schemaVersion`,
  `orientation_source` to `orientationSource`,
  `content_trust` to `contentTrust`,
  `max_query_variants` to `maxQueryVariants`,
  `character_budget` to `characterBudget`,
  `folder_cards` to `folderCards`,
  `page_cards` to `pageCards`,
  `suggested_terms` to `suggestedTerms`,
  `exact_identifiers` to `exactIdentifiers`, and
  `fallback_modes` to `fallbackModes`.
- Valid nested `folder_cards[]` entries preserve array order and map
  `path`, `page_count`, and `terms` to `path`, `pageCount`, and `terms`.
- Valid nested `page_cards[]` entries preserve array order and map `page_id`,
  `title`, `path`, `headings`, `terms`, `exact_identifiers`, and `excerpt` to
  `pageId`, `title`, `path`, `headings`, `terms`, `exactIdentifiers`, and
  `excerpt`.
- Guidance containing any extra top-level or nested field, `null`, unknown
  schema version, unknown `orientation_source`, bad `content_trust`,
  over-budget content, or malformed nested shape omits the entire public
  `retrievalGuidance` object and adds a sanitized warning diagnostic.
- Absent source `retrieval_guidance` omits public `retrievalGuidance`; sources
  that advertised `llmwiki_agent_guided_lexical_v1` also produce a sanitized
  warning diagnostic.
- `llmwiki_search` without `retrieval` preserves existing request bodies.
- `/message:send` and `llmwiki_agent_run` without `retrieval` preserve existing
  source request bodies and result shapes.
- `/message:send` accepts optional `data.retrievalGuidance`, and
  `llmwiki_agent_run` accepts optional top-level `retrievalGuidance`, without
  changing single-shot behavior.
- Requests using `retrieval.guidance`, `retrieval.guidance.source`, or
  `data.retrieval.guidance` fail validation.
- `data.mode` and `data.orchestrationMode` remain orchestration controls only.
- `retrieval.searchMode` remains the source retrieval mode control.
- `retrieval.search.fields` accepts only a bounded array of strings and
  forwards `fields` unchanged to compatible sources.
- `retrieval.search.snippetChars` still maps to `snippet_chars`.
- `retrieval.search.excludePageIds` maps to `exclude_page_ids` for the
  matching source.
- Source-prefixed excluded page IDs with a different source ID fail with a
  sanitized bad-request error before source fan-out.
- `retrieval.search.queryVariants` maps to upstream `query_variants` for
  sources that advertise exactly `llmwiki_agent_guided_lexical_v1`.
- A source that advertises only `llmwiki_retrieval_v1` and a lexical
  search-mode capability receives no upstream `query_variants`.
- A lexical request with non-empty `queryVariants` targeting a source that
  lacks `llmwiki_agent_guided_lexical_v1` distinguishes fallback policy:
  `fallback: "lexical"` omits upstream `query_variants` with a sanitized
  diagnostic, while `fallback: "none"` fails before source fan-out with HTTP
  `400` `retrieval_mode_unsupported` or MCP `-32602`; the public error
  identifies `queryVariants` and exact `llmwiki_agent_guided_lexical_v1`, does
  not claim lexical `searchMode` is unsupported, and omits URLs, card/provider
  fields, and private query values.
- Non-empty `retrieval.search.queryVariants` with effective `literal`,
  `vector`, or `hybrid` mode returns HTTP `400` or JSON-RPC `-32602` with the
  existing invalid retrieval contract before capability fallback and before any
  source fan-out.
- Non-empty `retrieval.search.queryVariants` with `retrieval` present but
  `searchMode` omitted returns the existing invalid retrieval error before any
  source fan-out.
- Empty or omitted `queryVariants` remains compatible for lexical, literal,
  vector, and hybrid requests and follows existing retrieval-mode forwarding
  and fallback behavior.
- The base query is always included in upstream `query` even when variants are
  supplied.
- Caller-supplied variants are trimmed, must remain non-empty, duplicates are
  removed deterministically by Unicode NFC plus casefold comparison, and at
  most two supplied variants are accepted before normalization.
- The total deduplicated lexical channels are capped at three, including the
  mandatory primary query.
- Korean and non-Latin queries survive compaction and forwarding, for example
  a query containing `릴리즈`, `설치`, `패키지`, or `온보딩` must not become
  empty or ASCII-only.
- Exact identifiers survive variant handling, including `publish.yml`,
  `llmwiki-agent-bridge`, `#123`, `v0.4.1`, `CVE-2026-1234`, and
  `docs/message-send-contract.md`.
- Mixed Korean and English variants deduplicate only exact normalized matches,
  not different-language phrases.
- Legacy `llmwiki-http` and MCP sources that lack retrieval capabilities
  receive no `mode`, `fields`, `snippet_chars`, `exclude_page_ids`, or
  `query_variants` during lexical fallback.
- Compatible HTTP sources receive `mode`, `fields`, `snippet_chars`,
  `exclude_page_ids`, and, when they advertise exact
  `llmwiki_agent_guided_lexical_v1`, `query_variants` on `/search`.
- Compatible MCP sources receive `mode`, `fields`, `snippet_chars`,
  `exclude_page_ids`, and, when they advertise exact
  `llmwiki_agent_guided_lexical_v1`, `query_variants` on `llmwiki_search`.
- `llmwiki_context` forwards only context-compatible controls; if a source does
  not support a search-only control on context, the bridge omits it
  deterministically.
- Upstream `retrieval_guidance.orientation_source` from a compatible context
  response maps to public
  `structuredContent.llmwiki_context.retrievalGuidance.orientationSource`.
- `/message:send` uses caller-supplied query variants for bounded source search
  augmentation but does not claim or simulate runtime tool chaining.
- `llmwiki_agent_run` follows the same single-shot behavior as
  `/message:send`.
- Valid caller-provided `data.retrievalGuidance` and MCP top-level
  `retrievalGuidance` are accepted only as bounded untrusted traceability
  metadata outside `retrieval`.
- Unknown, malformed, oversized, or unsafe caller-provided
  `retrievalGuidance` fails before request-body I/O logging and source fan-out
  with HTTP `400` or JSON-RPC `-32602`.
- The agent card and docs do not claim runtime tool availability while
  `mcpServers` is empty.
- Malformed caller-provided `retrievalGuidance` metadata, oversized `fields`,
  oversized `excludePageIds`, oversized `queryVariants`, non-string variants,
  provider fields, URLs, local paths, credentials, raw vectors, and raw
  embeddings return sanitized HTTP `400` or JSON-RPC `-32602` errors.
- Multi-source fan-out preserves selected source order for variants,
  diagnostics, citations, source bundles, and results.
- Query variant and `retrievalGuidance` validation happens before request-body
  I/O debug logging.
- Audit and I/O logs omit source URLs, local roots, provider configuration,
  credentials, raw vectors, raw embeddings, and oversized `retrievalGuidance`
  payloads.
- `package.json` and `package-lock.json` contain no new ML, embedding,
  vector-store, ANN, numeric, or provider SDK dependency for this workflow.
- Generated `docs/openapi.json` matches `src/index.mjs`.

## Fake Source Strategy

- `guided-http-source`: advertises `llmwiki_retrieval_v1`,
  `llmwiki_search_mode_lexical`, and `llmwiki_agent_guided_lexical_v1`, then
  records `/search` bodies for `fields`, `snippet_chars`,
  `exclude_page_ids`, and `query_variants`.
- `guided-mcp-source`: advertises `llmwiki_retrieval_v1`,
  `llmwiki_search_mode_lexical`, and `llmwiki_agent_guided_lexical_v1`, then
  records `llmwiki_context` and `llmwiki_search` arguments.
- `retrieval-only-source`: advertises `llmwiki_retrieval_v1` and
  `llmwiki_search_mode_lexical` but fails the test if it receives
  `query_variants`.
- `legacy-http-source`: fails the test if lexical fallback sends new
  unsupported fields.
- `legacy-mcp-source`: fails the test if lexical fallback sends new
  unsupported fields.
- `guidance-source`: returns full valid `retrieval_guidance` fixtures for
  `authored`, `projection_extractive`, and `none`, including every top-level
  and nested Serve canonical field, plus prompt-like text inside excerpts so
  tests can prove the bridge maps evidence without executing instructions.
- `unknown-guidance-source`: returns unknown schema, unknown orientation enum,
  unknown extra fields, and bad `content_trust` fixtures to prove diagnostics
  and whole-object omission behavior.
- `malformed-guidance-source`: returns malformed recognized guidance shapes to
  prove sanitized diagnostics, omission, and continued tool/one-shot behavior.
- `multi-source-prefix-source`: uses overlapping page IDs across sources to
  prove `excludePageIds` prefix handling cannot suppress pages from the wrong
  source.

## Commands

```sh
npm run lint
npm run contracts:check
node --test test/agent-bridge.test.mjs
npm run check
git diff --check
```

## Engineering Validation Evidence

These records are sanitized engineering evidence from dirty local or lab
snapshots. They are not public release or performance claims and do not replace
clean-commit release, publish, or install-smoke evidence.

- Windows dirty snapshot: full Node test suite 140 passed; focused
  retrieval/guided lexical slice 15 passed.
- DGX dirty snapshot: full Node test suite 140 passed; deterministic
  cross-repo validation 29/29 passed using a real Qwen tool-call harness. This
  was not DeepAgents ACP validation.
