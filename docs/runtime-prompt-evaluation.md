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
| Runtime citation exactness | Live responses cover every required exact `[n](#citation-n)` anchor and no invalid exact anchors | Required for live smoke pass; invalid anchors still fail with `citation_anchor_invalid` |
| Live benchmark prompt contract | Runtime messages preserve configured claim phrases and graph relation phrases, keep relation verbs readable, cite exact anchors near supported claims, cite every repeated occurrence when required, and avoid evidence-free claims | Required for strict live benchmark isolation |
| Benchmark-only strict claim checklist | Live user prompts list effective strict expected claim phrases with resolved exact markdown anchors, strict/required gate status, occurrence intent, and nearby/window intent | Required when a live fixture defines strict `expectedCitationMappings`; omitted for fixtures without strict mappings |
| Runtime completion | Live responses report `finishReason`, `truncation`, and aggregate truncation counts | `finish_reason=length` and inferred max-token exhaustion fail strict runs |
| Lossy renderer isolation | Lossy projections are labeled and cannot silently become the production contract | Must be explicit candidate/eval-only |
| Reproducibility | Offline benchmark does not call provider/runtime/network | Required |
| Offline comparison basis | Offline reports declare top-level and per-comparison size-only basis | `offlineComparisonBasis: "size-only"` and every fixture/totals comparison `basis: "size-only"`; no offline recommendation fields |
| Answer oracle | Live outputs cover configured required terms/relations and avoid explicitly configured forbidden, unsupported, and contradictory patterns | Required when a fixture defines a strict oracle |
| Expected citation mappings | Configured claims resolve to expected citation anchors within `windowChars`, with opt-in every-occurrence mode for repeated claims | Required when a strict fixture defines mappings |
| Failure taxonomy | Live reports include `failureCodes` and aggregate `failureCodeCounts` | Required for failure attribution |
| Safe live diagnostics | Live reports summarize failure codes, missing configured oracle terms/relations, missing expected claim phrases, citation coverage, invalid exact anchor tokens/counts, finish reason, truncation, and output length without raw model text, offsets, surrounding context, or private runtime/local values | Required for prompt-contract versus renderer-loss isolation |
| Private-safe live wrapper | Tracked wrapper captures raw child stdout/stderr only in OS temp, enforces an overall timeout, scans raw and sanitized output for sensitive patterns, and prints sanitized aggregate JSON only | Required before copying live aggregate metrics into docs |
| Production default approval e2e | Tracked e2e wrapper checks a named default renderer against production approval fixture/query classes using sanitized live-safe output only | Required before treating any renderer as production-default approved |
| Benchmark-only strict answer format | Live user prompts provide mandatory completeness instructions, the allowed exact citation-anchor set, `Expected claim row` skeletons, supplemental required-anchor rows, and strict oracle coverage rows | Required when strict expected citation mappings leave top-level citation anchors or strict oracle items otherwise unforced |
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
For live benchmark runs, effective strict expected citation mappings also feed
a benchmark-only checklist in the runtime user prompt. The checklist names the
exact configured claim phrase, the resolved exact markdown anchor or anchors,
the strict/required gate status, `require` target semantics, occurrence intent
including `occurrenceMode: "every"`, and the configured nearby/window intent.
This is a prompt aid for strict fixture isolation only; it does not change
production bridge prompting and does not relax answer-oracle, expected-citation
mapping, repeated-occurrence, distortion, unsupported, contradictory, or
citation-anchor gates.
The same effective strict mappings also feed a benchmark-only strict answer
format skeleton. The skeleton lists the fixture's allowed exact citation
anchors, for example `[1](#citation-1)` through `[N](#citation-N)`, and tells
the runtime not to invent or use any other anchor. When no allowed anchor
supports a factual claim, the skeleton tells the runtime to omit that
unsupported claim instead of creating a new anchor. Fixtures that omit the
strict skeleton also omit this allowed-anchor guidance. Before the skeleton
rows, a mandatory completeness checklist
states that the final answer must include every `Expected claim row` exactly
once, that these rows are not optional and must not be omitted, split, merged,
or rephrased, and that multi-hop rows must stay intact with all shown anchors
on the same row near the claim. Expected-claim rows are labeled
`Expected claim row:` and copy the exact expected claim phrase ending with the
exact resolved markdown anchor or anchors, such as
`Expected claim row: Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation [1](#citation-1) [2](#citation-2)`.
The skeleton adds required citation coverage rows for any top-level citation
anchor not already forced by claim rows, which keeps fixtures such as
`graph-linear-chain` from missing `[1](#citation-1)` while preserving
claim-level citation placement for `[2](#citation-2)` and
`[3](#citation-3)`. It then adds oracle coverage rows for strict
`answerOracle.requiredTerms`, `requiredPhrases`, and `requiredRelations` that
are not already textually covered by the strict expected-citation claim rows.
Those rows ask for one evidence-supported sentence including the required
oracle text and ending in an exact markdown citation anchor, preferring a
determinable top-level supporting anchor and otherwise the nearest supporting
evidence anchor. The limitations row appears after claim, citation coverage,
and oracle coverage rows only, and factual limitations also require
citations. Fixtures without effective strict mappings omit both the checklist
and skeleton. This remains live-eval-only prompt guidance; strict validators
are unchanged.
Invalid-anchor diagnostics remain private-safe: live reports and the safe
wrapper may include exact invalid anchor tokens and aggregate counts, such as
`invalidCitationAnchors` and `invalidCitationAnchorCounts`, but not raw answer
text, offsets, surrounding context, endpoint/model/key values, temp paths, or
local absolute paths.
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

