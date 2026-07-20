# Plan: Safe Request Audit Logging

1. Add an opt-in audit configuration flag in `bridgeConfig`.
2. Wrap `handleBridgeRequest` with a single `finally`-based audit emission path
   so successes and failures share the same formatter.
3. Pass a request run context into `/message:send` and MCP `llmwiki_agent_run`
   paths so audit request IDs match result IDs when a run is created.
4. Add side-channel audit summary collection inside `runA2aMessage` without
   changing returned JSON.
5. Emit audit events only for known bridge routes and allowlisted MCP
   method/tool labels.
6. Document the environment/programmatic/persistent config switch and privacy
   boundary.
7. Add regression tests for evidence-only runs, delegated-runtime runs, and
   settings/MCP route-pattern logging.

