# Retrieval Mode Forwarding

## Problem

`llmwiki-agent-bridge` fans out one request to one or more Knowledge Sources,
but it currently cannot express whether source retrieval should use lexical,
literal, vector, or hybrid search. Reusing `data.mode` would be ambiguous
because that field already selects bridge orchestration behavior such as
`evidence-only` or `delegated-runtime`.

Vector and hybrid retrieval also belong at the Knowledge Source boundary. The
source owns the projected documents, draft policy, adapter metadata, cache
invalidation, embedding model, and any vector index. The bridge should route a
retrieval intent; it should not embed documents or queries.

## Goals

- Add an optional `data.retrieval` namespace for retrieval intent.
- Keep existing `/message:send`, MCP, and source-tool payloads compatible when
  retrieval intent is omitted.
- Preserve `data.mode` and `data.orchestrationMode` as orchestration controls.
- Forward retrieval modes only to sources that advertise support.
- Provide deterministic fallback or error behavior for mixed-capability
  multi-source runs.
- Keep provider credentials, embedding endpoints, and raw vectors out of bridge
  client payloads, logs, diagnostics, and artifacts.
- Map supported retrieval modes to the existing `mode` field on compatible
  `llmwiki-serve` query/search contracts.

## Non-goals

- No bridge-owned vector index, embedding provider, model download, or ML
  dependency.
- No client-selected embedding provider, endpoint, credential, model path, or
  raw embedding vector in v1.
- No mutation of the production `llmwiki_agent_result` artifact schema.
- No automatic promotion of legacy sources to semantic-capable sources without
  advertised capabilities.
- No claim that all Knowledge Source protocols support vector or hybrid search.

## Retrieval Intent

Requests MAY include `data.retrieval` on `/message:send` and the same
`retrieval` object in MCP `llmwiki_agent_run`, `llmwiki_context`, and
`llmwiki_search` arguments.

```json
{
  "data": {
    "query": "Which release checks are still missing?",
    "mode": "evidence-only",
    "retrieval": {
      "schemaVersion": "llmwiki.retrieval.v1",
      "searchMode": "hybrid",
      "fallback": "lexical",
      "search": {
        "limit": 8,
        "snippetChars": 600
      }
    }
  }
}
```

`data.mode` remains the orchestration alias for `data.orchestrationMode`.
`data.retrieval.searchMode` is the source retrieval mode. Implementations MUST
not treat these fields as aliases.

## Schema

`RetrievalIntent` is an optional object with `additionalProperties: false`.

| Field | Required | Values | Meaning |
| --- | --- | --- | --- |
| `schemaVersion` | yes | `llmwiki.retrieval.v1` | Version for the retrieval intent namespace. |
| `searchMode` | yes | `lexical`, `literal`, `vector`, `hybrid` | Requested source retrieval mode. |
| `fallback` | no | `lexical`, `none` | Behavior when a selected source cannot satisfy `searchMode`. Defaults to `lexical`. |
| `search.limit` | no | integer, bounded by existing source-tool limits | Maximum upstream context/search items. |
| `search.snippetChars` | no | integer, implementation-bounded | Desired snippet size when the source supports it. |
| `search.fields` | no | bounded string array | Optional source-owned field selection for compatible lexical search. |
| `search.excludePageIds` | no | bounded string array | Optional page IDs to suppress for compatible lexical search, with source-prefix routing handled by the bridge. |
| `search.queryVariants` | no | string array, `maxItems: 2` before normalization | Optional additional lexical query variants, gated by `llmwiki_agent_guided_lexical_v1`; every item must trim to a non-empty string. |

Clients MUST NOT send embedding vectors, provider credentials, provider
endpoints, API keys, model paths, or arbitrary provider configuration in
`retrieval`. Public clients also MUST NOT select an embedding provider, model,
cache directory, provider URL, credential, or trigger model/index downloads
through bridge retrieval fields. These concerns belong to the source runtime
operator configuration. The bridge MUST reject unknown fields in v1 instead of
silently logging or forwarding them.

