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
- [x] Run Loop 11 private-safe fallback `--live-runs 1` real-runtime smoke with
      the configured legacy `HERMES_*` environment, keep raw stdout/stderr
      outside the repo, pass redaction checks, and document only sanitized
      aggregate live/recommendation results plus the fallback rationale.
- [x] Add Loop 12 local TDD for the live benchmark claim-preserving prompt
      contract and a safe failing-run diagnostic summary.
- [x] Strengthen live benchmark runtime messages to preserve configured claim
      phrases, graph relation phrases, readable relation verbs, exact nearby
      citation anchors, every-occurrence repeated-citation gates, and
      evidence-only claims.
- [x] Add safe live diagnostic summaries for fixture/renderer and totals
      renderer reports without raw `outputText`, endpoints, model names, keys,
      temp paths, or local absolute paths.
- [x] Document that oracle tolerance and synonym matching remain deferred until
      prompt-contract versus renderer-information-loss causes are isolated.
- [x] Add Loop 13 regression assertions proving
      `live.totals.renderers[rendererId].diagnosticSummary` is emitted with
      safe aggregate diagnostics.
- [x] Add Loop 13 serialized live-report privacy coverage proving a synthetic
      configured runtime model name is used in the mock request but omitted
      from the report.
- [x] Add Loop 14 mock runtime request inspection proving
      `graph-strict-evidence-fidelity` live user prompts include a
      benchmark-only strict claim checklist with exact claim phrases, resolved
      exact markdown anchors, strict/required gate status, occurrence intent,
      and nearby/window citation intent.
- [x] Add Loop 14 coverage proving fixtures without effective strict expected
      citation mappings omit the strict claim checklist.
- [x] Implement Loop 14 live-only strict claim checklist rendering without
      weakening answer-oracle, expected-citation, repeated-occurrence,
      distortion, unsupported/contradictory, or citation-anchor checks.
- [x] Add Loop 15 live-only strict answer format skeleton rendering with exact
      expected claim rows ending in resolved markdown citation anchors.
- [x] Add Loop 15 required citation coverage rows for top-level citation
      anchors not already forced by strict expected claim rows.
- [x] Add Loop 15 prompt-inspection coverage for
      `graph-strict-evidence-fidelity` exact skeleton rows and the
      `graph-linear-chain` `[1](#citation-1)` coverage row.
- [x] Add Loop 15 row-shaped mock live answers proving both strict fixtures
      pass with empty `failureCodes`.
- [x] Confirm Loop 15 keeps no-strict-mapping fixtures free of both the
      strict claim checklist and strict answer format skeleton.
- [x] Add Loop 16 live-only strict oracle coverage rows after strict claim rows
      and supplemental citation coverage rows.
- [x] Derive Loop 16 oracle coverage rows from strict
      `answerOracle.requiredTerms`, `requiredPhrases`, and
      `requiredRelations` that strict claim rows do not already cover.
- [x] Add Loop 16 graph-linear-chain prompt inspection proving a
      `Runtime Prompt Validation`/`validation` oracle coverage row appears
      before the limitations row.
- [x] Add Loop 16 mock live pass coverage where the mock runtime includes the
      validation oracle term only when the new oracle coverage row is present,
      and both strict fixtures pass with empty `failureCodes`.
- [x] Add Loop 16 negative mock coverage where required anchors and expected
      mappings pass but omitting `Runtime Prompt Validation`/`validation` still
      fails with `oracle_omission`.
- [x] Confirm Loop 16 keeps no-strict-mapping/no-strict-oracle fixtures free
      of checklist, skeleton, supplemental coverage, and oracle coverage rows.
- [x] Add Loop 17 tracked no-dependency private-safe live wrapper
      `scripts/validate-runtime-prompt-live-safe.mjs` around the existing
      runtime prompt benchmark.
- [x] Add Loop 17 `loop17-smoke`, `loop17-full`, and `none` profile/default
      support while preserving pass-through benchmark arguments and forcing
      `--live`.
- [x] Ensure Loop 17 raw child stdout/stderr go only to OS temp files, are not
      printed with temp paths, and are scanned before a sanitized aggregate is
      emitted.
- [x] Enforce Loop 17 `--overall-timeout-ms` and fail closed on timeout, child
      nonzero exit, benchmark JSON parse failure, or sensitive scan failure.
- [x] Print Loop 17 sanitized aggregate JSON with safe command option names,
      live validation/recommendation status, renderer totals, pass/fail rates,
      failure-code counts, finish-reason counts, citation coverage, oracle and
      expected-citation mapping aggregates, truncation counts,
      `outputTextLength` summaries, and sensitive scan categories/counts.
