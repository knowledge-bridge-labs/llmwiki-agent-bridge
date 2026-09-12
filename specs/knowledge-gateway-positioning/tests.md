# Knowledge Gateway Positioning Tests

## Docs-only acceptance coverage

- README states that `llmwiki-agent-bridge` is the optional LLMWiki Knowledge
  Gateway / gateway-compatible bridge for source fan-out, evidence bundling,
  citations, graph context, source registry use, and runtime synthesis
  artifacts.
- README preserves direct-client guidance: clients that can call
  `llmwiki-serve` directly should still start there.
- README and `docs/client-paths.md` describe the bridge as a target or
  companion behind an external gateway, not as a replacement for Docker,
  agentgateway, AWS AgentCore, API gateways, runtime hosts, or deployment
  platforms.
- README and `docs/client-paths.md` include the component boundaries:
  `llmwiki-serve` as source projection layer, `llmwiki-agent-bridge` as
  evidence gateway and runtime synthesis artifact layer, `llmwiki-chat` as
  UI/workbench, and `llmwiki-bridge-start` as setup/start harness.
- Existing A2A-style, MCP-style, and public-preview wording remains
  conservative and does not claim certified conformance.
- The docs-only change does not modify source files, generated OpenAPI,
  package metadata, examples, tests, or `CHANGELOG.md`. In a dirty worktree,
  unrelated existing changes should be inspected separately and left untouched.

## Suggested checks

```sh
git diff --check
git status --short -- README.md docs/client-paths.md docs/decisions/2026-09-12-knowledge-gateway-positioning.md specs/knowledge-gateway-positioning
git status --short
rg -n "Docker|agentgateway|AWS AgentCore|replacement|replace" README.md docs/client-paths.md docs/decisions/2026-09-12-knowledge-gateway-positioning.md specs/knowledge-gateway-positioning
rg -n "llmwiki-serve|llmwiki-agent-bridge|llmwiki-chat|llmwiki-bridge-start" README.md docs/client-paths.md docs/decisions/2026-09-12-knowledge-gateway-positioning.md specs/knowledge-gateway-positioning
```

The first `rg` is expected to find only scoped negative language such as "not a
replacement" or "does not replace"; it should not find product claims that
present the bridge as a broad gateway platform.
