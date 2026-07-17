# Evidence Cache Spec

## Problem

Repeated coding-agent queries often ask the same selected Knowledge Source the
same question during a short local work session. Re-fetching the same evidence
adds latency even though the bridge still needs to synthesize a fresh answer for
the current request.

## Goals

- Add an opt-in in-memory cache for successful normalized per-source evidence.
- Keep default bridge behavior unchanged.
- Cache source evidence outcomes before runtime synthesis, never final runtime
  answers.
- Bound cache lifetime and size.
- Avoid exposing raw source URLs, cache keys, credentials, or private paths in
  trace artifacts or diagnostics.
- Preserve selected-source ordering and existing per-source failure semantics.

## Non-Goals

- Persistent cache storage.
- Cross-process cache sharing.
- Runtime answer caching.
- Public HTTP contract changes beyond existing trace detail text.

## Requirements

- Cache is disabled when `LLMWIKI_AGENT_BRIDGE_EVIDENCE_CACHE_TTL_MS` is unset
  or `0`.
- When enabled, cache entries expire after the configured TTL.
- Cache size defaults to 128 entries and can be bounded with
  `LLMWIKI_AGENT_BRIDGE_EVIDENCE_CACHE_MAX_ENTRIES`.
- Cache keys include an internal schema marker, protocol, source id, a hash of a
  normalized source URL, query text, and request shaping inputs such as evidence
  limits.
- Cache hits return fresh trace steps that identify hit status without replaying
  old timings or exposing cache keys.
- Cache misses and expirations fetch sources with the existing code path.
- Only successful normalized evidence outcomes are cached.

## Compatibility

The cache is disabled by default, so existing requests, traces, source calls,
runtime calls, and contracts behave as before unless an operator opts in.
