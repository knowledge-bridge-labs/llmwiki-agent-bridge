# Source Registry Visibility Tests

## Acceptance coverage

- MCP `initialize` negotiates a supported protocol version and advertises only
  implemented capabilities.
- MCP `notifications/initialized` returns an empty response body.
- MCP `ping` returns an empty result object.
- `GET /sources` returns registered sources, counts, safe root labels, and no
  absolute local root paths by default.
- `GET /sources?probe=1` marks live sources with `basis=live_probe` and enriches
  adapter/bundle/count metadata from a fixture manifest.
- Duplicate source IDs sent to `PUT /settings/sources.json` return a conflict
  without persisting.
- CLI `sources --json` and `status --json` read local settings and include the
  local root path for operator diagnostics.
- Runtime failure output points to `/settings` and evidence-only mode without
  leaking credentials.

## Commands

```sh
npm run lint
node --test test/agent-bridge.test.mjs
npm run check
git diff --check
```