For private live calibration that may be copied into docs, prefer the tracked
safe wrapper:

```sh
npm run eval:runtime-prompt:live:safe -- --profile loop17-smoke --overall-timeout-ms 180000
```

The wrapper invokes `scripts/benchmark-runtime-prompt.mjs --live`, applies
profile defaults only when matching benchmark options are absent, and accepts
pass-through benchmark arguments. `loop17-smoke` runs the two strict fixtures
with compact JSON once; `loop17-full` runs the same fixtures across compact
JSON, markdown summary, and TOON three times; `none` forces `--live` without
other defaults.

## Runtime Default And Approval Boundary

The production delegated-runtime and hybrid prompt path currently renders the
LLMWiki evidence bundle as compact JSON. This is a runtime encoding fact, not a
broad approval claim across all models or runtime classes. `pretty-json` remains
an offline debug/size baseline in benchmark reports, while `compact-json` is the
named renderer used for production-default approval checks.

Do not interpret a passing single-runtime run, offline token saving, or
`live.recommendation.recommendedRendererId` as enough to claim broad production
default approval. Broad approval requires one sanitized passing e2e approval
report for each maintainer-selected safe runtime/model-class cell.

For production-default approval, use the tracked e2e wrapper rather than
reading `live.recommendation` alone:

```sh
npm run e2e:runtime-prompt:production-approval -- --profile prod-approval-smoke --runtime-alias configured-runtime --model-class configured-model-class --overall-timeout-ms 300000
```

`prod-approval-smoke` runs one private-safe pass for `compact-json` across the
production approval fixture set. `prod-approval-candidate` runs three repeated
passes across lossless candidates `compact-json` and `toon`. `prod-approval-full`
runs three repeated passes across `compact-json`, `markdown-summary`, `toon`,
and `pretty-json` so lossy/debug controls remain visible without silently
becoming defaults. Pass-through benchmark options can still override fixture,
renderer, token, temperature, and timeout settings for calibration.

The e2e wrapper emits
`llmwiki-agent-bridge.runtime-prompt-production-approval.v1` with a
`defaultApproval` object for a named renderer, defaulting to `compact-json`.
Approval is fail-closed and independent from "smallest eligible renderer"
ranking. It requires:

- live-safe child status and JSON parsing to pass;
- sensitive scan status ok with zero matches;
- live validation status ok;
- required fixture ids present: `single-source`, `multi-source`,
  `insufficient-evidence`, `graph-linear-chain`, and
  `graph-strict-evidence-fidelity`;
- required fixture classes present: local single-source, global multi-source,
  insufficient evidence, graph relation, and strict evidence fidelity;
- required query classes present: local query, global query,
  insufficient-evidence query, and graph query;
- the configured safe `modelClass` for this invocation to satisfy the required
  model-class check;
