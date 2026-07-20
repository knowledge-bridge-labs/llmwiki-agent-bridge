# Source Readiness Hardening Plan

## Implementation

1. Add readiness basis metadata and `source_policy_blocked` reason to source
   registry/list schemas.
2. Use policy-aware readiness for `/health`, agent-card source registry
   summaries, and `llmwiki_list_sources`.
3. Keep run fan-out on selected last-known-ready sources so policy and live
   failures become redacted source diagnostics.
4. Skip runtime synthesis when all selected last-known-ready sources fail.
5. Preserve partial behavior when at least one source returns evidence.

## Risks

- Runtime smoke tests that intentionally pass no sources must continue to call
  the runtime.
- Source-bundle warning diagnostics should not inflate source query failure
  counts when the query itself fails.
