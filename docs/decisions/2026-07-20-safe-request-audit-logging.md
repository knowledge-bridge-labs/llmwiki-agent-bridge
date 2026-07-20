# ADR: Safe Request Audit Logging

## Status

Accepted.

## Context

`llmwiki-agent-bridge` handles user prompts, source descriptors, source
responses, runtime requests, and runtime answers. Operators sometimes need proof
that a chat turn traversed the bridge, but raw request/response logging would
expose prompts, answers, private endpoints, credentials, source URLs, model
names, source paths, and local machine details.

Existing diagnostics are redacted and returned inside bridge artifacts, but they
are not process-level audit records. The bridge also has no file logging
convention.

## Decision

Add opt-in request audit logging controlled by `LLMWIKI_AGENT_BRIDGE_AUDIT_LOG`,
programmatic `auditLog`, or persistent config `"auditLog": true`.

Audit records are JSON lines emitted through the existing logger (`logger.log`,
defaulting to stdout). The record is constructed from an allowlist of safe scalar
fields and only for known bridge routes. It uses route patterns instead of raw
URLs and safe counts instead of source/citation identities.

The audit emitter never stringifies raw request bodies, responses, source
descriptors, runtime payloads, upstream bodies, or arbitrary error objects. It
also fails closed: logging errors are swallowed and cannot alter request
handling.

## Consequences

- Operators can verify request flow and distinguish evidence-only from
  runtime-delegated runs without collecting sensitive content.
- Logs remain low-cardinality and safe for local debugging or operator-managed
  collection.
- The bridge still does not provide a file sink; deployments that need file
  retention should redirect stdout/stderr or provide a logger.
- The `/message:send` and `/mcp` response contracts are unchanged.

## Follow-ups

- If the project later adopts structured logger/file-sink conventions, route
  audit events through that interface without expanding the event payload.

## Links

- Spec: `specs/safe-request-audit-logging/`
- Contract docs: `docs/message-send-contract.md`