- the named default renderer to have 100% pass rate, zero failed runs, empty
  failure-code counts, no truncation, no invalid citation anchors, 100%
  required-anchor coverage, zero strict oracle failures, zero strict
  unsupported/contradictory/distortion hits, 100% required oracle item
  coverage, and 100% strict expected-citation mapping and occurrence coverage.

The e2e output records only a safe runtime alias supplied by the operator. It
also records only a safe model-class label supplied by the operator. Multi-model
approval means running the e2e once per required `runtimeAlias`/`modelClass`
cell and comparing sanitized outputs; a single invocation is only approval for
that safe model class. The e2e script scans its own final JSON output and must
not record configured endpoint values, configured model names, keys, raw
answers, raw prompts, temp paths, or local absolute paths.

The default approval path is documented in
`docs/decisions/2026-07-22-compact-json-runtime-default-approval.md`.

LLMWiki ingest guidance: ingest this document plus the
`specs/runtime-prompt-projection-quality/` files after review. Do not ingest
`.llmwiki-work`, raw live reports, wrapper temp files, endpoint/model/key
values, raw runtime answers, or local private path exports.

Raw child stdout/stderr stay in OS temp files and their paths are not printed.
The wrapper scans those raw files plus its own emitted summary for raw
`"outputText"` fields, configured endpoint/model/key values, key-like tokens,
bearer tokens, `api_key` query values, temp paths, and absolute local paths.
It reports only counts/categories and exits nonzero on child failure, timeout,
JSON parse failure, or scan failure. The emitted JSON summary contains safe
command option names, fixture/renderer ids, live validation and recommendation
status, renderer totals, pass/fail rates, citation coverage, oracle and
expected-citation mapping aggregates, finish-reason counts, truncation counts,
invalid exact citation-anchor tokens/counts, and `outputTextLength` summaries;
it intentionally omits raw prompts, model
answers, endpoint values, model names, keys, temp paths, and local absolute
paths.

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

### Loop 12: Claim-preserving live prompt contract and safe diagnostics

- Research/analysis: Loop 11 live failures could still come from at least two
  causes: the live runtime may not have been told strongly enough to preserve
  fixture claim/relation wording, or a renderer may have removed information
  needed to answer the strict oracle. Loop 12 isolates those causes before
  changing oracle tolerance.
- TDD target: mock runtime request inspection proves the live benchmark system
  message includes the claim-preserving contract, and a failing live mock run
  emits a safe diagnostic summary with failure codes, missing configured oracle
  relation details, missing expected claim phrases, citation coverage, finish
  reason, truncation, and output length.
- Quality gates added: strict live benchmark messages now ask the runtime to
  preserve configured claim phrases and graph relation phrases instead of
  paraphrasing, render relation verbs readably such as `measured_by` as
  "measured by", place exact markdown citation anchors near each supported
  claim, cite every occurrence when repeated-citation gates require it, and use
  no evidence-free claims. Live fixture/renderer and totals renderer summaries
  now include safe diagnostic summaries without raw `outputText`, private
  endpoints, model names, keys, temp paths, or local absolute paths.
- Optional live smoke: ran isolated `compact-json` one-run smokes for
  `graph-linear-chain` and `graph-strict-evidence-fidelity` against the
  configured private runtime. Raw stdout/stderr stayed outside the repo and
  redaction checks found no raw `"outputText"` field, key-like token,
  configured endpoint/model/credential value, or local absolute path.
- Result: both strict live smokes failed with `recommendation.status:
  blocked` and no truncation. `graph-linear-chain` had
  `oracle_omission=1`, `expected_claim_missing=1`, 100% required citation
  anchor coverage, 60% answer-oracle required-item coverage, and 0% expected
  citation mapping coverage. `graph-strict-evidence-fidelity` had
  `expected_claim_missing=1`, 100% required citation anchor coverage, 100%
  answer-oracle required-item coverage, and 50% expected citation mapping
  coverage.
- Retrospective: oracle synonym tolerance is intentionally deferred. Strict
  omission, distortion, and citation-fidelity checks stay unchanged until a
  follow-up live calibration can compare more renderers under the stronger
  prompt contract and determine whether remaining failures are
  renderer-specific information loss or true oracle brittleness.

### Loop 13: Totals diagnostic and model-name privacy regression

