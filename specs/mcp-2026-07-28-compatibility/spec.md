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
- Keep existing `2025-06-18` and `2024-11-05` `initialize` behavior working.
- Keep `tools/list` and `tools/call` usable without session state.
- Preserve existing request logging and diagnostic redaction boundaries when
  requests include modern `_meta`.

## Non-Goals

- Do not claim complete MCP 2026-07-28 conformance.
- Do not implement the full 2026-07-28 error taxonomy beyond the existing JSON-
  RPC surface needed for this slice.
- Do not add protocol sessions, sticky routing, MRTR, caching controls, prompts,
  resources, or extension negotiation.
- Do not change source adapter behavior or runtime synthesis contracts.

## Requirements

- `REQ-001`: `SUPPORTED_MCP_PROTOCOL_VERSIONS` includes `2026-07-28` and legacy
  versions `2025-06-18` and `2024-11-05`.
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

## Compatibility

The bridge remains dual-era. Requests using the legacy `initialize` flow keep
the current initialized-client behavior. Modern requests can use per-request
`params._meta` and call `server/discover`, `tools/list`, or `tools/call`
directly. The bridge does not persist client capabilities or identity between
modern requests.
