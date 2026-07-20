# Runtime Profiles

`llmwiki-agent-bridge` supports three initial runtime profiles: `hermes`, `deepagents`, and `generic`. Profiles are configuration presets over the same bridge contract. They select the OpenAI-compatible chat completions endpoint, model name, and runtime identity metadata returned by `/health`, `/settings.json`, and `/.well-known/agent-card.json`.

Profiles do not change the Knowledge Source evidence contract. All profiles can use selected `llmwiki-http`, `mcp`, and `a2a` Knowledge Sources and return the same `llmwiki_agent_result` artifact shape.

Runtime profiles are separate from request orchestration mode. `/message:send`
and the `llmwiki_agent_run` MCP tool accept `orchestrationMode` or `mode` with
`delegated-runtime`, `evidence-only`, or `hybrid`. The default is
`delegated-runtime`, which preserves the existing profile behavior and calls the
configured runtime after evidence collection. `evidence-only` gathers and
returns citations, graph context, trace steps, and safe source bundle manifest
metadata without calling the runtime.

Profiles also share the same conversation-runtime-context behavior. Additive
`/message:send` conversation fields, including `data.message`, top-level A2A
`message`, and OpenAI/LangChain-style `data.messages`, are normalized before
runtime delegation: bounded user/assistant history is inserted after the bridge
evidence system prompt and before the final current-query evidence prompt.
Knowledge Source retrieval continues to use only the current query from
`data.query` or A2A message text, so prior assistant answers are not sent to
source query or search endpoints.

## Hermes

Use this profile for Hermes local runtimes.

```sh
LLMWIKI_AGENT_BRIDGE_BASE_URL=http://127.0.0.1:8642/v1
LLMWIKI_AGENT_BRIDGE_MODEL=hermes-agent
LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=hermes
```

Hermes compatibility aliases such as `HERMES_BASE_URL`, `HERMES_MODEL`, and `HERMES_A2A_BRIDGE_*` are accepted for migration.

## DeepAgents

Use this profile for DeepAgents local runtimes that expose an OpenAI-compatible chat completions endpoint.

```sh
LLMWIKI_AGENT_BRIDGE_BASE_URL=http://127.0.0.1:8642/v1
LLMWIKI_AGENT_BRIDGE_MODEL=deepagents-local
LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=deepagents
```

DeepAgents is first-class in this package. It is not treated as future-only work and does not require a separate bridge implementation when the runtime is OpenAI-compatible.

## Generic

Use this profile for any OpenAI-compatible local runtime that is not better represented by a named profile.

```sh
LLMWIKI_AGENT_BRIDGE_BASE_URL=http://127.0.0.1:8642/v1
LLMWIKI_AGENT_BRIDGE_MODEL=local-model
LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=generic
```

The generic profile is the right fit for local servers that implement `/v1/chat/completions` but do not need runtime-specific naming.

## Programmatic Configuration

```js
import { startAgentBridge } from 'llmwiki-agent-bridge'

await startAgentBridge({
  baseUrl: 'http://127.0.0.1:8642/v1',
  model: 'deepagents-local',
  runtimeProfile: 'deepagents',
})
```

Profile-derived runtime identity can still be overridden with
`runtimeId`, `runtimeName`, `runtime`, `agentRuntime`, and
`providerOrganization` when a client needs a custom A2A card identity.

## Environment Variables

The bridge is local-first by default. Set only the runtime endpoint, model, and
profile for normal loopback development. Add bearer auth and explicit network
settings before exposing the bridge beyond the local machine.

