# Plan

1. Add a self-contained Node maintenance script under `scripts/` that starts
   `llmwiki-serve`, starts the bridge, registers sources, runs deterministic
   queries, and prints a sanitized JSON report.
2. Keep the script dependency-free beyond Node, the bridge source checkout, and
   the local serve checkout's existing `uv` workflow.
3. Add focused docs explaining prerequisites, command usage, assertions, and
   expected report fields.
4. Run the new smoke locally against the two patched checkouts.
5. Run relevant syntax and regression checks in the bridge checkout.

## Affected Files

- `scripts/answer-retrieval-quality-smoke.mjs`
- `docs/answer-retrieval-quality-smoke.md`
- `specs/answer-retrieval-quality-smoke/`

## Risks

- Live local ports can race with other processes; the script chooses free
  loopback ports and waits for health before continuing.
- MCP Streamable HTTP framing may differ by `llmwiki-serve` version; the smoke
  treats JSON-RPC error or non-JSON responses as deterministic failures.
- Graph-neighborhood expansion depends on a source tool/route that may not be
  present in the paired serve checkout; the smoke records that as a quality gap
  while still requiring graph nodes and edges from the context artifact.

## Rollback

Remove the added script and docs/spec directory. No persistent source or bridge
state is written outside temporary directories during the smoke.
