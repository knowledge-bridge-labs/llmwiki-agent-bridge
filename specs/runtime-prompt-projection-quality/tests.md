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
- Failing live mock runs include a safe aggregate diagnostic summary under
  `live.totals.renderers[rendererId].diagnosticSummary` with failure codes,
  failure-code counts, citation coverage, finish reason counts, truncation
  counts, missing configured oracle relation details, missing expected claim
  phrases, and aggregate `outputTextLength`.
- Serialized live reports do not include a raw `"outputText"` field, private
  runtime endpoint values, configured model names, key-like tokens, temp paths,
  or local absolute paths; `outputTextLength` remains allowed as a safe
  diagnostic scalar.
- A synthetic configured runtime model name is sent to the mock chat
  completions request but does not appear anywhere in the serialized live
  report.
- The private-safe live wrapper invokes the existing runtime prompt benchmark
  with `--live`, profile defaults, and pass-through benchmark arguments while
  printing only safe command option names and safe fixture/renderer ids.
- The private-safe live wrapper writes raw child stdout/stderr only to OS temp
  files, does not print temp file paths, and emits a sanitized aggregate JSON
  summary suitable for docs.
- The private-safe live wrapper summary includes live validation status,
  recommendation status/id, renderer totals, pass/fail rates, failure-code
  counts, finish-reason counts, citation coverage, answer-oracle aggregate
  metrics, expected-citation mapping aggregate metrics, truncation counts,
  `outputTextLength` summaries, and sensitive scan categories/counts.
- The private-safe live wrapper exits nonzero when the benchmark child exits
  nonzero while still emitting the parseable sanitized aggregate summary when
  child stdout contains benchmark JSON.
- The private-safe live wrapper exits nonzero on overall timeout, benchmark
  JSON parse failure, or sensitive scan failure.
- The private-safe live wrapper scans raw files and the emitted summary for raw
  `"outputText"` fields, configured endpoint/model/key values, key-like
  tokens, bearer tokens, `api_key` query values, temp paths, and absolute local
  paths; scan reports include categories/counts only, never matched values.
- Synthetic redaction-scan canaries for raw `"outputText"`, key-like tokens,
  bearer tokens, `api_key` query values, configured runtime values, temp paths,
  and absolute local paths are detected without printing the canary values.
- Good live mock answers for `graph-linear-chain` and
  `graph-strict-evidence-fidelity` still pass strict oracle and expected
  citation gates after the prompt-contract change.
- Oracle synonym tolerance remains intentionally deferred; strict omission,
  distortion, and citation checks are not weakened in Loop 12.
- Live mock request inspection proves `graph-strict-evidence-fidelity` user
  prompts include a clearly labeled benchmark-only strict claim checklist with
  the exact phrase
  `Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation`,
  resolved exact markdown anchors `[1](#citation-1)` and
  `[2](#citation-2)`, strict/required gate status, `require: "all"` target
  intent, repeated `occurrenceMode: "every"` intent, and configured
  nearby/window citation intent.
- Live mock request inspection proves fixtures without effective strict
  expected citation mappings omit the benchmark-only strict claim checklist.
- The good `graph-strict-evidence-fidelity` mock answer still passes while
  omission, wrong-anchor, every-occurrence, unsupported, contradictory,
  distortion, and citation-anchor failures still fail through existing strict
  gates; Loop 14 does not loosen oracle behavior.
- Live mock request inspection proves strict live prompts include
  `# Benchmark-only strict answer format`.
- `graph-strict-evidence-fidelity` strict answer-format skeleton includes
  exact claim rows ending with:
  `Expected claim row: Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation [1](#citation-1) [2](#citation-2)`,
  `Expected claim row: Live Prompt Evaluation checks Exact Citation Anchor [3](#citation-3)`,
  `Expected claim row: Citation Fidelity Gate enforces Repeated Citation Gate [4](#citation-4)`,
  and `Expected claim row: Privacy Redaction Gate blocks Source Path Leak [5](#citation-5)`.
- `graph-strict-evidence-fidelity` strict answer-format skeleton includes a
  mandatory completeness checklist before expected-claim rows that says every
  `Expected claim row` must appear exactly once, expected rows are not
  optional, rows must not be omitted/split/merged/rephrased, multi-hop rows
  must stay intact, and anchors must stay on or near the same claim row.
