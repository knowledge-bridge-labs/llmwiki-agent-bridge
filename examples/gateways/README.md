# External Gateway Examples

These examples show where `llmwiki-agent-bridge` can fit when another gateway
already owns ingress, identity, policy, TLS, routing, scaling, deployment, and
operations.

The bridge remains the LLMWiki Knowledge Gateway target or companion. It
normalizes evidence from selected `llmwiki-serve` Knowledge Sources, adds
citations and graph context, and optionally calls the configured runtime before
returning one `llmwiki_agent_result` artifact.

| Example | Purpose |
| --- | --- |
| [agentgateway-standalone.yaml](./agentgateway-standalone.yaml) | Configuration sketch for routing MCP traffic to the bridge `/mcp` endpoint. |
| [aws-agentcore-target.md](./aws-agentcore-target.md) | Placement guide for choosing an MCP target or HTTP passthrough target. |
| [docker-mcp-gateway.md](./docker-mcp-gateway.md) | Operator notes for evaluating Docker MCP Gateway as a fronting gateway or catalog/profile workflow. |

## Local Bridge Baseline

Start the bridge locally before placing it behind another gateway:

```sh
LLMWIKI_AGENT_BRIDGE_HOST=127.0.0.1 \
LLMWIKI_AGENT_BRIDGE_PORT=8788 \
LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=generic \
LLMWIKI_AGENT_BRIDGE_BASE_URL=http://127.0.0.1:8642/v1 \
LLMWIKI_AGENT_BRIDGE_MODEL=local-model \
npx llmwiki-agent-bridge@latest
```

For an evidence-only validation path, the runtime does not need to be reachable
as long as requests use `mode: "evidence-only"`.

## Validation Flow

Use this sequence before adding an external gateway:

```sh
curl -s http://127.0.0.1:8788/health
```

```sh
curl -s http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}'
```

```sh
curl -s http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Then route the same checks through the external gateway. Operator validation is
required because each gateway owns different policy, authentication, transport,
and logging behavior.

