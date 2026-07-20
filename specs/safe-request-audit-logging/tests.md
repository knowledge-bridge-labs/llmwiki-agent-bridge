# Tests: Safe Request Audit Logging

## Acceptance Criteria

- Evidence-only `/message:send` emits one JSON audit event with:
  - route `/message:send`;
  - `orchestrationMode: "evidence-only"`;
  - `runtimeCalled: false`;
  - selected/ready source, citation, graph, artifact, and diagnostic counts;
  - redaction flags showing bodies, query strings, credentials, and source URLs
    are not logged.
- Delegated-runtime `/message:send` emits one JSON audit event with:
  - route `/message:send`;
  - `orchestrationMode: "delegated-runtime"`;
  - `runtimeCalled: true`;
  - safe counts;
  - no raw prompt, runtime answer, runtime endpoint, source endpoint, model
    canary, key canary, source path, or source ref.
- `/settings.json` and `/mcp` emit route-pattern audit events without query
  strings or JSON-RPC request-body values.

## Commands

```sh
npm test -- --test-name-pattern "safe request audit|audits settings and MCP"
npm run lint
```

