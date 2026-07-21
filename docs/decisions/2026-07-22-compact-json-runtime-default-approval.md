# ADR: Compact JSON Runtime Default Approval Boundary

## Status

Accepted.

## Context

`llmwiki-agent-bridge` delegated-runtime and hybrid synthesis already render the
runtime evidence bundle with compact JSON (`JSON.stringify(evidenceBundle)`) in
the production message path. The benchmark harness also uses `compact-json` as
a named renderer, while `pretty-json` remains an offline size-comparison debug
baseline.

This creates a naming risk: "compact JSON is used by the runtime" and
"compact JSON is broadly production-default approved across renderer/model/
fixture classes" are related but not the same claim.

## Decision

- Keep the current runtime prompt evidence encoding as compact JSON.
- Do not add a broad operator-facing renderer switch or default flip in this
  step. The public bridge artifact and source contracts remain JSON-shaped and
  unchanged.
- Treat `compact-json` production-default approval as an evidence claim, not a
  code switch. A single live run approves only the configured safe
  `runtimeAlias` / `modelClass` cell used for that invocation.
- Use the tracked production approval wrapper before making broader default
  claims:

  ```sh
  npm run e2e:runtime-prompt:production-approval -- \
    --profile prod-approval-candidate \
    --runtime-alias <safe-runtime-class> \
    --model-class <safe-model-class> \
    --required-model-class <safe-model-class> \
    --min-runs 3 \
    --overall-timeout-ms 1500000 \
    -- --timeout-ms 120000 --max-tokens 768 --temperature 0.2
  ```

- Broad approval requires one sanitized passing report per required runtime /
  model-class cell chosen for the release, with all required fixture ids,
  fixture classes, query classes, strict oracle gates, citation mapping gates,
  truncation gates, invalid-anchor gates, and sensitive-output scans passing.
- `toon`, `markdown-summary`, and future renderer candidates must not become
  defaults through size savings alone. They need separate quality evidence and,
  when their contract differs from compact JSON, a separate ADR.

## Consequences

- Runtime behavior stays stable for current users.
- The bridge can document that its runtime prompt evidence is compact JSON
  without over-claiming broad multi-model default approval.
- Production-default approval remains fail-closed and reproducible through the
  existing e2e wrapper.
- Token savings remain secondary to omission, distortion, citation, and graph
  fidelity gates.

## Follow-ups

- Run the candidate approval profile across the maintainer-selected runtime /
  model-class matrix before claiming broad default approval in public docs.
- Store only sanitized aggregate reports or summarized metrics in tracked docs;
  never commit raw prompts, raw model answers, endpoint/model/key values, temp
  paths, or local absolute paths.
- If a future release needs an operator-facing renderer switch, define the
  config surface, compatibility behavior, and fallback policy in a new spec/ADR.

## Links

- Runtime evaluation rubric: `docs/runtime-prompt-evaluation.md`
- Runtime prompt projection spec: `specs/runtime-prompt-projection-quality/`
- Existing quality-gates ADR:
  `docs/decisions/2026-07-19-runtime-prompt-projection-quality-gates.md`
