# Gateway Target Registry Overlay

## Problem

`llmwiki-agent-bridge` exposes registered Knowledge Sources through `/sources`,
`/settings/sources.json`, health metadata, and the MCP-style
`llmwiki_list_sources` tool. Those responses are still named as a source
registry, while the Stage 1 positioning now describes the bridge as an optional
LLMWiki Knowledge Gateway.

Gateway clients need additive target-oriented metadata without breaking
existing source-registry clients or leaking private local details.

## Goals

- Preserve the existing source-registry contract for `/sources`,
  `/settings/sources.json`, health metadata, and `llmwiki_list_sources`.
- Add gateway target identity fields to source descriptors:
  `targetId`, `targetKind`, `registryRole`, and `idNamespace`.
- Add a safe `endpoint` object that carries redacted endpoint metadata and
  policy/readiness basis useful to gateway clients.
- Promote safe capability and projection hints into registry views:
  `capabilityBasis`, `retrievalModes`, `sourceTools`, source-bundle
  `sourceId`/`bundleId`, projection signatures/counts, graph counts, and source
  reference counts when available.
- Keep local roots redacted from HTTP/MCP registry views unless the existing CLI
  local-root mode explicitly asks for them.

## Non-goals

- No rename of `/sources`, `/settings/sources.json`, or MCP
  `llmwiki_list_sources`.
- No removal or behavioral change for existing `id`, `url`, `readiness`,
  `health`, `capabilities`, adapter, implementation, bundle, and count fields.
- No credential, bearer-token, query-string, fragment, or raw absolute local
  path exposure in the new gateway overlay.
- No live probing by default. `/sources?probe=1` remains the opt-in path for
  live source-bundle or manifest discovery.
- No claim that the bridge replaces external gateways.

## Requirements

1. `/sources` without `probe=1` keeps existing counts and source fields, and
   each source includes additive gateway target identity plus safe endpoint
   metadata.
2. `/sources?probe=1` promotes source-bundle or manifest metadata into safe
   gateway fields when available, including source-bundle source id, projection
   signature/counts, graph counts, source-ref count, and capability basis.
3. `/settings/sources.json` GET/PUT keeps persisted source shape compatible and
   includes the same safe gateway target identity and endpoint metadata in the
   response descriptors.
4. MCP `llmwiki_list_sources` keeps URL-free text output while adding gateway
   overlay fields to `structuredContent.llmwiki_sources.sources`.
5. New endpoint metadata is always redacted: credentials, query strings,
   fragments, bearer tokens, and raw absolute local paths are omitted.
6. OpenAPI documents the overlay as additive fields on existing registry
   descriptor schemas.

## Compatibility

The overlay is additive. Existing clients can keep reading the legacy source
fields. Clients that want gateway terminology can read `targetId` as the stable
alias of `id` and use `endpoint`, `projection`, and `graph` when present.
