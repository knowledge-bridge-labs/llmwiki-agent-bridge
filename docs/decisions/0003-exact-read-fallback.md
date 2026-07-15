# ADR 0003: Bounded Exact-Read Fallback For Empty HTTP Evidence

## Status

Accepted

## Context

The bridge queries `llmwiki-http` sources with `/query` and augments evidence
with compact `/search` variants. Coding agents can still receive thin evidence
when the primary `/query` response has no normalized citations or explicitly
reports `answerable: false`, even though the compact search variant finds a
specific page. Reading the exact page can improve answer grounding, but
unbounded page reads or full Markdown prompts would increase latency and expose
too much source content to the runtime.

## Decision

Add a bounded exact-read fallback for `llmwiki-http` sources. The fallback runs
only when the primary `/query` result has no normalized citations or reports
`answerable: false`. It selects unique `/search` hits that were not already
cited by `/query`, reads at most two exact pages with `GET /read/{page_id or
path}`, and replaces matching search-hit citation records with compact read
excerpts.

The runtime prompt continues to receive only compact citation snippets. Full
page text, read targets, source URLs, source bundles, and graph payloads are not
inlined into runtime prompts. Read failures become warning diagnostics and safe
trace counts, while the run continues with available `/query` and `/search`
evidence.

## Consequences

- Coding-agent answers get better grounding when compact search finds a page
  that broad `/query` missed.
- Extra source latency is bounded by the two-page cap and only applies to
  empty or explicitly not-answerable primary evidence cases.
- Citation order and numbering remain defined by the normalized top-level
  citation array.
- Sources with missing or failing `/read` endpoints still return successful
  bridge runs when search evidence is available, with warning diagnostics.

## Follow-Ups

- Revisit the trigger only if `llmwiki-serve` exposes a stronger structured
  confidence signal for `/query` and `/search`.
- Keep fallback limits internal unless operators need configurable latency
  budgets.

## Links

- Spec: `specs/exact-read-fallback/spec.md`
