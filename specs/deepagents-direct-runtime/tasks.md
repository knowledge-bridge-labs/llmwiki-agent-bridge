# Tasks

- [x] Add runtime adapter config and metadata.
- [x] Add TDD coverage for default chat-completions compatibility.
- [x] Add TDD coverage for explicit `deepagents-acp` dispatch via injected
      adapter.
- [x] Update docs/runtime-profiles.md and README wording.
- [x] Update generated OpenAPI.
- [x] Add ADR for runtime profile vs runtime adapter boundary.
- [x] Evaluate official ACP TypeScript SDK integration.
- [ ] Implement live DeepAgents ACP subprocess adapter.
- [ ] Add live-safe DeepAgents ACP smoke script.
- [ ] Wire llmwiki-bridge-start quickstart to the new adapter.

## Current slice

Adapter boundary only. Live DeepAgents subprocess execution is deliberately
tracked as a follow-up until the injected-adapter contract is green.

## Validation status

- A focused `node --test test/agent-bridge.test.mjs --test-name-pattern ...`
  run covering adapter-boundary and runtime metadata tests passed.
- `npm run lint` passed.
- Full `npm test` passed with 112 tests.
- `npm run contracts:generate` refreshed `docs/openapi.json`.
- `npm run contracts:check` passed after generation.
