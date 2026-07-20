# Source Readiness Hardening Tests

## Acceptance coverage

- Persisted selected `status=ready` registered source that is unreachable:
  returns a redacted source query diagnostic, does not expose URL/path/query
  canaries, and does not call the runtime when it is the only selected source.
- Partial failure: surviving source evidence is sent to the runtime; failed
  source count and query diagnostic count match.
- All selected source failures: runtime is not called and the artifact explains
  fail-closed behavior.
- `llmwiki_list_sources` and source registry summaries mark policy-blocked
  persisted-ready sources unavailable without network preflight.

## Commands

```sh
npm run lint
node --test test/agent-bridge.test.mjs
npm run check
```
