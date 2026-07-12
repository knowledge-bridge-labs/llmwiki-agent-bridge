# Direct Client Path vs Bridge Path

LLMWiki clients do not always need `llmwiki-agent-bridge`. Choose the simplest path that matches the client and deployment boundary.

## Direct Client Path

Use the direct-client path when the agent client can call `llmwiki-serve` itself.

Good fits:

- Codex using skills, commands, MCP, or HTTP against `llmwiki-serve`.
- Claude Code using skills, commands, MCP, or HTTP against `llmwiki-serve`.
- Copilot or IDE agents with direct MCP or HTTP access to the Knowledge Source.
- Scripts and backend services that only need retrieval/context and will do their own synthesis.

Benefits:

- Fewer moving pieces.
- The client controls prompting, synthesis, and tool policy.
- No extra local HTTP service between the client and `llmwiki-serve`.

Tradeoff:

- Each client must know how to call the Knowledge Source and assemble its own grounded answer or trace.

## Bridge Path

Use the bridge path when a client wants one companion runtime service that:

- Accepts an A2A-style `message:send` request.
- Accepts an MCP-style `llmwiki_agent_run` tool call at `POST /mcp`.
- Calls selected `llmwiki-serve` Knowledge Sources over `llmwiki-http`, MCP-style JSON-RPC, or A2A-style HTTP.
- Sends the evidence bundle to Hermes, DeepAgents, or a generic OpenAI-compatible runtime.
- Returns one structured answer artifact with citations, graph data, and trace steps.

The detailed request, response, artifact, and failure shapes are documented in
[Message Send Contract](./message-send-contract.md).

Benefits:

- One integration surface for multiple local runtimes.
- Tool-oriented clients can use `tools/list` and `tools/call` without losing the `llmwiki_agent_result` artifact.
- Runtime profiles for Hermes, DeepAgents, and generic OpenAI-compatible endpoints.
- Consistent answer, citation, graph, and trace artifact shape.
- Bounded source fan-out for multiple selected sources while preserving
  selected-source ordering in the returned artifact.

Tradeoff:

- The bridge becomes part of the local trust boundary and must be configured with the right bind host, bearer auth, CORS, and source policy.

## Source URL Policy

The bridge validates every Knowledge Source URL before fetching it. URLs with
userinfo, non-HTTP protocols, or malformed origins are rejected.
This policy applies to bridge outbound source fetches. It is separate from
`llmwiki-chat` Agent Runtime URL policy, browser CORS, provider runtime base URL
configuration, and A2A source message URL validation after agent-card discovery.

| Policy | Meaning | Typical use |
| --- | --- | --- |
| `private-http` | Default. Allows loopback, private-network, and public HTTP/HTTPS Knowledge Source origins. | Local, personal, Tailscale/VPN, and trusted private-network workflows. |
| `allowlist` | Allows only exact origins listed in `LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS`. | Shared bridge deployments where operators want explicit source admission. |
| `public-https` | Allows loopback origins, exact allowlisted origins, and public-reachable HTTPS origins. Blocks private HTTP origins unless allowlisted. | Public or semi-public bridge deployments. |

`open` and `default` are accepted aliases for `private-http` for compatibility,
but new documentation should use `private-http`.

Allowlist entries are origins, not full paths:

```sh
LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY=allowlist
LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS=http://127.0.0.1:8765,https://wiki.example.com
```

For public or shared bridge deployments, combine a restrictive source policy
with `LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN`, HTTPS at the network edge, and
operator-owned logging rules.

## Bind, Auth, and CORS

The default bind is local-only:

```sh
LLMWIKI_AGENT_BRIDGE_HOST=127.0.0.1
LLMWIKI_AGENT_BRIDGE_PORT=8788
```

Binding to `0.0.0.0`, a LAN address, or a Tailscale address requires:

```sh
LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND=1
LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN=replace-with-a-secret
```

Unauthenticated non-loopback binds require
`LLMWIKI_AGENT_BRIDGE_ALLOW_INSECURE_PUBLIC_BIND=1`. Treat that as a
troubleshooting escape hatch only. Never use it on shared or public networks,
and never use it with private Knowledge Sources, runtime API keys, bearer
tokens, or logs that could expose private source content.

Browser CORS is limited to loopback origins plus explicit extra origins:

```sh
LLMWIKI_AGENT_BRIDGE_ALLOWED_ORIGINS=http://127.0.0.1:5173,https://chat.example.com
```

This CORS list controls browser access to the bridge. It does not admit
outbound Knowledge Source URLs; use `LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS`
for that.

## Settings Surface

The bridge publishes `GET /settings` as a guided local setup screen and
`GET /settings.json` as a redacted configuration endpoint. The JSON endpoint
does not include raw bearer tokens or runtime API keys, and it follows the same
bridge bearer-token requirement as the rest of the authenticated HTTP surface.

The first-run path is:

1. Connect runtime. The page saves runtime profile, base URL, and model through
   `PUT /settings/config.json`.
2. Register Knowledge Sources. The page reads and saves reusable source
   descriptors through `GET/PUT /settings/sources.json`. A client may still send
   `knowledgeSources` on each request; when it omits them, the bridge uses the
   registered sources instead.
3. Verify Bridge. The page sends `POST /message:send` with the registered
   source set and displays the returned answer artifact, citations, graph, and
   trace steps.

Runtime credentials, access controls, CORS, timeout, source-policy settings,
source-origin allowlists, and bind host/port controls live under
diagnostics/advanced. Runtime and policy changes apply to the running process.
Bind `host` and `port` changes are persisted for the next start and reported as
restart-required fields.

The agent card includes `metadata.settingsUrl` so clients can link operators to
the local settings screen without hard-coding the path.

## Rule of Thumb

If Codex, Claude Code, Copilot, or another agent can already use `llmwiki-serve` directly through a trusted tool path, start there. Use `llmwiki-agent-bridge` when the runtime needs a companion protocol layer that performs source fan-out, evidence bundling, runtime synthesis, and structured result assembly.
