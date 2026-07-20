# ADR: Bridge-Managed Source Readiness Authority

## Status

Accepted.

## Context

Registered source settings can persist stale `status=ready` values even after a
source endpoint becomes unreachable or no longer satisfies source policy. The
bridge must prevent those last-known values from authorizing unsafe runtime
synthesis.

## Decision

The bridge treats persisted source `status=ready` as last-known metadata.
Registry summaries and source-list tools combine that metadata with bridge
source policy and expose the readiness basis. Chat orchestration still attempts
selected last-known-ready sources so live failures produce redacted diagnostics,
but if every selected last-known-ready source fails, the bridge does not call
the configured runtime and returns a diagnostic artifact instead.

## Consequences

- `/health` remains fast because it performs no source network preflight.
- Policy-blocked sources are visible as unavailable in summaries.
- Partial outages still allow synthesis from surviving evidence.
- Total selected-source outages fail closed before runtime synthesis.

## Links

- Spec: `specs/source-readiness-hardening/`
