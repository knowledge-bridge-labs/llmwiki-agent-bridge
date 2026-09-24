# Tests: TypeSafe Jev/System-One Judgment Gate

Run:

```sh
node --test --test-name-pattern "external judgment|System-One|progressive-disclosure|graph-expansion|source-policy blocked|masked|default-off" test/agent-bridge.test.mjs
npm run contracts:check
npm run check
npm run audit
```

Acceptance criteria:

- Default-off configuration does not call the provider.
- Report-only runtime-route diagnostics call the provider before runtime
  synthesis and preserve the runtime answer.
- Enforce mode skips runtime synthesis when evidence support is below the
  configured threshold.
- Provider failures fail open in report-only mode and fail closed in enforce
  mode.
- Source-policy blocked source ids, names, and private URLs are absent from
  provider request bodies.
- MCP progressive-disclosure provider state omits the raw source-tool query.
- Graph-expansion report-only diagnostics do not add graph/source calls or
  alter runtime output.
