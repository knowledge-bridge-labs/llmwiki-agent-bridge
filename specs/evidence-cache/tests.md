# Evidence Cache Tests

## Acceptance Criteria

- Repeated identical request with TTL enabled calls source endpoints once and
  preserves citation order.
- Different query misses the cache.
- TTL expiry misses the cache.
- Max entries evict older evidence entries.
- Cache traces and diagnostics do not expose raw cache keys or source URLs.
- Runtime answers are not cached; delegated-runtime requests still call the
  configured runtime per request.

## Commands

- `npm test`
- `npm run contracts:check`
