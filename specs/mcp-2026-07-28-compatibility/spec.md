# Spec: MCP 2026-07-28 Compatibility

## Status

Implemented.

## Problem

`llmwiki-agent-bridge` currently exposes a legacy MCP-style JSON-RPC `/mcp`
surface centered on the initialization-based `2025-06-18` and `2024-11-05`
flows. MCP revision `2026-07-28` introduces a modern, per-request metadata era
with no required negotiation handshake and requires `server/discover` so
clients can learn supported versions, capabilities, and server identity before
or instead of `initialize`.

Bridge clients that prefer the modern stateless flow need a small compatibility
path without regressing existing initialized clients.

## Goals

- Advertise and accept protocol version `2026-07-28` on the bridge `/mcp`
  JSON-RPC endpoint.
- Implement `server/discover` with a focused `DiscoverResult` that includes
  supported protocol versions, tools capability, and bridge server identity.
- Add conservative `resultType: "complete"` and private cache hints to modern
  discovery/list results where they do not break existing clients.
- Keep existing legacy `initialize` behavior working and accept the prior
  official `2025-11-25` revision on the same compatibility path.
- Keep `tools/list` and `tools/call` usable without session state.
- Preserve existing request logging and diagnostic redaction boundaries when
  requests include modern `_meta`.

## Non-Goals

- Do not claim complete MCP 2026-07-28 conformance.
- Do not implement the full 2026-07-28 error taxonomy beyond the existing JSON-
  RPC surface needed for this slice.
- Do not add protocol sessions, sticky routing, MRTR, active cache invalidation
  controls, prompts, resources, or extension negotiation.
- Do not change runtime synthesis contracts.
- Do not replace the MCP source client with a full MCP SDK client; this slice
  only preserves explicitly registered `/mcp/stream` endpoints and sends modern
  request metadata headers on existing JSON-RPC tool calls.

## Requirements

- `REQ-001`: `SUPPORTED_MCP_PROTOCOL_VERSIONS` includes `2026-07-28`,
  `2025-11-25`, and legacy versions `2025-06-18` and `2024-11-05`.
- `REQ-002`: Legacy `initialize` returns the requested supported version, so a
  `2026-07-28` initialize probe receives `protocolVersion: "2026-07-28"`
  without changing the response shape expected by existing tests.
- `REQ-003`: `server/discover` returns JSON-RPC success with
  `resultType: "complete"`, `supportedVersions`, `capabilities.tools`, and
  `_meta["io.modelcontextprotocol/serverInfo"]`.
- `REQ-004`: `tools/list` and `tools/call` continue to work without requiring
  prior `initialize` or any session header.
- `REQ-005`: Safe audit logs only expose allowlisted MCP method names and must
  not expose raw `_meta` contents, prompts, paths, endpoint URLs, bearer tokens,
  API keys, or local paths.
- `REQ-006`: Contract docs describe this as a compatibility slice and avoid
  over-claiming full MCP 2026-07-28 support.
- `REQ-007`: `server/discover` and `tools/list` include
  `resultType: "complete"`, `ttlMs`, and `cacheScope: "private"` as additive
  cache hints for modern clients.
- `REQ-008`: `tools/call` includes additive `resultType: "complete"` and
  response `_meta["io.modelcontextprotocol/serverInfo"]` without changing tool
  structured content.
- `REQ-009`: Registered MCP Knowledge Source URLs that already end with `/mcp`
  or `/mcp/stream` are used as explicit endpoints. Base source URLs continue to
  use the legacy `/mcp` fallback.
- `REQ-010`: MCP Knowledge Source `tools/call` POSTs include
  `Accept: application/json, text/event-stream`, `MCP-Protocol-Version:
  2026-07-28`, `Mcp-Method: tools/call`, `Mcp-Name` for the selected source
  tool, and protocol/client metadata under `params._meta`.

## Compatibility

The bridge remains dual-era. Requests using the legacy `initialize` flow keep
the current initialized-client behavior. Modern requests can use per-request
`params._meta` and call `server/discover`, `tools/list`, or `tools/call`
directly. The bridge does not persist client capabilities or identity between
modern requests.
