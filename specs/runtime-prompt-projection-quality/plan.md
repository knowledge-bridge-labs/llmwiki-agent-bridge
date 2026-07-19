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
16. Add representative built-in strict fixture coverage:
    - add `graph-strict-evidence-fidelity` with portable synthetic evidence,
      five citations, and graph edges for promotion, citation fidelity, live
      prompt evaluation, repeated citation, and privacy redaction gates;
    - require strict oracle terms/relations, unsupported and contradictory
      claim patterns, `require: "all"` multi-hop citation mapping,
      `occurrenceMode: "every"` repeated citation mapping, privacy/source-path
      mapping, and exact-anchor mismatch coverage;
    - assert default offline fixture inclusion, citation/path quality, private
      data safety, live good-answer eligibility, relation omission failure,
      wrong-nearby-anchor failure, repeated-occurrence failure, and
      unsupported/contradictory distortion classification.
17. Loop 11 private-safe real-runtime calibration:
    - run the repeated live benchmark against the configured legacy `HERMES_*`
      runtime environment for `graph-linear-chain` plus
      `graph-strict-evidence-fidelity` and compact JSON, markdown summary, and
      TOON renderers;
    - use a fallback one-run smoke when the full repeated run is slow, fails
      strict gates, or risks blocking the supervisor turn;
    - redirect raw stdout/stderr to an OS temp directory outside the repo;
    - record only sanitized aggregate live/recommendation metrics in docs;
    - verify raw-report redaction before copying aggregates into tracked
      files.
18. Loop 12 prompt-contract and safe-diagnostic isolation:
    - add local TDD coverage that inspects live benchmark runtime messages for
      a strict claim-preserving contract;
    - tell the live benchmark runtime to preserve configured claim phrases and
      graph relation phrases, keep underscored relation verbs readable, cite
      exact anchors near supported claims, cite every repeated occurrence when
      strict repeated-citation gates ask for it, and avoid evidence-free
      claims;
    - add safe fixture/renderer/run diagnostics that summarize failure codes,
      missing configured oracle relations, missing expected claim phrases,
      citation coverage, finish reason, truncation, and output length without
      raw model output, endpoints, model names, keys, temp paths, or local
      absolute paths;
    - keep oracle checks strict and defer synonym/tolerance changes until
      prompt-contract versus renderer-loss causes are isolated.
19. Loop 13 safe-diagnostic aggregate and privacy regression hardening:
    - add local coverage proving `live.totals.renderers[rendererId].diagnosticSummary`
      is emitted with aggregate-only failure codes, citation coverage, finish
      reason, truncation, missing oracle relation, missing expected claim, and
      `outputTextLength` diagnostics;
    - assert a synthetic configured runtime model name is sent to the mock
      runtime but does not appear in serialized live reports;
    - keep changes additive and preserve strict answer-oracle, expected
      citation mapping, occurrence, and citation-anchor checks.
20. Loop 14 benchmark-only strict claim checklist:
    - add mock runtime request inspection proving live user prompts for
      `graph-strict-evidence-fidelity` include a clearly labeled
      benchmark-only checklist with exact expected claim phrases and resolved
      exact markdown citation anchors;
    - derive checklist entries from effective strict
      `answerOracle.expectedCitationMappings`, including strict/required gate
      status, target requirement semantics, occurrence intent, and
      nearby/window citation intent;
    - omit the checklist for fixtures without effective strict expected
      citation mappings;
    - keep answer oracle, expected citation mapping, repeated-occurrence,
      unsupported/contradictory, distortion, and citation-anchor validation
      unchanged, and keep reports private-data-safe.
21. Loop 15 benchmark-only strict answer format skeleton:
    - add a live-only prompt skeleton headed
      `# Benchmark-only strict answer format`;
    - derive claim rows from effective strict
      `answerOracle.expectedCitationMappings`, copying each exact claim phrase
      and ending the row with the exact resolved markdown anchor or anchors;
    - add required citation coverage rows for top-level citation anchors not
      already forced by those claim rows, including the `graph-linear-chain`
      `[1](#citation-1)` anchor;
    - place a limitations row after claim/coverage rows only, and state that
      factual limitations also need citations;
    - omit both checklist and skeleton for fixtures without effective strict
      expected citation mappings;
    - add row-shaped mock live answers for `graph-linear-chain` and
      `graph-strict-evidence-fidelity` that pass with empty failure codes;
    - preserve strict answer-oracle, expected-citation mapping, occurrence,
      unsupported/contradictory, distortion, truncation, and citation-anchor
      validation unchanged.
22. Loop 16 strict oracle coverage rows:
    - extend the live-only strict answer-format skeleton with oracle coverage
      rows after strict expected-citation claim rows and supplemental
      citation-coverage rows;
    - derive rows generically from strict `answerOracle.requiredTerms`,
      `requiredPhrases`, and `requiredRelations` that are not already
      textually covered by strict expected-citation claim rows;
    - instruct the runtime to write one evidence-supported sentence including
      the required oracle text and ending with an exact markdown citation
      anchor, preferring a determinable top-level supporting anchor and
      otherwise the nearest supporting evidence anchor;
    - add prompt-inspection and mock-live pass/fail coverage for the remaining
      `graph-linear-chain` validation oracle omission;
    - keep fixtures without effective strict expected citation mappings or
      strict answer oracles free of oracle coverage rows;
    - preserve strict answer-oracle, expected-citation mapping, occurrence,
      unsupported/contradictory, distortion, truncation, and citation-anchor
      validation unchanged.
23. Loop 17 private-safe live validation wrapper:
    - add a no-dependency wrapper around
      `scripts/benchmark-runtime-prompt.mjs --live` with `loop17-smoke`,
      `loop17-full`, and pass-through/no-default profile support;
    - write raw child stdout/stderr only to OS temp files and never print raw
      output, model output, prompts, endpoints, model names, keys, temp paths,
      or absolute local paths;
    - enforce `--overall-timeout-ms` around the whole child process and fail
      closed on timeout, child nonzero exit, JSON parse failure, or sensitive
      scan failure;
    - scan raw files and the emitted sanitized summary for raw `"outputText"`
      fields, configured endpoint/model/key env values, key-like tokens,
      bearer tokens, `api_key` query values, temp paths, and absolute local
      paths;
    - print only docs-suitable aggregate JSON with safe command option names,
      live validation/recommendation status, renderer totals, pass/fail rates,
      failure-code and finish-reason counts, citation coverage, oracle and
      expected-citation mapping aggregates, truncation counts,
      `outputTextLength` summaries, and sensitive scan counts/categories.
