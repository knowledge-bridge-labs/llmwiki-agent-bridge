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
      endpoint through an explicit DeepAgents programmatic wrapper.
- [x] Add live-safe DeepAgents ACP smoke script.

## Current slice

Live DeepAgents ACP subprocess execution is implemented for opt-in
`runtimeAdapter=deepagents-acp` runs. It remains non-default. Default npm
`deepagents-acp` CLI launch works, but vLLM/custom-base provider-backed smoke
coverage requires an explicit DeepAgents programmatic wrapper that injects a
chat-completions model configured for the private OpenAI-compatible endpoint.
`scripts/deepagents-acp-vllm-live-safe-smoke.mjs` captures that wrapper flow as
an opt-in smoke script with sanitized aggregate JSON output.

## Validation status

- A focused `node --test --test-name-pattern "deepagents-acp|ACP"
  test/agent-bridge.test.mjs` run covering injected dispatch, live fake ACP
  subprocess execution, permission cancellation, hard timeout cleanup, and
  redacted nonzero/malformed failures passed.
- `npm run check` passed for `llmwiki-agent-bridge`.
- `npm run check` passed for `llmwiki-bridge-start`.
- Manual live smoke passed with `runtimeAdapter=deepagents-acp`, a temporary
  `DeepAgentsServer` + `ChatOpenAICompletions` wrapper, a private
  OpenAI-compatible provider endpoint, and a lab-hosted model, returning a
  cited answer from a fixture LLMWiki source.
- `npm run lint` passed with
  `scripts/deepagents-acp-vllm-live-safe-smoke.mjs` included in syntax checks.
- `scripts/deepagents-acp-vllm-live-safe-smoke.mjs` was verified to fail closed
  with sanitized aggregate JSON when runtime endpoint/model env is absent.
- `npm run e2e:deepagents-acp:vllm -- --serve-repo <llmwiki-serve-checkout>
  --pretty` passed against a local sample wiki, temporary SQLite GraphStore,
  temporary DeepAgents ACP wrapper, and configured OpenAI-compatible runtime.
