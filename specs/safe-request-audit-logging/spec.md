# Spec: Safe Request Audit Logging

## Status

Implemented.

## Problem

Operators need a way to verify that chat and tool requests passed through
`llmwiki-agent-bridge` without collecting sensitive request or runtime content.
Normal diagnostics are returned inside task artifacts, but they are not a
process-level request log and should not be repurposed as raw observability.

## Goals

- Emit opt-in JSON-line audit events for bridge HTTP request handling.
- Cover `/message:send`, `/mcp`, `/settings`, `/settings.json`,
  `/settings/config.json`, `/settings/sources.json`,
  `/.well-known/agent-card.json`, and `/health`.
- Include only allowlisted request-level facts: timestamp, request/trace IDs,
  method, route pattern, status, duration, source policy, orchestration mode,
  runtime-called state, safe counts, allowlisted MCP labels, and redaction flags.
- Let `/message:send` and MCP `llmwiki_agent_run` events summarize selected
  source count, selected-ready source count, citation count, source bundle count,
  graph node count, artifact count, and diagnostic count when available.

## Non-Goals

- Do not log request bodies, user prompts, runtime answers, upstream bodies,
  full query strings, source URLs, runtime base URLs, model names, credentials,
  local paths, source IDs, citation IDs, or source refs.
- Do not add a file sink unless the project adopts a broader file logging
  convention.
- Do not change the `/message:send` or `/mcp` response contract.

## Requirements

- `REQ-001`: Audit logging is disabled by default and can be enabled with
  `LLMWIKI_AGENT_BRIDGE_AUDIT_LOG=1`, programmatic `auditLog: true`, or
  persistent config `"auditLog": true`.
- `REQ-002`: Each audit event is a single JSON object serialized as one line
  through the existing bridge logger.
- `REQ-003`: Route values are fixed route patterns, never raw URLs or query
  strings.
- `REQ-004`: The emitter builds events from an allowlist of safe scalar fields
  and must never stringify raw request, response, source, runtime, or error
  objects.
- `REQ-005`: Audit logging failure must not change request handling behavior.
- `REQ-006`: Tests scan emitted audit events for prompt, answer, endpoint,
  credential, model, source-path, source-ref, query-string, and body canaries.

