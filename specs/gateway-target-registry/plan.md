# Gateway Target Registry Plan

## Implementation

1. Extend registry source descriptor output with gateway target identity:
   `targetId`, `targetKind`, `registryRole`, and `idNamespace`.
2. Add a safe endpoint metadata helper that emits redacted URL/origin, source
   protocol, configured status, fetch policy basis, and fetch allowance when a
   config is available.
3. Preserve `url` and existing fields for compatibility, but ensure new
   endpoint metadata never includes query strings, fragments, credentials, or
   local roots.
4. Extend manifest/source-bundle registry metadata normalization to include
   source-bundle source id, capabilities, capability basis, projection
   signature/counts, graph counts, and source-ref counts.
5. Add derived gateway hints:
   `retrievalModes`, `sourceTools`, and `graph`.
6. Update OpenAPI schemas and contract docs.

## Affected Files

- `src/index.mjs`
- `test/agent-bridge.test.mjs`
- `docs/message-send-contract.md`
- `docs/openapi.json`
- `docs/decisions/2026-09-12-gateway-target-registry.md`
- `specs/gateway-target-registry/`

## Risks

- Existing tests use deep equality for some MCP readiness objects, so readiness
  itself should stay unchanged; extra readiness basis belongs in the additive
  endpoint/gateway fields.
- `/settings/sources.json` is an editor endpoint and may preserve full `url`
  fields for compatibility. New gateway endpoint metadata must be independently
  redacted.
- Live probe metadata must stay allowlisted because source bundles can carry
  raw origins and local path data.
