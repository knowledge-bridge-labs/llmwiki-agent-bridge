# Contributing

Thanks for contributing to `llmwiki-agent-bridge`.

## Scope

This package is a small protocol and serving layer between LLMWiki-style Knowledge Sources and OpenAI-compatible agent runtimes. Hermes, DeepAgents, and generic OpenAI-compatible runtimes are initial first-class profiles. Keep changes focused on the bridge contract:

- Accept a query and selected Knowledge Sources.
- Query supported `llmwiki-http`, `mcp`, and `a2a` sources.
- Send grounded evidence to an OpenAI-compatible chat completions endpoint.
- Return an answer, citations, graph data, and trace steps.

Avoid turning the bridge into a full-stack RAG app, crawler, vector store, hosted chat UI, or Hermes-only adapter. MCP and A2A surfaces should be described as MCP-style or A2A-style compatibility surfaces unless certified conformance has been established. Codex, Claude Code, Copilot, and similar clients may use `llmwiki-serve` directly through skills, commands, MCP-style calls, or HTTP when a bridge is unnecessary.

## Development Setup

Requirements:

- Node.js `>=22.12`
- npm `>=10`

Run the checks:

```sh
npm run lint
npm run contracts:check
npm test
npm run pack:dry-run
npm run audit
```

`npm run check` runs lint, OpenAPI contract freshness checks, tests, and dry
packaging. If the bridge HTTP surface or `llmwiki_agent_result` artifact shape
changes, run `npm run contracts:generate` and commit the refreshed
`docs/openapi.json`.

## Contribution Flow

1. Open or find an issue for reproducible bugs, focused feature requests,
   usage questions, runtime-profile gaps, source protocol gaps, or
   documentation problems. Follow `SECURITY.md` for suspected vulnerabilities.
2. Work on a topic branch and keep the diff scoped to the bridge behavior or
   documentation goal.
3. Update tests and docs when message contracts, source policy, runtime
   profiles, endpoint behavior, setup, or package contents change.
4. Fill out the pull request template, including affected runtime/source
   behavior, validation, and security/data-handling checks.
5. Respond to review by pushing follow-up commits. Do not rewrite unrelated
   project history or revert changes outside your PR scope.

For substantial or ambiguous changes, open an issue first and agree on the
direction before investing in a large pull request. Examples include new
runtime profiles, new source protocol behavior, authentication or source-policy
changes, release automation, or changes that expand the supported deployment
model.

Maintainers may close low-effort, unverified, or mostly generated issues and
PRs when they do not include a clear problem statement, implementation
rationale, and reproducible validation. AI-assisted contributions are welcome,
but contributors remain responsible for understanding, testing, and maintaining
the change.

## Pull Requests

- Keep changes small and explain the protocol behavior affected.
- Use the pull request template and fill in the validation checklist honestly.
- Add or update tests for behavior changes.
- Update README or security docs when configuration, source policy, endpoints, or deployment assumptions change.
- Do not commit secrets, local runtime URLs with credentials, generated logs, `node_modules`, or npm tarballs.
- Preserve compatibility aliases unless the changelog clearly documents their removal.

## Source Policy Changes

Changes touching URL validation, source policy, CORS, public bind behavior, bearer auth, or error redaction need extra review. Include the deployment scenario and the expected safe failure mode in the pull request.

## License

By contributing, you agree that your contributions are licensed under Apache-2.0.
