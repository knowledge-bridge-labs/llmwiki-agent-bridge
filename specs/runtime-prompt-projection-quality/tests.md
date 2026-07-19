# Tests: Runtime Prompt Projection Quality

## Acceptance Criteria

- The default offline benchmark still passes.
- A temporary Graphify-like `graph.json` fixture is added to the report.
- The Graphify fixture reports graph node/edge counts and citation coverage.
- Absolute local source paths in the input graph do not appear in the report.
- Live mock validation still rejects bare citation references and requires full
  required-anchor coverage.
- Live mock validation rejects responses that cover citations but omit required
  oracle relations.
- Live mock validation reports repeated-run pass rate and fails when any strict
  run violates citation or oracle gates.
- Live mock validation fails `finish_reason=length` and reports
  `truncation.detected`, `failureCodes`, `finishReasonCounts`, and
  `truncatedCount`.
- Live mock validation infers truncation when `finish_reason` is missing and
  `completion_tokens >= max_tokens`.
- Live mock validation rejects citation stuffing when required anchors and
  answer-oracle checks pass but expected citation mappings are outside the
  configured claim windows.
- Expected citation mappings can use `expectedCitationIds` and resolve them to
  current citation indexes for exact-anchor checks.
- Live renderer and totals reports include
  `averageExpectedCitationMappingCoveragePct`.

## Commands

```sh
npm run bench:runtime-prompt
npm test -- --test-name-pattern "Graphify graph fixture|exact citation anchors|answer oracle|repeated live|finish reason|inferred live runtime truncation|citation stuffing"
node --check scripts/benchmark-runtime-prompt.mjs
node --check test/agent-bridge.test.mjs
npm run check
git diff --check
```
