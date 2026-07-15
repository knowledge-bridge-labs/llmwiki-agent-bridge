# ADR 0002: Runtime Prompt Shaping For Cache-Friendly Delegation

## Status

Accepted

## Context

The bridge delegates synthesis to OpenAI-compatible runtimes for
`delegated-runtime` and `hybrid` runs. Prompt-cache-friendly runtimes benefit
from a stable prefix, while local runtimes can fail or degrade when prompts
include avoidable context such as full source-bundle metadata or graph samples.
The public answer artifact already returns full citations, graph data, source
bundles, trace steps, and diagnostics, so the runtime does not need every
artifact field repeated in its prompt.

## Decision

Build chat-completions messages with a byte-stable system prompt first, a compact
runtime evidence bundle second, and the user question in a later user message.
The runtime evidence bundle uses a schema marker plus stable contract keys,
keeps `citationDigest` and top-level `citations` separate, and preserves
citation numbering by instructing the runtime to use the 1-based index of the
top-level `citations` array.

Do not include returned `sourceBundles`, per-source `sourceBundle` payloads, full
graph node arrays, full graph edge arrays, or graph samples in the runtime
prompt. Keep compact source summaries, orientation digests, citation IDs,
source-failure diagnostics, graph counts, and corpus summaries.

## Consequences

- The public `/message:send` and `/mcp` artifact contracts are unchanged.
- Runtime prompt prefixes are more stable across queries and evidence bundles.
- Runtime context pressure is lower because source-bundle and graph payloads are
  not duplicated into the prompt.
- Runtimes receive less graph detail, so answers should cite text evidence rather
  than infer from graph node labels.

## Follow-Ups

- Revisit the internal runtime evidence schema if a future runtime profile needs
  a different compact evidence representation.
- Keep final-answer caching out of scope unless a separate spec and ADR approve
  it.

## Links

- Spec: `specs/runtime-prompt-shaping/spec.md`
