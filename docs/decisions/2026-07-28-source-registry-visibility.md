# ADR: Source Registry Visibility And Redaction

## Status

Accepted.

## Context

The bridge registry is an operational boundary: it names which Knowledge
Sources are selected, where they are reachable, and whether they appear ready.
Operators need that information without speaking MCP, but HTTP responses can be
called by browser clients and should not expose absolute local roots by default.
The MCP endpoint also advertises compatibility while missing lifecycle methods
required by spec-compliant clients.

## Decision

The bridge will expose a redacted `GET /sources` HTTP registry view and local
CLI `sources`/`ls`/`status` views. HTTP source roots are limited to safe labels
for absolute paths; local CLI output may show stored root paths. The HTTP view
uses last-known readiness by default and performs live probes only when
requested with `probe=1`.

The MCP endpoint implements the lifecycle methods needed for client handshake:
`initialize`, `notifications/initialized`, and `ping`. This is a conservative
compatibility claim, not full certification.

Duplicate source IDs are rejected on persisted source updates. Existing
duplicate registry state is reported as warnings in read-only registry views
instead of silently hiding the ambiguity.

## Consequences

- Operators get a plain REST and CLI path for registry inspection.
- HTTP callers do not receive absolute local root paths by default.
- Spec-compliant MCP clients can complete the basic lifecycle before listing or
  calling tools.
- Upstream quickstart flows still need their own selection-time duplicate
  handling, but the bridge boundary no longer accepts duplicate persisted IDs.

## Links

- Spec: `specs/source-registry-visibility/`
- Issues: `knowledge-bridge-labs/llmwiki-bridge-start#3`,
  `knowledge-bridge-labs/llmwiki-agent-bridge#20`