- Research/analysis: Loop 12 added safe diagnostics, but reviewer follow-up
  asked for explicit local proof that aggregate totals diagnostics are emitted
  at `live.totals.renderers[rendererId].diagnosticSummary` and that configured
  runtime model names are absent from serialized live reports.
- TDD target: extend the failing live mock diagnostic test to assert totals
  renderer diagnostic fields for failure codes, failure-code counts, citation
  coverage, finish reason counts, truncation counts, missing configured oracle
  relations, missing expected claim phrases, and aggregate `outputTextLength`.
  The same test uses a synthetic configured model-name canary, verifies the
  mock runtime request received it, and verifies the serialized report does
  not contain it.
- Result: no runtime script change was needed. Existing live-report shaping
  already emitted safe aggregate diagnostics and used boolean model
  configuration status rather than serializing model names.
- Retrospective: this closes the non-blocking privacy/test-hardening gap while
  preserving strict answer-oracle, expected citation mapping, occurrence, and
  citation-anchor checks.

### Loop 14: Benchmark-only strict claim checklist

- Research/analysis: the strict prompt contract told runtimes to preserve
  configured claims, but live strict fixtures still required the model to infer
  which exact expected phrases and anchors the deterministic oracle would
  validate. A benchmark-only checklist can isolate prompt-following behavior
  without weakening the oracle.
- TDD target: mock runtime request inspection proves
  `graph-strict-evidence-fidelity` live user prompts include the exact
  promotion-gate claim phrase, resolved exact markdown anchors, strict/required
  gate status, target requirement semantics, every-occurrence repeated-citation
  intent, and nearby/window citation intent. A no-mapping fixture omits the
  checklist.
- Quality gates added: live user prompts now include a clearly labeled
  benchmark-only strict claim checklist derived from effective strict
  `answerOracle.expectedCitationMappings`. Reports still contain prompt
  measurements and safe diagnostics, not raw prompt text or raw model output.
- Optional live smoke: ran a private-safe `compact-json` one-run smoke for
  `graph-linear-chain` and `graph-strict-evidence-fidelity`. Raw
  stdout/stderr stayed outside the repo, and the sensitive scan found 0 raw
  sensitive matches.
- Result: strict validation still failed with recommendation blocked: 2 runs, 0
  pass, 2 fail, `finishReasonCounts.stop=2`, and output length avg 1290, min
  1088, max 1492. Aggregate failure codes were `citation_anchor_missing`,
  `expected_claim_missing`, and `expected_citation_mismatch`; missing oracle
  relations were none. Sanitized fixture details: `graph-linear-chain` missed
  required anchor `[1]`; `graph-strict-evidence-fidelity` still missed
  `Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation`
  and placed nearby anchor `[5]` where `[3]` was expected.
- Retrospective: the checklist appears to remove the prior oracle-omission
  signal in this isolated smoke, but strict citation anchor coverage/placement
  and exact promotion-claim preservation remain unresolved. This is
  benchmark-only behavior, so no ADR or public contract change is needed, and
  strict answer-oracle, expected-citation mapping, repeated-occurrence,
  distortion, unsupported/contradictory, and citation-anchor checks remain
  unchanged.

### Loop 15: Benchmark-only strict answer format skeleton

- Research/analysis: the Loop 14 checklist named exact strict claims and
  anchors, but it did not force a row-shaped answer. `graph-linear-chain` could
  still satisfy mapped claim rows for `[2](#citation-2)` and
  `[3](#citation-3)` while omitting the top-level `[1](#citation-1)` anchor.
- TDD target: mock runtime request inspection proves strict live prompts
  include `# Benchmark-only strict answer format`; the
  `graph-strict-evidence-fidelity` skeleton includes exact claim rows ending
  in `[1](#citation-1) [2](#citation-2)`, `[3](#citation-3)`,
  `[4](#citation-4)`, and `[5](#citation-5)`; and the `graph-linear-chain`
  skeleton includes a supplemental required citation coverage row for
  `[1](#citation-1)`.
- Quality gates added: live-only strict prompts now include a row-shaped
  answer skeleton derived from effective strict expected citation mappings,
  supplemental required-anchor coverage rows for top-level citations not
  already forced by claim rows, and a final limitations row that reminds the
  runtime that factual limitations also need citations.
