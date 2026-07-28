# Source Registry Visibility

## Problem

Operators cannot inspect the bridge source registry without using the settings
UI or an MCP tool call, and spec-compliant MCP clients cannot reach that tool
surface because `/mcp` lacks lifecycle methods. Runtime defaults also look the
same as user-provided runtime settings, which hides unvalidated local defaults.

## Goals

- Make `/mcp` accept the minimal MCP lifecycle handshake:
  `initialize`, `notifications/initialized`, and `ping`.
- Add a plain `GET /sources` registry endpoint for operational inspection.
- Add CLI `sources`, `ls`, and `status` views that read the local bridge
  settings file without starting the service.
- Include last-known readiness by default and live source probes when requested.
- Preserve source root metadata internally and in local CLI output, while HTTP
  responses expose only safe labels for absolute local roots.
- Surface duplicate source IDs as conflicts on persisted writes and warnings on
  read-only registry views.
- Add runtime setting source metadata and actionable runtime failure guidance.

## Non-goals

- No claim of full MCP certification beyond the implemented lifecycle and tool
  methods.
- No background source or runtime health cache.
- No automatic source ID disambiguation.
- No HTTP default that exposes absolute local root paths.

## Requirements

- `POST /mcp initialize` returns a JSON-RPC result with `protocolVersion`,
  `capabilities.tools`, and `serverInfo`.
- `POST /mcp ping` returns `{}`.
- `POST /mcp notifications/initialized` returns no JSON-RPC response body.
- `GET /sources` returns registered source descriptors, counts, duplicate
  warnings, and `health.basis`.
- `GET /sources?probe=1` performs bounded live probes and enriches source
  metadata when manifests expose safe adapter, implementation, bundle, and count
  fields.
- `PUT /settings/sources.json` rejects duplicate source IDs with a conflict
  response instead of accepting ambiguous registry state.
- CLI local views may show stored local roots; HTTP views redact absolute roots
  to basename-style labels.
- Health/settings/agent-card metadata distinguish runtime values that came from
  defaults from values supplied by options, environment, or persisted settings.
