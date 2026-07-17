# ADR 0001: Opt-In In-Memory Evidence Cache

## Status

Accepted

## Context

Coding agents can issue repeated identical bridge queries during one local work
session. The bridge currently fetches source evidence for every request before
optionally calling the configured runtime. Caching final runtime answers would
risk stale or misleading responses, but caching successful normalized
per-source evidence can reduce repeated source latency while preserving fresh
runtime synthesis.

## Decision

Add a bounded, opt-in, in-memory evidence cache inside `llmwiki-agent-bridge`.
The cache is disabled by default with
`LLMWIKI_AGENT_BRIDGE_EVIDENCE_CACHE_TTL_MS=0`. When enabled, it stores only
successful normalized per-source evidence outcomes and safe source-bundle
metadata before runtime synthesis. It does not store final runtime answers,
source failures, raw source URLs, request headers, credentials, or public cache
keys.

Cache keys are internal and derived from a schema marker, protocol, source id,
a hash of the normalized source URL, query text, and request shaping inputs such
as evidence limits. Entries expire by TTL and are bounded by max-entry eviction.
Trace output reports only safe aggregate cache counts and cache-hit source
steps.

## Consequences

- Default bridge behavior is unchanged.
- Operators can trade short-lived staleness risk for lower repeated source
  latency by choosing a TTL.
- Runtime answers remain fresh for each request.
- Cache state is process-local and disappears on restart.
- Source-bundle discovery warnings are not replayed on cache hits because hits
  emit fresh cache trace steps instead of cached transient diagnostics.

## Follow-Ups

- Revisit cache invalidation only if Knowledge Sources expose stable revision
  or projection signatures in every protocol path.
- Keep OpenAPI unchanged unless cache diagnostics become a structured public
  artifact field.

## Links

- Spec: `specs/evidence-cache/spec.md`
