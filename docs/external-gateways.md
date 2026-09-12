# External Gateway Placement

`llmwiki-agent-bridge` can sit behind an external agent gateway, API gateway,
managed agent platform, reverse proxy, or internal service mesh when that
system already owns ingress and policy. In that shape, the bridge is a
candidate target or companion for LLMWiki evidence assembly, not the gateway
platform itself.

The external gateway or operator owns:

- inbound authentication and authorization
- tenant, user, and policy enforcement
- TLS, public network exposure, routing, and rate limits
- service lifecycle, scaling, deployment, and observability
- credential storage and provider-specific runtime access

The bridge owns the LLMWiki-specific work behind that boundary:

- selected Knowledge Source fan-out
- source registry and gateway target metadata
- evidence normalization across HTTP, MCP-style, and A2A-style sources
- citation, graph, source-bundle, diagnostic, and trace assembly
- opt-in graph-context expansion from served source graph neighborhoods
- optional runtime calls through the configured bridge runtime adapter
- one normalized `llmwiki_agent_result` artifact

Keep source projection in `llmwiki-serve`. Keep hosted gateway operations in
the external gateway. Keep browser workbench state in `llmwiki-chat`.

## Placement Patterns

| Pattern | Use when | Bridge responsibility | External responsibility |
| --- | --- | --- | --- |
| Direct bridge | A trusted local client can call the bridge directly. | Evidence fan-out, optional runtime call, normalized artifact. | Local process supervision and network policy. |
| External gateway in front | A gateway already terminates client traffic and needs an LLMWiki target. | Local evidence target/companion behind the gateway. | Ingress, auth, policy, routing, TLS, scaling, hosted operations. |
| External gateway beside bridge | A platform gateway handles other MCP, A2A, or model traffic while the bridge handles LLMWiki evidence. | LLMWiki evidence assembly for selected sources. | Cross-service orchestration and platform policy. |

## MCP 2026-07-28 Posture

The bridge exposes a conservative MCP 2026-07-28 compatibility slice for the
bridge endpoint:

- `server/discover`
- version advertising for `2026-07-28`, `2025-06-18`, and `2024-11-05`
- sessionless `tools/list`
- sessionless `tools/call` for `llmwiki_agent_run` and read-only source tools

The public docs intentionally avoid broader conformance claims. Modern MCP
operators should validate their gateway's expected request metadata,
`resultType` handling, caching behavior, and transport policy against the exact
gateway version they deploy.

## Docker MCP Gateway

Docker MCP Gateway centralizes MCP server lifecycle, routing, authentication,
credentials, profiles, and container isolation. It is a possible fronting
gateway or catalog/profile workflow for a bridge target, subject to operator
validation.

Current reviewed Docker documentation and repository README did not document
MCP `2026-07-28` protocol-version support. Do not assume a Docker-managed path
will exercise the bridge's MCP 2026 compatibility slice until the deployed
Docker MCP Gateway version has been checked.

See [examples/gateways/docker-mcp-gateway.md](../examples/gateways/docker-mcp-gateway.md)
for a placement guide.

## agentgateway

agentgateway is designed for gatewaying MCP, A2A, and LLM traffic and documents
virtual MCP, server federation, stateless/sessionless MCP 2026-07-28 flow,
`server/discover`, and automatic version negotiation.

A practical local placement is:

```text
client -> agentgateway -> llmwiki-agent-bridge /mcp -> llmwiki-serve sources -> optional runtime
```

Use the bridge as the LLMWiki evidence target. Keep gateway policy, routing,
identity, and platform observability in agentgateway.

See [examples/gateways/agentgateway-standalone.yaml](../examples/gateways/agentgateway-standalone.yaml)
for a configuration sketch.

## AWS Bedrock AgentCore Gateway

AWS Bedrock AgentCore Gateway is a fully managed gateway for agent, tool, and
model traffic. It can aggregate MCP targets, HTTP passthrough targets, and
inference routing with inbound/outbound authentication and CloudWatch
observability. AWS documentation reviewed for this planning pass mentions MCP
server target support for protocol version `2026-07-28`.

Use the bridge as a candidate MCP target when the managed gateway should call
the bridge's MCP tools. Use HTTP passthrough only when the operator wants to
front `/message:send` or other bridge HTTP routes directly.

See [examples/gateways/aws-agentcore-target.md](../examples/gateways/aws-agentcore-target.md)
for a placement guide.

## Operator Checklist

Before treating an external placement as ready:

- verify the bridge is healthy through `/health`
- verify `POST /mcp` `server/discover` when using MCP
- verify `POST /mcp` `tools/list` includes the expected bridge and source tools
- verify `POST /mcp` `tools/call` can run `llmwiki_agent_run` in
  `evidence-only` mode
- verify `/message:send` only if the external gateway intentionally fronts the
  A2A-style HTTP route
- keep `LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN` enabled when the bridge is exposed
  beyond loopback
- use `LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY=allowlist` or `public-https` for
  shared deployments
- keep private Knowledge Source roots, source URLs, runtime credentials, and
  prompts out of external logs unless the operator has explicitly approved
  that telemetry path

## References Reviewed

These links are reference points for the placement guidance above. Re-check
them when updating gateway-specific examples:

- [MCP 2026-07-28 `server/discover`](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/)
- [agentgateway MCP spec compatibility](https://agentgateway.dev/docs/standalone/latest/documentation/mcp/spec-compatibility/)
- [AWS Bedrock AgentCore Gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)
- [AWS AgentCore MCP server targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html)
