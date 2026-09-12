# Plan: MCP 2026-07-28 Compatibility

1. Add focused tests for `server/discover`, `2026-07-28` initialize
   acceptance, sessionless `tools/list`, sessionless `tools/call`, and audit
   redaction for request `_meta`.
2. Run the new focused test pattern and confirm it fails before implementation.
3. Add `2026-07-28` and prior revision `2025-11-25` to the bridge MCP
   supported-version list.
4. Implement a small `mcpServerDiscoverResult()` helper and route
   `server/discover` in `handleMcpJsonRpc`.
5. Add `server/discover` to the safe MCP audit method allowlist and generated
   OpenAPI method enum.
6. Add additive `resultType`, `ttlMs`, and `cacheScope` metadata to
   `server/discover` and `tools/list`; add `resultType` and response `_meta` to
   tool call results.
7. Preserve explicitly registered MCP source endpoints ending in `/mcp/stream`
   and send modern MCP headers plus `params._meta` on upstream source tool
   calls.
8. Add opt-in progressive gateway exposure for compact catalog, single-tool
   detail, and source-tool dispatch.
9. Update `docs/message-send-contract.md` and gateway docs to document the
   compatibility slice.
10. Run focused tests, full `npm test`, `npm run lint`, and contract generation
   or check as needed.
