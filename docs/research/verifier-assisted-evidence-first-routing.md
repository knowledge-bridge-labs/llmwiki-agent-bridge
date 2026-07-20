# Research: Verifier-Assisted Evidence-First Routing

## Status

Draft research note, 2026-07-20.

This note records candidate research and model/tool options for making
`llmwiki-agent-bridge` faster without lowering citation, grounding, or
distortion safety. It is not an implementation plan by itself. The companion
spec is `specs/verifier-assisted-evidence-first-routing/`.

## Executive Summary

The safe direction is not to embed one verifier model directly into the bridge.
The bridge should expose an optional, pluggable verifier-assisted routing gate
that runs after source fan-out and before runtime synthesis. A runtime call can
be skipped only when the query class, retrieved evidence, citation coverage,
and verifier signals all pass configured safety thresholds. Any uncertainty
falls back to the configured Hermes, DeepAgents, or generic runtime when
surviving evidence exists; total selected-source failure stays on the existing
diagnostic fail-closed path.

The strongest production candidate shape is a cascade:

1. rerank evidence candidates;
2. produce a citation-preserving evidence-first draft for simple answer
   classes;
3. verify answer claims against cited evidence;
4. skip runtime only when verification is clean;
5. otherwise escalate to the configured runtime.

This treats runtime avoidance as an earned optimization, not as a new default.

## Research Pattern To Borrow

CADENZA, LOTUS, and Abacus point in the same architectural direction: model
inference should be treated as an optimizable operator with quality, latency,
and cost trade-offs, not as a monolithic step.

- CADENZA compiles natural-language intent into task-specific operator DAGs
  and optimizes quality, latency, and cost under user preferences. Its reported
  gains are useful directional evidence, but they apply to a broader semantic
  query optimizer rather than directly to the bridge.
  Source: https://arxiv.org/abs/2606.29151
- LOTUS provides semantic operators and optimizations for LLM-based bulk data
  processing. It is useful as a semantic-operator reference, not as a small
  online verifier dependency.
  Source: https://arxiv.org/abs/2407.11418 and
  https://github.com/lotus-data/lotus
- Abacus frames semantic-operator selection as quality/cost/latency
  optimization from limited validation examples. This supports the idea that
  bridge routing thresholds should be calibrated on local fixtures rather than
  hard-coded from public benchmarks.
  Source: https://arxiv.org/abs/2505.14661

The practical bridge adaptation is a bounded operator sequence:

```text
query -> source fan-out -> evidence ranking -> citation/coverage checks
      -> optional verifier cascade -> runtime skip or runtime fallback
```

## Candidate Matrix

Licenses and operational notes are based on public model cards or repositories
checked on 2026-07-20. This is engineering due diligence, not legal advice.

| Role | Candidate | License / availability | Use in bridge | Notes |
| --- | --- | --- | --- | --- |
| Evidence reranking | `BAAI/bge-reranker-v2-m3` | Apache-2.0 | Strong default OSS reranker candidate | Multilingual and practical for Korean/English mixed evidence ranking. It ranks relevance; it does not prove factual support. Source: https://huggingface.co/BAAI/bge-reranker-v2-m3 |
| Evidence reranking | `Qwen/Qwen3-Reranker-0.6B` | Apache-2.0 | Evaluation candidate | Strong newer reranker family, but decoder-style operation can be heavier than BGE for a default local path. Source: https://huggingface.co/Qwen/Qwen3-Reranker-0.6B |
| Evidence reranking | `mixedbread-ai/mxbai-rerank-large-v2` | Apache-2.0 | Evaluation candidate | Good OSS candidate, but larger footprint makes it less suitable as the first local default. Source: https://huggingface.co/mixedbread-ai/mxbai-rerank-large-v2 |
| Evidence reranking | Jina reranker v2/v3 | CC-BY-NC-4.0 for HF self-hosted weights | Exclude from production OSS default | Useful as a comparison or commercial adapter, not as a permissive default dependency. Source: https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual |
| Groundedness | `vectara/hallucination_evaluation_model` / HHEM-2.1-Open | Apache-2.0 | Strong optional verifier candidate | Scores whether a hypothesis is supported by premise/context. It requires `trust_remote_code` in the standard Transformers path, so pinning and audit are required before local default use. Source: https://huggingface.co/vectara/hallucination_evaluation_model |
| Grounded fact checking | MiniCheck | Apache-2.0 repo; model licenses vary by checkpoint | Strong offline/local verifier candidate | Designed for checking claims against grounding documents. Multi-sentence answers require sentence or claim decomposition before scoring. Source: https://github.com/Liyan06/MiniCheck |
| Groundedness spans | LettuceDetect | MIT | Optional span/explainability candidate | Useful when UI or trace wants unsupported answer spans. Early public material is English RAG oriented; newer project material should be reviewed per checkpoint before assuming multilingual, code, or tool-grounded coverage. Source: https://github.com/KRLabsOrg/LettuceDetect and https://arxiv.org/abs/2502.17125 |
| Multilingual NLI | `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` | MIT | Multilingual entailment/contradiction fallback | Useful for Korean/English mixed entailment signals. It is NLI, not a RAG factuality model, so it should not be the only safety gate. Source: https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 |
| English/code NLI | `tasksource/ModernBERT-large-nli` | Apache-2.0 | English/code-doc profile candidate | Good NLI candidate for English and code-heavy documentation. It should not replace multilingual verification without local evidence. Source: https://huggingface.co/tasksource/ModernBERT-large-nli |
| Runtime routing | RouteLLM | Apache-2.0 | Comparison or future runtime-router adapter | Routes between stronger/weaker LLMs. It does not verify evidence support. Source: https://github.com/lm-sys/RouteLLM |
| Runtime routing | BEST-Route | MIT | Research comparison | Useful routing idea for query difficulty and multi-sampling, but not a direct evidence verifier. Source: https://github.com/microsoft/best-route-llm |

