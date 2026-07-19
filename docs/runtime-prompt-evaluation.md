# Runtime Prompt Projection Evaluation

This document defines the evaluation rubric for runtime prompt renderers and
graph-shaped projection candidates. The primary objective is low omission and
distortion. Token reduction is useful only after provenance and relation
quality gates pass.

## Required Rubric

| Gate | Metric | Required outcome |
| --- | --- | --- |
| Canonical evidence safety | Public artifact/API remains JSON-shaped and unchanged | No OpenAPI or artifact contract change unless a separate contract spec exists |
| Citation mapping | `citationDigest` ids map to top-level `citations` | 100% |
| Graph provenance | Every `graphNodes` and `graphEdges` entry has a valid citation index | 100% for graph fixtures |
| Portable evidence | Benchmark evidence paths do not expose local roots, parent paths, URLs, or private endpoints | 0 non-portable paths |
| Runtime citation exactness | Live responses cover every required exact `[n](#citation-n)` anchor and no invalid exact anchors | Required for live smoke pass |
| Runtime completion | Live responses report `finishReason`, `truncation`, and aggregate truncation counts | `finish_reason=length` and inferred max-token exhaustion fail strict runs |
| Lossy renderer isolation | Lossy projections are labeled and cannot silently become the production contract | Must be explicit candidate/eval-only |
| Reproducibility | Offline benchmark does not call provider/runtime/network | Required |
| Offline comparison basis | Offline reports declare top-level and per-comparison size-only basis | `offlineComparisonBasis: "size-only"` and every fixture/totals comparison `basis: "size-only"`; no offline recommendation fields |
| Answer oracle | Live outputs cover configured required terms/relations and avoid explicitly configured forbidden, unsupported, and contradictory patterns | Required when a fixture defines a strict oracle |
| Expected citation mappings | Configured claims resolve to expected citation anchors within `windowChars`, with opt-in every-occurrence mode for repeated claims | Required when a strict fixture defines mappings |
| Failure taxonomy | Live reports include `failureCodes` and aggregate `failureCodeCounts` | Required for failure attribution |
| Live recommendation | `live.recommendation` ranks renderers quality-first | Size can recommend a renderer only after strict live pass rate is 100% and strict quality failures are zero |
| Representative strict fixture coverage | Built-in strict fixtures include multi-hop citation mappings, every-occurrence repeated claims, nearby-wrong-anchor failures, unsupported/contradictory claims, and privacy/source-path claims | Required before using live recommendations as promotion evidence |

Fixtures may set an answer oracle to `report-only` while a new oracle is being
calibrated. Production-quality fixture gates should remain strict. Report-only
answer-oracle diagnostics remain in the report, but strict live
`failureCodes`/`failureBuckets` are not emitted for answer-oracle failures when
`answerOracle.gate` is `report-only`.

Answer oracles are deterministic configured-pattern checks, not general
semantic judges. `unsupportedClaims` and `contradictoryClaims` use the same
literal/string, `anyOf`, and `allOf` matching style as existing oracle fields.
They fail strict runs even when all required citation anchors are present.
Reports include `unsupportedClaimHitCount` and
`contradictoryClaimHitCount`. `distortionCount` is the aggregate count of
configured negative-pattern hits across `forbiddenTerms`, `forbiddenClaims`,
`unsupportedClaims`, and `contradictoryClaims`; strict failure classification
emits the broad `oracle_distortion` code plus the distinct
`oracle_unsupported_claim` or `oracle_contradiction` code when those categories
are hit.
Renderer-level and totals-level live aggregates include the same answer-oracle
categories for comparison: unsupported and contradictory claim hit counts,
aggregate `distortionCount`, average omission rate, and average required-item
coverage. Required-item coverage is derived from the configured required term,
phrase, and relation checks; it is still a deterministic fixture-pattern
metric, not an LLM judge.
The aggregate `answerOracle` object also splits strict from report-only
diagnostics with `strictUnsupportedClaimHitCount`,
`strictContradictoryClaimHitCount`, `strictDistortionCount`,
`reportOnlyUnsupportedClaimHitCount`, `reportOnlyContradictoryClaimHitCount`,
and `reportOnlyDistortionCount`. Strict counts participate in recommendation
eligibility; report-only counts remain visible for calibration but do not block
eligibility.

Metric interpretation note: `distortionCount` is a configured
negative-pattern hit aggregate and may include unsupported or contradictory
claim hits when those categories are configured. `strictQualityFailureCount`
is a quality-first eligibility guard for renderer recommendation and may
intentionally count overlapping failure indicators; it should not be read as
an orthogonal defect count.

