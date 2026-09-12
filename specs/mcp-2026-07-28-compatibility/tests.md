# Tests: MCP 2026-07-28 Compatibility

## Acceptance Criteria

- `server/discover` over `POST /mcp` returns:
  - HTTP `200`;
  - JSON-RPC success with the caller's `id`;
  - `result.resultType: "complete"`;
  - `result.supportedVersions` containing `2026-07-28`, `2025-06-18`, and
    `2024-11-05`;
  - `result.capabilities.tools` as an object;
  - `result._meta["io.modelcontextprotocol/serverInfo"]` with bridge name and
    package version.
- `initialize` still accepts `2025-06-18` and now also returns `2026-07-28`
  when requested.
- `tools/list` and `tools/call` work without prior initialization.
- Audit logs for modern MCP requests include only allowlisted method labels and
  do not include raw `_meta` canaries, raw prompts, local paths, URLs, API keys,
  or bearer tokens.

## Commands

```sh
npm test -- --test-name-pattern "MCP 2026-07-28"
npm test
npm run lint
npm run contracts:check
```