## Key Risk: Verifier Scores Do Not Transfer Reliably

Automatic attribution and grounding metrics should not be treated as portable
truth. A 2026 attribution-metric audit reports that metric rankings can invert
across datasets, and that an off-the-shelf NLI scorer can fall to chance-level
performance on one long-form attribution dataset while doing well elsewhere.
Source: https://arxiv.org/abs/2606.23915

This means public benchmark strength is insufficient for a bridge default. The
bridge needs in-domain fixtures covering local queries, global queries,
insufficient evidence, contradictory evidence, graph relations, prompt
injection in evidence, and Korean/English/code-document mixtures.

## Recommended Production Boundary

The bridge should own:

- source fan-out and source failure accounting;
- evidence and citation packaging;
- optional routing decision after source collection;
- pluggable verifier provider contracts;
- safe routing diagnostics and metrics;
- runtime fallback to Hermes, DeepAgents, or a generic OpenAI-compatible
  runtime.

The bridge should not own:

- bundled model weights;
- mandatory Python/Transformers runtime dependencies;
- chat-side client routing;
- `llmwiki-serve` retrieval semantics;
- claims that any public model is production-safe without local calibration.

## Proposed Profiles

| Profile | Providers | Intended use |
| --- | --- | --- |
| `none` | no verifier | Current behavior. Runtime call behavior remains unchanged. |
| `mock` | deterministic fixture scores | TDD and offline calibration only. |
| `safe-default-candidate` | BGE reranker + MiniCheck or HHEM + optional mDeBERTa | First candidate for local permissive OSS evaluation. |
| `english-code-candidate` | BGE or Qwen reranker + ModernBERT NLI + MiniCheck/HHEM | English/code-heavy repositories. |
| `span-diagnostic-candidate` | LettuceDetect | Explainability and unsupported-span experiments. |
| `runtime-router-candidate` | RouteLLM or BEST-Route-style router | Future escalation routing, not evidence verification. |

## Promotion Criteria

Verifier-assisted evidence-first routing should remain opt-in until all of the
following are true for the target fixture and runtime matrix:

- unsafe runtime skip count is `0`;
- insufficient, contradictory, verifier-error, verifier-timeout, and
  source-total-failure cases fall back to runtime or diagnostic output 100% of
  the time;
- strict citation anchor coverage is 100%;
- expected citation mapping and occurrence coverage are 100%;
- required answer-oracle coverage is 100%;
- strict unsupported, contradictory, and distortion hits are `0`;
- tracked eval reports and routing summaries report `0` raw prompt, answer,
  endpoint, key, query-string, and local-path leak matches;
- p50/p95 latency and runtime-call avoidance are reported separately from
  quality gates;
- results are repeated across local-query, global-query, insufficient-evidence,
  graph-relation, and strict evidence-fidelity fixture classes.

## Implementation Implication

The next implementation loop should add the evaluation harness before adding
any real verifier provider. The first executable target should be a pure,
deterministic routing evaluator with synthetic fixture scores. Real model
providers should be exercised through optional adapters or sidecars only after
the harness can prove that unsafe skips are detected.
