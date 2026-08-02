# Agent-Guided Lexical Workflow

## Problem

`llmwiki-agent-bridge` already forwards source-owned retrieval modes, but the
best default user workflow should not start with vector search or a
bridge-owned query rewriter. LLMWiki-style sources are most useful when a
capable host agent first reads source-authored orientation or source-provided
retrieval guidance, then creates precise domain and coding keywords for
lexical search and reads cited pages.

The bridge must preserve that workflow across source tools and one-shot answer
surfaces without claiming runtime tool chaining when the agent card advertises
no runtime tools.

## Goals

- Make the source-tool path explicitly support:
  `llmwiki_list_sources -> llmwiki_context -> llmwiki_search -> llmwiki_read`.
- Preserve source-returned retrieval guidance and orientation as untrusted
  source evidence.
- Normalize valid Serve snake_case `retrieval_guidance` to public bridge
  camelCase `retrievalGuidance`.
- Let capable host agents send bounded query variants for lexical search while
  preserving the base query and exact identifiers.
- Keep Korean, other non-Latin text, file paths, issue IDs, symbols, and code
  identifiers intact during query trimming, deduplication, and forwarding.
- Forward source-owned retrieval controls compatibly: search mode, fields,
  snippet size, excluded page IDs, and query variants.
- Keep `/message:send` and `llmwiki_agent_run` single-shot bridge runs.
- Avoid automatic model, vector, hybrid, embedding, derived-index, or hot-cache
  activation in the bridge.

## Non-Goals

- No bridge-generated embeddings, vector indexes, model downloads, ANN stores,
  or query rewriting model calls.
- No bridge-owned derived orientation index or source projection cache.
- No mutation of Knowledge Source files, source-authored orientation pages, or
  bridge settings as part of retrieval.
- No full MCP or A2A certification claim beyond existing conservative
  compatibility wording.
- No execution of instructions contained in orientation, guidance, snippets, or
  citations.
- No bridge-owned expansion of Serve `retrieval_guidance` beyond the canonical
  Serve V1 schema.

## Workflow Contract

The default bridge product workflow is progressive disclosure through read-only
source tools:

1. `llmwiki_list_sources` lists selected and ready sources without querying
   them.
2. `llmwiki_context` reads a source orientation pack for the current user
   question. The response may include authored orientation and source-provided
   `retrieval_guidance`, normalized by the bridge to public camelCase
   `retrievalGuidance`.
3. The host agent treats orientation and guidance as untrusted source evidence,
   extracts vocabulary and exact identifiers, and calls `llmwiki_search` with
   the mandatory base query plus at most two additional query variants.
4. The host agent calls `llmwiki_read` for the specific source-prefixed page
   IDs or paths that support the answer.

The bridge should describe this as a host-agent workflow. It must not describe
`/message:send` or `llmwiki_agent_run` as dynamically calling source tools from
the configured runtime while the agent card returns `mcpServers: []`.

## Retrieval Request Extension

This feature extends the existing `llmwiki.retrieval.v1` namespace. Existing
requests without `retrieval` remain compatible and keep the legacy lexical
source request shape.

```json
{
  "data": {
    "query": "How do we release the bridge package?",
    "mode": "evidence-only",
    "retrieval": {
      "schemaVersion": "llmwiki.retrieval.v1",
      "searchMode": "lexical",
      "search": {
        "limit": 8,
        "snippetChars": 600,
        "fields": ["title", "path", "headings", "body", "sourceRefs"],
        "excludePageIds": ["sample-wiki:index"],
        "queryVariants": [
          "npm package release checklist",
          "publish workflow provenance"
        ]
      }
    }
  }
}
```

`retrieval.searchMode` remains the retrieval mode field. `data.mode` and
`data.orchestrationMode` remain bridge orchestration fields.

The effective retrieval search mode for query-variant validation is resolved
before source capability fallback:

- If `retrieval` is omitted, the effective mode is the legacy default
  `lexical`, and the bridge keeps the existing legacy source request shape.
- If a valid `llmwiki.retrieval.v1` object is present, the effective mode is
  `retrieval.searchMode`.
- If a `retrieval` object is present but omits `searchMode`, the retrieval
  object is invalid under `llmwiki.retrieval.v1`; no default is applied inside
  that malformed object.

