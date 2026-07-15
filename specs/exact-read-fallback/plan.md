# Exact-Read Fallback Plan

## Implementation

1. Add conservative exact-read fallback constants for page count, excerpt size,
   and read target length.
2. Extend the `llmwiki-http` retrieval path after `/query` and compact
   `/search` augmentation to select unique search hits when primary evidence is
   absent.
3. Call `GET /read/{page_id or path}` for capped candidates and convert page
   responses into compact citation records.
4. Replace matching search-hit records with read excerpts so citation order is
   preserved without duplicate citations.
5. Add a safe fallback trace step and warning diagnostics for read failures.
6. Include fallback bounds in the evidence cache request shape.
7. Document behavior in the message contract and ADR.

## Affected Modules

- `src/index.mjs`
- `test/agent-bridge.test.mjs`
- `docs/message-send-contract.md`
- `docs/decisions/0003-exact-read-fallback.md`
- `specs/exact-read-fallback/*`

## Risks

- Extra source latency when `/query` returns no evidence and `/search` finds
  candidates. The two-page cap bounds this.
- Read excerpts may still omit useful later-page detail because full page bodies
  are intentionally not sent to the runtime.
- Sources with incompatible `/read` implementations may produce warning
  diagnostics while still falling back to search snippets.

## Rollout

No operator configuration is required. The behavior applies only to
`llmwiki-http` sources when primary evidence is empty or explicitly marked not
answerable, and preserves existing artifact shape and source failure behavior.
