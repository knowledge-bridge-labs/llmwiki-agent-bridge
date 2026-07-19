# Spec: Runtime Prompt Projection Quality

## Status

Draft.

## Problem

Runtime prompt projections can reduce context size but may make agents omit
facts, distort graph relations, or cite the wrong source. The bridge needs an
evaluation path that treats provenance and relation preservation as primary
quality gates.

## Goals

- Define machine-readable quality gates for runtime prompt evidence fixtures.
- Allow optional external graph fixtures, including Graphify-like `graph.json`,
  without adding production dependencies.
- Keep public bridge API and artifact contracts unchanged.
- Separate lossless codecs from lossy prompt projections in reports.
- Attribute live-runtime failures with stable local report codes before ranking
  prompt renderers.

## Non-Goals

- Do not make Graphify a package dependency.
- Do not claim compatibility with any external CKG standard.
- Do not change runtime synthesis defaults based only on token reduction.
- Do not expose local paths, private endpoints, credentials, or raw sensitive
  logs in reports or fixtures.

## Requirements

- `REQ-001`: Offline benchmark reports quality gates before renderer-size
  comparisons.
- `REQ-002`: Graph fixtures report citation coverage for nodes and edges.
- `REQ-003`: Graphify-like `graph.json` can be loaded as eval-only input.
- `REQ-004`: Graphify-like local or absolute source paths are converted to
  portable evidence paths.
- `REQ-005`: Live smoke fails responses that omit any required exact citation
  anchor or include invalid exact anchors.
- `REQ-006`: Live smoke fails responses that violate a fixture's deterministic
  answer oracle, including explicitly configured required, forbidden,
  unsupported, and contradictory patterns.
- `REQ-007`: Live evaluation can run each fixture/renderer multiple times and
  reports pass rate plus variance-sensitive aggregate metrics.
- `REQ-008`: Live evaluation captures `finishReason` and an explicit
  `truncation` object for each run.
- `REQ-009`: Strict live runs fail when `finish_reason` is `length` or when
  `finish_reason` is missing and usage indicates
  `completion_tokens >= max_tokens`.
- `REQ-010`: Live evaluation aggregates `finishReasonCounts`,
  `truncatedCount`, `failureCodeCounts`, and legacy `failureBucketCounts`.
- `REQ-011`: Fixture answer oracles can define
  `expectedCitationMappings` using `claim`, `windowChars`,
  `require: "any" | "all"`, and either `citationIndex` or
  citation-position-independent `expectedCitationIds`; omitted `require`
  defaults to `any`.
- `REQ-012`: Strict live runs fail when an expected claim is missing, the
  configured citation id/index cannot resolve, a wrong citation is near the
  claim, or the expected citation anchor is outside the claim window.
- `REQ-013`: Expected citation mapping gates are independent from
  `answerOracle.gate`; fixture-level or per-mapping report-only mappings keep
  diagnostics in `expectedCitationMappings` without making strict `run.pass`
  false or adding live failure buckets/codes. Fixture-level report-only
  dominates per-mapping strict settings; per-mapping gates may downgrade a
  strict fixture to report-only but cannot upgrade a report-only fixture to
  strict.
- `REQ-014`: Unknown `expectedCitationIds` and invalid citation indexes are
  reported with unresolved target metrics/details and the strict failure code
  `expected_citation_target_unresolved`.
- `REQ-015`: Expected citation mappings evaluate every occurrence of the claim
  phrase and, by default, pass when any occurrence satisfies the configured
  citation target condition.
- `REQ-016`: Expected citation mappings support
  `occurrenceMode: "any" | "every"` independently from `require`; omitted
  `occurrenceMode` defaults to `any`, and `every` requires each repeated claim
  occurrence to satisfy the mapping.
- `REQ-017`: Expected citation mapping reports include aggregate occurrence
  metrics: `claimOccurrenceCount`, `satisfiedOccurrenceCount`,
  `unsatisfiedOccurrenceCount`, and `occurrenceCoveragePct`.
- `REQ-018`: Strict every-occurrence mapping failures emit the distinct
  `expected_citation_every_occurrence_failed` failure code and corresponding
  aggregate failure-code metrics.
- `REQ-019`: Answer oracles support configured `unsupportedClaims` and
  `contradictoryClaims` pattern checks, report `unsupportedClaimHitCount` and
  `contradictoryClaimHitCount`, and emit distinct strict failure codes
  `oracle_unsupported_claim` and `oracle_contradiction` while preserving the
  broad `oracle_distortion` code.
- `REQ-020`: When `answerOracle.gate` is `report-only`, answer-oracle
  diagnostics remain visible but strict answer-oracle failure buckets/codes are
  not emitted.
- `REQ-021`: `answerOracle.metrics.distortionCount` aggregates all configured
  negative-pattern hits: forbidden terms, forbidden claims, unsupported claims,
  and contradictory claims.
- `REQ-022`: Live renderer and totals reports aggregate expected-citation
  occurrence metrics, including average occurrence coverage and total claim,
  satisfied, and unsatisfied occurrence counts. The aggregate
  `expectedCitationMappings` shape includes `enabledRunCount`,
  `expectedMappingCount`, `satisfiedMappingCount`, `averageCoveragePct`,
  `claimOccurrenceCount`, `satisfiedOccurrenceCount`,
  `unsatisfiedOccurrenceCount`, `occurrenceCoveragePct`,
  `averageOccurrenceCoveragePct`, `strictEveryOccurrenceFailureCount`,
  `strictTargetResolutionFailureCount`,
  `strictExpectedCitationMismatchCount`, and `strictProximityFailureCount`.
- `REQ-023`: Live renderer and totals reports aggregate answer-oracle quality
  metrics needed for renderer comparison: unsupported claim hits,
  contradictory claim hits, aggregate distortion counts, average omission rate,
  and average required-item coverage. Aggregate reports split strict and
  report-only diagnostics, including `strictUnsupportedClaimHitCount`,
  `strictContradictoryClaimHitCount`, and `strictDistortionCount`.
- `REQ-024`: Offline renderer reports declare
  `offlineComparisonBasis: "size-only"` at the top level, every fixture-level
  and totals-level comparison includes `basis: "size-only"`, and offline mode
  does not emit `recommendation` or `recommendedRendererId` fields. Offline
  byte/char/estimated-token comparisons must not be interpreted as
  recommendations or readiness decisions.
- `REQ-025`: Live reports include a quality-first recommendation object that
  ranks renderers by size only after strict live `passRatePct` is 100,
  failure-code counts are empty, no truncation or inferred truncation is
  detected, strict unsupported/contradictory/distortion hits are zero, and all
  strict expected-citation occurrence, target-resolution, mismatch, and
  proximity gates are satisfied.
- `REQ-026`: When no live renderer satisfies the strict quality-first
  eligibility gate, the recommendation is blocked with renderer-specific
  reasons instead of selecting the smallest renderer.
