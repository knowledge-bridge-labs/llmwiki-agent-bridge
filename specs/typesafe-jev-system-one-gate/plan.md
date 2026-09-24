# Plan: TypeSafe Jev/System-One Judgment Gate

1. Add shared external-judgment configuration parsing with `SYSTEM_ONE_*` names
   and `EXTERNAL_JUDGMENT_*` aliases.
2. Add deterministic state preparation and masking helpers.
3. Insert runtime-route judgment before runtime synthesis.
4. Insert report-only source-routing, evidence-relevance, citation-support,
   progressive-disclosure, and graph-expansion diagnostics at existing bridge
   boundaries.
5. Keep graph-expansion report-only limited to already gathered state so it
   cannot add graph/source calls.
6. Add tests for default-off behavior, report-only behavior, enforce behavior,
   provider failure behavior, source-policy minimization, and raw-query-free
   progressive-disclosure state.
7. Update README, runtime profile docs, message contract docs, changelog, and
   OpenAPI output.

## Risks

- External provider calls can introduce latency; defaults stay `off`.
- Diagnostics can become a privacy leak if state minimization regresses; tests
  include identifier/path/query canaries.
- Overstating effectiveness would mislead users; release notes remain limited
  to opt-in diagnostics and gating semantics.
