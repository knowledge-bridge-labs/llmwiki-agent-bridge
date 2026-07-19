# Tests: Runtime Prompt Projection Quality

## Acceptance Criteria

- The default offline benchmark still passes.
- A temporary Graphify-like `graph.json` fixture is added to the report.
- The Graphify fixture reports graph node/edge counts and citation coverage.
- Absolute local source paths in the input graph do not appear in the report.
- The default offline benchmark includes the built-in strict fixture
  `graph-strict-evidence-fidelity`, reports 100% graph node/edge citation
  coverage for it, reports `nonPortableSourcePathCount` as 0, and keeps the
  serialized report free of private-looking path, endpoint, or key patterns.
- A good live mock answer for `graph-strict-evidence-fidelity` passes strict
  required-anchor, answer-oracle, and expected-citation mapping gates and is
  eligible for the quality-first live recommendation.
- Omitting the fixture's multi-hop required relation fails strict live mock
  validation with `oracle_omission`.
- Citing a wrong nearby anchor while still covering global required anchors
  fails strict live mock validation with `expected_citation_mismatch`.
- Leaving one repeated claim occurrence uncited under
  `occurrenceMode: "every"` fails strict live mock validation with
  `expected_citation_every_occurrence_failed`.
- Unsupported and contradictory claims in the fixture fail strict live mock
  validation with broad `oracle_distortion` plus distinct
  `oracle_unsupported_claim` and `oracle_contradiction` failure codes.
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
- Live renderer and totals reports include expected-citation occurrence
  rollups: average occurrence coverage plus total claim, satisfied, and
  unsatisfied occurrence counts, and total occurrence coverage across repeated
  live runs.
- Live renderer and totals reports include answer-oracle rollups for
  unsupported claim hits, contradictory claim hits, distortion counts, average
  omission rate, and average required-item coverage, with strict unsupported,
  contradictory, and distortion hit counts separated from report-only
  diagnostics.
- Offline renderer comparisons remain byte/char/estimated-token measurements
  and are explicitly marked `basis: "size-only"`.
- Offline renderer reports include top-level
  `offlineComparisonBasis: "size-only"`.
- Every fixture-level and totals-level offline comparison includes
  `basis: "size-only"`.
- Offline mode may report `live.enabled: false` as a skip note, but it emits no
  `recommendation` or `recommendedRendererId` fields when `--live` is omitted.
- Live recommendation ranking is quality-first: a smaller renderer with strict
  live quality failures is not recommended.
- A renderer with strict live `passRatePct` of 100 and zero strict quality
  failures becomes eligible, and the smallest eligible renderer is recommended.
- If no renderer is eligible, `live.recommendation.status` is blocked with
  renderer-specific reasons and `recommendedRendererId` is `null`.
- Report-only oracle and expected-citation diagnostics aggregate separately and
  remain visible, but they do not block recommendation eligibility.
- Fixture-authoring guidance documents compact, deterministic, private-data-safe
  oracle and expected-citation mapping patterns.
- Manual/private live smoke for Loop 11 runs the configured legacy `HERMES_*`
  runtime environment across `graph-linear-chain` and
  `graph-strict-evidence-fidelity`, records only aggregate live/recommendation
  fields, and does not check in raw benchmark stdout, stderr, model answers,
  temp paths, endpoint, model name, credentials, or private local paths.
- The Loop 11 fallback `--live-runs 1` smoke is acceptable when the full
  `--live-runs 3` smoke is slow, fails strict gates, or risks blocking the
  supervisor turn; the docs must state that fallback reason.
- Loop 11 per-renderer table entries such as `Pass/fail 0 / 2` represent the
  two fixture-runs from that fallback mode: `graph-linear-chain` once and
  `graph-strict-evidence-fidelity` once, not two repeated live runs of the same
  fixture.
- Loop 11 raw-report redaction checks confirm no `"outputText"` field, no
  key-like tokens, no configured endpoint/model/credential value, and no
  absolute local paths before sanitized aggregates are copied into docs.
- Live benchmark runtime request inspection confirms the system message carries
  the strict claim-preserving prompt contract for configured claim phrases,
  graph relation phrases, readable relation verbs such as `measured_by` as
  "measured by", exact nearby markdown citation anchors, every-occurrence
  repeated-citation gates, and no evidence-free claims.
- Failing live mock runs include a safe diagnostic summary under live
  fixture/renderer summaries with failure codes, missing configured oracle
  relation details, missing expected claim phrases, citation coverage, finish
  reason counts, truncation counts, and `outputTextLength`.
- Serialized live reports do not include a raw `"outputText"` field, private
  runtime endpoint values, key-like tokens, temp paths, or local absolute paths;
  `outputTextLength` remains allowed as a safe diagnostic scalar.
- Good live mock answers for `graph-linear-chain` and
  `graph-strict-evidence-fidelity` still pass strict oracle and expected
  citation gates after the prompt-contract change.
- Oracle synonym tolerance remains intentionally deferred; strict omission,
  distortion, and citation checks are not weakened in Loop 12.

## Commands

```sh
npm run bench:runtime-prompt
# Manual/private live smoke: redirect raw stdout/stderr to an OS temp
# directory outside the repo, leak-check the raw files, and copy only
# sanitized aggregate fields into tracked docs/specs.
: "${OS_TEMP_DIR:?set OS_TEMP_DIR to an OS temp directory outside the repo}"
node scripts/benchmark-runtime-prompt.mjs --live --fixture graph-linear-chain,graph-strict-evidence-fidelity --renderer compact-json,markdown-summary,toon --live-runs 1 --temperature 0.2 --max-tokens 768 --timeout-ms 120000 > "$OS_TEMP_DIR/runtime-prompt-loop11.stdout.json" 2> "$OS_TEMP_DIR/runtime-prompt-loop11.stderr.txt"
# Optional only when the fallback run completes quickly and safely:
node scripts/benchmark-runtime-prompt.mjs --live --fixture graph-linear-chain,graph-strict-evidence-fidelity --renderer compact-json,markdown-summary,toon --live-runs 3 --temperature 0.2 --max-tokens 768 --timeout-ms 120000 > "$OS_TEMP_DIR/runtime-prompt-loop11-runs3.stdout.json" 2> "$OS_TEMP_DIR/runtime-prompt-loop11-runs3.stderr.txt"
npm test -- --test-name-pattern "offline.*size-only|runtime prompt rendering offline|quality-first|recommendation"
npm test -- --test-name-pattern "claim-preserving|safe diagnostic|graph-strict-evidence-fidelity|runtime prompt rendering offline"
npm test -- --test-name-pattern "runtime prompt rendering offline|graph-strict-evidence-fidelity|strict evidence-fidelity"
npm test -- --test-name-pattern "Graphify graph fixture|exact citation anchors|answer oracle|unsupported|contradictory|oracle distortion|repeated live|finish reason|inferred live runtime truncation|citation stuffing|expected citation mapping|every-occurrence|occurrenceMode|occurrence coverage|smaller live renderer|size-saving live renderer|every renderer fails|report-only aggregate diagnostics"
node --check scripts/benchmark-runtime-prompt.mjs
node --check test/agent-bridge.test.mjs
npm run check
git diff --check
```
