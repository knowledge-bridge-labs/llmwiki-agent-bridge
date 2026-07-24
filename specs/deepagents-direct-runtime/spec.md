# DeepAgents Direct Runtime Provider

## Problem

`llmwiki-agent-bridge` currently treats runtime profiles as identity presets
over one OpenAI-compatible `/v1/chat/completions` call path. That is useful for
Hermes-compatible gateways, but it is too narrow for DeepAgents. DeepAgents Code
is primarily an agent harness and can expose its prebuilt coding agent over ACP
stdio with `dcode --acp`.

The product direction is that coding-agent clients should connect to one
`llmwiki-agent-bridge` endpoint. The bridge should gather LLMWiki evidence and
then call the selected runtime provider itself, rather than requiring users to
manually configure DeepAgents as another client of the same sources.

## Goals

- Keep the existing OpenAI-compatible runtime path fully compatible.
- Split runtime identity (`runtimeProfile`) from invocation mechanism
  (`runtimeAdapter`).
- Add an opt-in DeepAgents direct-provider path based on a verified official
  protocol surface.
- Preserve one bridge answer artifact shape across adapters.
- Keep installation, process lifecycle, credentials, and logs explicit and
  safe.

## Non-goals

- Do not make DeepAgents the default runtime adapter in this slice.
- Do not claim certified A2A conformance for DeepAgents until a verified
  official A2A server surface is tested.
- Do not write DeepAgents credentials or provider keys from the bridge.
- Do not mutate user projects or wiki source files.

## Verified upstream surface

- DeepAgents Code docs describe `dcode` as a terminal coding agent with
  provider configuration, memory, skills, approvals, MCP tools, and tracing.
- DeepAgents MCP docs describe `.mcp.json` auto-discovery and MCP tool loading.
- The current DeepAgents ACP docs describe `deepagents-acp` as a CLI and
  programmatic API for exposing Deep Agents over ACP stdio.
- The Agent Client Protocol TypeScript docs identify
  `@agentclientprotocol/sdk` as the official TypeScript package for building
  ACP clients and agents.

## Requirements

1. Existing users with no new settings keep the current behavior:
   `runtimeAdapter=chat-completions`, default `runtimeProfile=hermes`.
2. `runtimeProfile=deepagents` without explicit adapter override keeps the
   existing OpenAI-compatible path for compatibility. `runtimeProfile` must not
   imply ACP or any other direct runtime invocation mechanism by itself.
3. `runtimeAdapter=deepagents-acp` is opt-in and may be selected with
   `LLMWIKI_AGENT_BRIDGE_RUNTIME_ADAPTER=deepagents-acp` or programmatic
   `runtimeAdapter`; packaged live subprocess execution remains follow-up until
   the ACP lifecycle tests land.
4. The bridge runtime call accepts the same normalized evidence bundle and
   returns answer text for the same `llmwiki_agent_result` artifact.
5. Runtime errors remain redacted and contract-safe. Chat-completions failures
   keep the legacy `chat_completions_failed` code; non-chat adapter failures
   return the runtime failure status class with `runtime_adapter_failed`,
   diagnostic schema v1, `scope=runtime`, adapter-specific `phase` and
   `protocol`, and no adapter command, session, credentials, prompt, headers, or
   upstream body in the HTTP response.
6. Settings, health, and agent-card metadata expose the selected adapter without
   leaking runtime URLs, API keys, local absolute paths, or prompt bodies.
7. Tests cover adapter dispatch before live DeepAgents ACP execution.

## Compatibility

This is additive. OpenAPI may gain `runtimeAdapter` metadata and settings
fields. Existing `baseUrl`, `model`, `apiKey`, `hermesBaseUrl`,
`hermesModel`, and legacy `HERMES_*` aliases remain supported.

## Acceptance

- Unit/integration tests pass for existing chat-completions behavior.
- A test-injected `deepagents-acp` adapter is called when explicitly selected.
- `deepagents` profile without adapter override still uses chat completions.
- `hermes`, `deepagents`, and `generic` profiles without adapter override all
  use chat completions and do not call injected direct adapters.
- Docs state that DeepAgents direct-provider support is ACP-first, opt-in, and
  not yet a production-default live subprocess path.
