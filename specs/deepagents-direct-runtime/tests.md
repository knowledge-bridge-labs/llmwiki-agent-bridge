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
- `/health`, `/.well-known/agent-card.json`, and `/settings.json` expose
  `runtimeAdapter` without leaking sensitive runtime details.
- `agentBridgeOpenApi()` and `docs/openapi.json` stay in sync.

## Characterization tests added in `test/agent-bridge.test.mjs`

- `keeps legacy runtime profiles on chat completions unless runtimeAdapter is explicit`
- `dispatches explicit deepagents-acp runtimeAdapter through an injected adapter without chat completions HTTP`
- `returns a redacted contract-safe failure when an injected runtime adapter fails`

## Required before live DeepAgents ACP approval

- A local fake ACP server/process fixture proves initialize/session/prompt
  ordering, timeout, stderr capture, and cleanup.
- DGX/Linux live-safe test runs DeepAgents ACP in an isolated HOME/XDG
  directory with no provider secrets and verifies the process can initialize
  and create a session.
- A separate provider-backed live test verifies one grounded answer only after
  the operator has explicitly configured model credentials.
