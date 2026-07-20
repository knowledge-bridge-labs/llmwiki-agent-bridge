# ADR: Default I/O Debug Logging

## Status

Accepted.

## Context

The bridge already has safe request audit logging, but that stream is
metadata-only and opt-in. It is appropriate for operational proof that a request
traversed the bridge, not for debugging prompts, source payloads, runtime
requests, runtime answers, or timeout failures.

Local bridge users need a default observability path that shows enough of a
`/message:send` turn to understand what the bridge received, what it sent to
sources and runtimes, and what came back. That debug stream must still preserve
credential, authorization-header, API-key, bearer-token, and URL redaction.

## Decision

Add a separate default-on JSONL I/O log stream with schema
`llmwiki.agent-bridge.io.v1` and event name `llmwiki.agent_bridge.io`.

By default, I/O events are appended to
`.runtime-logs/llmwiki-agent-bridge-io.jsonl`, which is gitignored. This gives
local users a discoverable request, source, runtime, and response evidence file
without requiring them to capture stdout manually. Operators can disable this
with `LLMWIKI_AGENT_BRIDGE_IO_LOG=off`, programmatic `ioLog: false`, or
persistent settings. Operators that prefer process logs can use
`LLMWIKI_AGENT_BRIDGE_IO_LOG=logger` or `stdout`, and operators that want a
different file path can use `LLMWIKI_AGENT_BRIDGE_IO_LOG_PATH`.

The existing audit stream remains opt-in and metadata-only. It is not expanded
with prompts, bodies, answers, endpoints, or model names.

I/O log payloads pass through a shared redactor before serialization. The
redactor strips credential-like fields and header values, bearer/API-key
patterns, raw URLs, API-key query parameters, and obvious local absolute paths.
Source and runtime targets include route/path and source summaries, not raw
origins or full URLs.

## Consequences

- Local debugging works by default without requiring users to discover an audit
  flag first or manually capture stdout.
- Prompt and answer content can appear in local debug logs after credential and
  URL redaction, so users who need strict content privacy can opt out.
- Safe audit logs retain their narrower privacy boundary and can continue to be
  used where raw prompt or answer collection is not acceptable.
- File retention is the default and generated logs remain untracked.

## Follow-ups

- If the project adopts a structured logger abstraction, route both audit and
  I/O events through that abstraction while preserving their separate schemas.
- Revisit field-level content controls if users need body-summary-only modes in
  addition to `file`, `logger`, and `off`.

## Links

- Spec: `specs/default-io-logging/`
- Prior audit ADR: `docs/decisions/2026-07-20-safe-request-audit-logging.md`
