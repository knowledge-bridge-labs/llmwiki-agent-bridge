# Exact-Read Fallback Spec

## Problem

Coding agents sometimes ask broad natural-language questions where
`llmwiki-serve` `/query` returns no normalized evidence even though compact
`/search` variants find an exact page. Passing only search snippets to the
runtime can leave answers under-grounded, while passing full Markdown pages
would increase latency and prompt size.

## Goals

- Improve evidence accuracy for `llmwiki-http` sources when primary `/query`
  evidence is absent or explicitly marked not answerable.
- Reuse compact `/search` augmentation as the candidate source.
- Bound extra `/read` calls and read target size.
- Add only compact excerpts from read pages to normalized citations.
- Keep full page bodies, source bundles, and source URLs out of runtime prompts.
- Preserve selected-source order, citation numbering, and current source
  failure semantics.
- Report safe fallback searched/read/skipped/warning counts in trace output.

## Non-Goals

- Change MCP or A2A source retrieval behavior.
- Add broad semantic re-ranking or answer-quality heuristics.
- Inline full Markdown pages into bridge artifacts or runtime prompts.
- Add operator configuration for fallback limits.
- Change the public `/message:send` response shape.

## Requirements

- The fallback runs only for `llmwiki-http` sources when primary `/query`
  returns no normalized citations or explicitly reports `answerable: false`.
- The fallback chooses unique `/search` hits that were not already cited by the
  primary `/query` result.
- The fallback reads at most two pages per source and only uses targets up to
  the documented target-length bound.
- Read records replace the matching search-hit citation record, preserving the
  existing citation position.
- Read snippets are compacted to the same citation snippet bound used by the
  runtime citation digest.
- Read failures produce warning diagnostics with redacted observations and do
  not fail the source or run.
- Trace detail reports searched, read, skipped, and warning counts without raw
  source URLs or read targets.
- Evidence cache keys include the exact-read fallback request shape.

## Compatibility

The public artifact shape is unchanged. Strong primary `/query` results keep the
previous behavior. When the fallback runs, clients may see better snippets for
search-derived citations, and traces may include an additional exact-read
fallback step plus warning diagnostics for failed reads.
