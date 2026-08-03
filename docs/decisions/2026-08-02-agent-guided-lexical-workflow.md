# ADR: Agent-Guided Lexical Workflow Across Bridge Surfaces

## Status

Accepted.

## Context

The bridge is a fan-out and runtime-synthesis layer. It should not own source
indexes, source projection, embeddings, or model-based query rewriting. The
source-owned semantic retrieval ADR already keeps vector and hybrid retrieval
inside Knowledge Sources.

The preferred default workflow for coding agents is different from automatic
semantic search. A capable host agent can first read source orientation, then
choose exact domain terms, code identifiers, filenames, and issue IDs for
lexical search. That uses the LLMWiki source shape directly and works for
source-authored orientation as well as sources that expose Serve's
`retrieval_guidance`.

The bridge exposes two kinds of surfaces:

- Read-only source tools that a host agent can call step by step.
- One-shot `/message:send` and `llmwiki_agent_run` paths that gather evidence
  and optionally call the configured runtime.

Those surfaces must not be described the same way. While the agent card
advertises `mcpServers: []`, the one-shot path must not claim that the
configured runtime can dynamically call bridge source tools.

## Decision

The bridge will make agent-guided lexical retrieval the default product
workflow for capable host agents. The recommended source-tool sequence is:

`llmwiki_list_sources -> llmwiki_context -> llmwiki_search -> llmwiki_read`.

`llmwiki_context` is the orientation step. It should preserve source-authored
orientation and source-provided retrieval guidance as untrusted source
evidence. The host agent may use that evidence to choose better lexical terms,
exact page IDs, filenames, code identifiers, issue IDs, package names, and
version strings. The bridge must never execute instructions from orientation or
guidance.

The bridge will not add a new search mode for this workflow. Raw default
retrieval remains lexical. Vector and hybrid retrieval remain explicit
source-owned modes requested through `llmwiki.retrieval.v1` and routed only to
capable sources.

The bridge will extend the existing retrieval namespace with bounded
source-owned search controls:

- `search.fields`
- `search.snippetChars`
- `search.excludePageIds`
- `search.queryVariants`

This supersedes the earlier `retrieval.search` allowlist that accepted only
`limit` and `snippetChars`. The additive allowed search fields are `limit`,
`snippetChars`, `fields`, `excludePageIds`, and `queryVariants`.

The bridge maps these controls to compatible upstream source fields:
`fields`, `snippet_chars`, `exclude_page_ids`, and `query_variants`.
`query_variants` is gated by the exact source capability
`llmwiki_agent_guided_lexical_v1`; generic `llmwiki_retrieval_v1` alone is not
sufficient. Lexical fallback to a legacy source omits fields that the source
did not advertise.

Source response guidance uses Serve as the canonical schema owner. The bridge
consumes the Serve V1 snake_case `ContextPack.retrieval_guidance` schema and
maps it to public camelCase `retrievalGuidance`. The canonical Serve field set
is:

- `schema_version`
- `orientation_source`
- `content_trust`
- `max_query_variants`
- `character_budget`
- `folder_cards`
- `page_cards`
- `suggested_terms`
- `exact_identifiers`
- `fallback_modes`

The bridge preserves every valid guidance value by value, array order, and
nesting. It maps `folder_cards[].page_count` to
`folderCards[].pageCount`, `page_cards[].page_id` to
`pageCards[].pageId`, and `page_cards[].exact_identifiers` to
`pageCards[].exactIdentifiers`. It does not expose raw snake_case guidance in
public bridge objects.

The public bridge `retrievalGuidance.orientationSource` enum is exactly
`authored`, `projection_extractive`, or `none`. `contentTrust` is exactly
`untrusted_source_evidence`.

Absent source guidance remains compatible and is omitted. If a source
advertises `llmwiki_agent_guided_lexical_v1` but omits guidance, the bridge
adds a sanitized warning diagnostic. Unknown schema version, unknown
orientation enum, bad content-trust marker, unknown top-level or nested fields,
`null`, over-budget content, or malformed nested guidance causes the bridge to
omit the entire public `retrievalGuidance` object for that source and add a
sanitized warning diagnostic. The bridge does not partially forward malformed
or unknown guidance.