`search` has `additionalProperties: false` and accepts only `limit`,
`snippetChars`, `fields`, `excludePageIds`, and `queryVariants` in v1. The
`fields`, `excludePageIds`, and `queryVariants` additions are specified in
`specs/agent-guided-lexical-workflow/`; the earlier restriction to only
`limit` and `snippetChars` is superseded. The bridge maps camel-case client
fields to upstream source fields as follows:

| Client field | `llmwiki-http` `/query` and `/search` | MCP source tools | A2A source |
| --- | --- | --- | --- |
| `retrieval.searchMode` | `mode` | `mode` | `data.retrieval.searchMode` |
| `retrieval.search.limit` | `limit` | `limit` | `data.retrieval.search.limit` |
| `retrieval.search.snippetChars` | `snippet_chars` | `snippet_chars` | `data.retrieval.search.snippetChars` |
| `retrieval.search.fields` | `fields` | `fields` | `data.retrieval.search.fields` |
| `retrieval.search.excludePageIds` | `exclude_page_ids` | `exclude_page_ids` | `data.retrieval.search.excludePageIds` |
| `retrieval.search.queryVariants` | `query_variants` | `query_variants` | `data.retrieval.search.queryVariants` |

The bridge MUST NOT invent snake-case aliases in the public bridge request
schema. It MAY omit `snippet_chars` when an upstream protocol or source version
does not advertise or accept that option.

`queryVariants` has an additional capability gate. The bridge forwards it to
HTTP and MCP sources as `query_variants`, and to A2A sources as
`data.retrieval.search.queryVariants`, only when the source advertises exactly
`llmwiki_agent_guided_lexical_v1`.

`queryVariants` is also lexical-only. The base `query` is required. Input
`queryVariants` has `maxItems: 2` before normalization, and every item must be a
string that trims to a non-empty value. Effective lexical channels start with
the primary `query`, append variants in caller order, remove exact duplicates
after Unicode NFC plus casefold comparison, and preserve the first original
spelling. The effective retrieval search mode is resolved before capability
fallback: omitted `retrieval` means the legacy default lexical behavior, a
valid `retrieval.searchMode` is authoritative when present, and a v1
`retrieval` object that omits `searchMode` remains invalid under this schema.
If non-empty `queryVariants` remains after shape validation and trimming and
the effective mode is `literal`, `vector`, or `hybrid`, the bridge MUST reject
the request before capability resolution, source fallback, source fan-out, and
request-body I/O logging. HTTP callers receive `400` with
`error.code: "invalid_retrieval_intent"`; MCP callers receive JSON-RPC
`-32602`. The bridge MUST NOT silently discard variants, downgrade the
requested mode to lexical, or activate vector, hybrid, model, embedding, or
index behavior because variants were supplied.

Unknown `searchMode` values MUST be rejected at the bridge boundary with an
HTTP `400` or JSON-RPC `-32602` error. Future modes require a new bridge
contract update.

The bridge request schema statically accepts only `lexical`, `literal`,
`vector`, and `hybrid`. Runtime availability is source-specific: accepting a
known `searchMode` in the bridge schema does not mean every selected source can
satisfy that mode. Capability resolution below decides whether the request is
forwarded, lexically downgraded with diagnostics, or rejected before fan-out.

## Capability Discovery

A source advertises v1 retrieval and guided lexical support through exact
string capabilities:

- `llmwiki_retrieval_v1`
- `llmwiki_search_mode_lexical`
- `llmwiki_search_mode_literal`
- `llmwiki_search_mode_vector`
- `llmwiki_search_mode_hybrid`
- `llmwiki_agent_guided_lexical_v1`

These exact, case-sensitive strings are the public bridge contract and MUST
match the `llmwiki-serve` capability strings. Implementations MUST NOT accept
spelling variants such as dotted names, camel-case names, uppercase names, or
mode aliases.

