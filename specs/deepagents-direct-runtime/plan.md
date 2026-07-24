# Plan

## Slice 1: Adapter boundary

- Add `runtimeAdapter` config with default `chat-completions`.
- Add adapter aliases and validation.
- Rename the internal chat-completions call path to runtime-neutral names while
  preserving legacy config fields.
- Add test-only adapter injection so TDD can validate dispatch without starting
  a real DeepAgents process.
- Expose adapter metadata in `/health`, `/.well-known/agent-card.json`, and
  `/settings.json`.
- Update OpenAPI generation/checks.

## Slice 2: DeepAgents ACP provider

- Add an ACP client implementation using the official
  `@agentclientprotocol/sdk` package or a small isolated adapter if the SDK API
  does not expose the needed stdio client primitives.
- Spawn `npx --yes deepagents-acp` (`npx.cmd` on Windows) only when
  `runtimeAdapter=deepagents-acp` is selected and no injected adapter is
  provided.
- Create one isolated ACP session per bridge runtime request at first; consider
  pooling only after correctness and cleanup tests pass.
- Send the LLMWiki evidence prompt as a text prompt block.
- Convert the ACP final assistant output into bridge answer text.
- Enforce fail-closed permission responses, timeout, cancellation, stderr
  capture, child cleanup, and redaction.

## Slice 3: QuickStart integration

- Keep Hermes as connect-only.
- For DeepAgents, install only after explicit opt-in.
- If DeepAgents ACP is selected, start `llmwiki-agent-bridge` with
  `LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=deepagents` and
  `LLMWIKI_AGENT_BRIDGE_RUNTIME_ADAPTER=deepagents-acp`.
- Print one bridge MCP/A2A handoff URL for coding-agent clients.

## Risks

- ACP is session/process oriented; chat completions is stateless HTTP. The first
  provider slice must avoid pooling until lifecycle correctness is proven.
- DeepAgents can execute tools. The bridge must not silently grant filesystem
  or shell permissions beyond explicit DeepAgents configuration.
- Non-interactive/headless behavior differs from editor ACP behavior. Live tests
  must cover DGX/Linux and local dev separately.