`retrieval.search` accepts exactly these additive V1 fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `limit` | no | Bounded upstream result limit. |
| `snippetChars` | no | Bounded upstream snippet size. |
| `fields` | no | Bounded array of source-owned field names. |
| `excludePageIds` | no | Bounded array of page IDs to avoid returning again; source-prefixed IDs are routed only to the matching source and stripped before upstream forwarding. |
| `queryVariants` | no | Caller-supplied additional lexical variants. Non-empty variants are valid only when the effective retrieval search mode is `lexical`; at most two supplied variants are accepted before normalization. |

Unknown search fields remain invalid.

## Query Variants

The base `query` remains required at the bridge boundary and in every upstream
source request. Caller-supplied variants are additive; they do not replace the
primary query.

`retrieval.search.queryVariants` is optional. Omission or `[]` preserves legacy
single-query behavior. When present, it is an input array with `maxItems: 2`
before normalization. Each item must be a string that trims to a non-empty
value. Empty strings, non-strings, and arrays with more than two items are
invalid.

The bridge normalizes query variants deterministically:

1. Trim the base `query`; it must be non-empty.
2. Start channels with the base query.
3. Append caller-supplied variants in caller order.
4. Deduplicate by Unicode NFC plus casefold comparison.
5. Preserve the first original spelling for each deduplicated channel.
6. Cap effective channels at three: the primary query plus at most two
   additional variants.

After normalization, the bridge sends the primary query in upstream `query` and
sends only the additional deduplicated variants in upstream `query_variants`.
If no additional variants remain, the bridge omits `query_variants`.

Non-empty `queryVariants` is legal only when the effective mode is `lexical`.
If any non-empty variants remain after shape validation and trimming and the
effective mode is `literal`, `vector`, or `hybrid`, the bridge rejects the
request before capability resolution, source fallback, source fan-out, and
request-body I/O logging. HTTP callers receive `400` through the existing
invalid retrieval response shape with `error.code: "invalid_retrieval_intent"`;
MCP callers receive JSON-RPC `-32602`. The bridge must not silently discard
variants, downgrade the requested mode to lexical, or activate vector, hybrid,
model, embedding, or index behavior because variants were supplied.

Normalization must be Unicode-safe. It must not drop Hangul, CJK, accented
Latin text, non-Latin identifiers, file paths, package names, issue IDs,
version strings, or code symbols.

## Retrieval Guidance Mapping

Serve is the canonical source for V1 guidance. The bridge consumes the
canonical Serve snake_case `ContextPack.retrieval_guidance` schema defined in
the sibling `llmwiki-serve` spec:
`specs/agent-guided-lexical-retrieval/spec.md`.

The canonical Serve guidance object contains exactly:

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

It contains no arbitrary frontmatter, projection digest, diagnostics, selection
object, next-call object, `null`, raw snippets beyond bounded `excerpt`, or
extra keys.

The bridge public response shape is camelCase. The bridge must preserve every
valid Serve guidance value by value, array order, and nesting after bounded
validation. It must not synthesize guidance, add bridge-authored guidance
fields, expose raw snake_case guidance in public bridge objects, or execute
guidance content as instructions.

Top-level mapping:

| Serve field | Bridge public field |
| --- | --- |
| `retrieval_guidance` | `retrievalGuidance` |
| `schema_version` | `schemaVersion` |
| `orientation_source` | `orientationSource` |
| `content_trust` | `contentTrust` |
| `max_query_variants` | `maxQueryVariants` |
| `character_budget` | `characterBudget` |
| `folder_cards` | `folderCards` |
| `page_cards` | `pageCards` |
| `suggested_terms` | `suggestedTerms` |
| `exact_identifiers` | `exactIdentifiers` |
| `fallback_modes` | `fallbackModes` |

Nested mapping:

| Serve field | Bridge public field |
| --- | --- |
| `folder_cards[].path` | `folderCards[].path` |
| `folder_cards[].page_count` | `folderCards[].pageCount` |
| `folder_cards[].terms` | `folderCards[].terms` |
| `page_cards[].page_id` | `pageCards[].pageId` |
| `page_cards[].title` | `pageCards[].title` |
| `page_cards[].path` | `pageCards[].path` |
| `page_cards[].headings` | `pageCards[].headings` |
| `page_cards[].terms` | `pageCards[].terms` |
| `page_cards[].exact_identifiers` | `pageCards[].exactIdentifiers` |
| `page_cards[].excerpt` | `pageCards[].excerpt` |

