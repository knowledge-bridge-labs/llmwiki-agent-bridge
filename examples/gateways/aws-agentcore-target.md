# AWS AgentCore Gateway Placement

This is a placement guide for using `llmwiki-agent-bridge` as a candidate
target behind AWS Bedrock AgentCore Gateway. It is not an AWS-managed
deployment recipe.

AWS Bedrock AgentCore Gateway owns the managed gateway surface: inbound and
outbound authentication, target aggregation, HTTP passthrough or MCP target
routing, inference routing, CloudWatch observability, scaling, and hosted
operations.

The bridge owns the LLMWiki evidence layer behind that managed boundary:
source fan-out, graph context, citations, source-bundle metadata, diagnostics,
and the optional runtime call.

## Choose A Target Shape

| Target shape | Use when | Bridge endpoint |
| --- | --- | --- |
| MCP server target | The gateway should call bridge tools such as `llmwiki_agent_run`, `llmwiki_context`, `llmwiki_search`, `llmwiki_read`, `llmwiki_graph`, and `llmwiki_graph_neighbors`. | `POST /mcp` |
| HTTP passthrough target | The gateway should front bridge HTTP routes directly, usually `POST /message:send` for A2A-style runs or `GET /health` for readiness. | Selected HTTP route |

AWS documentation reviewed for this planning pass mentions MCP server target
support for protocol version `2026-07-28`. Still validate the deployed gateway
configuration against the bridge before relying on it for shared traffic.

## Bridge Settings

For a bridge exposed beyond loopback, use explicit host, auth, and source
policy settings:

```sh
LLMWIKI_AGENT_BRIDGE_HOST=0.0.0.0
LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND=1
LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN=replace-with-a-secret
LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY=allowlist
LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS=https://source.example.internal
```

Terminate TLS and manage public network exposure at the gateway or platform
edge. Do not put private source roots, runtime credentials, prompts, or raw
answer artifacts into CloudWatch or gateway logs unless the operator has
explicitly approved that telemetry path.

## Minimum Smoke

Run these through the AgentCore target path:

1. `server/discover` on bridge MCP.
2. `tools/list` and check for `llmwiki_agent_run`.
3. `tools/call` `llmwiki_agent_run` with `mode: "evidence-only"` and one
   allowlisted Knowledge Source.
4. Optional `/message:send` only when HTTP passthrough is the selected target
   shape.

