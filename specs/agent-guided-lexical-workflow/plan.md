# Agent-Guided Lexical Workflow Plan

## Implementation

1. Extend retrieval validation without breaking existing requests.
   - Keep `schemaVersion`, `searchMode`, `fallback`, and existing
     `search.limit` / `search.snippetChars`.
   - Add bounded `search.fields`, `search.excludePageIds`, and
     `search.queryVariants`.
   - Define the effective retrieval search mode before capability fallback:
     omitted `retrieval` defaults to legacy lexical behavior, valid
     `retrieval.searchMode` is authoritative when present, and a V1
     `retrieval` object that omits `searchMode` remains invalid.
   - Reject non-empty `search.queryVariants` unless the effective retrieval
     search mode is `lexical`, before capability fallback, source fan-out, and
     request-body I/O logging.
   - Keep caller-provided guidance metadata outside `retrieval` as optional
     `data.retrievalGuidance` on `/message:send` and `retrievalGuidance` on
     `llmwiki_agent_run`.
   - Reject unknown, oversized, provider-shaped, vector-shaped, credential,
     URL, local-path, cache, and download fields before source calls and before
     I/O request logging.
2. Make query variant handling Unicode-safe.
   - Preserve Korean, CJK, accented Latin text, code identifiers, paths,
     package names, issue IDs, and version strings.
   - Require at most two supplied variants before normalization.
   - Reject non-string or empty-after-trim variants.
   - Deduplicate channels by Unicode NFC plus casefold comparison.
   - Preserve first original spelling and cap channels at the primary query
     plus at most two additional variants.
3. Update MCP-style source tool descriptors and implementation.
   - Document the intended
     `llmwiki_list_sources -> llmwiki_context -> llmwiki_search -> llmwiki_read`
     host-agent flow.
   - Accept retrieval search controls on `llmwiki_context` and
     `llmwiki_search`.
   - Preserve valid source-returned `retrieval_guidance` as public camelCase
     `retrievalGuidance` using the exact Serve canonical V1 schema.
   - Treat Serve as the canonical schema owner; bridge implementation validates
     and maps it, but does not extend it.
   - Omit the entire public guidance object when source guidance is absent,
     unknown, malformed, over-budget, `null`, or contains extra fields.
   - Enforce public `retrievalGuidance.orientationSource` values of exactly
     `authored`, `projection_extractive`, or `none`.
   - Forward `fields`, `snippet_chars`, `exclude_page_ids`, and
     `query_variants` to compatible HTTP and MCP Knowledge Sources.
   - Forward `query_variants` only when the source advertises exactly
     `llmwiki_agent_guided_lexical_v1`; `llmwiki_retrieval_v1` alone is not
     sufficient.
   - Route and strip source-prefixed `excludePageIds` only for the matching
     source.
4. Update one-shot run handling.
   - Accept the same additive retrieval search controls on `/message:send` and
     `llmwiki_agent_run`.
   - Accept optional untrusted `retrievalGuidance` metadata outside
     `retrieval`.
   - Reject unknown, malformed, oversized, or unsafe caller-supplied
     `retrievalGuidance` before source fan-out and request-body I/O logging.
   - Apply the same source-response guidance normalization and diagnostic
     policy before adding source context to one-shot evidence bundles.
   - Use caller-supplied query variants for bounded source search augmentation
     while always sending the primary upstream `query`.
   - Keep the run single-shot and do not claim runtime tool chaining while the
     agent card advertises no runtime tools.
5. Update contract artifacts and docs after implementation.
   - Regenerate `docs/openapi.json`.
   - Update `docs/message-send-contract.md` and README source-tool guidance.
   - Keep A2A-style and MCP-style compatibility wording conservative.
   - Add changelog and version metadata only when the implementation ships.
6. Add focused tests.
   - Unicode query variants.
   - Pass-through mapping.
   - Full source guidance mapping for all `orientationSource` enum values and
     every Serve canonical field.
   - Unknown and malformed source guidance diagnostics.
   - Unknown and malformed caller `retrievalGuidance` rejection.
   - Non-empty `queryVariants` rejection for effective literal, vector, and
     hybrid modes before capability fallback.
   - Omitted-field compatibility.
   - Limits and malformed data.
   - Multi-source fan-out.
   - Privacy and redaction.
   - No automatic model/vector activation.

## Affected Modules

- `src/index.mjs`
  - OpenAPI schema generator
  - MCP tool descriptors
  - retrieval intent parser and redactor
  - `compactSearchQueryVariants`
  - source-tool run path
  - HTTP and MCP source forwarding
  - one-shot evidence gathering
  - source-prefixed page ID routing
- `docs/openapi.json`
- `docs/message-send-contract.md`
- `README.md`
- `CHANGELOG.md` when released
- `package.json` and `package-lock.json` when released
- `test/agent-bridge.test.mjs`
- fake source fixtures if new coverage is easier to isolate

No ML, embedding, vector-store, ANN, numeric, or provider SDK dependency should
be added for this workflow.

## Rollout

1. Ship as an additive public-preview contract.
2. Keep raw default retrieval lexical and legacy-compatible.
3. Teach docs and tool descriptions that capable host agents should read
   context first, then search with precise variants, then read pages.
4. Keep vector and hybrid modes explicit, source-owned fallbacks.

## Risks

- ASCII-only token normalization can silently erase Korean and other non-Latin
  queries. The implementation must make this a regression test.
- `queryVariants` can over-broaden search. The cap, deduplication, and selected
  source ordering must be deterministic.
- Caller-supplied `retrievalGuidance` metadata can contain prompt injection
  text. The bridge must mark it untrusted and never execute it.
- Generic retrieval capability can be mistaken for query-variant support. The
  implementation must require exact `llmwiki_agent_guided_lexical_v1` before
  forwarding `query_variants`.
- Source guidance can drift from Serve's canonical schema. The bridge must
  omit unknown or malformed guidance instead of partially forwarding it.
- Source-prefixed excluded page IDs can hide evidence from the wrong source if
  prefixes are not checked before stripping.
- Public docs can overstate `/message:send` as agentic tool use. The one-shot
  contract must stay explicit until a runtime tool surface exists.
