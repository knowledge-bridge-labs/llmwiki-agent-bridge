# Source Registry Visibility Plan

## Implementation

1. Add registry and runtime metadata fields to the OpenAPI generator.
2. Implement MCP lifecycle handlers in the JSON-RPC router.
3. Preserve additional registered-source metadata during normalization.
4. Reject duplicate IDs in persisted source updates and report registry
   warnings in read-only views.
5. Add `GET /sources` with optional live source probing and redacted root labels.
6. Add non-starting CLI `sources`, `ls`, and `status` commands.
7. Add optional runtime reachability probes and clearer runtime failure guidance.
8. Update docs and regenerate `docs/openapi.json`.

## Risks

- Existing clients may rely on `/settings/sources.json` echoing persisted source
  objects exactly; new root metadata must be omitted or redacted there.
- Live source probes can be slow or fail transiently, so the default view must
  stay non-networked.
- MCP lifecycle support must not overstate protocol coverage.