The public bridge `orientationSource` enum is exactly:
`authored | projection_extractive | none`.

### Guidance Compatibility Policy

Source-returned guidance is optional source evidence:

- If `retrieval_guidance` is absent, the bridge omits public
  `retrievalGuidance` and does not synthesize replacement guidance. If the
  source advertised `llmwiki_agent_guided_lexical_v1`, the bridge adds a
  sanitized warning diagnostic in the existing diagnostics surface; older or
  capability-unknown sources do not produce a warning for absence alone.
- If `retrieval_guidance` has an unknown schema version, an unknown
  `orientation_source`, a `content_trust` value other than
  `untrusted_source_evidence`, unknown top-level or nested fields, `null`
  values, over-budget recognized content, or malformed nested shapes, the
  bridge omits the entire public `retrievalGuidance` object for that source and
  adds a sanitized warning diagnostic.

Source-response diagnostics must use the existing compatible warning surface
with `phase: "retrieval"` and must not expose source URLs, local roots, raw
source responses, raw guidance payloads, credentials, provider settings, model
names, raw vectors, or raw embeddings. `llmwiki_context` still returns its
normal structured payload when source guidance is absent or malformed.
`/message:send` and `llmwiki_agent_run` apply the same mapper before building
one-shot evidence bundles; invalid source guidance is not passed to the
runtime and never fails an otherwise valid bridge request.

Caller-provided one-shot metadata has no field inside the public `retrieval`
object. `/message:send` uses `data.retrievalGuidance`; MCP
`llmwiki_agent_run` uses top-level `retrievalGuidance`. Valid caller metadata
must match the same public camelCase guidance shape, is optional, bounded,
untrusted traceability metadata, and is not a source instruction channel.
Unknown, malformed, oversized, or unsafe caller-provided `retrievalGuidance`
fails before source fan-out and request-body I/O logging with HTTP `400` using
the existing error response shape and `error.code:
"invalid_retrieval_guidance"`, or JSON-RPC `-32602` for MCP callers.

The public bridge contract must not expose or accept
`retrieval.guidance.source`, `retrieval.guidance`, or
`data.retrieval.guidance`.

## Source Tool Inputs

`llmwiki_context` and `llmwiki_search` accept the same `retrieval` object as
`/message:send` and `llmwiki_agent_run`. `llmwiki_search` is the primary place
where host agents pass `queryVariants`, `fields`, `excludePageIds`, and
`snippetChars` after reading orientation.

For compatible upstream `llmwiki-serve` HTTP and MCP sources, the bridge maps
camelCase bridge fields to the source wire shape:

| Bridge field | Upstream HTTP/MCP field | Forwarding rule |
| --- | --- | --- |
| `retrieval.searchMode` | `mode` | Use retrieval-mode-forwarding capability rules. |
| `retrieval.search.snippetChars` | `snippet_chars` | Use retrieval-mode-forwarding capability rules. |
| `retrieval.search.fields` | `fields` | Forward only to sources compatible with the additive search-options contract. |
| `retrieval.search.excludePageIds` | `exclude_page_ids` | Forward only to compatible sources, after source-prefix routing and stripping. |
| `retrieval.search.queryVariants` | `query_variants` | Forward only when the source advertises exactly `llmwiki_agent_guided_lexical_v1`. |

`llmwiki_agent_guided_lexical_v1` is an exact, case-sensitive source capability
string. Generic `llmwiki_retrieval_v1` alone is not sufficient for forwarding
`query_variants`. The lexical-only validation for non-empty `queryVariants`
happens before source capability fallback. After that validation passes, each
selected source still needs the exact guided lexical capability before
receiving upstream `query_variants`. When a lexical request with non-empty
variants targets a source that lacks the required capability, `fallback:
"lexical"` sends the existing single-primary-query lexical request without
`query_variants` and adds a sanitized diagnostic; `fallback: "none"` fails
before fan-out through the existing unsupported-capability contract.

