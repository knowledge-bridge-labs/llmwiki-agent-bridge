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
  - answer oracles may explicitly configure `unsupportedClaims` and
    `contradictoryClaims`; these are deterministic pattern checks, not general
    semantic judging, and strict runs fail when the configured patterns appear
    even if citation anchors are complete.
  - answer-oracle `distortionCount` aggregates all configured negative-pattern
    hits: forbidden terms, forbidden claims, unsupported claims, and
    contradictory claims. Strict unsupported/contradictory hits retain distinct
    failure codes while also preserving broad distortion accounting.
  - report-only answer-oracle failures remain diagnostic and do not emit strict
    live failure buckets/codes.
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
  - expected citation mappings may also set
    `occurrenceMode: "any" | "every"` independently from `require`; omitted
    `occurrenceMode` preserves pass-if-any repeated-claim behavior, while
    `every` requires each repeated claim occurrence to satisfy the configured
    citation target condition.
  - expected citation mapping gates are independent from the broader answer
    oracle gate: `answerOracle.expectedCitationMappingsGate` or per-mapping
    `gate: "report-only"` records diagnostics without affecting strict live
    pass/failure-code classification, and fixture-level report-only cannot be
    upgraded by per-mapping `gate: "strict"` or `reportOnly: false`.
  - unresolved citation-id/index targets use the distinct
    `expected_citation_target_unresolved` failure code instead of
    `expected_citation_mismatch`.
  - every-occurrence mapping failures use occurrence metrics and the distinct
    `expected_citation_every_occurrence_failed` failure code.
  - live renderer and totals reports aggregate expected-citation occurrence
    coverage and total claim occurrence counts so repeated-claim citation
    discipline can be compared across renderers.
  - live renderer and totals reports aggregate answer-oracle unsupported claim
    hits, contradictory claim hits, aggregate distortion counts, omission rate,
    and required-item coverage so quality comparisons do not depend on reading
    individual run records.
  - strict and report-only diagnostics are split in aggregate reports; strict
    unsupported, contradictory, distortion, and expected-citation failure
    counts participate in recommendation eligibility, while report-only counts
    remain visible for fixture calibration.
- Mark offline byte/char/estimated-token comparisons as `size-only`; offline
  size comparisons are never readiness recommendations:
  - offline reports declare top-level
    `offlineComparisonBasis: "size-only"`;
  - every fixture-level and totals-level offline comparison declares
    `basis: "size-only"`;
  - offline mode may include a `live.enabled: false` skip note, but it does
    not emit `recommendation` or `recommendedRendererId` fields.
- Add a live `quality-first` recommendation object:
  - each renderer is eligible only when strict live pass rate is 100% and
    strict quality failures are zero;
  - strict quality failures include failure-code counts, truncation or inferred
    truncation, strict unsupported/contradictory/distortion hits, and strict
    expected-citation occurrence, target-resolution, mismatch, or proximity
    failures;
  - size ranking is applied only among eligible renderers;
  - when no renderer is eligible, recommendation is blocked with
    renderer-specific reasons.
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
  failures, oracle omissions/distortions, unsupported or contradictory claim
  hits, and claim-citation proximity or occurrence failures easier to aggregate
  across repeated runs.
- Citation-ID-based expected mappings let fixture authors avoid hard-coding
  fragile citation positions while preserving exact anchor checks in rendered
  answers.
- Multi-target mappings default to `require: "any"` for Loop 5 compatibility;
  `require: "all"` is opt-in when every target must appear in the same claim
  window.
- Repeated claim handling scans every occurrence and defaults to pass-if-any to
  avoid first-occurrence false failures. Fixtures that need stricter evidence
  discipline can opt into every-occurrence mode.
- Unsupported and contradictory claim checks are intentionally explicit
  configured-pattern detectors; they improve deterministic attribution but do
  not replace a semantic judge. They are counted in aggregate distortion
  metrics while also retaining distinct category metrics and failure codes.
- Live renderer comparison can now be read from aggregate report fields instead
  of manually inspecting each run, but the aggregate metrics remain only as
  good as the checked-in oracle fixtures.
- Smaller prompt renderers can be measured offline but cannot be recommended
  by the live report unless strict live quality gates pass first.
- The representative strict-fixture follow-up is addressed by the built-in
  `graph-strict-evidence-fidelity` evaluation fixture. This is an eval-only
  fixture and documentation/test consistency update, so it does not require a
  new ADR and introduces no public contract or API change.
- The first real-runtime calibration smoke failed all strict runs, so current
  renderer readiness is blocked by answer-quality and evaluation-attribution
  gaps rather than by token-size comparison.

## Follow-ups

- Expand answer-level oracle fixtures for required facts, required relations,
  forbidden claims, unsupported claims, contradictory claims, and expected
  citation mappings.
- Run repeated live evals against real local/runtime models and record
  renderer-specific variance before changing defaults.
- Calibrate claim-citation window sizes with private-data-safe live smokes
  before treating live pass rates as renderer rankings.
- Calibrate every-occurrence expected citation mapping usage so fixtures
  distinguish introductory repeated claims from repeated supported claims.
- Keep fixture patterns compact and promotion-relevant; prefer
  `expectedCitationIds` and avoid private endpoints, model names, credentials,
  raw live answers, or absolute local paths in checked-in material.
- Consider model-specific tokenizer counts when tokenizer access is available.

## Links

- Rubric: `docs/runtime-prompt-evaluation.md`
- Spec: `specs/runtime-prompt-projection-quality/`