- [x] Add Loop 17 npm script `eval:runtime-prompt:live:safe` and include the
      wrapper in package lint/pack coverage.
- [x] Add Loop 17 mock live wrapper tests for sanitized success, parseable
      nonzero benchmark propagation, and redaction scan canaries without
      printing matched values.
- [x] Run and document Loop 17 private-safe repeated compact JSON smoke through
      the wrapper: wrapper safety/parsing/timeout behavior passed and sensitive
      scans found zero matches, but live quality acceptance remained blocked.
- [x] Add Loop 18 benchmark-only mandatory completeness instructions before
      strict answer-format skeleton rows.
- [x] Label Loop 18 strict expected-citation mapping skeleton rows as
      `Expected claim row` rows.
- [x] Add Loop 18 prompt-inspection coverage proving every
      `Expected claim row` must appear exactly once, is not optional, must not
      be omitted/split/merged/rephrased, and keeps multi-hop anchors on or near
      the same row.
- [x] Extend Loop 18 row-shaped mock answers so copied
      `Expected claim row:` lines still pass strict oracle and expected
      citation mapping gates.
- [x] Keep Loop 18 no-strict-mapping fixtures free of mandatory completeness,
      skeleton, supplemental coverage, and oracle coverage rows.
- [x] Confirm Loop 18 omission coverage still fails with
      `expected_claim_missing` without weakening validators.
- [x] Achieve repeated compact JSON live quality acceptance for the two strict
      graph fixtures on the configured private runtime: Loop 19 supervisor
      rerun passed 6/6 live runs with 100% pass rate, recommended
      `compact-json`, zero invalid citation anchors, zero strict oracle
      failures, zero expected-citation mapping failures, and clean raw plus
      sanitized sensitive scans. This is scoped evidence for those two strict
      graph fixtures only, not broad production default approval across all
      renderers, models, or fixture classes.
- [x] Add Loop 19 allowed exact citation-anchor guidance to the
      benchmark-only strict answer-format skeleton, listing only
      `[1](#citation-1)` through `[N](#citation-N)`, telling the runtime not to
      invent other anchors, and telling it to omit unsupported factual claims
      instead of creating unsupported anchors.
- [x] Keep Loop 19 fixtures without the strict answer-format skeleton free of
      allowed-anchor guidance.
- [x] Add Loop 19 private-safe diagnostics for invalid citation anchors so live
      reports identify malformed exact anchor tokens and aggregate counts
      without raw model output, offsets, surrounding context, endpoints, model
      names, keys, temp paths, or local absolute paths.
- [x] Preserve Loop 19 strict invalid-anchor validation unchanged:
      invalid anchors still fail with `citation_anchor_invalid`; required
      coverage, answer-oracle, and expected-mapping pass states are reported
      independently.
- [x] Extend the Loop 19 private-safe live wrapper sanitized summary to retain
      invalid exact anchor token/count aggregates while keeping sensitive scans
      clean.
- [x] Add Loop 20 fixture/query class metadata to benchmark fixture reports and
      sanitized live summaries.
- [x] Strengthen Loop 20 `single-source` local-query and `multi-source`
      global-query fixtures with strict answer oracles and expected citation
      mappings.
- [x] Add Loop 20 `insufficient-evidence` fixture requiring the runtime to
      state approval/endpoint evidence gaps instead of inventing production
      default approval facts.
- [x] Add Loop 20 private-safe live wrapper profiles
      `prod-approval-smoke`, `prod-approval-candidate`, and
      `prod-approval-full`.
- [x] Add Loop 20 reusable production approval e2e script
      `scripts/e2e-runtime-prompt-production-approval.mjs` and npm entry
      `e2e:runtime-prompt:production-approval`.
- [x] Add Loop 20 safe runtime-alias and model-class metadata to the e2e
      approval output, with unsafe aliases sanitized before final output.
- [x] Add Loop 20 final e2e JSON sensitive-output scanning before
      `defaultApproval` can pass.
- [x] Add Loop 20 deterministic mock e2e coverage proving `compact-json`
      default approval passes across local, global, insufficient-evidence, and
      graph fixture/query classes.
- [x] Add Loop 20 deterministic mock e2e coverage proving default approval is
      blocked by invalid exact citation anchors.
- [x] Add Loop 20 deterministic mock e2e coverage proving unsafe runtime
      aliases are not printed in the final sanitized output.
- [x] Document Loop 20 LLMWiki ingest candidates and explicitly exclude raw
      live artifacts, endpoint/model/key values, temp paths, raw answers, and
      private local path exports.