## One-Shot Runs

`POST /message:send` and MCP `llmwiki_agent_run` use the same internal bridge
run path. They may accept `data.retrieval.search.queryVariants` and
`data.retrievalGuidance` metadata from the caller, then forward only validated
source-owned retrieval fields to capable sources.

They remain single-shot runs:

- The bridge gathers source evidence for the current query.
- The bridge may use caller-supplied query variants for bounded source search
  augmentation.
- The configured runtime receives a bounded evidence bundle and does not get a
  bridge-provided tool loop unless a future contract advertises one.
- Public docs and agent-card metadata must not imply runtime tool chaining
  while `mcpServers` is empty.

## Security And Privacy

Orientation, source guidance, snippets, citations, and caller-supplied
`retrievalGuidance` metadata are untrusted source evidence. They may help
choose vocabulary and page IDs, but they must not be interpreted as system
instructions, source policy, credentials, tool permissions, runtime
configuration, or network targets.

The bridge must continue rejecting or redacting provider credentials, endpoint
URLs, model names, local paths, cache/download controls, raw embeddings, and
raw vectors in retrieval-shaped payloads. Query variant errors and diagnostics
must not expose private source URLs, local roots, raw source responses, or
provider configuration.

## Compatibility

- Existing clients that omit `retrieval` keep the current behavior.
- Existing result artifact shapes remain compatible.
- Existing `data.mode` orchestration behavior is unchanged.
- New source-tool callers can use the context-first workflow without calling
  the answer runtime.
- New one-shot callers can pass query variants, but the bridge does not promise
  multi-step runtime tool use.
- Vector and hybrid search remain explicit source-owned modes. They are not
  auto-activated by this workflow.
- Multi-source fan-out preserves selected source ordering for diagnostics,
  source bundles, variant handling, and results.

## Acceptance Criteria

- Source tools advertise clear descriptions for context-first progressive
  disclosure.
- `llmwiki_context` preserves valid source-returned `retrieval_guidance` as
  public camelCase `retrievalGuidance` in structured content, using exactly the
  Serve canonical V1 mapping.
- Invalid, unknown, or malformed source guidance is omitted entirely with a
  sanitized diagnostic and no runtime instruction effect.
- Public `retrievalGuidance.orientationSource` accepts exactly `authored`,
  `projection_extractive`, or `none`.
- `llmwiki_search` forwards `mode`, `fields`, `snippet_chars`,
  `exclude_page_ids`, and `query_variants` only to compatible sources, with
  `query_variants` gated by exact `llmwiki_agent_guided_lexical_v1`.
- Non-empty `queryVariants` with effective `literal`, `vector`, or `hybrid`
  retrieval mode is rejected before capability fallback and source fan-out with
  HTTP `400` or JSON-RPC `-32602`.
- `/message:send` and `llmwiki_agent_run` accept omitted retrieval fields and
  caller-supplied query variants without changing existing requests.
- `/message:send` accepts optional `data.retrievalGuidance` and
  `llmwiki_agent_run` accepts optional `retrievalGuidance`; neither surface
  accepts `retrieval.guidance`.
- Query variant handling preserves Korean and non-Latin text.
- Query variants are deterministic, deduplicated by NFC plus casefold, and
  capped at two additional variants before normalization for at most three
  total lexical channels including the mandatory primary query.
- Upstream source requests always include the primary `query`; they never rely
  on `query_variants` alone.
- Exact identifiers, paths, issue IDs, package names, symbols, and version
  strings are preserved during variant handling.
- Source-prefixed excluded page IDs cannot be applied to the wrong source.
- Malformed caller-provided `retrievalGuidance` metadata, oversized variants,
  and unsafe retrieval fields fail with sanitized HTTP `400` or JSON-RPC
  `-32602` errors.
- Multi-source fan-out preserves selected source ordering for variants,
  diagnostics, and results.
- Tests prove no model/vector dependency or automatic semantic mode activation
  is introduced by this bridge workflow.

## Links

- Existing retrieval forwarding spec: `specs/retrieval-mode-forwarding/`
- Existing semantic retrieval ADR:
  `docs/decisions/2026-08-01-source-owned-semantic-retrieval-routing.md`
