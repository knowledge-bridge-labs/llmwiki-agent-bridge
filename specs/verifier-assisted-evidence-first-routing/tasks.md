# Tasks: Verifier-Assisted Evidence-First Routing

## Documentation

- [x] Create research note for semantic-operator, verifier, reranker, NLI, and
  routing candidates.
- [x] Create draft spec.
- [x] Create draft plan.
- [x] Create draft task list.
- [x] Create draft test plan.
- [x] Create ADR for the intended ownership boundary and opt-in default.
- [ ] Update `docs/message-send-contract.md` when a concrete public request or
  response field is chosen.
- [ ] Regenerate `docs/openapi.json` when the public contract changes.
- [ ] Update `README.md`, `docs/client-paths.md`, and `docs/runtime-profiles.md`
  when the feature becomes usable.
- [ ] Ingest this spec, ADR, and research note into the project LLMWiki after
  review.

## Implementation

- [ ] Add a pure verifier-routing module with no provider/network dependency.
- [ ] Add safe decision and metric shapes.
- [ ] Add mock verifier provider.
- [ ] Add fixture loader for routing evaluation.
- [ ] Add opt-in routing configuration.
- [ ] Wire HTTP `/message:send` and MCP `llmwiki_agent_run` through the same
  routing path.
- [ ] Preserve current default behavior when routing is disabled.
- [ ] Add safe trace and diagnostic summaries.
- [ ] Add bounded timeout/error handling for verifier providers.
- [ ] Add optional provider interface for reranker, grounding verifier, NLI
  verifier, span verifier, and runtime router.
- [ ] Add optional sidecar/provider adapters only after the mock harness passes.

## Evaluation

- [ ] Add deterministic unit tests for safe skip, runtime fallback, diagnostic,
  verifier timeout, verifier invalid output, source partial failure, source
  total failure, contradiction, and insufficient evidence.
- [ ] Add fixture classes for local query, global query, insufficient evidence,
  contradictory evidence, graph relation, citation stuffing, prompt injection,
  source partial failure, and privacy canaries.
- [ ] Add offline evaluation script for routing confusion matrix and quality
  gates.
- [ ] Add private-safe live validation wrapper for optional verifier providers.
- [ ] Add production-candidate e2e approval script only after live-safe wrapper
  behavior is stable.
- [ ] Calibrate BGE reranker, MiniCheck, HHEM-2.1-Open, mDeBERTa NLI,
  ModernBERT NLI, and LettuceDetect candidates in separate provider profiles.
- [ ] Record runtime avoided rate and latency p50/p95 as secondary metrics.
- [ ] Require unsafe evidence-first skip count to remain `0`.

## Release And Operations

- [ ] Document provider licenses and pinning requirements.
- [ ] Document `trust_remote_code` audit requirements for providers that need
  it.
- [ ] Document no-bundled-weights policy.
- [ ] Document local-only and sidecar deployment patterns.
- [ ] Add rollback instructions before any default change.
- [ ] Revisit ADR status before promoting evidence-first routing beyond opt-in.

