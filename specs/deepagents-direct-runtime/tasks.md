# Tasks

- [x] Add runtime adapter config and metadata.
- [x] Add TDD coverage for default chat-completions compatibility.
- [x] Add TDD coverage for explicit `deepagents-acp` dispatch via injected
      adapter.
- [x] Update docs/runtime-profiles.md and README wording.
- [x] Update generated OpenAPI.
- [x] Add ADR for runtime profile vs runtime adapter boundary.
- [x] Evaluate official ACP TypeScript SDK integration.
- [x] Implement live DeepAgents ACP subprocess adapter.
- [ ] Add live-safe DeepAgents ACP smoke script.
- [ ] Wire llmwiki-bridge-start quickstart to the new adapter.

## Current slice

Live DeepAgents ACP subprocess execution is implemented for opt-in
`runtimeAdapter=deepagents-acp` runs. It remains non-default; live provider
smoke coverage and quickstart wiring remain follow-up tasks.

## Validation status

- A focused `node --test --test-name-pattern "deepagents-acp|ACP"
  test/agent-bridge.test.mjs` run covering injected dispatch, live fake ACP
  subprocess execution, permission cancellation, hard timeout cleanup, and
  redacted nonzero/malformed failures passed.
- Full `npm test` and `npm run check` should be rerun before merge.
