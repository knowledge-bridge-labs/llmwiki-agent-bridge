# Gateway Target Registry Tests

## Automated

- `/sources` without live probe includes `targetId`, `targetKind`,
  `registryRole`, `idNamespace`, `endpoint`, `sourceTools`, and derived
  `retrievalModes`, while existing `id`, `url`, count, root redaction, and
  health fields remain compatible.
- `/sources?probe=1` promotes source-bundle projection and graph metadata into
  safe registry fields.
- `/settings/sources.json` GET/PUT responses include gateway target identity and
  redacted endpoint metadata while preserving the editable source descriptor
  fields.
- MCP `llmwiki_list_sources` structured output includes the gateway overlay and
  text output remains URL-free.
- OpenAPI exposes the overlay fields without changing the required legacy
  fields.

## Manual

- Inspect serialized HTTP/MCP registry responses for absence of raw absolute
  local paths in redacted views.
- Inspect endpoint metadata for absence of credentials, query strings,
  fragments, bearer tokens, and raw local roots.
