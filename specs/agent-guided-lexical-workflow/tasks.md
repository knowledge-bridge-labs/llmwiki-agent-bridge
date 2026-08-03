# Agent-Guided Lexical Workflow Tasks

- [x] Create the agent-guided lexical workflow spec.
- [x] Create the ADR for bridge surface responsibilities.
- [x] Record fixed contract decisions for mandatory primary query, exact
  `llmwiki_agent_guided_lexical_v1` query-variant capability gating,
  snake_case upstream to camelCase bridge mapping, and untrusted
  `retrievalGuidance`.
- [x] Adopt Serve as the canonical source for the V1 guidance schema.
- [x] Simplify bridge guidance mapping to the exact Serve field set:
  `schema_version`, `orientation_source`, `content_trust`,
  `max_query_variants`, `character_budget`, `folder_cards`, `page_cards`,
  `suggested_terms`, `exact_identifiers`, and `fallback_modes`.
- [x] Lock public `retrievalGuidance.orientationSource` to exactly `authored`,
  `projection_extractive`, or `none`.
- [x] Record that unknown or malformed source guidance is omitted entirely
  rather than partially forwarded.
- [x] Record that non-empty `search.queryVariants` is valid only when the
  effective retrieval search mode is `lexical` and is rejected before
  capability fallback for `literal`, `vector`, or `hybrid`.

## Implementation Tasks

- [x] Extend retrieval validation for `search.fields`,
  `search.excludePageIds`, and `search.queryVariants`.
- [x] Enforce `search.queryVariants` `maxItems: 2` before normalization.
- [x] Reject non-string or empty-after-trim `search.queryVariants` items.
- [x] Deduplicate query channels by Unicode NFC plus casefold while preserving
  first original spelling.
- [x] Reject non-empty `search.queryVariants` for effective `literal`,
  `vector`, and `hybrid` modes with HTTP `400` or JSON-RPC `-32602` before
  source fan-out and capability fallback.
- [x] Add bounded optional one-shot `retrievalGuidance` metadata outside the
  `retrieval` object, using the public camelCase guidance shape.
- [x] Update OpenAPI and MCP input schemas.
- [x] Preserve valid source-returned `retrieval_guidance` as public camelCase
  `retrievalGuidance` in `llmwiki_context` structured content.
- [x] Validate the exact Serve canonical guidance fields and omit the entire
  object when any required field is missing, malformed, unknown, over-budget,
  or `null`.
- [x] Map Serve top-level fields to public camelCase:
  `schemaVersion`, `orientationSource`, `contentTrust`, `maxQueryVariants`,
  `characterBudget`, `folderCards`, `pageCards`, `suggestedTerms`,
  `exactIdentifiers`, and `fallbackModes`.
- [x] Map nested `folder_cards[].page_count` to
  `folderCards[].pageCount`.
- [x] Map nested `page_cards[].page_id` and
  `page_cards[].exact_identifiers` to `pageCards[].pageId` and
  `pageCards[].exactIdentifiers`.
- [x] Add sanitized diagnostics for absent guidance from a source that
  advertises `llmwiki_agent_guided_lexical_v1`, and for invalid guidance.
- [x] Reject unknown, malformed, oversized, or unsafe caller-provided
  `retrievalGuidance` before source fan-out and request-body I/O logging.
- [x] Forward compatible `fields`, `snippet_chars`, `exclude_page_ids`, and
  `query_variants` to HTTP `llmwiki-serve` sources.
- [x] Forward compatible `fields`, `snippet_chars`, `exclude_page_ids`, and
  `query_variants` to MCP Knowledge Source tools.
- [x] Require exact source capability `llmwiki_agent_guided_lexical_v1` before
  forwarding upstream `query_variants`; do not treat generic
  `llmwiki_retrieval_v1` as sufficient.
- [x] Keep lexical fallback to legacy sources free of unsupported new fields.
- [x] Add focused evidence that lexical `queryVariants` with `fallback=none`
  and a selected source missing `llmwiki_agent_guided_lexical_v1` uses the
  unsupported-capability error path before source fan-out across HTTP, MCP, and
  A2A source protocols.
- [x] Make `compactSearchQueryVariants` and caller variant deduplication
  Unicode-safe.
- [x] Preserve exact identifiers, paths, issue IDs, package names, and version
  strings in variant handling.
- [x] Ensure every upstream lexical request includes the primary `query` and
  never relies on `query_variants` alone.
- [x] Validate source-prefixed `excludePageIds` and prevent cross-source
  suppression.
- [x] Update `/message:send` and `llmwiki_agent_run` to accept caller-supplied
  variants and optional `retrievalGuidance` metadata while remaining
  explicitly single-shot.
- [x] Update source tool descriptions to recommend
  `list_sources -> context -> search -> read`.
- [x] Update README and `docs/message-send-contract.md` after implementation.
- [x] Add Unicode, exact-identifier preservation, pass-through, compatibility,
  malformed input, limit, multi-source ordering, and privacy tests.
- [x] Add tests for all three public `orientationSource` values and exact
  Serve guidance mapping.
- [x] Add tests proving non-empty `queryVariants` with effective `literal`,
  `vector`, or `hybrid` mode is rejected before any source fan-out or
  capability fallback.
- [x] Add tests proving no model/vector dependency and no automatic semantic
  retrieval activation.
- [x] Regenerate and check `docs/openapi.json`.
- [x] Add changelog and version metadata only when this additive contract
  ships.

## Engineering Validation Evidence

- [x] Record sanitized dirty-snapshot engineering evidence in
  `specs/agent-guided-lexical-workflow/tests.md`; this evidence is not a
  public performance or release claim.
- [ ] Re-run final release gates from a clean commit and record publish or
  install-smoke evidence before public release claims.
