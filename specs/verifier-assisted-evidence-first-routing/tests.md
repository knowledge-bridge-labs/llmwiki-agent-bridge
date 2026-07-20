# Tests: Verifier-Assisted Evidence-First Routing

## Status

Draft acceptance plan. No tests are implemented in this documentation-only
change.

## Required Rubric

All required gates are fail-closed. A required gate scored `0` blocks
promotion even if latency improves.

| Gate | Metric | Required outcome |
| --- | --- | --- |
| Default compatibility | Routing disabled behavior | `delegated-runtime` and `hybrid` still call runtime as before |
| Opt-in boundary | Request/config routing policy | Evidence-first routing runs only when explicitly enabled |
| Safe skip precision | Unsafe evidence-first skips | `0` |
| Insufficient evidence | Fallback/diagnostic rate | 100% runtime fallback or diagnostic output; no evidence-first skip |
| Contradiction handling | Contradictory evidence/claim fallback | 100% runtime fallback |
| Verifier failure handling | timeout, unavailable, invalid output | 100% runtime fallback |
| Citation exactness | required anchors and invalid anchors | 100% required coverage, `0` invalid anchors |
| Expected citation mappings | claim-window and occurrence coverage | 100% for strict fixtures |
| Answer oracle | required-item coverage and distortion counts | 100% required coverage, `0` strict distortion hits |
| Source failure consistency | partial and total source failures | Partial uses surviving evidence only if coverage passes; total failure returns diagnostic without runtime |
| Privacy | sensitive scan matches | `0` raw prompt, answer, endpoint, model, key, query-string, temp-path, or local-path leaks |
| Metrics | decision report completeness | decision counts, runtime avoided rate, verifier latency, runtime latency, and total latency p50/p95 are reported |

## Fixture Classes

- `answerable-local`: one source contains sufficient evidence for a direct
  local answer.
- `answerable-global`: multiple sources contribute required evidence.
- `insufficient-evidence`: evidence does not support the requested claim.
- `contradictory-evidence`: retrieved evidence contains conflict that requires
  runtime fallback or explicit uncertainty.
- `citation-stuffing`: answer has citation anchors but not near supported
  claims.
- `missing-required-citation`: answer omits a required exact anchor.
- `graph-relation`: answer requires preserving a graph relation.
- `source-partial-failure`: at least one source fails, but surviving evidence
  may still be enough.
- `source-total-failure`: every selected source fails.
- `prompt-injection-in-evidence`: evidence contains instructions that must not
  affect routing or diagnostics.
- `privacy-redaction-canary`: fixture contains synthetic sensitive-looking
  values that must not appear in reports.

## Deterministic Unit Tests

Future tests should cover:

- routing disabled preserves current runtime call behavior;
- sufficient evidence plus verifier pass returns `evidence-first`;
- insufficient evidence returns `runtime`;
- contradiction returns `runtime`;
- verifier timeout returns `runtime`;
- invalid verifier output returns `runtime`;
- total selected-source failure returns `diagnostic`;
- partial source failure is included in reason metrics;
- strict citation mapping failure returns `runtime`;
- strict answer-oracle distortion returns `runtime`;
- prompt-injection fixture cannot force `evidence-first`;
- privacy canaries do not appear in decision, artifact, audit, or eval report.

## Offline Evaluation

Initial offline command target:

```sh
npm run eval:verifier-routing
```

Expected properties:

- no network calls;
- no runtime calls;
- no real verifier provider calls;
- deterministic mock verifier scores;
- confusion matrix included;
- unsafe skip count fails the command when greater than `0`;
- serialized report passes sensitive scan.

## Live-Safe Evaluation

Initial live-safe command target:

```sh
npm run eval:verifier-routing:live:safe -- --profile verifier-routing-smoke --runtime-alias configured-runtime --model-class configured-model-class
```

Expected properties:

- raw child stdout/stderr stay outside the repo;
- output is sanitized aggregate JSON only;
- provider endpoint values and configured model names are not printed;
- runtime avoided rate is reported but not used as a quality gate;
- provider latency and runtime latency are reported separately;
- failure reasons are category/count based.

## Production-Candidate Approval

Initial approval command target:

```sh
npm run e2e:verifier-routing:approval -- --profile evidence-first-candidate --runtime-alias configured-runtime --model-class configured-model-class --min-runs 3
```

Promotion requires:

- all required fixture classes present;
- each required fixture class run at least three times for the target provider
  profile and safe model class;
- unsafe evidence-first skip count `0`;
- strict fixture pass rate 100%;
- strict failure-code counts empty;
- truncation count `0`;
- invalid citation anchor count `0`;
- required citation-anchor coverage 100%;
- required oracle item coverage 100%;
- expected citation mapping and occurrence coverage 100%;
- final sensitive scan clean.

## Manual Review Before Default Change

Before any default change, review:

- provider license table;
- fixture representativeness for Korean/English/code-document mixtures;
- observed verifier false positives and false negatives;
- p50/p95 latency against runtime-only baseline;
- rollback instructions;
- ADR status and follow-up decisions.