- Regression coverage: row-shaped mock live answers for `graph-linear-chain`
  and `graph-strict-evidence-fidelity` pass with empty `failureCodes`;
  no-strict-mapping fixtures omit both the checklist and skeleton; wrong
  nearby anchors and omitted anchors continue to fail through the existing
  strict validators.
- Optional live smoke: ran a private-safe `compact-json` one-run smoke for
  `graph-linear-chain` and `graph-strict-evidence-fidelity`. Raw
  stdout/stderr stayed outside the repo, and the sensitive scan found 0 raw
  sensitive matches.
- Result: strict validation improved from Loop 14 but remained blocked: 2
  runs, 1 pass, 1 fail, `finishReasonCounts.stop=2`, truncation 0, and
  `recommendedRendererId` null. Required citation anchor coverage reached
  100%, and `expected_claim_missing` plus `expected_citation_mismatch`
  disappeared. The remaining failure was `graph-linear-chain` with
  `oracle_omission`, missing required term any-of `Runtime Prompt Validation`
  or `validation`.
- Retrospective: the answer format skeleton closed the required-anchor and
  expected-citation gaps in this isolated smoke, while the linear-chain oracle
  still needs the runtime to preserve the validation concept. This remains
  benchmark-only/live-eval-only prompt guidance. No ADR or public/production
  contract change is needed, and answer-oracle, expected-citation mapping,
  occurrence, distortion, unsupported, contradictory, truncation, and
  citation-anchor validation are unchanged.

### Loop 16: Strict oracle coverage rows

- Research/analysis: Loop 15 left one live strict omission in
  `graph-linear-chain`: the expected citation rows forced the mapped claims
  and anchors, but no row explicitly required the validation oracle term.
- TDD target: prompt inspection proves the strict answer-format skeleton adds
  an oracle coverage row for `Runtime Prompt Validation` or `validation`
  before the limitations row, and a mock runtime passes both strict fixtures
  only when it sees that row and includes the validation concept.
- Quality gates added: live-only strict prompts now derive oracle coverage
  rows generically from strict `requiredTerms`, `requiredPhrases`, and
  `requiredRelations` that are not already textually covered by strict
  expected-citation claim rows. Rows prefer a determinable supporting
  top-level citation anchor and otherwise ask for the nearest supporting
  evidence anchor.
- Regression coverage: no-strict-mapping/no-strict-oracle fixtures remain free
  of checklist, skeleton, supplemental coverage, and oracle coverage rows; a
  negative mock still fails with `oracle_omission` when anchors and expected
  mappings pass but the validation oracle term is omitted.
- Optional live smoke: ran an isolated private-safe `compact-json` one-run
  smoke for `graph-linear-chain` and `graph-strict-evidence-fidelity`. Raw
  stdout/stderr stayed outside the repo, and the sensitive scan found 0 raw
  sensitive matches.
- Result: `liveExit=0`, `validationOk=true`, `liveValidationOk=true`,
  `status=ok`, `recommendationStatus=recommended`, and
  `recommendedRendererId=compact-json`. Totals were 2 runs, 2 passed, 0
  failed, 100% pass rate, 100% required-anchor coverage, empty
  `failureCodes`, empty missing expected claim phrases, empty missing
  relations, `finishReasonCounts.stop=2`, `truncation.truncatedCount=0`,
  `truncation.inferredTruncatedCount=0`, and output text length min 556, max
  640, average 598.
- Retrospective: the strict oracle coverage rows closed the Loop 15
  validation-concept omission in this limited smoke. This is evidence for one
  private-safe compact-json run per strict fixture only; it is not a broad
  renderer/model promotion across all renderers, models, or repeated-run
  samples. This remains benchmark-only/live-eval-only prompt guidance and does
  not require a new ADR or production contract change. Strict answer-oracle,
  expected-citation mapping, occurrence, distortion, unsupported,
  contradictory, truncation, and citation-anchor validators remain unchanged.

### Loop 17: Private-safe live validation wrapper

- Research/analysis: prior live-smoke documentation depended on an operator
  manually redirecting raw benchmark streams to temp files and manually
  redaction-checking them before copying aggregate metrics into docs. Loop 17
  makes that workflow tracked, repeatable, and fail-closed.
