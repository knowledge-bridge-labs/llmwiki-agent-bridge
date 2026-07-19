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
  - live runtime smoke must satisfy deterministic answer oracles when fixtures
    define required terms, required relations, or forbidden terms.
  - repeated live evaluation must report per-run outcomes and aggregate
    pass-rate/variance metrics.
  - live runtime smoke must record `finishReason`, an explicit `truncation`
    object, truncation counts, and fail strict runs when `finish_reason` is
    `length` or when missing `finish_reason` plus usage indicates
    `completion_tokens >= max_tokens`.
  - live runtime smoke must classify failed runs with stable `failureCodes`
    while retaining human-readable failure buckets for continuity.
  - strict fixtures may define `answerOracle.expectedCitationMappings` with a
    claim, `windowChars`, `require: "any" | "all"`, and either
    `expectedCitationIds` or `citationIndex`; configured claims must cite the
    expected anchor close to the claim.
  - expected citation mapping gates are independent from the broader answer
    oracle gate: `answerOracle.expectedCitationMappingsGate` or per-mapping
    `gate: "report-only"` records diagnostics without affecting strict live
    pass/failure-code classification, and fixture-level report-only cannot be
    upgraded by per-mapping `gate: "strict"` or `reportOnly: false`.
  - unresolved citation-id/index targets use the distinct
    `expected_citation_target_unresolved` failure code instead of
    `expected_citation_mismatch`.
- Keep Graphify support eval-only by reading a pre-generated `graph.json`.
- Do not install, import, execute, or depend on Graphify from the Node package.
- Keep lossy renderers, including markdown summary projections, explicit and
  non-default until omission/distortion evals pass.
- Allow `report-only` answer oracles only for calibration; strict gates are the
  default for production-quality fixtures.

## Consequences

- Token savings alone cannot justify a renderer becoming the default.
- External graph generators can be compared without expanding production
  dependencies or runtime contracts.
- Some answer-quality metrics still require stronger oracle fixtures and live
  runtime evaluation.
- A renderer can fail live smoke even when it wins token-size comparisons.
- Deterministic answer oracles are conservative: they catch known omissions and
  obvious distortions but do not replace semantic claim/citation judging.
- Repeated live runs make unstable renderers visible, but they increase live
  provider cost linearly with fixture, renderer, and run counts.
- Failure codes make truncation, runtime-call failures, citation-anchor
  failures, oracle omissions/distortions, and claim-citation proximity failures
  easier to aggregate across repeated runs.
- Citation-ID-based expected mappings let fixture authors avoid hard-coding
  fragile citation positions while preserving exact anchor checks in rendered
  answers.
- Multi-target mappings default to `require: "any"` for Loop 5 compatibility;
  `require: "all"` is opt-in when every target must appear in the same claim
  window.
- Repeated claim handling currently scans every occurrence and passes if any
  occurrence satisfies the mapping. This avoids first-occurrence false
  failures, but it is intentionally weaker than a future every-occurrence gate.
- The first real-runtime calibration smoke failed all strict runs, so current
  renderer readiness is blocked by answer-quality and evaluation-attribution
  gaps rather than by token-size comparison.

## Follow-ups

- Expand answer-level oracle fixtures for required facts, required relations,
  forbidden claims, and expected citation mappings.
- Run repeated live evals against real local/runtime models and record
  renderer-specific variance before changing defaults.
- Calibrate claim-citation window sizes with private-data-safe live smokes
  before treating live pass rates as renderer rankings.
- Consider an opt-in every-occurrence expected citation mapping mode after
  fixture authors distinguish introductory repeated claims from repeated
  supported claims.
- Consider model-specific tokenizer counts when tokenizer access is available.

## Links

- Rubric: `docs/runtime-prompt-evaluation.md`
- Spec: `specs/runtime-prompt-projection-quality/`
