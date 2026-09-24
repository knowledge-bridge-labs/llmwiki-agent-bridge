# Spec: TypeSafe Jev/System-One Judgment Gate

## Status

Implemented for 0.6.1.

## Problem

The bridge can gather evidence from multiple LLMWiki Knowledge Sources and then
ask a runtime to synthesize an answer. Operators need an optional first-stage
typed judgment provider that can flag weak evidence, source-routing ambiguity,
citation support risk, progressive source-tool continuation choices, and graph
expansion opportunities without turning the bridge into a provider-specific
agent or leaking private source details.

## Goals

- Add opt-in System-One/Jev-style judgment calls owned by
  `llmwiki-agent-bridge`.
- Keep all judgment modes disabled by default.
- Support runtime-route `off`, `report-only`, and `enforce`.
- Support source-routing, evidence-relevance, citation-support,
  progressive-disclosure, and graph-expansion as report-only diagnostics.
- Minimize and mask provider state before every external judgment call.
- Preserve source calls, runtime prompts, answer text, citations, graph
  payloads, and artifacts for every report-only mode.
- Prevent source-policy blocked source descriptors from reaching the external
  judgment provider.

## Non-Goals

- Do not call System-One from `llmwiki-serve`.
- Do not treat external judgment as a security boundary.
- Do not make System-One a required runtime dependency.
- Do not hardcode terms, source names, page names, project-specific labels, or
  custom traits from any particular LLMWiki.
- Do not publish answer-quality or token-savings claims from this slice without
  separate benchmark evidence.

## Requirements

- `REQ-001`: `prepareExternalJudgmentState` is exported and masks credentials,
  bearer tokens, API keys, URLs, local paths, hostnames, emails, phone-like
  strings, and identifier-shaped source/page/graph ids.
- `REQ-002`: Missing provider configuration never changes behavior in
  report-only mode.
- `REQ-003`: Runtime-route `enforce` skips runtime synthesis when the provider
  rejects the route, evidence support is below threshold, route confidence is
  below threshold, or the provider fails.
- `REQ-004`: Source-routing report-only runs before source fan-out and observes
  only source-policy eligible selected ready sources.
- `REQ-005`: Evidence-relevance report-only runs after source fan-out and never
  reorders or drops citations.
- `REQ-006`: Citation-support report-only runs after runtime synthesis and never
  edits answer text or citation anchors.
- `REQ-007`: Progressive-disclosure report-only runs only for read-only MCP
  source-tool results and may add
  `llmwiki_external_judgment_progressive_disclosure` structured content.
- `REQ-008`: Progressive-disclosure provider state uses structural query/result
  counts and must not include the raw source-tool query.
- `REQ-009`: Graph-expansion report-only uses already gathered structural
  source/citation/graph/source-bundle data and never triggers extra graph or
  source calls.
- `REQ-010`: Diagnostics are redacted and omit provider request/response bodies,
  endpoint URLs, API keys, raw source ids, raw source URLs, local paths, graph
  labels, page text, and raw answer text.
- `REQ-011`: Provider state uses structural text and graph signals for source
  display names, source descriptions, page titles, page snippets, graph labels,
  graph relations, answer text, and cited claim snippets instead of raw wording.
- `REQ-012`: Report-only graph-expansion and citation-support judgments skip
  provider calls when the current request has no structural graph/multi-source
  or cited-anchor state to evaluate.
- `REQ-013`: Provider `score` questions use live System-One compatible
  criteria arrays, not object maps, so all judgment phases can call the live
  API successfully.

## Compatibility

The feature is additive and opt-in. Existing clients that do not configure
System-One keep the 0.6.0 behavior. Report-only modes add diagnostics but must
not change outputs other than those additive diagnostics. Runtime-route enforce
is an explicit operator choice.