- `graph-linear-chain` strict answer-format skeleton includes a required
  citation coverage row for otherwise-unforced `[1](#citation-1)` while not
  duplicating coverage rows for claim-forced `[2](#citation-2)` or
  `[3](#citation-3)`.
- `graph-linear-chain` strict answer-format skeleton includes an oracle
  coverage row requiring the strict `Runtime Prompt Validation`/`validation`
  oracle term and a supporting exact markdown citation anchor before the
  limitations row.
- Fixtures without effective strict expected citation mappings omit both the
  strict claim checklist, strict answer-format skeleton, supplemental coverage
  rows, and oracle coverage rows.
- Row-shaped mock live answers for `graph-linear-chain` and
  `graph-strict-evidence-fidelity` pass strict oracle, expected-citation,
  occurrence, and citation-anchor gates with empty `failureCodes`; the
  copied `Expected claim row:` labels still pass those validators, and the
  `graph-linear-chain` mock includes `Runtime Prompt Validation` only when the
  new oracle coverage row appears in the prompt.
- A negative `graph-linear-chain` mock answer still fails with
  `oracle_omission` when required citation anchors and expected citation
  mappings are covered but the strict `Runtime Prompt Validation`/`validation`
  oracle term is omitted.
- A negative `graph-strict-evidence-fidelity` multi-hop omission still fails
  with `expected_claim_missing`; mandatory completeness language does not
  weaken validators.
- Existing negative tests still prove wrong nearby anchors fail as
  `expected_citation_mismatch` and omitted anchors fail as
  `citation_anchor_missing`; Loops 15 through 18 do not loosen validation.
- `graph-strict-evidence-fidelity` strict answer-format prompts list the
  allowed exact citation anchors `[1](#citation-1)` through
  `[5](#citation-5)`, tell the runtime not to invent or use other anchors, and
  tell it to omit unsupported factual claims rather than creating unsupported
  anchors.
- Fixtures without an emitted strict answer-format skeleton omit the
  allowed-anchor guidance.
- A live mock answer that covers every required anchor, satisfies the answer
  oracle, and satisfies expected citation mappings still fails when it also
  includes invalid exact anchor `[6](#citation-6)`, with `failureCodes` exactly
  `["citation_anchor_invalid"]`.
- Invalid-anchor live diagnostics expose only invalid exact anchor tokens and
  aggregate counts, such as `invalidCitationAnchors` and
  `invalidCitationAnchorCounts`; diagnostic summaries do not expose raw answer
  text, offsets, surrounding context, endpoint/model/key values, temp paths, or
  local absolute paths.
- The private-safe live wrapper sanitized failure summary preserves invalid
  exact anchor token/count aggregates while sensitive scan status remains ok.
- Built-in benchmark fixtures expose safe `fixtureClass` and `queryClass`
  metadata in offline and live reports.
- The production approval fixture matrix includes local single-source,
  global multi-source, insufficient-evidence, graph relation, and strict
  evidence-fidelity fixture classes.
- `single-source` local-query and `multi-source` global-query fixtures have
  strict answer oracles and expected citation mappings so live approval checks
  validate content rather than citation-anchor presence only.
- `insufficient-evidence` requires an answer that states the production
  default approval gap and absence of private runtime endpoint evidence instead
  of inventing a renderer approval or endpoint value.
- The private-safe live wrapper supports `prod-approval-smoke`,
  `prod-approval-candidate`, and `prod-approval-full` profiles while keeping
  raw child stdout/stderr in OS temp and emitting sanitized aggregate JSON.
- The production approval e2e script emits
  `llmwiki-agent-bridge.runtime-prompt-production-approval.v1` and a
  `defaultApproval` decision for a named renderer.
- `defaultApproval` passes only when required fixture ids, fixture classes, and
  query classes are present; the invocation's safe model class satisfies the
  required model-class check; the named default renderer has 100% pass rate,
  empty failure-code counts, no truncation, no invalid citation anchors, 100%
  required-anchor coverage, zero strict answer-oracle failures, zero strict
  unsupported/contradictory/distortion hits, 100% required oracle item
  coverage, and 100% strict expected-citation mapping and occurrence coverage.
- The production approval e2e script blocks approval when an otherwise valid
  answer includes an invalid exact citation anchor.
- Production approval e2e summaries do not expose raw `"outputText"`,
  endpoint values, configured model names, keys, temp paths, raw prompts, raw
  answers, or local absolute paths.