Expected citation mappings are calibrated independently from the rest of the
answer oracle. Fixtures may set `answerOracle.expectedCitationMappingsGate` to
`report-only`, or set an individual mapping `gate: "report-only"`, to keep
diagnostics in the report without making `run.pass` false or emitting live
`failureCodes`/`failureBuckets`. Fixture-level report-only dominates: an
individual mapping cannot opt back into strict mode with `gate: "strict"` or
`reportOnly: false`. Per-mapping gates may only downgrade a strict fixture to
report-only. If omitted, expected citation mappings are strict even when the
broader answer oracle is report-only.

Each mapping supports two independent modes. `require: "any" | "all"` controls
target semantics over `expectedCitationIds`/`citationIndexes`; the default is
`any` to preserve the Loop 5 behavior where one matching target satisfied a
multi-target mapping. `all` requires every resolved unique citation index in
the same claim window. `occurrenceMode: "any" | "every"` controls repeated
claim semantics; the default is `any` to preserve Loop 6 pass-if-any occurrence
behavior. `every` requires each found claim occurrence to satisfy the mapping.
Reports include `claimOccurrenceCount`, `satisfiedOccurrenceCount`,
`unsatisfiedOccurrenceCount`, `occurrenceCoveragePct`, and
`expected_citation_every_occurrence_failed` for strict every-occurrence
failures.
Unknown `expectedCitationIds` and out-of-range citation indexes are reported as
target-resolution failures with `expected_citation_target_unresolved`, not as
wrong-nearby-citation mismatches.
Live renderer and totals aggregates also roll these occurrence fields up as
totals plus `occurrenceCoveragePct` and
`averageExpectedCitationOccurrenceCoveragePct`, so renderer comparison can
distinguish "some mapped claims passed" from "every configured claim occurrence
stayed cited." The aggregate `expectedCitationMappings` object includes
`enabledRunCount`, `expectedMappingCount`, `satisfiedMappingCount`,
`averageCoveragePct`, `claimOccurrenceCount`,
`satisfiedOccurrenceCount`, `unsatisfiedOccurrenceCount`,
`occurrenceCoveragePct`, `averageOccurrenceCoveragePct`,
`strictEveryOccurrenceFailureCount`, `strictTargetResolutionFailureCount`,
`strictExpectedCitationMismatchCount`, and `strictProximityFailureCount`.

Offline benchmark comparisons remain size-only. Offline reports declare
`offlineComparisonBasis: "size-only"` at the top level, and each fixture-level
and totals-level comparison keeps the existing byte/char/estimated-token
savings fields while also declaring `basis: "size-only"`. Offline size reports
never imply renderer readiness and must not emit `recommendation` or
`recommendedRendererId` fields when `--live` is omitted. The offline
`live.enabled: false` note is only a skip notice, not a winner selection.

When `--live` is enabled, `live.recommendation` reports a quality-first
ranking. A renderer is eligible only when strict live `passRatePct` is `100`,
failure-code counts are empty, no truncation or inferred truncation was
detected, strict unsupported/contradictory/distortion hits are zero, and all
strict expected-citation occurrence, target-resolution, mismatch, and proximity
gates are satisfied. Among eligible renderers, the recommendation uses
`runtimeUserPrompt.estimatedTokens` as the size metric. If no renderer is
eligible, the recommendation is blocked with renderer-specific reasons and
`recommendedRendererId: null`.

## Fixture Authoring Notes

- Keep fixtures compact by making each oracle pattern target a decision
  distinction that affects renderer promotion: required terms for essential
  facts, required relations for graph shape, and negative patterns only for
  known unsupported or contradictory claims.
- Prefer `expectedCitationIds` over numeric indexes so fixture edits can
  reorder citations without rewriting mapping intent.
- Use short `claim` phrases that should appear verbatim in good answers. If a
  fixture expects repeated claims, start with omitted `occurrenceMode` (`any`)
  during calibration and opt into `occurrenceMode: "every"` only when every
  repetition must be cited.
- Use `report-only` gates only while calibrating a new fixture. A renderer
  recommendation ignores report-only failures, but production-quality fixtures
  should make promotion-relevant checks strict.
- Use `graph-strict-evidence-fidelity` as the representative built-in pattern
  for strict fixture authoring. It combines a `require: "all"` multi-hop
  mapping, an `occurrenceMode: "every"` repeated claim, exact-anchor mismatch
  coverage, unsupported/contradictory claim checks, and a privacy/source-path
  claim without private paths or endpoints.
- Do not include private endpoints, model names, keys, raw live answers, or
  absolute local paths in checked-in fixtures or docs.

## Scored Loop Rubric

