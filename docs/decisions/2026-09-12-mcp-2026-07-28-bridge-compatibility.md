# ADR: MCP 2026-07-28 Bridge Compatibility

## Status

Accepted.

## Context

The bridge already provides an MCP-style `/mcp` JSON-RPC endpoint for local
tool clients. Existing clients use initialization-based MCP revisions such as
`2025-06-18` and `2024-11-05`. MCP revision `2026-07-28` introduces a modern
per-request metadata model and requires `server/discover` so clients can learn
supported versions, capabilities, and server identity without establishing a
protocol session.

The bridge tools are already effectively stateless at the `/mcp` route: source
selection is provided by tool arguments or persistent settings, and no MCP
session store is required for `tools/list` or `tools/call`.

## Decision

Implement a small dual-era compatibility slice:

- Add `2026-07-28` and prior revision `2025-11-25` to the supported MCP
  protocol versions.
- Keep legacy `initialize` responses for existing clients and let
  `initialize` echo `2026-07-28` when requested.
- Add `server/discover` as a sessionless JSON-RPC method that returns bridge
  supported versions, tools capability, and server identity under the
  `io.modelcontextprotocol/serverInfo` `_meta` key.
- Keep `tools/list` and `tools/call` sessionless.
- Add private cache hints to `server/discover` and `tools/list`, plus
  `resultType: "complete"` to `tools/list` and `tools/call`.
- Extend only the existing safe audit method allowlist for `server/discover`;
  do not log request `_meta` or client-provided identity/capabilities.

## Consequences

- Modern clients can discover and call bridge tools without a prior
  initialization handshake.
- Existing initialized clients keep their current behavior.
- The implementation does not claim complete MCP 2026-07-28 conformance; MRTR,
  full transport header validation, active cache invalidation semantics,
  prompts, resources, and extension negotiation remain out of scope.
- The public contract documents a compatibility slice rather than a certified
  MCP implementation.

## Follow-ups

- Evaluate full `UnsupportedProtocolVersionError` behavior for modern
  per-request `_meta` after clients require strict 2026-07-28 version
  rejection semantics.
- Revisit generated OpenAPI schema detail if external clients need a formal
  `server/discover` result schema rather than the generic MCP JSON-RPC response.

## Links

- Spec: `specs/mcp-2026-07-28-compatibility/`
- Contract docs: `docs/message-send-contract.md`
