# Source Readiness Hardening

## Problem

Persisted registered sources can retain `selected=true` and `status=ready`
after their endpoint becomes unreachable or no longer passes the bridge source
policy. Treating that persisted status as authoritative lets stale sources
reach chat orchestration as if they were live.

## Goals

- Treat persisted `status=ready` as last-known readiness, not live readiness.
- Keep `/health` and registry summaries fast by avoiding network preflight.
- Make source-policy readiness visible in list and summary metadata.
- Fail closed when every selected last-known-ready source fails live query.
- Keep source URLs, paths, query strings, credentials, headers, and upstream
  bodies out of diagnostics, audit logs, and human-readable summaries.

## Non-goals

- No background source health cache.
- No `/health` network fan-out.
- No change to registered source persistence format.

## Requirements

- `llmwiki_list_sources`, `/health`, and the agent card report readiness using
  bridge policy plus persisted status metadata.
- Run paths still attempt selected last-known-ready sources so they can return
  redacted live failure diagnostics.
- If at least one selected source returns evidence, delegated runtime synthesis
  proceeds with only surviving evidence plus source failure counts.
- If all selected last-known-ready sources fail, the bridge returns a diagnostic
  artifact and does not call the configured runtime.
