# ADR: Runtime Prompt Projection Quality Gates

## Status

Accepted.

## Context

`llmwiki-agent-bridge` can reduce runtime prompt size by changing how evidence
is rendered for the LLM. For `llmwiki-*` systems, size reduction is secondary:
answers must not omit required evidence, distort graph relationships, or lose
source/citation mappings.

Recent exploration compared compact JSON, TOON, markdown summary projection,
and CKG-like graph projection candidates. Graphify can produce external
`graph.json` files with nodes, edges, confidence, and source locations, but it
should remain optional evaluation input rather than a runtime dependency.

## Decision

- Keep canonical bridge artifacts and public contracts JSON-shaped.
- Treat runtime prompt rendering as a pluggable/evaluable projection layer.
- Add quality gates before token-size comparisons:
  - citation digest ids must map to top-level citations;
  - graph nodes and edges must carry valid citation indexes;
  - benchmark evidence paths must be portable and must not expose local roots;
  - live runtime smoke must require full required-anchor coverage with exact
    `[n](#citation-n)` anchors.
- Keep Graphify support eval-only by reading a pre-generated `graph.json`.
- Do not install, import, execute, or depend on Graphify from the Node package.
- Keep lossy renderers, including markdown summary projections, explicit and
  non-default until omission/distortion evals pass.

## Consequences

- Token savings alone cannot justify a renderer becoming the default.
- External graph generators can be compared without expanding production
  dependencies or runtime contracts.
- Some answer-quality metrics still require stronger oracle fixtures and live
  runtime evaluation.
- A renderer can fail live smoke even when it wins token-size comparisons.

## Follow-ups

- Add answer-level oracle fixtures for required facts, required relations,
  forbidden claims, and expected citation mappings.
- Add repeated live eval runs and per-fixture variance reporting.
- Consider model-specific tokenizer counts when tokenizer access is available.

## Links

- Rubric: `docs/runtime-prompt-evaluation.md`
- Spec: `specs/runtime-prompt-projection-quality/`
