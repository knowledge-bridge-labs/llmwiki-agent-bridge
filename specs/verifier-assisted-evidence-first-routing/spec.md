# Spec: Verifier-Assisted Evidence-First Routing

## Status

Draft. Documentation only; no implementation is included yet.

## Problem

The bridge currently gathers evidence from selected Knowledge Sources and, in
`delegated-runtime` or `hybrid`, calls the configured OpenAI-compatible runtime
for synthesis. Runtime calls dominate end-to-end latency for many local runs.

Some requests are simple enough to answer from source evidence directly, but
skipping runtime synthesis without strict grounding checks risks omissions,
distortions, wrong citations, and unsafe answers. The bridge needs a way to
evaluate evidence-first routing safely before making any production-default
claim.

## Goals

- Add a design path for optional evidence-first routing that can skip runtime
  only when evidence and verifier gates pass.
- Keep current `delegated-runtime`, `hybrid`, and `evidence-only` behavior
  unchanged until an implementation and evaluation loop explicitly changes it.
- Locate routing inside `llmwiki-agent-bridge`, after source fan-out and before
  runtime synthesis.
- Treat verifier providers as optional and pluggable rather than bundled model
  dependencies.
- Require deterministic fixture evaluation before live model/provider testing.
- Prioritize omission, distortion, contradiction, and citation safety over
  token or latency savings.
- Preserve private-safe logging, audit, and report behavior.

## Non-Goals

- Do not implement CADENZA, LOTUS, Abacus, or another full semantic query
  optimizer inside the bridge.
- Do not add model weights or mandatory Python/Transformers dependencies to the
  Node package.
- Do not move routing into `llmwiki-chat`.
- Do not change `llmwiki-serve` retrieval, graph, or source-bundle semantics.
- Do not make `hybrid` evidence-first by default in this spec.
- Do not claim production default approval until the evaluation matrix passes.
- Do not rely on a single NLI or hallucination detector score as proof of
  correctness.

## Requirements

- `REQ-001`: Default bridge behavior remains unchanged. Without an explicit
  verifier routing option, `delegated-runtime` and `hybrid` still call the
  configured runtime after evidence collection.
- `REQ-002`: Verifier-assisted routing is opt-in through a future additive
  request/config option such as `routingPolicy: "evidence-first"`.
- `REQ-003`: The routing decision runs after selected sources have been queried
  and before the runtime chat-completions request is built.
- `REQ-004`: The routing decision can return only safe states such as
  `runtime`, `evidence-first`, or `diagnostic`; ambiguous names such as
  `approved` are avoided until production approval is earned.
- `REQ-005`: The bridge skips runtime only when all configured evidence,
  citation, query-class, and verifier gates pass.
- `REQ-006`: Verifier unavailable, timeout, invalid output, threshold miss,
  contradiction, insufficient evidence, prompt-injection risk, or unsupported
  claim evidence must not produce an evidence-first runtime skip.
- `REQ-007`: Source-total-failure behavior remains consistent with source
  readiness hardening: when every selected last-known-ready source fails, the
  bridge returns diagnostic output and does not call runtime.
- `REQ-008`: Partial source failure can still allow synthesis or evidence-first
  routing only when surviving evidence satisfies configured coverage gates;
  otherwise the bridge falls back to runtime.
- `REQ-009`: Query classes that request planning, code generation, broad
  synthesis, comparison without sufficient evidence, or multi-hop reasoning
  beyond available citations must fall back to runtime.
- `REQ-010`: Query classes such as local lookup, source summary, citation
  listing, and evidence mapping can become evidence-first candidates only after
  fixture calibration.
- `REQ-011`: Candidate answers must keep exact citation anchors and expected
  citation mappings before a runtime skip is allowed.
- `REQ-012`: Candidate answers must satisfy strict answer-oracle checks for
  required terms, required relations, unsupported claims, contradictory claims,
  and configured distortion patterns before a runtime skip is allowed.
- `REQ-013`: Verifier input is allowlisted. It may include query class,
  portable citation ids, titles, compact snippets, graph summaries,
  source-bundle safe metadata, and redacted source failure counts. It must not
  include credentials, private endpoints, raw URLs, query strings, local
  absolute paths, raw logs, or unredacted upstream bodies.
- `REQ-014`: Verifier output is allowlisted. It may include provider id,
  decision, confidence, scores, reason codes, latency, and error class. It must
  not include raw prompts, raw answers, private endpoints, model names,
  credentials, local paths, or matched sensitive values.
- `REQ-015`: HTTP `/message:send` and MCP `llmwiki_agent_run` share the same
  verifier-assisted routing semantics.
- `REQ-016`: Runtime profiles remain configuration presets over the same
  evidence contract; `hermes`, `deepagents`, and `generic` profiles do not
  change routing rules by themselves.
- `REQ-017`: If a future public artifact field such as `routingDecision` is
  added, it must be additive, documented in `docs/message-send-contract.md`,
  generated into `docs/openapi.json`, and covered by contract tests.
- `REQ-018`: Routing-specific traces, summaries, and eval reports may record
  safe decision summaries and counts. Safe audit logs remain metadata-only and
  do not include prompts, bodies, answers, endpoints, model names, or source
  URLs. Default I/O debug logging keeps its separately documented behavior and
  may include redacted prompt, body, and answer content when enabled.
- `REQ-019`: Offline evaluation must run without network, runtime, or verifier
  provider calls by using deterministic fixtures and mock verifier scores.
- `REQ-020`: Live evaluation wrappers must keep raw provider/runtime streams
  outside the repo, scan raw and sanitized output for sensitive patterns, and
  print only sanitized aggregate JSON.
- `REQ-021`: Production default promotion requires a repeated fixture matrix
  with unsafe runtime skips equal to `0` and strict quality gates at 100%.

## Compatibility

This spec is additive. It does not change the current request contract,
response artifact, runtime prompt renderer, source protocol, or default
orchestration mode.

The likely future contract surface is:

```json
{
  "data": {
    "query": "release readiness",
    "orchestrationMode": "hybrid",
    "routingPolicy": "evidence-first"
  }
}
```

The exact field name is not approved by this draft. Any implementation must
update the message contract and generated OpenAPI artifact before exposing a
public field.