Each development loop reports a scored rubric. Required gates are still
fail-closed: any required gate scored `0` means the loop is not complete even
if the weighted total is high.

| Score | Meaning |
| --- | --- |
| 0 | Not implemented, not measured, or unsafe |
| 1 | Implemented only as a sketch or manual check |
| 2 | Automated but incomplete or easy to bypass |
| 3 | Automated and covers the main happy/failure path |
| 4 | Automated, documented, and regression-tested |
| 5 | Automated, documented, regression-tested, and produces decision-ready metrics |

## Flexible Rubric

These metrics can evolve as fixtures improve:

- Required fact recall beyond exact term matching.
- Required relation preservation beyond exact relation phrase matching.
- Unsupported claim rate.
- Contradiction or distorted relation count.
- Richer semantic citation support checks beyond configured claim/citation
  proximity windows.
- Per-fixture and per-renderer variance over repeated live runs.
- Actual model tokenizer counts when the served model tokenizer is available.

## Current Candidate Classes

| Candidate | Role | Quality note |
| --- | --- | --- |
| Compact JSON | Lossless baseline runtime renderer | Safe shape, but live smoke must prove citation behavior |
| TOON | Lossless structured codec candidate | Useful mainly when repeated row structure dominates |
| Markdown summary | Lossy prompt projection | Must be evaluated separately for omission/distortion |
| Graphify/CKG-like fixture | External graph evidence candidate | Eval-only; loaded from pre-generated `graph.json`, not a runtime dependency |
| `graph-strict-evidence-fidelity` | Built-in strict synthetic graph fixture | Promotion-relevant evidence-fidelity stress case for live oracle and expected-citation gates |

## Iteration Log

### Loop 1: Graphify/CKG-like eval fixture

- Research/analysis: Graphify can generate `graph.json` with nodes, edges,
  relation, confidence, and source location fields. `ckg-mcp` domain graphs are
  separate human-reviewed CSV DAG catalogs.
- TDD target: a temporary Graphify-like `graph.json` can be loaded into the
  runtime prompt benchmark without adding a Graphify dependency.
- Quality gates added: graph citation coverage, citation digest mapping, and
  portable source path checks.
- Retrospective: this is still mostly an evidence-shape gate. The live citation
  smoke was tightened to require full required-anchor coverage, but semantic
  answer-level omission/distortion remains the next loop.

### Loop 2: Deterministic answer oracle

- Research/analysis: answer-level omission and distortion can be partially
  checked without an LLM judge by giving fixtures explicit required terms,
  required relations, and forbidden terms.
- TDD target: live mock responses that cover all citation anchors but omit a
  required relation must fail.
- Quality gates added: per-renderer answer-oracle term coverage, relation
  coverage, and forbidden-term hit counts.
- Retrospective: this catches deterministic omissions and obvious distortions.
  It does not prove semantic support between each claim and citation; that
  remains future work.

### Loop 3: Repeated live variance reporting

- Research/analysis: a single live response can hide unstable prompt behavior.
  Runtime prompt candidates need repeated-run pass rate and variance metrics
  before size comparisons are decision-ready.
- TDD target: repeated live mock responses with one strict failed run must fail
  overall while reporting pass rate, per-run records, coverage range, latency,
  and token averages.
- Quality gates added: `--live-runs`, per-run failure labels, aggregate
  pass-rate, coverage variance, latency/output ranges, and usage averages.
- Retrospective: repeated live runs improve observability of instability, but
  live provider variance still needs real model runs outside the offline CI
  mock.

### Loop 4: Real runtime calibration smoke

- Research/analysis: ran the `graph-linear-chain` fixture against a configured
  private OpenAI-compatible runtime with `--live-runs 2` for compact JSON,
  markdown summary, and TOON. No endpoint, model name, key, or raw response text
  is recorded here.
- TDD target: no new code target; this loop used the Loop 3 repeated-run
  harness to calibrate the rubric against a real runtime.
- Result: all 6 strict runs failed. Compact JSON reported 0% pass rate, 83.34%
  average citation coverage, 66.67% average oracle term coverage, and 0%
  average oracle relation coverage. Markdown summary reported 0% pass rate,
  100% average citation coverage, 33.33% average oracle term coverage, and 50%
  average oracle relation coverage. TOON reported 0% pass rate, 100% average
  citation coverage, 50% average oracle term coverage, and 75% average oracle
  relation coverage.
- Subagent rubric review: treat this as a failed renderer-readiness loop with
  useful observability, not as a failed experiment. The current metrics still
  conflate renderer, prompt contract, model behavior, output length, and oracle
  brittleness.
