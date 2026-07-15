# Runtime Prompt Shaping Plan

## Implementation

1. Refactor chat-completions message construction into stable runtime prompt
   helpers.
2. Define a stable system prompt constant and runtime evidence schema marker.
3. Build the runtime evidence bundle with stable top-level keys and compact
   citation/source summaries.
4. Move the user question into a later user message after the evidence bundle.
5. Remove source-bundle payloads and graph samples from the runtime prompt while
   preserving returned artifact fields.
6. Update runtime prompt tests and public contract docs.

## Affected Modules

- `src/index.mjs`
- `test/agent-bridge.test.mjs`
- `docs/message-send-contract.md`
- `docs/decisions/0002-runtime-prompt-shaping.md`

## Risks

- Some runtimes may weight later user messages differently than a single merged
  user prompt.
- Removing graph samples means synthesis can rely on citation text and graph
  counts, but not graph node labels.
- Runtime evidence bundle schema is internal, so future prompt changes need
  tests to preserve citation numbering and cache-friendly ordering.

## Rollout

No operator configuration is required. The change applies to delegated-runtime
and hybrid runs while preserving the public response artifact.
