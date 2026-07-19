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
- Expected citation mappings default to `require: "any"` and support
  `require: "all"` for multi-target mappings.
- Incomplete `require: "all"` mappings fail strict validation, while complete
  `all` and compatible `any` mappings pass.
- Unknown `expectedCitationIds` and invalid citation indexes are reported as
  unresolved target details with `expected_citation_target_unresolved`.
- Per-mapping report-only failures remain visible in
  `expectedCitationMappings` but do not make strict runs fail or emit live
  failure buckets/codes.
- Fixture-level report-only expected citation mapping gates dominate
  per-mapping `gate: "strict"` or `reportOnly: false` settings and do not emit
  strict failure buckets/codes.
- Repeated claim phrases are all evaluated, and current Loop 6 behavior passes
  when omitted `occurrenceMode` defaults to `any` and any occurrence satisfies
  the expected citation target condition.
- Expected citation mappings with `occurrenceMode: "every"` pass only when
  every repeated claim occurrence satisfies the configured target condition.
- Strict every-occurrence mapping failures report occurrence coverage metrics
  and emit `expected_citation_every_occurrence_failed`.
- Report-only every-occurrence mapping failures remain diagnostic and do not
  emit strict failure buckets/codes.
- Unsupported answer-oracle claims fail strict live mock validation even when
  all citations and expected mappings pass, report `unsupportedClaimHitCount`,
  increment `distortionCount`, and emit `oracle_distortion` plus
  `oracle_unsupported_claim`.
- Contradictory answer-oracle claims fail strict live mock validation even when
  all citations and expected mappings pass, report
  `contradictoryClaimHitCount`, increment `distortionCount`, and emit
  `oracle_distortion` plus `oracle_contradiction`.
- Report-only answer-oracle unsupported/contradictory diagnostics do not emit
  strict failure buckets/codes.
- Existing forbidden-pattern oracle distortion checks still emit
  `oracle_distortion` and include forbidden term plus forbidden claim hits in
  `distortionCount`.
- Live renderer and totals reports include
  `averageExpectedCitationMappingCoveragePct`.

## Commands

```sh
npm run bench:runtime-prompt
npm test -- --test-name-pattern "Graphify graph fixture|exact citation anchors|answer oracle|unsupported|contradictory|oracle distortion|repeated live|finish reason|inferred live runtime truncation|citation stuffing|expected citation mapping|every-occurrence|occurrenceMode"
node --check scripts/benchmark-runtime-prompt.mjs
node --check test/agent-bridge.test.mjs
npm run check
git diff --check
```