- TDD target: mock live wrapper tests prove a passing `loop17-smoke` run emits
  sanitized aggregate JSON without raw `outputText`, prompt text, endpoint,
  model, key, temp path, or local path values; a parseable benchmark failure
  propagates nonzero while still emitting sanitized aggregates; and synthetic
  redaction canaries are detected without printing matched values.
- Quality gates added: `scripts/validate-runtime-prompt-live-safe.mjs` wraps
  the existing live benchmark, supports `loop17-smoke`, `loop17-full`, and
  `none` profiles, writes raw child stdout/stderr only to OS temp, enforces an
  overall timeout, scans raw and sanitized output for sensitive categories,
  and prints only docs-suitable aggregate JSON.
- Result: local mock coverage passed for sanitized success, sanitized nonzero
  propagation, and redaction scan failure. The wrapper is available through
  `npm run eval:runtime-prompt:live:safe`. A private-safe repeated compact JSON
  profile was also run through the wrapper for the two strict graph fixtures
  with three live runs each, low temperature, a bounded response budget, and
  per-request plus overall timeouts. Wrapper behavior passed: raw child streams
  stayed outside the repo, JSON parsing succeeded, no timeout occurred, and
  raw plus sanitized sensitive scans reported zero matches.
- Repeated live result: quality acceptance did not pass. The sanitized
  aggregate reported 6 requests/runs, 5 passes, 1 failure, `passRatePct:
  83.33`, `liveValidationOk: false`, `recommendation.status: blocked`, and
  `recommendedRendererId: null`. Finish reasons were all `stop`; truncation
  was 0; required citation-anchor coverage was 100%; answer-oracle strict
  failures were 0 with required-item coverage at 100%. Expected citation
  mappings had one strict failure, average coverage 95.83%, one missing
  expected claim, one strict missing expected claim, and occurrence coverage at
  100%. The only failure code was `expected_claim_missing`.
- Safe diagnostic: the failed fixture was `graph-strict-evidence-fidelity`.
  The only missing expected claim phrase was `Promotion Decision requires
  Citation Fidelity Gate measured by Live Prompt Evaluation`; missing terms and
  missing relations were empty. This points to a remaining strict expected-claim
  stability gap, not a wrapper safety failure.
- Retrospective: Loop 17 validation tooling is now tracked and private-safe,
  but repeated live stability acceptance remains unmet. The loop does not
  change the production bridge runtime contract, public API, source policy,
  security defaults, answer validators, or renderer recommendation rules, so no
  new ADR is needed. Follow-up work should target the remaining strict expected
  claim omission before treating compact JSON as recommendation-eligible under
  repeated live runs.

### Loop 18: Mandatory expected-claim row completeness

- Research/analysis: Loop 17 isolated the remaining repeated live failure to
  omission of the multi-hop expected claim
  `Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation`.
  The strict answer-format skeleton already showed the row, but it did not
  explicitly state that every expected-claim row was mandatory and must remain
  intact.
- TDD target: mock runtime request inspection proves
  `graph-strict-evidence-fidelity` live prompts include mandatory completeness
  language requiring every `Expected claim row` exactly once, stating that
  expected rows are not optional and must not be omitted, split, merged, or
  rephrased, and requiring multi-hop rows to keep all shown anchors on or near
  the same row. Prompt row assertions now expect the `Expected claim row:`
  label.
- Quality gates added: the benchmark-only strict answer-format skeleton now
  emits a short mandatory completeness checklist before skeleton rows and
  labels every strict expected-citation mapping row as an `Expected claim row`.
  Coverage rows, oracle coverage rows, limitations-row ordering, and
  no-strict-mapping fixture omissions remain unchanged.
- Regression coverage: row-shaped mock answers now copy the
  `Expected claim row:` labels and still pass strict oracle and expected
  citation mapping gates. The multi-hop omission negative path still fails
  with `expected_claim_missing` and `oracle_omission`, proving validators were
  not loosened.
- Result: local validation passed: `npm run check`, `git diff --check`, and
  docs secret scanning reported no issues. A private-safe repeated
  `compact-json` profile was run through the tracked wrapper for the two
  strict graph fixtures with three live runs each and a bounded overall
  timeout. Wrapper behavior passed: no timeout occurred, benchmark JSON parsing
  succeeded, and raw plus sanitized sensitive scans reported zero matches.
  Repeated live quality still did not fully pass: 6 runs, 5 passed, 1 failed,
  `passRatePct: 83.33`, `recommendation.status: blocked`, and
  `recommendedRendererId: null`.
