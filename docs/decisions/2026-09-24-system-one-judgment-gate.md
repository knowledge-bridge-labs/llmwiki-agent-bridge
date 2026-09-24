# ADR: System-One Judgment Gate Boundary

## Status

Accepted for 0.6.1.

## Context

`llmwiki-agent-bridge` assembles evidence, citations, graph summaries, and
runtime prompts from selected Knowledge Sources. A typed first-stage judgment
provider can help classify whether evidence is strong enough to synthesize,
whether source routing looks ambiguous, and whether source-tool exploration
should continue. The same integration can leak private source names or become
project-specific if it consumes raw local details or encodes custom wiki terms.

## Decision

Add System-One/Jev-style integration as an optional bridge-owned judgment
layer:

- Defaults are `off`.
- Runtime-route judgment supports `report-only` and explicit `enforce`.
- Source-routing, evidence-relevance, citation-support,
  progressive-disclosure, and graph-expansion judgments are report-only.
- Provider state is minimized and masked before every call.
- Source-policy blocked source descriptors are excluded from provider state.
- Source/page/graph/answer wording is summarized as structural signals before
  provider calls; provider state must not depend on source-specific labels or
  page text.
- Report-only graph-expansion and citation-support calls are skipped when the
  current request has no structural graph/multi-source or cited-anchor state to
  evaluate.
- MCP progressive-disclosure uses structural query/result counts instead of the
  raw source-tool query.
- `llmwiki-serve` remains provider-free; only the bridge owns this integration.

## Consequences

- Existing users see no behavior change unless they enable System-One modes.
- Report-only diagnostics can be used for local evaluation without changing
  answers or source calls.
- Enforce mode is a deliberate operator choice and may skip runtime synthesis.
- Future improvements must remain generic and must not hardcode source-specific
  words, page titles, project names, or wiki-specific traits.

## Follow-Ups

- Gather benchmark evidence before publishing answer-quality or token-savings
  claims.
- Revisit whether any report-only diagnostics should graduate to enforceable
  policies only after representative public fixtures and privacy tests exist.

## Links

- Spec: `specs/typesafe-jev-system-one-gate/`