- Retrospective: do not promote any renderer based on current live results.
  The next loop should add failure taxonomy, finish-reason/truncation capture,
  fixture-specific expected citation mappings, and stronger claim-to-citation
  checks before ranking renderers.

### Loop 5: Failure taxonomy and claim-citation proximity

- Research/analysis: exact required-anchor coverage is not enough because a
  response can stuff all citation anchors far from the claims they support.
  Runtime completion also needs explicit attribution because truncated answers
  can still mention every required anchor.
- TDD target: deterministic local mock responses fail when `finish_reason` is
  `length`, when `finish_reason` is missing but `completion_tokens` reaches
  `max_tokens`, and when all anchors are present but configured expected
  citation mappings are outside the claim window.
- Quality gates added: per-run `finishReason`, explicit `truncation` object,
  inferred truncation from usage/max-token exhaustion, `failureCodes`,
  aggregate `finishReasonCounts`, `truncatedCount`, `failureCodeCounts`,
  `failureBucketCounts`, fixture `answerOracle.expectedCitationMappings` with
  `expectedCitationIds` or `citationIndex`, and
  `averageExpectedCitationMappingCoveragePct` at renderer and totals levels.
- Retrospective: this remains a deterministic local gate, not an LLM judge.
  It improves attribution for renderer comparisons without recording private
  endpoint, model, key, or raw live response details in repository docs.

### Loop 6: Expected citation mapping semantics

- Research/analysis: Loop 5 mappings were useful but too coarse. Multi-target
  mappings needed explicit `any`/`all` semantics, citation-id resolution needed
  report-visible unresolved target details, and repeated claims could fail
  incorrectly when the first occurrence was uncited.
- TDD target: deterministic local tests cover missing expected claims, unknown
  citation ids/out-of-range indexes, report-only mappings that do not affect
  strict pass/failure codes, fixture-level report-only dominance over strict
  per-mapping overrides, `any`/`all` pass and failure behavior, and repeated
  claim occurrences where a later occurrence is correctly cited.
- Quality gates added: independent expected-citation-mapping gate selection,
  per-mapping `require`, unresolved target metrics/details, distinct
  `expected_citation_target_unresolved` failure code, and all-occurrence
  scanning with current pass-if-any-occurrence semantics.
- Retrospective: Loop 6 kept the minimal pass-if-any repeated-claim behavior
  requested for that implementation and left stricter repeated-claim
  enforcement for a later opt-in mode.

### Loop 7: Every-occurrence mappings and configured claim failures

- Research/analysis: repeated claim support needed an opt-in stricter mode
  without changing Loop 6 defaults, and answer-oracle failures needed distinct
  configured unsupported/contradictory claim categories instead of treating all
  disallowed text as generic distortion.
- TDD target: deterministic tests cover default-any repeated-claim
  compatibility, `occurrenceMode: "every"` pass/fail behavior, report-only
  every-occurrence diagnostics, unsupported claim failures, contradictory claim
  failures, preserved forbidden-pattern distortion classification, and
  report-only answer-oracle classification suppression.
- Quality gates added: per-mapping `occurrenceMode`, aggregate occurrence
  metrics, `expected_citation_every_occurrence_failed`, configured
  `unsupportedClaims`, configured `contradictoryClaims`,
  `oracle_unsupported_claim`, and `oracle_contradiction`.
- Retrospective: these checks are explicit fixture-pattern gates, not semantic
  judging. They increase attribution fidelity for local deterministic evals
  while keeping public artifacts and OpenAPI unchanged.

### Loop 8: Decision-ready live renderer recommendation

- Research/analysis: live reports had enough per-run diagnostics to explain
  failures but still required manual aggregation before comparing renderers.
  Size comparisons also needed an explicit guardrail so a smaller but
  quality-failing renderer could not be promoted.
- TDD target: deterministic local mock runtime tests cover a smaller renderer
  that fails strict quality gates and is blocked from recommendation, plus a
  size-saving renderer that passes strict quality gates and becomes eligible.
  Additional tests cover repeated-run occurrence aggregation, all renderers
  failing with no winner, and report-only diagnostics remaining visible without
  blocking eligibility.
- Quality gates added: renderer-level and totals-level aggregates for expected
  citation occurrence coverage, answer-oracle unsupported/contradictory hits,
  distortion counts, omission rate, required-item coverage, and a
  `live.recommendation` object with quality-first eligibility and
  renderer-specific blocking reasons.
- Retrospective: the report is now decision-ready for renderer comparison when
  live fixtures are strict and representative. Offline byte/token comparisons
  remain useful sizing inputs only, not readiness signals.

### Loop 9: Explicit offline size-only basis

