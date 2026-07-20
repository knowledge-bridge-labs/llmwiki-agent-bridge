# Plan: Default I/O Debug Logging

1. Add I/O log configuration alongside, but separate from, safe audit logging:
   `ioLog`, `ioLogMode`, `ioLogPath`, `LLMWIKI_AGENT_BRIDGE_IO_LOG`, and
   `LLMWIKI_AGENT_BRIDGE_IO_LOG_PATH`.
2. Implement a fail-closed JSONL emitter that appends to a discoverable file
   sink by default and can route through the existing logger in logger/stdout
   mode.
3. Add a shared I/O redactor for credential-like keys, headers, bearer/API-key
   values, URL strings, query secrets, and local absolute paths.
4. Emit `/message:send` bridge request, source request/response/error, runtime
   request/response/error, and final bridge response events.
5. Preserve the existing request audit emitter and tests as metadata-only.
6. Add direct tests for default logging, opt-out, credential redaction, and
   runtime timeout error logging.
7. Update README/runtime docs, ADR, spec, and generated OpenAPI settings schema.
