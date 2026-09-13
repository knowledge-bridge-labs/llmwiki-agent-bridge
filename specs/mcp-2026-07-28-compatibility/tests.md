# Tests: MCP 2026-07-28 Compatibility

## Acceptance Criteria

- `server/discover` over `POST /mcp` returns:
  - HTTP `200`;
  - JSON-RPC success with the caller's `id`;
  - `result.resultType: "complete"`;
  - `result.ttlMs` and `result.cacheScope: "private"`;
  - `result.supportedVersions` containing `2026-07-28`, `2025-11-25`,
    `2025-06-18`, and `2024-11-05`;
  - `result.capabilities.tools` as an object;
  - `result._meta["io.modelcontextprotocol/serverInfo"]` with bridge name and
    package version.
- `initialize` still accepts `2025-11-25`, `2025-06-18`, and `2024-11-05`,
  and now also returns `2026-07-28` when requested.
- `tools/list` and `tools/call` work without prior initialization.
- `tools/list` returns `resultType: "complete"`, `ttlMs`, and
  `cacheScope: "private"`.
- Default `direct` tool exposure preserves the existing direct `tools/list`
  entries and omits gateway meta-tools.
- `LLMWIKI_AGENT_BRIDGE_MCP_TOOL_EXPOSURE=gateway` makes `tools/list` return
  only `llmwiki_gateway_search_tools`,
  `llmwiki_gateway_get_tool_details`, and `llmwiki_gateway_call_tool`.
- Gateway `tools/list` is smaller than the default direct built-in tool-list
  payload for this bridge.
- Gateway search returns compact catalog entries without `inputSchema`;
  gateway detail returns one selected full `inputSchema`; gateway call
  dispatches to the intended source tool and redacts URL, local path, and
  secret canaries from the wrapper result.
- `tools/call` returns `resultType: "complete"` while preserving existing
  `content`, `structuredContent`, and `isError` fields.
- Registered MCP Knowledge Source URLs that end in `/mcp/stream` are not
  rewritten to `/mcp/stream/mcp`, and source tool calls include the modern MCP
  request headers and `params._meta` metadata.
- Audit logs for modern MCP requests include only allowlisted method labels and
  do not include raw `_meta` canaries, raw prompts, local paths, URLs, API keys,
  or bearer tokens.

## Commands

```sh
npm test -- --test-name-pattern "MCP 2026-07-28"
npm test -- --test-name-pattern "compact MCP gateway tool discovery"
npm test
npm run lint
npm run contracts:check
```
