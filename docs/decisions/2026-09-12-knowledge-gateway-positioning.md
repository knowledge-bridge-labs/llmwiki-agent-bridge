# ADR: Knowledge Gateway Positioning

## Status

Accepted.

## Context

The bridge already gathers evidence from selected LLMWiki Knowledge Sources,
optionally delegates answer synthesis to a configured runtime, and returns one
normalized `llmwiki_agent_result` artifact with citations, graph context,
source-bundle metadata, diagnostics, and trace steps.

That role is gateway-like inside the LLMWiki stack, but the word "gateway" can
also imply broader infrastructure responsibilities: ingress, identity, policy,
tenant isolation, deployment, scaling, runtime hosting, container
orchestration, or certification against a particular external gateway product.
The repository needs a narrower positioning decision before making public docs
use gateway language more prominently.

## Decision

Position `llmwiki-agent-bridge` as the optional LLMWiki Knowledge Gateway and
gateway-compatible bridge for LLMWiki evidence assembly. In this repository,
"Knowledge Gateway" means a local companion service that:

- maintains or accepts selected Knowledge Source descriptors;
- fans out bounded read-only requests to `llmwiki-serve`, MCP-style sources, or
  A2A-style sources;
- bundles evidence with citations, graph context, and safe source metadata;
- optionally delegates answer synthesis to the configured runtime; and
- returns one normalized runtime synthesis artifact.

Gateway-compatible means the bridge can be called directly by a local client or
placed behind an external agent/API gateway as a target or companion service.
The external gateway remains responsible for its own ingress, identity,
authorization policy, deployment model, scaling, tenancy, cloud networking, and
operator controls. The bridge does not replace Docker, agentgateway,
AWS AgentCore, API gateways, runtime hosts, or deployment platforms.

Keep adjacent component boundaries explicit:

- `llmwiki-serve` is the source projection layer. It reads approved source
  folders and exposes context, search, graph, retrieval guidance, and
  source-bundle metadata.
- `llmwiki-agent-bridge` is the Knowledge Gateway layer. It owns source
  registry use, source fan-out, evidence bundling, citations, graph context,
  diagnostics, runtime delegation, and the normalized answer artifact.
- `llmwiki-chat` is the UI/workbench for source selection, runtime settings,
  traces, citations, and graph context.
- `llmwiki-bridge-start` is the setup/start harness for local workflow
  assembly. It can help launch or hand off source, bridge, and chat processes;
  it is not the gateway runtime and does not own source projection.

This ADR changes documentation posture only. It does not change the bridge HTTP
surface, MCP-style tools, A2A-style wording, generated OpenAPI contract,
runtime adapters, or package entry points.

## Consequences

- Public docs can use "LLMWiki Knowledge Gateway" consistently without
  implying broad infrastructure replacement.
- Direct `llmwiki-serve` use remains the recommended first path for capable
  clients.
- External gateway integrations have a clear placement model: call the bridge
  as a target/companion when LLMWiki evidence bundling and answer artifacts are
  useful.
- Future docs must continue to avoid certified gateway, A2A, MCP, runtime-host,
  container, or cloud-platform claims unless a separate implementation and
  validation record supports them.

## Follow-ups

- Add a changelog note during release prep if this positioning update is
  included in a published package/docs release.
- Keep cross-repo docs aligned so `llmwiki-serve`, `llmwiki-chat`, and
  `llmwiki-bridge-start` retain their own responsibilities.

## Links

- Spec: `specs/knowledge-gateway-positioning/`
- Client path guide: `docs/client-paths.md`