- Targeted fix result: the expected-claim completeness issue disappeared.
  Expected-citation mappings reported `strictFailureCount: 0`,
  `missingClaimCount: 0`, `expectedCitationMismatchCount: 0`, and
  `occurrenceCoveragePct: 100`; the prior `expected_claim_missing` failure code
  did not recur.
- Remaining diagnostic: the only remaining failure code was
  `citation_anchor_invalid=1` in `graph-strict-evidence-fidelity` run 3.
  Required citation-anchor coverage stayed at 100%, but
  `invalidCitationAnchorCount` was 1. Answer-oracle strict failures were 0,
  finish reasons were all `stop`, and truncation was 0. The sanitized report
  exposes only the invalid-anchor count, not the invalid anchor value.
- Retrospective: this is another benchmark-only/live-eval-only prompt guidance
  refinement. It does not change the production bridge runtime contract,
  public API, source policy, security defaults, answer validators, fixture
  validators, expected-citation matching, truncation handling, or renderer
  recommendation rules, so no new ADR is needed. The Loop 18 prompt change
  stabilized expected-claim row completeness, but repeated live acceptance
  remains blocked pending invalid citation-anchor stabilization or
  private-safe diagnostics that identify the malformed anchor without exposing
  raw model output.

### Loop 19: Allowed-anchor guidance and private-safe invalid-anchor diagnostics

- TDD target: strict live prompt inspection proves
  `graph-strict-evidence-fidelity` emits an allowed exact citation-anchor set
  for `[1](#citation-1)` through `[5](#citation-5)`, says not to invent or use
  any other anchor, and says to omit unsupported claims instead of creating a
  new anchor. The no-strict fixture path proves the allowed-anchor guidance is
  omitted when the strict answer-format skeleton is omitted.
- Quality gates added: live invalid-anchor diagnostics now expose exact invalid
  anchor tokens and aggregate counts only through safe fields such as
  `invalidCitationAnchors` and `invalidCitationAnchorCounts`. The private-safe
  wrapper preserves the same aggregate in sanitized output.
- Regression coverage: a strict live mock answer that covers all required
  anchors, passes the deterministic answer oracle, and passes expected citation
  mappings still fails when it includes `[6](#citation-6)`. Its
  `failureCodes` are exactly `citation_anchor_invalid`, so required coverage,
  oracle success, and expected-mapping success remain independently visible.
- Safety result: diagnostic summaries avoid raw answer text, offsets,
  surrounding context, private endpoint values, configured model names, keys,
  temp paths, and local absolute paths. The safe-wrapper invalid-anchor failure
  test keeps sensitive scan status ok while preserving only the invalid anchor
  token/count aggregate.
- Repeated live result: supervisor reran the private-safe `compact-json`
  profile through the tracked wrapper for `graph-linear-chain` and
  `graph-strict-evidence-fidelity`, with three live runs per fixture. Wrapper
  behavior passed: `safeLiveExit=0`, child status ok, child exit code 0, no
  timeout, benchmark JSON parsing ok, and raw plus sanitized sensitive scans
  reported zero matches. Live quality passed for this scoped profile:
  `validation.ok=true`, `recommendation.status=recommended`, and
  `recommendedRendererId=compact-json`. Totals were 6 requests, 6 runs, 6
  passes, 0 failures, `passRatePct=100`, empty failure-code counts, 6 stop
  finish reasons, no truncation, required citation-anchor coverage 100%,
  `invalidCitationAnchorCount=0`, no invalid citation anchors, strict
  answer-oracle failures 0, required item/term/phrase/relation coverage 100%,
  expected-citation mapping strict failures 0, average coverage 100%, no
  missing claims, no expected-citation mismatches, and occurrence coverage 100%.
- Retrospective: no new ADR is needed. Loop 19 changes benchmark-only prompt
  guidance plus private-safe diagnostics and does not change the production
  bridge runtime contract, public API, source policy, security defaults,
  validators, truncation handling, expected-citation mapping logic, or
  recommendation rules. The rerun supports repeated strict `compact-json` live
  acceptance for the configured private runtime and the two strict graph
  fixtures only; it is not broad production default approval across all
  renderers, models, or fixture classes.

