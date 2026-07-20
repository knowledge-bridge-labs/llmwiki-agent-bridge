# Plan: Verifier-Assisted Evidence-First Routing

## Status

Draft. Documentation only.

## Design Boundary

Verifier-assisted routing belongs in `llmwiki-agent-bridge` because the bridge
is the component that already has the combined query, selected source results,
citations, graph context, source failures, runtime profile, and artifact
shaping responsibility.

The decision point is:

```text
/message:send or llmwiki_agent_run
  -> select sources
  -> query source fan-out
  -> build evidence/citations/graph/source-failure summary
  -> verifier-assisted routing gate
  -> evidence-first answer or runtime fallback or diagnostic artifact
```

`llmwiki-chat` should remain a client and display routing diagnostics only.
`llmwiki-serve` should remain a read-only source server.

## Phases

### Phase 0: Documentation

- Record research, spec, tests, tasks, and ADR.
- Do not change runtime behavior.
- Do not add package dependencies.

### Phase 1: Deterministic Routing Core

- Add a pure routing module that accepts synthetic evidence, query-class
  metadata, source-failure summaries, citation mappings, answer-oracle
  diagnostics, and mock verifier outputs.
- Return a safe decision object with decision, confidence, reasons, metrics,
  and latency fields.
- Keep the module independent from HTTP server state.

### Phase 2: Offline Fixture Harness

- Add fixture classes for local query, global query, insufficient evidence,
  contradictory evidence, citation stuffing, missing required citation,
  partial source failure, graph relation, prompt injection in evidence, and
  privacy redaction canaries.
- Add confusion-matrix metrics for safe skip, unsafe skip, required runtime,
  and missed skip.
- Fail the harness on unsafe skips.

### Phase 3: Optional Provider Interface

- Add pluggable provider shapes for `reranker`, `groundingVerifier`,
  `nliVerifier`, and future `runtimeRouter`.
- Start with `none` and `mock` providers.
- Add HTTP or local sidecar providers only after the offline harness passes.
- Do not bundle model weights or require Python in the package.

### Phase 4: Bridge Integration

- Add an opt-in routing option after source fan-out and before runtime request
  construction.
- Preserve default behavior when the option is absent.
- Add safe trace and diagnostic summaries.
- Update message contract and generated OpenAPI only when a public field is
  introduced.

### Phase 5: Live-Safe Evaluation

- Add a private-safe live wrapper modeled after the runtime prompt evaluation
  wrappers.
- Allow provider aliases such as `mock`, `local-sidecar`, or safe operator
  labels, but never emit private endpoints or model names.
- Compare candidate provider cascades across repeated fixture classes.

### Phase 6: Promotion Review

- Keep evidence-first routing opt-in until strict gates pass across the target
  matrix.
- Treat runtime-call avoidance and latency as secondary metrics.
- Promote only after an ADR update records the fixture matrix, provider
  profile, quality thresholds, privacy checks, and rollback path.

## Candidate Provider Mapping

| Provider role | First candidates | Notes |
| --- | --- | --- |
| `reranker` | BGE reranker v2-m3, Qwen3 reranker, mixedbread reranker | Relevance ranking only; cannot authorize runtime skip by itself. |
| `groundingVerifier` | MiniCheck, HHEM-2.1-Open | Checks support of claims against evidence. Needs local calibration. |
| `nliVerifier` | mDeBERTa multilingual NLI, ModernBERT NLI | Entailment/contradiction signal. Not sufficient as the sole RAG factuality judge. |
| `spanVerifier` | LettuceDetect | Useful for explainability and unsupported span reporting. |
| `runtimeRouter` | RouteLLM, BEST-Route-style routing | Chooses runtime escalation level; not evidence verification. |

## Routing Decision Shape

Future implementation should produce a safe internal shape like:

```json
{
  "decision": "runtime",
  "policy": "evidence-first",
  "confidence": "low",
  "reasonCodes": ["insufficient_evidence"],
  "runtimeCalled": true,
  "verifierCalled": true,
  "metrics": {
    "citationCoveragePct": 80,
    "requiredOracleCoveragePct": 75,
    "sourceFailureCount": 0,
    "verifierLatencyMs": 12
  }
}
```

This shape is illustrative. If exposed publicly, it must be documented as an
additive contract and sanitized.

## Privacy And Safety Constraints

- Checked-in fixtures must be synthetic and portable.
- Tracked eval reports and routing summaries must not include raw prompts, raw
  answers, endpoint values, configured model names, keys, bearer tokens, temp
  paths, local absolute paths, or private source URLs.
- Default local I/O debug logging has separate documented behavior and may
  include redacted prompt, body, and answer content when enabled.
- Sensitive scans must report categories and counts only.
- Provider errors must be bounded and summarized by error class.
- Verifier calls must have explicit timeout and input-size limits.

## Rollout

1. Land documentation.
2. Land pure routing evaluator and fixture tests behind no public API.
3. Add private-safe eval scripts.
4. Add opt-in request/config surface.
5. Run local and live-safe matrices.
6. Revisit the ADR before any default change.

## Risks

- Public benchmarks may not transfer to local wiki, Korean, or code-document
  evidence.
- NLI can over-score short claims and underperform on long-form attribution.
- A verifier cascade can add latency that erases runtime-skip savings for
  simple queries.
- Non-commercial model licenses can accidentally enter default docs or tests.
- Provider diagnostics can leak raw source content if not strictly allowlisted.
