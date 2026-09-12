# Tasks: MCP 2026-07-28 Compatibility

- [x] Confirm official MCP 2026-07-28 behavior relevant to this slice.
- [x] Add spec and ADR for the compatibility boundary.
- [x] Add failing tests before implementation.
- [x] Advertise and accept `2026-07-28` on `/mcp`.
- [x] Implement `server/discover`.
- [x] Preserve sessionless `tools/list` and `tools/call`.
- [x] Add private cache hints to `server/discover` and `tools/list`.
- [x] Add result metadata to `tools/list` and `tools/call` without changing
  structured content.
- [x] Preserve explicit `/mcp/stream` MCP source endpoints and send modern MCP
  headers plus `params._meta` to source tool calls.
- [x] Add opt-in progressive gateway tool exposure for compact catalog,
  one-tool detail, and source-tool dispatch.
- [x] Preserve audit redaction for request `_meta`.
- [x] Update MCP contract documentation.
- [x] Regenerate OpenAPI if the generated contract changes.
- [x] Run focused and full validation.