Caller-provided one-shot metadata also uses public `retrievalGuidance`:
`/message:send` accepts optional `data.retrievalGuidance`, and MCP
`llmwiki_agent_run` accepts optional top-level `retrievalGuidance`. The bridge
will not define or accept `retrieval.guidance.source`, `retrieval.guidance`, or
`data.retrieval.guidance`. Unknown, malformed, oversized, or unsafe
caller-provided `retrievalGuidance` fails before source fan-out and
request-body I/O logging with the existing sanitized bad-request or
invalid-params behavior.

The base query remains mandatory and is always included. Caller variants are
additive. The bridge accepts at most two supplied variants before
normalization, requires each item to trim to a non-empty string, deduplicates
by Unicode NFC plus casefold comparison, and preserves first original spelling.
The primary query is always sent upstream as `query`; additional variants are
sent as `query_variants` only when the effective retrieval search mode is
`lexical` and the source advertises the exact guided lexical capability.
Effective mode is resolved before capability fallback: omitted `retrieval` is
legacy lexical, valid `retrieval.searchMode` is authoritative when present,
and a malformed V1 `retrieval` object gets no implicit default.

Non-empty `queryVariants` with effective `literal`, `vector`, or `hybrid` mode
is rejected before capability fallback and source fan-out with HTTP `400` or
JSON-RPC `-32602` through the invalid retrieval contract. The bridge must not
silently discard variants, downgrade the requested mode, or activate
vector/hybrid/model/index behavior because variants were supplied. Query
compaction and deduplication must be Unicode-safe so Korean and other
non-Latin queries are not erased. Exact identifiers must be preserved.

`/message:send` and `llmwiki_agent_run` remain single-shot bridge runs. They
may accept caller-supplied query variants and `retrievalGuidance` metadata, and
they may use those variants for bounded source search augmentation. They must
not claim runtime tool chaining unless a future contract advertises and
implements a runtime tool surface.

The bridge will not add model, vector, embedding, ANN, numeric, provider SDK,
derived-index, or hot-cache dependencies for this workflow.

## Consequences

- The first-class default is easy to explain: read orientation, search with
  precise terms, then read cited pages.
- Host agents can use LLMWiki orientation effectively without making the bridge
  responsible for model calls or semantic indexes.
- Existing clients remain compatible when retrieval options are omitted.
- One-shot bridge users can pass variants when they already have good terms,
  but should not expect an internal multi-step agent loop.
- Unicode handling becomes part of the bridge compatibility surface because
  ASCII-only compaction can break Korean and other non-Latin users.
- Guidance normalization becomes a bridge compatibility surface because Serve
  V1 guidance is snake_case while bridge public responses are camelCase.
- Exact `llmwiki_agent_guided_lexical_v1` gating prevents new
  `query_variants` traffic from reaching generic retrieval-capable sources that
  have not opted into this lexical contract.
- Pre-fallback lexical-only validation prevents a non-lexical semantic request
  with variants from being silently converted into a lexical guided workflow.
- Source-prefixed `excludePageIds` needs strict routing checks to avoid hiding
  evidence from the wrong source in multi-source runs.
- Public docs must keep A2A-style and MCP-style wording conservative.

## Follow-ups

- Keep implementation, docs, OpenAPI, tests, and local validation evidence
  reconciled in `specs/agent-guided-lexical-workflow/`.
- Coordinate with `llmwiki-serve` so generated model/OpenAPI exposes the
  canonical `retrieval_guidance`, advertises
  `llmwiki_agent_guided_lexical_v1`, and accepts bounded lexical-only
  `query_variants` consistently.
- Re-run clean-commit release and publish gates before making public release or
  performance claims.

## Links

- Spec: `specs/agent-guided-lexical-workflow/`
- Related spec: `specs/retrieval-mode-forwarding/`
- Related ADR:
  `docs/decisions/2026-08-01-source-owned-semantic-retrieval-routing.md`
