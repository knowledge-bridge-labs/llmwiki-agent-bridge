# Knowledge Gateway Positioning

## Problem

`llmwiki-agent-bridge` is already documented as an optional source fan-out and
runtime-synthesis layer, but the product language does not consistently name
the role it plays in the LLMWiki stack. That makes it easy to confuse the
bridge with unrelated gateway products, runtime hosts, setup harnesses, or UI
workbenches.

Stage 1 needs a conservative documentation-only positioning update: describe
the bridge as the LLMWiki Knowledge Gateway / gateway-compatible bridge for
evidence assembly and answer artifacts, while keeping adjacent component
boundaries explicit.

## Goals

- Position `llmwiki-agent-bridge` as an optional LLMWiki Knowledge Gateway for
  source fan-out, evidence bundling, citations, graph context, source registry
  use, and runtime synthesis artifacts.
- Explain that gateway-compatible means the bridge can be called directly by a
  local client or placed behind an external agent/API gateway as a target or
  companion service.
- Keep the bridge scope narrow: LLMWiki evidence assembly plus optional runtime
  delegation, not general deployment, hosting, container orchestration, ingress,
  policy, tenancy, or cloud gateway replacement.
- Document neighboring responsibilities:
  - `llmwiki-serve` is the source projection layer.
  - `llmwiki-chat` is the UI/workbench.
  - `llmwiki-bridge-start` is the setup/start harness.
- Preserve existing public-preview contract claims for `/message:send`, `/mcp`,
  `llmwiki_agent_result`, and source-tool behavior.

## Non-goals

- No code, endpoint, OpenAPI, package, or runtime behavior changes.
- No claim that `llmwiki-agent-bridge` is a replacement for Docker,
  agentgateway, AWS AgentCore, API gateways, runtime hosts, or deployment
  platforms.
- No new protocol conformance claim beyond the existing A2A-style and
  MCP-style compatibility wording.
- No migration of source projection, indexing, semantic retrieval, UI, or setup
  orchestration responsibilities into the bridge.
- No changelog edit in this stage.

## Requirements

1. README introductory positioning names the bridge as the optional LLMWiki
   Knowledge Gateway while preserving the existing explanation of local HTTP
   operation, source fan-out, evidence bundling, citations, graph context, and
   runtime synthesis.
2. README path guidance distinguishes direct `llmwiki-serve` use, bridge use as
   the Knowledge Gateway path, and use behind an external gateway as a
   compatible target/companion placement.
3. `docs/client-paths.md` explains the same path selection without implying
   that the bridge replaces external gateway infrastructure.
4. README and `docs/client-paths.md` state the component boundaries for
   `llmwiki-serve`, `llmwiki-agent-bridge`, `llmwiki-chat`, and
   `llmwiki-bridge-start`.
5. External gateway wording is factual and limited: external gateways may own
   ingress, identity, network exposure, deployment, scaling, tenancy, and
   policy, while the bridge owns LLMWiki evidence assembly and the normalized
   result artifact.
6. The docs keep existing conservative protocol language such as A2A-style,
   MCP-style, compatibility surface, and public-preview contract.

## Compatibility

This is a docs-only Stage 1 change. Existing clients, package entry points,
environment variables, source descriptors, runtime profiles, and generated
contract artifacts are unchanged.

## Acceptance

- README and `docs/client-paths.md` include the Knowledge Gateway positioning,
  gateway-compatible target/companion placement, and adjacent component
  boundaries.
- The new ADR records the product boundary and rejects broader gateway
  replacement claims.
- `specs/knowledge-gateway-positioning/tests.md` contains docs-only acceptance
  criteria that can be checked before any future implementation work.
- `CHANGELOG.md`, source files, generated OpenAPI, package metadata, examples,
  and tests remain untouched in this stage.
