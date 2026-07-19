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
   - require expected anchors near configured claims in strict runs;
   - report `averageExpectedCitationMappingCoveragePct`.
10. Verify targeted deterministic local mock tests, `node --check`, and
    whitespace diff checks.
