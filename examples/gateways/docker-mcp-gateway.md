# Docker MCP Gateway Placement

Docker MCP Gateway centralizes MCP server lifecycle, routing, authentication,
credentials, profiles, and container isolation. In an LLMWiki deployment it can
be evaluated as a fronting gateway or catalog/profile workflow for
`llmwiki-agent-bridge`.

This is a placement guide, not a validated Docker integration.

## Placement

```text
MCP client
  -> Docker MCP Gateway
  -> llmwiki-agent-bridge /mcp
  -> llmwiki-serve Knowledge Sources
  -> optional runtime adapter
```

Docker owns gateway lifecycle, routing, authentication, credentials, profiles,
container isolation, and operator controls. The bridge owns source fan-out,
evidence normalization, graph context, citations, trace steps, and the
`llmwiki_agent_result` artifact.

## Protocol Caveat

Current reviewed Docker MCP Gateway documentation and repository README did not
document MCP `2026-07-28` protocol-version support. Treat the bridge as a
candidate target and verify the actual gateway version before relying on:

- `server/discover`
- sessionless `tools/list`
- sessionless `tools/call`
- per-request `_meta`
- `resultType` behavior expected by the deployed client and gateway

## Operator Validation

Start with a direct local bridge smoke:

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

Then repeat the same calls through Docker MCP Gateway. Keep bridge bearer auth,
source-origin policy, TLS termination, and logging policy aligned with the
gateway deployment.

