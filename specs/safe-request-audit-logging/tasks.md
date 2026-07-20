# Tasks: Safe Request Audit Logging

- [x] Add `LLMWIKI_AGENT_BRIDGE_AUDIT_LOG` and `auditLog` configuration.
- [x] Emit JSON-line request audit events through the existing logger.
- [x] Use fixed route patterns instead of raw request URLs.
- [x] Summarize `/message:send` and MCP `llmwiki_agent_run` counts without
  logging raw bodies or artifacts.
- [x] Add safe redaction flags to every event.
- [x] Document the audit option in README and bridge docs.
- [x] Add focused tests for safe evidence-only and delegated-runtime logs.
- [x] Add a route-pattern test for settings and MCP requests.

