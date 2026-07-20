# Tasks: Default I/O Debug Logging

- [x] Add default-on I/O log configuration and env parsing.
- [x] Add optional file sink path with `.runtime-logs/llmwiki-agent-bridge-io.jsonl`
  as the file-mode default.
- [x] Add redaction for credential headers, API keys, bearer values,
  credential-like fields, URLs, query secrets, and local absolute paths.
- [x] Emit bridge request and final response events for `/message:send`.
- [x] Emit source request, response, and error events through shared fetch hooks.
- [x] Emit runtime request, response, and timeout/error events through shared
  fetch hooks.
- [x] Keep safe audit logging opt-in and metadata-only.
- [x] Add regression tests for default logging, opt-out, redaction, and runtime
  timeout logging.
- [x] Update README, runtime docs, ADR, spec, and OpenAPI schema.
