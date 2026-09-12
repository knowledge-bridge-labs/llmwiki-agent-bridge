# Tests

## Required for adapter-boundary slice

- Existing default `/message:send` delegated-runtime tests continue to post to
  `/v1/chat/completions`.
- `hermes`, `deepagents`, and `generic` runtime profiles without an explicit
  `runtimeAdapter` continue to post to `/v1/chat/completions`, even when an
  injected direct adapter is available in test configuration.
- `runtimeProfile=deepagents` without adapter override still uses
  chat-completions for compatibility.
- `runtimeAdapter=deepagents-acp` dispatches to the selected adapter and returns
  the adapter answer in the normal bridge artifact without calling the HTTP
  chat-completions endpoint.
- Adapter failure returns the same runtime failure status class and redacted
  diagnostics as the current chat-completions path, with a non-chat
  `runtime_adapter_failed` code and no adapter command, session, credentials,
  prompt, headers, or upstream body in the HTTP response.
- The built-in `deepagents-acp` adapter uses the official stable v1
  `@agentclientprotocol/sdk` client path against an ACP stdio subprocess when
  no injected adapter is supplied.
- A local fake ACP process proves initialize/session/prompt ordering, confirms
  the prompt contains the LLMWiki evidence bundle, and verifies chat
  completions HTTP is not called.
- ACP `session/request_permission` requests receive outcome `cancelled`.
- `requestTimeoutMs` is a hard timeout that cleans up the child process.
- Nonzero exits and malformed stdout return redacted diagnostics with capped
  stderr and no raw secrets, URLs, local paths, prompts, commands, or sessions.
- Windows default ACP launch configuration uses `node` plus npm's bundled
  `npx-cli.js` when discoverable so the bridge can keep `shell:false`; an
  explicit command override does not receive automatic argument prefixing.
- `/health`, `/.well-known/agent-card.json`, and `/settings.json` expose
  `runtimeAdapter` without leaking sensitive runtime details.
- `agentBridgeOpenApi()` and `docs/openapi.json` stay in sync.

## Characterization tests added in `test/agent-bridge.test.mjs`

- `keeps legacy runtime profiles on chat completions unless runtimeAdapter is explicit`
- `dispatches explicit deepagents-acp runtimeAdapter through an injected adapter without chat completions HTTP`
- `builds a no-shell-safe Windows default DeepAgents ACP spawn command`
- `returns a redacted contract-safe failure when an injected runtime adapter fails`
- `runs explicit deepagents-acp through a live ACP subprocess without chat completions HTTP`
- `responds to ACP permission requests with cancelled by default`
- `uses requestTimeoutMs as a hard timeout and cleans up the ACP subprocess`
- `returns redacted ACP process diagnostics for nonzero and malformed subprocess failures`

## Required before provider-backed DeepAgents ACP approval

- Provider-backed Linux live-safe test runs DeepAgents ACP in an isolated
  HOME/XDG directory with no provider secrets and verifies the process can
  initialize and create a session.
- A separate provider-backed live test verifies one grounded answer only after
  the operator has explicitly configured model credentials.
- `scripts/deepagents-acp-vllm-live-safe-smoke.mjs` fails closed when the
  OpenAI-compatible runtime base URL or model is missing, and its syntax is
  covered by `npm run lint`.
- When the operator provides a vLLM-compatible runtime endpoint and model, the
  live-safe script starts a temporary `DeepAgentsServer` wrapper with
  `ChatOpenAICompletions`, registers a local `llmwiki-serve` source, sends an
  A2A 1.0 delegated-runtime request with graph context, and validates cited
  answer, source bundle, graph, citation anchors, and leak scan checks.
- The temporary wrapper dependency install runs with install scripts disabled
  and with a bounded npm environment so runtime endpoint and key variables are
  not inherited by the install child process.

## Manual live validation

- Direct provider smoke passed against a private OpenAI-compatible endpoint
  using a lab-hosted model.
- `chat-completions` adapter smoke returned a cited answer using fixture
  LLMWiki evidence.
- Default npm `deepagents-acp` CLI launch was verified, but its documented CLI
  surface does not expose a custom OpenAI-compatible base URL flag.
- `deepagents-acp` adapter smoke returned a cited answer using fixture LLMWiki
  evidence only after launching an explicit programmatic wrapper that starts
  `DeepAgentsServer` with `ChatOpenAICompletions` configured for the private
  OpenAI-compatible endpoint.
- The reusable live-safe wrapper smoke is available as
  `npm run e2e:deepagents-acp:vllm -- --serve-repo <llmwiki-serve-checkout>`
  and prints only sanitized aggregate JSON.
