# Exact-Read Fallback Tests

## Acceptance Criteria

- Empty or not-answerable primary `/query` evidence plus an exact `/search` hit
  causes the bridge to read the page and add a bounded citation excerpt.
- Read failure records a redacted warning diagnostic and the run still
  succeeds with available search evidence.
- The fallback reads no more than the configured cap per source.
- Runtime prompts and result artifacts omit unbounded full page bodies.
- Citation numbering remains based on the top-level citation order.
- Strong primary `/query` evidence does not incur exact-read fallback calls.

## Commands

- `npm test`
- `npm run check`
