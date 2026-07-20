# Tasks

- [x] Preserve query-only `/message:send`.
- [x] Accept A2A `data.message` and top-level `message` text as current query
  input.
- [x] Parse `messages`, thread/session/turn IDs, metadata, and
  `configuration.historyLength`.
- [x] Forward bounded alternating runtime history without duplicating the
  current query.
- [x] Keep source retrieval isolated to `data.query`.
- [x] Add safe audit counts/flags.
- [x] Update OpenAPI and docs.
- [x] Add regression tests.
- [x] Re-run full `npm run check` before promotion.
