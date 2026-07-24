# DeepAgents Direct Runtime Adapter Boundary

## Status

Accepted

## Context

The bridge historically used runtime profiles as identity presets over an
OpenAI-compatible chat-completions call. That kept Hermes-compatible local
gateways simple, but it made DeepAgents look like only another OpenAI-compatible
HTTP endpoint.

The intended product shape is different: coding-agent clients should connect to
one `llmwiki-agent-bridge` endpoint, while the bridge gathers LLMWiki evidence
and delegates answer synthesis to the selected runtime provider. DeepAgents
should therefore be supportable as a direct runtime provider when a verified
official agent protocol surface is available.

The currently verified DeepAgents upstream surface is ACP over stdio. Current
DeepAgents docs describe `deepagents-acp` as a CLI and programmatic API for
exposing Deep Agents over ACP stdio. DeepAgents also supports MCP client
configuration and terminal-agent usage. A certified or official DeepAgents A2A
server surface has not yet been verified in this repository.

## Decision

Separate runtime identity from runtime invocation:

- `runtimeProfile` identifies the runtime family and metadata:
  `hermes`, `deepagents`, or `generic`.
- `runtimeAdapter` selects the invocation mechanism:
  `chat-completions` initially, with `deepagents-acp` added as an opt-in direct
  provider path.

The default adapter remains `chat-completions`. `runtimeProfile=deepagents`
without explicit adapter override keeps the existing OpenAI-compatible
compatibility path. DeepAgents ACP is opt-in until broader live provider tests
pass. The adapter boundary, injected-adapter tests, fake ACP subprocess
lifecycle tests, timeout cleanup, permission fail-closed behavior, and redacted
process diagnostics are implemented. The default adapter remains
`chat-completions`.

The adapter boundary is intentionally one-way: selecting a runtime profile only
changes identity metadata and defaults, while selecting `runtimeAdapter` changes
how the bridge invokes the runtime. A non-chat adapter may be provided by
programmatic injection for tests, or the built-in DeepAgents ACP subprocess
adapter may be selected explicitly. Adapter failures use a redacted runtime
failure contract and must not expose the adapter command, session, credentials,
prompt, headers, upstream body, or local runtime endpoint details in HTTP
responses.

## Consequences

- Existing deployments keep working without config changes.
- DeepAgents direct-provider work has a clear place to land without overloading
  OpenAI-compatible endpoint semantics.
- Settings, health, OpenAPI, and docs need to expose adapter metadata.
- Provider-backed ACP smoke tests and QuickStart wiring must pass before
  recommending `deepagents-acp` as a production onboarding default.

## Follow-ups

- Add a live-safe provider-backed DeepAgents ACP smoke script.
- Wire `llmwiki-bridge-start` QuickStart to the opt-in DeepAgents ACP adapter.
- If an official DeepAgents A2A server surface is verified, add it as a sibling
  adapter rather than replacing the ACP path.
