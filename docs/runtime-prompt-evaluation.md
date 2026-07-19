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
| Answer oracle | Live outputs cover configured required terms/relations and avoid forbidden terms | Required when a fixture defines an oracle |
| Expected citation mappings | Configured claims resolve to expected citation anchors within `windowChars` | Required when a strict fixture defines mappings |
| Failure taxonomy | Live reports include `failureCodes` and aggregate `failureCodeCounts` | Required for failure attribution |

Fixtures may set an answer oracle to `report-only` while a new oracle is being
calibrated. Production-quality fixture gates should remain strict.

Expected citation mappings are calibrated independently from the rest of the
answer oracle. Fixtures may set `answerOracle.expectedCitationMappingsGate` to
`report-only`, or set an individual mapping `gate: "report-only"`, to keep
diagnostics in the report without making `run.pass` false or emitting live
`failureCodes`/`failureBuckets`. Fixture-level report-only dominates: an
individual mapping cannot opt back into strict mode with `gate: "strict"` or
`reportOnly: false`. Per-mapping gates may only downgrade a strict fixture to
report-only. If omitted, expected citation mappings are strict even when the
broader answer oracle is report-only.

Each mapping supports `require: "any" | "all"` over
`expectedCitationIds`/`citationIndexes`; the default is `any` to preserve the
Loop 5 behavior where one matching target satisfied a multi-target mapping.
`all` requires every resolved unique citation index in the same claim window.
Unknown `expectedCitationIds` and out-of-range citation indexes are reported as
target-resolution failures with `expected_citation_target_unresolved`, not as
wrong-nearby-citation mismatches. The current Loop 6 repeated-claim behavior
checks every occurrence and passes a mapping if any occurrence satisfies the
target condition; stricter "every occurrence must satisfy" semantics remain a
future hardening option.

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
- Retrospective: Loop 6 keeps the minimal pass-if-any repeated-claim behavior
  requested for this implementation. A future stricter mode can require every
  occurrence to satisfy the mapping once fixtures are calibrated for repeated
  introductory/restated claims.