`llmwiki_agent_guided_lexical_v1` gates upstream `query_variants` forwarding.
It does not replace `llmwiki_retrieval_v1` for retrieval-mode forwarding and
does not imply vector or hybrid support. Conversely, `llmwiki_retrieval_v1`
alone is not sufficient for `query_variants`.

The bridge can learn these capabilities from inline or persisted Knowledge
Source descriptors, redacted source registry metadata, source bundle/manifest
metadata, MCP source-bundle metadata, or A2A agent-card metadata. Capability
normalization MUST be deterministic and case-sensitive.

When a request includes `RetrievalIntent`, the bridge MUST complete a bounded
capability-resolution phase for every selected ready source before any source
query/search/message fan-out. During that phase, fresh safe discovery metadata
obtained for the current request from source-bundle, manifest, MCP
source-bundle, or A2A agent-card discovery overrides inline and persisted
descriptor capabilities for that request. If fresh discovery is unavailable,
the bridge may use inline or persisted descriptor capabilities. If no safe
capability metadata is available, the source is treated as capability-unknown.

`llmwiki_retrieval_v1` is required before the bridge forwards any non-legacy
retrieval intent. A source also needs the matching
`llmwiki_search_mode_<mode>` capability before receiving `lexical`, `literal`,
`vector`, or `hybrid` as an explicit upstream `mode`.

Legacy sources without retrieval capabilities are treated as supporting the
existing default lexical behavior only when the bridge falls back to lexical or
when no retrieval intent was supplied. A capability-unknown or unsupported
source receives deterministic lexical fallback plus a structured diagnostic
only when `fallback` is `lexical`. With `fallback: "none"`, the bridge MUST fail
before query fan-out.

## Routing Rules

For each selected ready source, resolve an applied retrieval mode during the
pre-fanout capability-resolution phase:

Before this capability-resolution phase, validate the request-level retrieval
shape. In particular, non-empty `search.queryVariants` with effective
`literal`, `vector`, or `hybrid` mode is an invalid retrieval intent, not a
capability fallback case.

| Retrieval intent | Source capability | `fallback=lexical` | `fallback=none` |
| --- | --- | --- | --- |
| absent | any | Existing legacy request shape. | Existing legacy request shape. |
| `lexical` | advertised | Forward `mode: "lexical"`. | Forward `mode: "lexical"`. |
| `lexical` | absent or unknown | Legacy lexical request plus diagnostic. | Error before source fan-out. |
| `literal` | advertised | Forward `mode: "literal"`. | Forward `mode: "literal"`. |
| `literal` | absent or unknown | Legacy lexical request plus diagnostic. | Error before source fan-out. |
| `vector` | advertised | Forward `mode: "vector"`. | Forward `mode: "vector"`. |
| `vector` | absent or unknown | Legacy lexical request plus diagnostic. | Error before source fan-out. |
| `hybrid` | advertised | Forward `mode: "hybrid"`. | Forward `mode: "hybrid"`. |
| `hybrid` | absent or unknown | Legacy lexical request plus diagnostic. | Error before source fan-out. |

When `fallback=none`, the bridge MUST fail the request before calling any
source if any selected ready source cannot satisfy the requested mode. The error
message must be actionable and sanitized.

When `fallback=lexical`, capable sources receive the requested mode and
incapable sources receive the existing legacy lexical request shape. The bridge
adds a structured diagnostic through the existing diagnostics/warnings surface.
The diagnostic is a warning with `phase: "retrieval"`, safe source identity,
requested mode, applied mode, fallback policy, capability match status, and
capability metadata source (`fresh`, `descriptor`, or `none`). It MUST NOT
change the production `llmwiki_agent_result` artifact schema.

Multi-source results MUST remain normalized to selected source order, not
network completion order. Fallback diagnostics MUST also be stable in selected
source order.

## Wire Mapping

For `llmwiki-http` sources that advertise retrieval support:

- `/query` body adds `mode: <applied searchMode>`.
- `/search` body adds `mode: <applied searchMode>`.
- `retrieval.search.limit` maps to upstream `limit`.
- `retrieval.search.snippetChars` maps to upstream `snippet_chars`.
- `retrieval.search.fields` maps to upstream `fields`.
- `retrieval.search.excludePageIds` maps to upstream `exclude_page_ids`.
- `retrieval.search.queryVariants` maps to upstream `query_variants` only when
  the source advertises exactly `llmwiki_agent_guided_lexical_v1`.
- Lexical fallback to a legacy source omits `mode` to preserve old serve
  compatibility.
- The bridge never forwards provider/model/cache/download fields, raw
  embeddings, or provider endpoint data.

For MCP Knowledge Sources that advertise retrieval support:

- `llmwiki_context` arguments add `mode: <applied searchMode>`.
- `llmwiki_search` arguments add `mode: <applied searchMode>`.
- `retrieval.search.limit` maps to upstream `limit`.
- `retrieval.search.snippetChars` maps to upstream `snippet_chars`.
- `retrieval.search.fields` maps to upstream `fields`.
- `retrieval.search.excludePageIds` maps to upstream `exclude_page_ids`.
- `retrieval.search.queryVariants` maps to upstream `query_variants` only when
  the source advertises exactly `llmwiki_agent_guided_lexical_v1`.
- Lexical fallback to a legacy source omits `mode`.
- The bridge never forwards provider/model/cache/download fields, raw
  embeddings, or provider endpoint data.

For A2A Knowledge Sources that advertise `llmwiki_retrieval_v1`:

- The bridge forwards only the validated v1 fields: `schemaVersion`,
  `searchMode`, `fallback`, and `search.limit`/`search.snippetChars`,
  `search.fields`, `search.excludePageIds`, and `search.queryVariants`.
- The bridge forwards `search.queryVariants` only when the source also
  advertises exactly `llmwiki_agent_guided_lexical_v1`.
- Lexical fallback to a legacy source omits `data.retrieval` and sends the
  existing legacy `data.query` shape.
- The bridge does not send provider settings, provider endpoints, model names,
  cache paths, download controls, or embedding vectors.

## Error And Diagnostic Behavior

Validation and capability failures are caller errors, not source failures.

- HTTP `/message:send` invalid retrieval payloads return HTTP `400` with the
  existing error response shape and `error.code: "invalid_retrieval_intent"`.
- HTTP `/message:send` requests with non-empty
  `data.retrieval.search.queryVariants` and effective `literal`, `vector`, or
  `hybrid` mode return the same invalid retrieval error before source fan-out
  and before retrieval capability fallback.
- HTTP `/message:send` requests with `fallback: "none"` and any selected source
  that cannot prove the requested capability return HTTP `400` with the
  existing error response shape and
  `error.code: "retrieval_mode_unsupported"`. The bridge does not call any
  source query/search/message endpoint.
- MCP `tools/call` invalid retrieval payloads, non-empty variants on effective
  non-lexical modes, or `fallback: "none"` capability failures return JSON-RPC
  `-32602` before source fan-out. They do not return a `llmwiki_source_error`
  structured artifact because the selected retrieval contract is invalid for
  the chosen sources.
- MCP `llmwiki_agent_run` lexical fallback diagnostics are reported through the
  embedded `llmwiki_agent_result` diagnostics and trace diagnostics.
- MCP source tools (`llmwiki_context` and `llmwiki_search`) preserve their
  normal structured payloads on lexical fallback and add only the existing
  compatible diagnostic/warning surface used by those tools. If no structured
  diagnostic surface exists for the tool response, the fallback must still be
  visible through a bounded text warning and I/O/debug trace without exposing
  unsafe data.
- A2A source forwarding never receives an unsupported retrieval intent. With
  `fallback: "lexical"` it receives a legacy lexical request; with
  `fallback: "none"` the bridge fails before fan-out.

Error and diagnostic messages may name the requested mode, applied mode,
fallback policy, source protocol, and missing capability. They MUST NOT include
source URLs, local roots, raw request bodies, user query text, provider
endpoint URLs, provider/model names, cache paths, credentials, embedding
vectors, vector dimensions, or vector samples.

## Diagnostics And Redaction

The production `llmwiki_agent_result` schema remains unchanged. Retrieval
fallbacks and incompatibilities use existing compatible surfaces:

- result-level `diagnostics`
- trace-step `diagnostic`
- MCP source-tool error responses when the caller selected `fallback=none`

Diagnostics may include safe facts such as requested mode, applied mode,
fallback policy, source protocol, and whether a capability matched. Diagnostics
MUST NOT include source URLs, local roots, provider endpoint URLs, credentials,
raw request bodies, raw embedding vectors, vector dimensions, vector samples, or
unbounded source responses.

Default I/O debug logging must redact any accidental sensitive fields before
writing events. The bridge MUST validate and sanitize `retrieval` before
calling `emitIoLog` for `bridge.request`, and the I/O logger MUST recursively
redact sensitive retrieval-shaped fields if they appear elsewhere in a request,
response, diagnostic, or error. Rejected/redacted field names include
`embedding`, `embeddings`, `vector`, `vectors`, `provider`, `providers`,
`model`, `modelName`, `modelPath`, `endpoint`, `endpoints`, `baseUrl`,
`baseURL`, `url`, `cache`, `cacheDir`, `download`, `downloads`, `apiKey`,
`authorization`, `token`, `secret`, `password`, and credential-like variants.
Safe audit logging remains route/count oriented and must not include retrieval
query text, vectors, endpoints, provider/model fields, cache paths, downloads,
or credentials.

## Compatibility Matrix

| Client | Source | Retrieval intent | Expected behavior |
| --- | --- | --- | --- |
| Old client | Old source | omitted | Byte/semantic compatibility with current requests. |
| Old client | New source | omitted | Current lexical/default retrieval. |
| New client | Old source | `vector`, fallback lexical | Legacy lexical request, diagnostic in existing surface. |
| New client | Old source | `vector`, fallback none | Sanitized bridge error before source fan-out. |
| New client | New source | `vector` | Forward upstream `mode: "vector"`. |
| New client | Mixed sources | `hybrid`, fallback lexical | Capable sources receive hybrid; legacy sources receive lexical; deterministic diagnostics. |
| New client | Mixed sources | `hybrid`, fallback none | Sanitized bridge error before any source call. |

## Contract Impacts

- Add `RetrievalIntent` and nested `RetrievalSearchOptions` to the generated
  OpenAPI schema.
- Add optional `retrieval` to `MessageSendData`.
- Add optional `retrieval` to MCP input schemas for `llmwiki_agent_run`,
  `llmwiki_context`, and `llmwiki_search`.
- Keep `KnowledgeSourceDescriptor.capabilities` as an array of strings and
  document the retrieval capability strings.
- Bump the npm package version and add a changelog entry when the implementation
  ships, because this is an additive public contract.
- Update `docs/message-send-contract.md`, README routing guidance, and package
  examples after implementation.
- Regenerate and check `docs/openapi.json`.

## Acceptance Criteria

- Existing requests without `retrieval` produce the same source request shape as
  before.
- `data.mode` continues to control orchestration only.
- The bridge rejects unknown retrieval modes, unknown retrieval fields, raw
  vector arrays, and provider credential fields.
- The bridge validates or sanitizes retrieval fields before any `emitIoLog`
  event can contain the raw request body.
- The bridge never imports or installs ML/vector dependencies.
- Vector and hybrid modes are forwarded only to capable sources.
- Mixed-source fallback behavior is deterministic and redacted.
- Public clients cannot choose provider/model/endpoints, send embeddings, or
  trigger downloads through the bridge.
- OpenAPI, MCP tool schemas, docs, and tests describe the same contract.