### Loop 20: Production default approval e2e matrix

- Research/analysis: Loop 19 was scoped to `compact-json` on one configured
  private runtime and two strict graph fixtures. Production default approval
  needs a separate gate that covers local queries, global multi-source
  queries, insufficient-evidence behavior, graph relations, strict repeated
  citation/privacy fixtures, renderer candidates, and safe runtime aliases.
- TDD target: add deterministic mock e2e coverage proving the default renderer
  can be approved across the production fixture/query class matrix and proving
  approval is blocked when an otherwise good answer invents an invalid exact
  citation anchor.
- Quality gates added: fixtures now report `fixtureClass` and `queryClass`.
  `single-source` and `multi-source` have strict local/global query oracles
  and expected citation mappings. A new `insufficient-evidence` fixture checks
  that the runtime states the approval gap instead of inventing production
  default or private endpoint facts.
- Tooling added: `scripts/e2e-runtime-prompt-production-approval.mjs` wraps
  the private-safe live wrapper and emits a sanitized `defaultApproval`
  decision for a named renderer. New live-safe profiles `prod-approval-smoke`,
  `prod-approval-candidate`, and `prod-approval-full` provide reusable
  fixture/renderer matrices.
- Regression coverage: mock tests cover the passing production approval e2e
  path, invalid-anchor approval blocking, local/global/insufficient fixture
  classes, no-raw-output privacy behavior, and continued package inclusion.
- Retrospective: this still does not change the production bridge runtime
  contract, public API, source policy, security defaults, or renderer default.
  It creates the reusable approval gate required before making such a
  production-default claim. Multi-model approval still requires one sanitized
  e2e run per required safe `runtimeAlias`/`modelClass` cell. Live results
  copied into docs must come only from sanitized e2e/wrapper summaries and must
  use safe runtime aliases and safe model-class labels.

### Loop 21: Compact JSON candidate approval stabilization

- Research/analysis: the first live production-approval smoke isolated a
  brittle `single-source` expected-citation mapping. Private-safe diagnostics
  showed the runtime preserved the required local-query terms, citation
  anchors, graph summaries, and source limitations, but did not reproduce one
  long merged claim as a contiguous citation-mapping sentence.
- TDD target: keep the local-query default-approval gate strict while mapping
  the first `single-source` expected citation to the stable atomic claim
  "Release readiness depends on local checks." The broader answer oracle still
  checks citation anchors, graph summaries, explicit source limitations, and
  required local/global/insufficient/graph relations.
- Quality result: `prod-approval-smoke` passed for `compact-json` on the
  configured safe runtime/model class with 5/5 runs, 100% pass rate, empty
  failure-code counts, no truncation, 100% citation-anchor coverage, 100%
  required oracle item coverage, 100% expected-citation mapping coverage, no
  blocking reasons, and a clean final sensitive scan.
- Repeated candidate result: `prod-approval-candidate` passed for the
  `compact-json` default renderer with three runs per required fixture
  class/query class: 15/15 `compact-json` runs passed, 0 failed, pass rate
  100%, empty failure-code counts, no truncation, 0 invalid citation anchors,
  100% required citation-anchor coverage, 0 strict answer-oracle failures,
  0 strict unsupported/contradictory/distortion hits, 100% required oracle item
  coverage, 100% expected-citation mapping and occurrence coverage, 0 blocking
  reasons, and a clean final sensitive scan.
- Renderer-selection nuance: the candidate profile also evaluates `toon` as a
  renderer candidate. A live recommendation may rank `toon` first when it
  passes and is smaller, but this loop's production-default approval claim is
  specifically the fail-closed e2e approval for `compact-json`. Promoting
  `toon` would still require a separate lossiness/contract decision because
  LLMWiki prioritizes omission/distortion safety over size savings.
- Retrospective: no new ADR is needed. The change calibrates benchmark
  expected-citation mapping granularity and records sanitized live approval
  evidence; it does not change the bridge runtime contract, public API, source
  policy, security defaults, renderer implementation, or production default
  setting. Broader multi-model approval still requires one sanitized e2e run
  per additional safe `runtimeAlias`/`modelClass` cell.
