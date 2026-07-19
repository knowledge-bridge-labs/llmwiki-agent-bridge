# Plan: Runtime Prompt Projection Quality

1. Add rubric documentation and ADR.
2. Add quality metrics to `scripts/benchmark-runtime-prompt.mjs`.
3. Add eval-only `--graphify-graph` and `--graphify-query` inputs.
4. Test Graphify-like fixture ingestion with a temporary graph file.
5. Verify `npm run check` and commit.
6. Next loop: add oracle answer-quality fixtures for omission/distortion.

