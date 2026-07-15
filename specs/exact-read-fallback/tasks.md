# Exact-Read Fallback Tasks

- [x] Add fallback constants and cache request-shape inputs.
- [x] Trigger fallback only for empty or not-answerable primary `llmwiki-http`
  query evidence.
- [x] Select unique `/search` hits not already cited by `/query`.
- [x] Read capped exact pages and compact page text into citation snippets.
- [x] Preserve citation order by replacing matching search-hit records.
- [x] Add warning diagnostics and safe trace counts for read failures.
- [x] Add tests for success, read failure, cap behavior, prompt compactness,
  and citation order.
- [x] Update message contract docs and ADR.
- [x] Run `npm run check`.
