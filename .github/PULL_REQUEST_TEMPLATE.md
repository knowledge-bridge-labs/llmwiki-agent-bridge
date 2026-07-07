## Summary

<!-- What changed, and why? Keep this focused on runtime profile behavior,
Knowledge Source protocol compatibility, security posture, documentation, or
repository maintenance. -->

## Prior Discussion

- [ ] This is a small, self-contained fix or documentation change.
- [ ] I linked the issue or discussion where direction was agreed for a
      substantial or ambiguous change.
- [ ] Not applicable.

## Runtime and Source Impact

<!-- Check all that apply and explain compatibility impact. -->

- [ ] Hermes profile
- [ ] DeepAgents profile
- [ ] Generic OpenAI-compatible profile
- [ ] `llmwiki-http` source queries
- [ ] MCP-style JSON-RPC source queries
- [ ] A2A-style source or bridge message handling
- [ ] Citations, graph, trace, or result artifact shape
- [ ] No user-facing runtime/source impact

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor
- [ ] Test
- [ ] CI or security maintenance

## Validation

- [ ] `npm run lint`
- [ ] `npm run contracts:check`
- [ ] `npm test`
- [ ] `npm run pack:dry-run`
- [ ] `npm run audit`

`npm run check` covers lint, OpenAPI contract freshness, tests, and package
dry-run.

## Source Policy / Security Impact

- [ ] No change to source URL policy, CORS, public bind behavior, bearer auth, or redaction.
- [ ] Security-sensitive behavior changed and the safe failure mode is explained below.
- [ ] I did not include credentials, bearer tokens, private endpoint URLs, raw sensitive wiki content, runtime logs, or private infrastructure details.
- [ ] I followed `SECURITY.md` for any suspected vulnerability.

## Documentation and Release Notes

- [ ] I updated README, docs, CHANGELOG, or release guidance when behavior,
      setup, compatibility, validation, or release expectations changed.
- [ ] I documented runtime profile impact for Hermes, DeepAgents, or generic
      OpenAI-compatible behavior.
- [ ] I documented source protocol impact for `llmwiki-http`, MCP-style, or
      A2A-style behavior.
- [ ] Not applicable.

## Notes

Review focus:

Known risks or compatibility concerns:

Skipped validation or follow-up work:

Generated or AI-assisted areas needing closer review:
