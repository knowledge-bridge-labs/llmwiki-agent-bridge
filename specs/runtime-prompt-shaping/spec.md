# Runtime Prompt Shaping Spec

## Problem

Delegated-runtime and hybrid runs send LLMWiki evidence to an
OpenAI-compatible chat completions runtime. The previous prompt placed the user
question before the evidence bundle and included source-bundle metadata plus
graph samples in the runtime JSON. That made the stable prompt prefix smaller
than necessary and increased runtime context pressure without changing the
answer artifact contract.

## Goals

- Keep the system prompt byte-stable across different user queries and evidence
  bundles.
- Put stable runtime instructions before dynamic evidence.
- Send dynamic evidence before the user question.
- Keep full graph payloads and source-bundle payloads out of the runtime
  prompt.
- Preserve answer artifact contracts, citation numbering, source bundle return
  fields, and runtime answer behavior.
- Avoid caching final runtime answers.

## Non-Goals

- Change `/message:send`, `/mcp`, OpenAPI, or `llmwiki_agent_result` response
  shapes.
- Add final-answer caching.
- Add new unbounded prompt-size heuristics.
- Change source retrieval, evidence cache keys, or source-bundle discovery.

## Requirements

- The first chat-completions message is a stable system prompt that does not
  include query text, evidence text, source metadata, or runtime-specific
  dynamic values.
- The runtime evidence bundle has stable top-level schema and contract keys.
- The user question appears after the evidence bundle, either later in the same
  message or in a later message.
- Runtime evidence includes a compact citation digest and a top-level
  `citations` array. Citation anchors still use the 1-based index of the
  top-level `citations` array.
- Runtime evidence includes only compact source summaries, citation IDs,
  orientation digest records, source failure diagnostics, graph counts, and
  corpus summaries.
- Runtime evidence excludes returned `sourceBundles`, per-source `sourceBundle`
  payloads, graph node arrays, graph edge arrays, and graph samples.

## Compatibility

The public answer artifact is unchanged. Clients still receive `answer`,
`citations`, `graph`, `steps`, `sourceBundles`, and `diagnostics` through
`llmwiki_agent_result`. Only the internal runtime prompt shape changes for
`delegated-runtime` and `hybrid`.
