# ADR: Gateway Target Registry Overlay

## Status

Accepted.

## Context

The bridge source registry already serves several clients:

- `/sources` exposes a public, redacted source registry with optional live probe.
- `/settings/sources.json` lets local workbenches edit persisted source
  descriptors.
- health and agent-card metadata summarize registered, selected, ready, and
  unavailable source counts.
- MCP `llmwiki_list_sources` gives host agents a text-safe and structured view
  of the same selected Knowledge Sources.

Stage 1 positioned `llmwiki-agent-bridge` as the LLMWiki Knowledge Gateway.
That does not justify renaming source-registry surfaces, but gateway clients
need stable target-oriented terms and safe endpoint/projection hints.

## Decision

Keep the source registry as the compatibility contract and add a gateway target
registry overlay to each source descriptor.

Every registry descriptor may include:

- `targetId`: stable alias for the existing source `id`.
- `targetKind`: currently `knowledge-source`.
- `registryRole`: currently `gateway-target`.
- `idNamespace`: currently `gateway-target`.
- `endpoint`: safe redacted endpoint metadata.
- `capabilityBasis`, `retrievalModes`, and `sourceTools` when derivable.
- `sourceId`, `projection`, `graph`, and `sourceRefCount` when a descriptor or
  live source-bundle/manifest probe provides safe projection metadata.

The overlay is additive. Existing fields remain unchanged for callers that
already depend on `id`, `url`, `readiness`, `health`, `capabilities`,
`adapter`, `implementation`, `bundleId`, and page counts.

The new endpoint object must not reveal credentials, query strings, fragments,
bearer tokens, or raw local paths. Existing local-root behavior is preserved:
HTTP/MCP registry views redact absolute local roots, while the CLI registry can
still include them when explicitly run in local inspection mode.

## Consequences

- Gateway clients can use target terminology without migrating away from the
  existing registry endpoints.
- External gateways can treat bridge-managed Knowledge Sources as gateway
  targets while preserving the bridge's local redaction posture.
- The bridge still does not own ingress, tenancy, deployment, identity, or
  broad policy for external gateway infrastructure.
- Future registry evolution should add fields to the overlay before renaming or
  removing legacy source fields.

## Links

- Spec: `specs/gateway-target-registry/`
- Related ADR: `docs/decisions/2026-09-12-knowledge-gateway-positioning.md`
