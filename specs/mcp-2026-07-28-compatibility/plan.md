# Plan: MCP 2026-07-28 Compatibility

1. Add focused tests for `server/discover`, `2026-07-28` initialize
   acceptance, sessionless `tools/list`, sessionless `tools/call`, and audit
   redaction for request `_meta`.
2. Run the new focused test pattern and confirm it fails before implementation.
3. Add `2026-07-28` to the bridge MCP supported-version list.
4. Implement a small `mcpServerDiscoverResult()` helper and route
   `server/discover` in `handleMcpJsonRpc`.
5. Add `server/discover` to the safe MCP audit method allowlist and generated
   OpenAPI method enum.
6. Update `docs/message-send-contract.md` to document the compatibility slice.
7. Run focused tests, full `npm test`, `npm run lint`, and contract generation
   or check as needed.

