# Spec: Default I/O Debug Logging

## Status

Implemented.

## Problem

Users need to debug bridge request, source, and runtime flows without having to
enable the safe audit stream and then discover that audit records intentionally
omit prompts, bodies, runtime answers, and upstream response details.

## Goals

- Emit default-on JSONL I/O events for `/message:send` request handling.
- Log enough content to debug local runs: bridge request body, source request and
  response bodies, runtime request messages/body, runtime response/error, and
  final bridge response/artifact content.
- Preserve redaction for Authorization and other credential headers, API keys,
  bearer tokens, credential-like fields, raw URLs, URL query secrets, and obvious
  local absolute paths.
- Support opt-out with `LLMWIKI_AGENT_BRIDGE_IO_LOG=off`, programmatic
  `ioLog: false`, and persistent settings.
- Keep safe audit logging separate, opt-in, and metadata-only.

## Non-goals

- Do not replace safe request audit logging or expand audit payloads.
- Do not introduce server-side conversation persistence.
- Do not commit runtime log files or make `.runtime-logs/` canonical project
  knowledge.
- Do not guarantee that prompt/answer semantic content is private; the I/O log
  is a debug log and may include content after credential and URL redaction.

## Requirements

- `REQ-001`: I/O logging is enabled by default and appends JSON lines to
  `.runtime-logs/llmwiki-agent-bridge-io.jsonl` when no sink is selected.
- `REQ-002`: `LLMWIKI_AGENT_BRIDGE_IO_LOG=off`, programmatic `ioLog: false`, and
  persistent `ioLog: false` or `ioLogMode: "off"` suppress I/O events.
- `REQ-003`: File mode supports an env/config path and otherwise uses the
  default `.runtime-logs/llmwiki-agent-bridge-io.jsonl` path.
- `REQ-004`: `/message:send` I/O events include prompt and answer canaries in
  default mode so local users can verify the request/runtime path.
- `REQ-005`: Credential/header redaction always removes raw Authorization
  values, bearer tokens, API-key patterns, credential-like object fields, and raw
  source/runtime URLs.
- `REQ-006`: Runtime timeout failures emit request context and timeout error
  events without exposing runtime secrets.
- `REQ-007`: Safe audit tests continue to distinguish audit metadata from I/O
  debug events.
