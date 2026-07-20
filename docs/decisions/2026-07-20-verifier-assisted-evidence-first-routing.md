# ADR: Optional Verifier-Assisted Evidence-First Routing

## Status

Proposed.

## Context

Runtime-backed synthesis is the main latency cost in many bridge requests.
Recent semantic-query and compound-AI research supports decomposing natural
language work into operators that can be routed, verified, and optimized under
quality, latency, and cost constraints. Candidate tools for evidence ranking,
groundedness, NLI, span detection, and runtime routing exist under mixed
licenses and with different language/runtime assumptions.

The bridge already owns source fan-out, citation packaging, graph context,
source failure accounting, runtime calls, and artifact shaping. That makes it
the right place to decide whether a request can safely avoid runtime synthesis.
However, evidence-first skipping changes answer semantics and can introduce
silent omissions or distortions if applied without strict evaluation.

## Decision

Verifier-assisted evidence-first routing will be designed as an optional
bridge feature, not as a default behavior change.

The routing decision belongs after Knowledge Source fan-out and before the
runtime chat-completions call. `llmwiki-chat` remains a UI/client and should
not perform client-side evidence routing. `llmwiki-serve` remains a read-only
Knowledge Source and should not own answer-verification policy.

The bridge should introduce a future additive routing option, likely separate
from `orchestrationMode`, such as `routingPolicy: "evidence-first"`.
Existing `delegated-runtime`, `hybrid`, and `evidence-only` semantics remain
unchanged unless a later accepted ADR changes them.

Verifier providers will be pluggable. The package should not bundle model
weights or require Python/Transformers as a mandatory dependency. Candidate
provider roles include:

- `reranker` for evidence relevance ordering;
- `groundingVerifier` for evidence-supported answer checks;
- `nliVerifier` for entailment and contradiction signals;
- `spanVerifier` for unsupported-span diagnostics;
- `runtimeRouter` for future escalation routing.

Verifier failure, timeout, invalid output, insufficient evidence,
contradiction, source uncertainty, and prompt-injection risk do not authorize
runtime skipping. They fall back to runtime when evidence exists, or to the
existing diagnostic path when selected sources fail completely.

Any public routing result field must be additive, documented in the message
contract, generated into OpenAPI, tested, and sanitized. Safe audit logging
remains metadata-only.

## Consequences

- Current bridge behavior remains stable while the evaluation harness is built.
- Evidence-first latency wins can be measured without weakening production
  defaults.
- Real verifier providers can be compared behind the same interface.
- License and deployment risk stays outside the default Node package.
- Runtime skip becomes a quality-gated optimization rather than a heuristic.
- Promotion requires repeated local and live-safe evidence, not public
  benchmark claims alone.

## Alternatives Considered

### Make `hybrid` evidence-first by default

Rejected for now. It would change answer semantics before fixture and verifier
evaluation proves unsafe skips are zero.

### Put routing in `llmwiki-chat`

Rejected. Chat does not have the complete source failure, citation, graph,
runtime, and artifact-shaping context and should not become a client-side
reasoning engine.

### Put verification in `llmwiki-serve`

Rejected. Serve is the read-only Knowledge Source layer. It should expose
retrieval, read, graph, and source-bundle evidence, not decide answer-runtime
policy.

### Bundle one verifier model

Rejected. Candidate models differ by language support, license, latency,
hardware requirement, and deployment posture. Bundling one model would make the
package heavier and create a false sense of production safety.

### Implement a full semantic query optimizer

Rejected for this feature. CADENZA, LOTUS, and Abacus are useful references,
but the bridge needs a smaller online routing gate first.

## Follow-ups

- Implement a pure deterministic routing evaluator and mock verifier fixtures.
- Add private-safe offline and live-safe evaluation scripts.
- Calibrate provider profiles for BGE reranking, MiniCheck, HHEM, mDeBERTa,
  ModernBERT NLI, and LettuceDetect candidates.
- Update `docs/message-send-contract.md` and regenerate OpenAPI when a public
  routing field is selected.
- Revisit this ADR before enabling evidence-first routing beyond opt-in.
- Ingest the research note, spec, tests, and ADR into the project LLMWiki after
  review.

## Links

- Spec: `specs/verifier-assisted-evidence-first-routing/`
- Research note: `docs/research/verifier-assisted-evidence-first-routing.md`
- CADENZA: https://arxiv.org/abs/2606.29151
- LOTUS: https://arxiv.org/abs/2407.11418
- Abacus: https://arxiv.org/abs/2505.14661
- Attribution metric audit: https://arxiv.org/abs/2606.23915

