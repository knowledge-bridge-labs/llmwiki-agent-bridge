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
- [x] Add Windows no-shell-safe default ACP launcher coverage.
- [x] Wire `llmwiki-bridge-start` QuickStart to the opt-in adapter.
- [x] Verify provider-backed ACP smoke against a private OpenAI-compatible
      vLLM endpoint.
- [ ] Add live-safe DeepAgents ACP smoke script.

## Current slice

Live DeepAgents ACP subprocess execution is implemented for opt-in
`runtimeAdapter=deepagents-acp` runs. It remains non-default; live provider
smoke coverage has been manually verified against a private OpenAI-compatible
vLLM endpoint, and a reusable live-safe script remains follow-up work.

## Validation status

- A focused `node --test --test-name-pattern "deepagents-acp|ACP"
  test/agent-bridge.test.mjs` run covering injected dispatch, live fake ACP
  subprocess execution, permission cancellation, hard timeout cleanup, and
  redacted nonzero/malformed failures passed.
- `npm run check` passed for `llmwiki-agent-bridge`.
- `npm run check` passed for `llmwiki-bridge-start`.
- Manual live smoke passed with `runtimeAdapter=deepagents-acp`, a private
  OpenAI-compatible provider endpoint, and a lab-hosted model, returning a
  cited answer from a fixture LLMWiki source.