- Research/analysis: the offline report already carried size-only comparison
  fields, but the regression tests and docs needed to make clear that offline
  byte/token comparisons are not recommendations.
- TDD target: offline benchmark tests assert top-level
  `offlineComparisonBasis: "size-only"`, every fixture-level and totals-level
  comparison `basis: "size-only"`, and no `recommendation` or
  `recommendedRendererId` fields when `--live` is omitted.
- Quality gates added: explicit regression coverage for the offline report
  boundary between size measurements and live quality-gated readiness.
- Retrospective: no benchmark implementation change was needed; this loop
  turned the existing size-only semantics into executable acceptance checks so
  token savings cannot be mistaken for renderer promotion.

### Loop 10: Representative strict evidence-fidelity fixture

- Research/analysis: strict fixture coverage was still too simple because the
  main strict graph fixture was a short linear chain. Renderer promotion needed
  a built-in fixture that directly stresses omission, distortion, repeated
  citation discipline, exact claim-anchor mapping, and privacy/source-path
  fidelity before token savings.
- TDD target: the default offline benchmark includes
  `graph-strict-evidence-fidelity` with 100% graph node/edge citation coverage,
  zero non-portable source paths, and no private-looking serialized path,
  endpoint, or key patterns. Live mock tests cover a passing answer that is
  recommendation-eligible, a multi-hop relation omission, a wrong nearby
  citation anchor while global anchors are covered, a repeated claim cited only
  once under `occurrenceMode: "every"`, and unsupported plus contradictory
  claims.
- Quality gates added: a compact synthetic built-in fixture with five
  citations and five key graph edges: Promotion Decision requires Citation
  Fidelity Gate; Citation Fidelity Gate is measured by Live Prompt Evaluation;
  Live Prompt Evaluation checks Exact Citation Anchor; Citation Fidelity Gate
  enforces Repeated Citation Gate; Privacy Redaction Gate blocks Source Path
  Leak.
- Retrospective: this completes the representative strict-fixture follow-up
  without changing public contracts or architecture. The checks remain
  deterministic configured-pattern gates; future real-runtime calibration
  should use this fixture alongside `graph-linear-chain`.

### Loop 11: Private-safe repeated real-runtime smoke

- Research/analysis: ran a fallback `--live-runs 1` smoke against the
  configured legacy `HERMES_*` real-runtime environment using
  `graph-linear-chain` and `graph-strict-evidence-fidelity` across compact
  JSON, markdown summary, and TOON. Raw stdout/stderr stayed outside the repo;
  no endpoint, model name, key, raw answer text, temp path, or private local
  path is recorded here.
- TDD target: no new code target; this loop records private-safe manual live
  acceptance using the existing repeated live benchmark and redaction checks.
- Result: strict live gates failed and no renderer was recommendation-eligible.
  The live report had `live.status: failed`,
  `recommendation.status: blocked`, `recommendedRendererId: null`, and
  `requestCount: 6`.
- Table note: each per-renderer `Pass/fail 0 / 2` entry means two fixture-runs
  in fallback `--live-runs 1` mode: one run of `graph-linear-chain` and one
  run of `graph-strict-evidence-fidelity`. It does not mean two repeated live
  runs of the same fixture.

  | Renderer | Pass rate | Pass/fail | Failure code counts | Truncated / inferred | Avg required citation anchor coverage | Avg answer-oracle required-item coverage | Avg expected citation mapping coverage | Avg expected citation occurrence coverage | Recommendation strict quality failures |
  | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
  | compact-json | 0% | 0 / 2 | `oracle_omission=2`, `expected_claim_missing=2` | 0 / 0 | 100% | 65% | 0% | n/a | 10 |
  | markdown-summary | 0% | 0 / 2 | `citation_anchor_missing=2`, `oracle_omission=2`, `expected_claim_missing=2` | 0 / 0 | 73.34% | 50% | 0% | n/a | 12 |
  | toon | 0% | 0 / 2 | `oracle_omission=2`, `expected_claim_missing=2`, `citation_anchor_missing=1` | 0 / 0 | 90% | 85% | 0% | n/a | 11 |

- Redaction checks: raw stdout/stderr passed checks for no `"outputText"`
  field, no key-like tokens, no configured legacy `HERMES_*` values, and no
  absolute local paths.
- Retrospective: Loop 11 intentionally used the fallback one-run smoke because
  the fallback run took about two minutes and exited nonzero on strict quality
  gates. The optional `--live-runs 3` smoke was not rerun in this supervisor
  turn after previous full-run hangs; future calibration should rerun the
  three-run smoke only after the runtime responds reliably enough to avoid
  blocking.
