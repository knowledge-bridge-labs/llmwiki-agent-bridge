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

- DGX/Linux live-safe test runs DeepAgents ACP in an isolated HOME/XDG
  directory with no provider secrets and verifies the process can initialize
  and create a session.
- A separate provider-backed live test verifies one grounded answer only after
  the operator has explicitly configured model credentials.

## Manual live validation

- Direct provider smoke passed against a private OpenAI-compatible vLLM
  endpoint using a lab-hosted Qwen-family model.
- `chat-completions` adapter smoke returned a cited answer using fixture
  LLMWiki evidence.
- `deepagents-acp` adapter smoke returned a cited answer using fixture LLMWiki
  evidence with `OPENAI_BASE_URL` set to a private provider endpoint and
  `OPENAI_API_KEY` set to a non-secret placeholder required by the local
  OpenAI-compatible server.
