# Plan: Runtime Prompt Projection Quality

1. Add rubric documentation and ADR.
2. Add quality metrics to `scripts/benchmark-runtime-prompt.mjs`.
3. Add eval-only `--graphify-graph` and `--graphify-query` inputs.
4. Test Graphify-like fixture ingestion with a temporary graph file.
5. Add oracle answer-quality fixtures for omission/distortion.
6. Add repeated live-run variance reporting.
7. Add finish-reason/truncation capture:
   - capture `finishReason` from OpenAI-compatible choices;
   - report an explicit `truncation` object per run;
   - fail strict runs on `finish_reason=length`;
   - infer truncation when `finish_reason` is absent and
     `completion_tokens >= max_tokens`.
8. Add failure taxonomy:
   - emit stable `failureCodes` and aggregate `failureCodeCounts`;
   - retain legacy `failureBuckets` and `failureBucketCounts` for continuity.
9. Add expected citation mapping checks:
   - support `citationIndex` and `expectedCitationIds`;
   - resolve ids to current top-level citation indexes;
   - default multi-target mappings to `require: "any"` and support opt-in
     `require: "all"`;
   - default repeated-claim mappings to `occurrenceMode: "any"` and support
     opt-in `occurrenceMode: "every"` independently from target `require`
     semantics;
   - keep expected citation mapping report-only gates independent from the
     broader answer-oracle gate, with fixture-level report-only dominating
     per-mapping strict settings;
   - report unknown ids/invalid indexes as unresolved targets with
     `expected_citation_target_unresolved`;
   - report aggregate claim-occurrence coverage metrics;
   - evaluate every claim occurrence while preserving Loop 6 pass-if-any
     occurrence behavior as the default;
   - require expected anchors near configured claims in strict runs;
   - report `averageExpectedCitationMappingCoveragePct`.
10. Add configured answer-oracle unsupported/contradictory claim checks:
    - detect only fixture-configured strings, `anyOf`, or `allOf` patterns;
    - report unsupported and contradictory claim hit metrics;
    - classify strict failures with `oracle_unsupported_claim` and
      `oracle_contradiction` while preserving broad `oracle_distortion`;
    - count forbidden term hits, forbidden claim hits, unsupported claim hits,
      and contradictory claim hits in aggregate `distortionCount`;
    - keep answer-oracle report-only diagnostics from emitting strict failure
      buckets/codes.
11. Verify targeted deterministic local mock tests, `node --check`, and
    whitespace diff checks.
12. Promote live metrics to decision-ready aggregates:
    - roll expected-citation occurrence coverage and occurrence counts up to
      renderer and totals reports;
    - roll answer-oracle unsupported/contradictory hits, distortion counts,
      omission rate, and required-item coverage up to renderer and totals
      reports.
13. Add a live quality-first recommendation object:
    - mark offline byte/char/estimated-token comparisons as size-only;
    - compute renderer eligibility from strict live pass rate, empty
      failure-code counts, no truncation or inferred truncation, zero strict
      answer-oracle quality hits, and satisfied strict expected-citation
      mapping gates;
    - apply prompt-size ranking only among eligible renderers;
    - include blocked reasons when smaller renderers fail quality or when no
      renderer is eligible.
14. Document compact fixture-authoring guidance so future live fixtures remain
    private-data-safe and promotion-relevant.
15. Lock offline size-only semantics in regression coverage and docs:
    - assert top-level `offlineComparisonBasis: "size-only"`;
    - assert every fixture-level and totals-level offline comparison carries
      `basis: "size-only"`;
    - assert offline reports do not emit `recommendation` or
      `recommendedRendererId` fields when `--live` is omitted.
