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
- Maintain representative built-in strict fixtures that stress citation
  fidelity, relation preservation, repeated claims, and privacy-source safety.
- Isolate prompt-contract failures from renderer-specific information loss
  before changing oracle tolerance.

## Non-Goals

- Do not make Graphify a package dependency.
- Do not claim compatibility with any external CKG standard.
- Do not change runtime synthesis defaults based only on token reduction.
- Do not expose local paths, private endpoints, credentials, or raw sensitive
  logs in reports or fixtures.
- Do not add synonym tolerance or weaken strict oracle checks before live
  prompt-contract versus renderer-loss causes are isolated.

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
- `REQ-027`: The default built-in benchmark fixture set includes a private-data
  safe strict fixture `graph-strict-evidence-fidelity` that covers a
  promotion-gate multi-hop citation mapping, relation omission detection,
  exact-anchor mismatch detection, every-occurrence repeated citation
  enforcement, unsupported/contradictory claim distortion checks, and a
  privacy/source-path claim. The fixture must keep graph node and edge citation
  coverage at 100% and `nonPortableSourcePathCount` at 0.
- `REQ-028`: Live benchmark runtime messages include a strict
  claim-preserving prompt contract that tells the runtime to preserve
  configured claim phrases and graph relation phrases, keep relation verbs
  readable such as `measured_by` as "measured by", place exact markdown
  citation anchors `[n](#citation-n)` near each supported claim, cite every
  occurrence when strict repeated-citation gates ask for it, and avoid
  evidence-free claims. This is benchmark behavior and does not change the
  production bridge runtime contract.
- `REQ-029`: Live reports include a safe diagnostic summary for cause
  isolation at fixture/renderer/run or aggregate scope, including
  `live.totals.renderers[rendererId].diagnosticSummary`. The summary may
  include fixture id, renderer id, failure codes, missing configured oracle
  terms/relations, missing configured expected claim phrases, citation
  coverage, finish reason, truncation, and `outputTextLength`; it must not
  include raw `outputText`, private endpoints, configured model names, keys,
  temp paths, or local absolute paths.
- `REQ-030`: Live benchmark user prompts include a clearly labeled
  benchmark-only strict claim checklist when the fixture has effective strict
  `answerOracle.expectedCitationMappings`. The checklist is derived from those
  mappings and includes exact configured claim phrases, resolved exact
  markdown citation anchors such as `[1](#citation-1)`, strict/required gate
  status, target requirement semantics, occurrence intent including
  every-occurrence mappings, and nearby/window citation intent. Fixtures
  without effective strict expected citation mappings omit the checklist or
  keep it harmless. This prompt aid must not weaken strict answer-oracle,
  expected-citation, repeated-occurrence, distortion, unsupported,
  contradictory, or citation-anchor validation, and reports must remain free of
  raw model output and private runtime/local values.
- `REQ-031`: Live benchmark user prompts include a clearly labeled
  benchmark-only strict answer-format skeleton when effective strict
  `answerOracle.expectedCitationMappings` can be resolved to exact citation
  anchors. The skeleton is coverage-aware: it emits one claim row per effective
  strict mapping, with the exact configured claim phrase ending in the exact
  resolved markdown citation anchor or anchors, and then emits required
  citation-coverage rows for top-level citation anchors not already forced by
  those claim rows. A limitations row appears only after all claim,
  citation-coverage, and oracle coverage rows and states that factual
  limitations also need citations. Fixtures
  without effective strict expected citation mappings and without supplemental
  top-level citation coverage rows omit the skeleton. This remains
  benchmark-only/live-eval-only behavior and must not change or loosen
  answer-oracle, expected-citation, occurrence, distortion, unsupported,
  contradictory, truncation, or citation-anchor validation.
- `REQ-032`: The benchmark-only strict answer-format skeleton also emits
  oracle coverage rows after strict expected-citation claim rows and
  supplemental citation-coverage rows. Rows are derived generically from strict
  `answerOracle.requiredTerms`, `requiredPhrases`, and `requiredRelations`
  that are not already textually covered by the strict claim rows. Each row
  instructs the runtime to write one evidence-supported sentence including the
  required oracle text and ending with an exact markdown citation anchor,
  preferring a determinable top-level supporting anchor and otherwise the
  nearest supporting evidence anchor. Fixtures without effective strict
  expected citation mappings, or without a strict answer oracle, omit oracle
  coverage rows. This remains benchmark-only/live-eval-only behavior and must
  not change or loosen answer-oracle, expected-citation, occurrence,
  distortion, unsupported, contradictory, truncation, or citation-anchor
  validation.
- `REQ-033`: A tracked private-safe live validation wrapper invokes the
  benchmark in `--live` mode with documented profiles and pass-through
  benchmark arguments, writes raw child stdout/stderr only to OS temp files,
  enforces an overall timeout, scans raw files and the emitted summary for raw
  `"outputText"` fields, configured endpoint/model/key values, key-like
  tokens, bearer tokens, `api_key` query values, temp paths, and absolute local
  paths, and prints only sanitized aggregate JSON. The wrapper exits nonzero
  when the child exits nonzero, times out, produces unparsable JSON, or any
  sensitive scan fails.
- `REQ-034`: The benchmark-only strict answer-format skeleton includes a
  mandatory completeness checklist before expected-claim skeleton rows and
  labels every strict expected-citation mapping row as an
  `Expected claim row`. The checklist states that the final answer must include
  every `Expected claim row` exactly once; that expected-claim rows are not
  optional and must not be omitted, split, merged, or rephrased; and that
  multi-hop expected-claim rows must stay intact with all shown anchors on the
  same row and anchors remaining on or near that claim row. This applies only
  when effective strict expected citation mappings render a skeleton; fixtures
  without effective strict mappings remain free of checklist and skeleton rows.
  This remains benchmark-only/live-eval-only behavior and must not change or
  loosen answer-oracle, expected-citation mapping, occurrence, distortion,
  unsupported, contradictory, truncation, or citation-anchor validation.
- `REQ-035`: The benchmark-only strict answer-format skeleton includes an
  allowed exact citation-anchor set derived from the fixture's top-level
  citations, such as `[1](#citation-1)` through `[N](#citation-N)`, and tells
  the runtime not to invent or use any other citation anchor. It also tells the
  runtime to omit unsupported factual claims instead of creating a new anchor
  when no allowed anchor supports the claim. Fixtures that omit the strict
  skeleton also omit this allowed-anchor guidance. This remains
  benchmark-only/live-eval-only behavior and must not change or loosen
  `citation_anchor_invalid` validation.
- `REQ-036`: Live diagnostic summaries and the private-safe live wrapper
  preserve invalid exact citation-anchor diagnostics as exact anchor tokens and
  aggregate counts only, for example `invalidCitationAnchors` and
  `invalidCitationAnchorCounts`. They must not expose raw answer output,
  offsets, surrounding text, private endpoints, configured model names, keys,
  temp paths, or local absolute paths. Invalid anchors still fail strict live
  validation with `citation_anchor_invalid`.
