# Knowledge Gateway Positioning Plan

## Implementation

1. Create this positioning spec and companion task/test files.
2. Add an ADR for the LLMWiki Knowledge Gateway boundary.
3. Update README introductory and path-selection language.
4. Update `docs/client-paths.md` with direct, bridge, and external-gateway
   placement guidance.
5. Add component-boundary wording for `llmwiki-serve`, `llmwiki-agent-bridge`,
   `llmwiki-chat`, and `llmwiki-bridge-start`.
6. Run docs-only validation and inspect the diff for file scope, whitespace,
   tone, and overclaiming.

## Risks

- Gateway language could be read as a general infrastructure or runtime-hosting
  claim if not scoped to LLMWiki evidence assembly.
- Mentioning external gateway products could imply replacement or certification
  if the docs do not explicitly state the bridge is only a target/companion
  behind them.
- Component-boundary text can drift from existing specs if it suggests the
  bridge owns source projection, indexing, UI, or setup orchestration.
- Docs-only work can accidentally trigger generated-contract or changelog
  churn; this stage must avoid that.

## Rollout

This stage is documentation-only and can ship without code rollout. A later
release note should mention the positioning clarification without presenting it
as a behavior change.
