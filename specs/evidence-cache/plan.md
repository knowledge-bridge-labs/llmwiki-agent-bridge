# Evidence Cache Plan

## Implementation

1. Extend bridge configuration with TTL and max-entry options from programmatic
   options and environment variables.
2. Add a small in-memory LRU-style cache on the bridge config object when TTL is
   greater than zero and max entries is positive.
3. Wrap `gatherSourceEvidence` with cache lookup, stale eviction, successful
   write-through, and safe cache trace details.
4. Include cache hit, miss, expired, disabled, and evicted counts in the existing
   evidence preparation trace detail.
5. Document the opt-in environment variables in public configuration docs.

## Affected Modules

- `src/index.mjs`
- `test/agent-bridge.test.mjs`
- `README.md`
- `docs/message-send-contract.md`
- `docs/decisions/0001-evidence-cache.md`

## Risks

- Stale evidence if operators choose a TTL that is too long for active source
  edits.
- Cache keys must remain internal and omit raw source URLs from exposed trace
  artifacts.
- Source-bundle discovery warnings are not replayed on cache hits because hits
  intentionally return fresh cache trace steps.

## Rollout

The feature is opt-in. Operators can enable it for local repeated-agent query
sessions by setting a short TTL.
