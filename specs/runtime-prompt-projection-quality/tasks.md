# Tasks: Runtime Prompt Projection Quality

- [x] Define quality rubric and ADR.
- [x] Add Graphify-like fixture loading to benchmark script.
- [x] Add evidence quality metrics for citation and path safety.
- [x] Add test coverage for Graphify-like fixture loading.
- [x] Add oracle answer-quality fixtures for omission/distortion.
- [x] Add repeated live eval variance reporting.
- [x] Report loop completion with scored rubrics.
- [x] Run private-data-safe real runtime calibration smoke.
- [x] Add failure taxonomy and finish-reason/truncation capture.
- [x] Add expected citation mapping and claim-citation proximity checks.
- [x] Support `expectedCitationIds` so fixtures do not hard-code citation
      positions.
- [x] Infer truncation when `finish_reason` is missing and
      `completion_tokens >= max_tokens`.
- [x] Aggregate `finishReasonCounts`, `truncatedCount`, `failureCodeCounts`,
      legacy `failureBucketCounts`, and expected citation mapping coverage.
- [x] Strengthen expected citation mappings with independent report-only
      gates, fixture-level report-only dominance, default-any/opt-in-all target
      semantics, unresolved target reporting, and all-occurrence claim scanning.
- [x] Add `occurrenceMode: "any" | "every"` for expected citation mappings,
      preserving default-any repeated-claim compatibility while supporting
      opt-in every-occurrence enforcement.
- [x] Report claim occurrence counts, satisfied/unsatisfied occurrence counts,
      occurrence coverage percentage, and every-occurrence failure codes.
- [x] Add configured `unsupportedClaims` and `contradictoryClaims`
      answer-oracle checks with distinct strict failure codes and report-only
      classification behavior.
- [x] Count forbidden, unsupported, and contradictory configured negative
      pattern hits in aggregate answer-oracle `distortionCount`.
- [x] Aggregate expected-citation occurrence coverage and claim occurrence
      counts at live renderer and totals levels.
- [x] Aggregate answer-oracle unsupported/contradictory hits, distortion
      counts, omission rate, and required-item coverage at live renderer and
      totals levels.
- [x] Mark offline renderer savings as size-only and keep them separate from
      readiness recommendation semantics.
- [x] Add a live quality-first recommendation object that blocks strict
      quality failures before applying prompt-size ranking.
- [x] Add deterministic local mock runtime tests for a smaller renderer blocked
      by quality and a quality-passing renderer becoming recommendation
      eligible.
- [x] Add deterministic coverage for all live renderers failing strict quality
      gates so no recommendation winner is emitted.
- [x] Aggregate report-only oracle and expected-citation diagnostics separately
      from strict quality failures and verify they do not block eligibility.
- [x] Document compact fixture-authoring notes for promotion-relevant, private
      data-safe live fixtures.
- [x] Add explicit offline size-only regression assertions and docs so offline
      byte/token savings cannot be mistaken for recommendations.
- [x] Add built-in `graph-strict-evidence-fidelity` fixture with
      promotion-gate, citation-fidelity, live-evaluation, repeated-citation,
      and privacy-redaction graph edges.
- [x] Add strict fixture oracle mappings for a `require: "all"` multi-hop
      claim, an `occurrenceMode: "every"` repeated claim, a privacy/source-path
      claim, and an exact-anchor claim that detects nearby wrong anchors.
- [x] Add deterministic tests proving the new fixture passes with a good live
      mock answer, fails relation omissions as `oracle_omission`, fails nearby
      wrong anchors as `expected_citation_mismatch`, fails one uncited repeated
      occurrence as `expected_citation_every_occurrence_failed`, and classifies
      unsupported plus contradictory claims as strict oracle distortion.
