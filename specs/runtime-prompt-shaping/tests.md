# Runtime Prompt Shaping Tests

## Acceptance Criteria

- The system message is identical across two different queries and evidence
  bundles.
- The runtime evidence bundle has stable top-level schema and contract keys.
- The user question appears after the evidence bundle in a later message.
- Runtime evidence omits source-bundle payloads and graph node/edge samples.
- Top-level `citations` order still defines `[n](#citation-n)` numbering.
- Delegated-runtime and hybrid answers still return the same public artifact
  shape and runtime answer text.

## Commands

- `npm test`
- `npm run check`