Hermes remains the default profile for backward compatibility with earlier
bridge builds and legacy environment aliases. For a new OSS setup, set
`LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=generic` explicitly unless the target
runtime is Hermes or DeepAgents.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLMWIKI_AGENT_BRIDGE_HOST` | `127.0.0.1` | Bridge bind host. Non-loopback hosts require explicit public-bind opt-in. Host changes saved from `/settings` require restart. |
| `LLMWIKI_AGENT_BRIDGE_PORT` | `8788` | Bridge HTTP port. Port changes saved from `/settings` require restart. |
| `LLMWIKI_AGENT_BRIDGE_BASE_URL` | `http://127.0.0.1:8642/v1` | OpenAI-compatible runtime base URL. |
| `LLMWIKI_AGENT_BRIDGE_MODEL` | `hermes-agent` | Model name sent to the runtime. |
| `LLMWIKI_AGENT_BRIDGE_API_KEY` | unset | Optional runtime API key. When set, the bridge sends it to the runtime as bearer auth. |
| `LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE` | `hermes` | Runtime profile: `hermes`, `deepagents`, or `generic`. |
| `LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN` | unset | Optional bearer token required by clients that call the bridge. Required for non-loopback binds unless the insecure development escape hatch is explicit. |
| `LLMWIKI_AGENT_BRIDGE_TIMEOUT_MS` | `120000` | Outbound runtime/source request timeout in milliseconds. |
| `LLMWIKI_AGENT_BRIDGE_AUDIT_LOG` | unset | Set to `1`, `true`, `yes`, or `on` to emit safe request audit JSON lines through the bridge logger. Events include route patterns and counts only; raw prompts, answers, URLs, credentials, model names, query strings, and local paths are omitted. |
| `LLMWIKI_AGENT_BRIDGE_IO_LOG` | `file` | Default-on I/O debug JSONL. Set `off` to suppress prompt/body/answer debug logs, `logger`/`stdout` to route through process logs, or `file` to append JSONL to a file sink. |
| `LLMWIKI_AGENT_BRIDGE_IO_LOG_PATH` | `.runtime-logs/llmwiki-agent-bridge-io.jsonl` | Optional path for I/O debug JSONL. |
| `LLMWIKI_AGENT_BRIDGE_ALLOWED_ORIGINS` | unset | Comma-separated browser CORS origins allowed to call the bridge in addition to loopback origins. |
| `LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY` | `private-http` | Outbound Knowledge Source URL policy. See [Client Paths](./client-paths.md#source-url-policy). |
| `LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS` | unset | Comma-separated exact source origins allowed by the `allowlist` policy or as exceptions under stricter policies. |
| `LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND` | unset | Set to `1` to allow binding to a non-loopback host. |
| `LLMWIKI_AGENT_BRIDGE_CONFIG_PATH` | CLI user config file | Persistent settings file used by `/settings/config.json` and `/settings/sources.json`. Programmatic callers can pass `configPath`. |

Runtime identity fields returned by `/health`, `/settings.json`, and
`/.well-known/agent-card.json` can be overridden with:

| Variable | Purpose |
| --- | --- |
| `LLMWIKI_AGENT_BRIDGE_RUNTIME_ID` | Agent-card runtime ID. |
| `LLMWIKI_AGENT_BRIDGE_RUNTIME_NAME` | Human-readable runtime name. |
| `LLMWIKI_AGENT_BRIDGE_RUNTIME` | Runtime kind label. |
| `LLMWIKI_AGENT_BRIDGE_AGENT_RUNTIME` | A2A-style agent runtime label. |
| `LLMWIKI_AGENT_BRIDGE_PROVIDER_ORGANIZATION` | Provider or operator label. |

Unauthenticated non-loopback binds are blocked by default. The
`LLMWIKI_AGENT_BRIDGE_ALLOW_INSECURE_PUBLIC_BIND=1` escape hatch exists only
for isolated local troubleshooting. Do not use it for shared networks, public
interfaces, private Knowledge Sources, runtime API keys, bearer tokens, or
logs that could expose private source content.

Legacy Hermes migration aliases such as `HERMES_BASE_URL`, `HERMES_MODEL`,
`HERMES_API_KEY`, and `HERMES_A2A_BRIDGE_*` are still accepted. Prefer the
`LLMWIKI_AGENT_BRIDGE_*` names for new deployments.

## Persistent Settings

The CLI enables the local `/settings` UI with a user config file by default, or
you can set `LLMWIKI_AGENT_BRIDGE_CONFIG_PATH` explicitly. Embedded callers must
pass `configPath` to enable persistence.

The settings page is organized as a guided first-time setup:

1. Connect runtime. Save runtime profile, runtime base URL, and model through
   `PUT /settings/config.json`.
2. Register Knowledge Sources. Read and save reusable source descriptors through
   `GET/PUT /settings/sources.json`; bridge requests that omit
   `knowledgeSources` use this registry.
3. Verify Bridge. Run `POST /message:send` from the page to confirm the runtime,
   source registry, artifact, citations, graph, and trace path work together.

Runtime credentials, bridge bearer token, CORS origins, request timeout, source
policy, source-origin allowlists, and bind settings are available under
diagnostics/advanced. Changes to the bridge listener `host` or `port` are saved
but only take effect after restart.

Default I/O debug logs are controlled separately from safe request audit logs.
Use `ioLog: false` or `ioLogMode: "off"` in persistent settings when prompt,
source body, runtime body, and answer debug events should be suppressed. Use
`ioLogMode: "logger"` for stdout/process-log retention, or `ioLogPath` for a
non-default JSONL file path.

## Protocol Status

The bridge exposes MCP-style and A2A-style compatibility surfaces for local integration. `POST /mcp` supports `tools/list` and `tools/call` for the `llmwiki_agent_run` tool, which returns `structuredContent.llmwiki_agent_result` from the same internal run path as `/message:send`.

The package includes `@a2a-js/sdk@0.3.13` and tests agent-card discovery with the official SDK resolver. Do not describe the compatibility surfaces as certified conformance unless a separate certification process has been completed and documented.
