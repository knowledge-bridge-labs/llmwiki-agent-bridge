# Tests: Default I/O Debug Logging

## Acceptance

- Default `/message:send` delegated-runtime runs emit `llmwiki.agent_bridge.io`
  events that include a prompt canary and runtime answer canary.
- `ioLog: false` suppresses I/O events and does not log the prompt or answer
  canaries through the configured logger.
- I/O logs redact bridge bearer tokens, runtime API keys, Authorization header
  values, raw source URLs, and raw runtime URLs.
- Runtime timeout failures emit a `runtime.error` I/O event with request ID,
  trace ID, timeout flag, request context, and redacted timeout error.
- Safe audit events remain `llmwiki.agent_bridge.request` records and do not
  include raw prompts, answers, URLs, model names, or credentials.

## Commands

```sh
npm test -- --test-name-pattern "IO logs|IO request context"
npm test -- --test-name-pattern "safe request audit|audits settings and MCP"
npm run lint
npm run contracts:check
npm run e2e:default-io-logging:live
```