- Production approval e2e summaries sanitize unsafe runtime aliases, expose
  only safe model-class labels, and scan their final JSON output before
  approval can pass.
- Loop 21 calibrated the `single-source` expected-citation mapping to the
  stable atomic claim "Release readiness depends on local checks" while keeping
  broader answer-oracle checks for citation anchors, graph summaries, source
  limitations, and required relations.
- Loop 21 sanitized live approval evidence for the configured safe
  runtime/model class:
  - `prod-approval-smoke` approved `compact-json` with 5/5 runs, 100% pass
    rate, empty failure-code counts, no truncation, 0 invalid citation anchors,
    100% citation-anchor coverage, 100% required oracle item coverage,
    100% expected-citation mapping coverage, zero blocking reasons, and clean
    final sensitive scan.
  - `prod-approval-candidate` approved `compact-json` with three runs per
    required fixture/query class: 15/15 default-renderer runs passed, 0 failed,
    pass rate 100%, empty failure-code counts, no truncation, 0 invalid
    citation anchors, 100% citation-anchor coverage, 0 strict answer-oracle
    failures, 100% required oracle item coverage, 100% expected-citation
    mapping/occurrence coverage, zero blocking reasons, and clean final
    sensitive scan.

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
# Preferred tracked Loop 17 wrapper for private-safe live aggregate summaries:
npm run eval:runtime-prompt:live:safe -- --profile loop17-smoke --overall-timeout-ms 180000
# Optional repeated renderer profile when the runtime is stable enough:
npm run eval:runtime-prompt:live:safe -- --profile loop17-full --overall-timeout-ms 420000
# Production default approval e2e. Use only sanitized output in docs/wiki:
npm run e2e:runtime-prompt:production-approval -- --profile prod-approval-smoke --runtime-alias configured-runtime --model-class configured-model-class --overall-timeout-ms 300000
# Candidate/full profiles for default-change or lossy-renderer approval work:
npm run e2e:runtime-prompt:production-approval -- --profile prod-approval-candidate --runtime-alias configured-runtime --model-class configured-model-class --min-runs 3 --overall-timeout-ms 600000
npm run e2e:runtime-prompt:production-approval -- --profile prod-approval-candidate --runtime-alias configured-runtime --model-class configured-model-class --required-model-class configured-model-class --min-runs 3 --overall-timeout-ms 1500000 -- --timeout-ms 120000 --max-tokens 768 --temperature 0.2
npm run e2e:runtime-prompt:production-approval -- --profile prod-approval-full --runtime-alias configured-runtime --model-class configured-model-class --min-runs 3 --overall-timeout-ms 900000
npm test -- --test-name-pattern "production approval|local query|global query|insufficient evidence|invalid anchor"
npm test -- --test-name-pattern "offline.*size-only|runtime prompt rendering offline|quality-first|recommendation"
npm test -- --test-name-pattern "strict claim checklist|claim-preserving|safe diagnostic|graph-strict-evidence-fidelity|runtime prompt rendering offline"
npm test -- --test-name-pattern "oracle coverage|strict answer format|strict claim checklist|claim-preserving|safe diagnostic|graph-strict-evidence-fidelity|expected citation mapping|runtime prompt rendering offline"
npm test -- --test-name-pattern "runtime prompt rendering offline|graph-strict-evidence-fidelity|strict evidence-fidelity"
npm test -- --test-name-pattern "mandatory completeness|Expected claim row|strict answer format|strict claim checklist|expected citation mapping|graph-strict-evidence-fidelity|oracle coverage|runtime prompt rendering offline"
npm test -- --test-name-pattern "allowed citation anchor|invalid anchor|live safe profile|strict answer format|Expected claim row|graph-strict-evidence-fidelity|runtime prompt rendering offline"
npm test -- --test-name-pattern "Graphify graph fixture|exact citation anchors|answer oracle|unsupported|contradictory|oracle distortion|repeated live|finish reason|inferred live runtime truncation|citation stuffing|expected citation mapping|every-occurrence|occurrenceMode|occurrence coverage|smaller live renderer|size-saving live renderer|every renderer fails|report-only aggregate diagnostics"
npm test -- --test-name-pattern "live safe profile|redaction scan"
node --check scripts/validate-runtime-prompt-live-safe.mjs
node --check scripts/benchmark-runtime-prompt.mjs
node --check test/agent-bridge.test.mjs
npm run check
git diff --check
```
