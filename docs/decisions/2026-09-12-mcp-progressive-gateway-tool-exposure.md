# ADR: MCP Progressive Gateway Tool Exposure

## Status

Accepted.

## Context

MCP hosts that connect to many servers can waste model context by loading every
tool schema up front. The bridge already exposes direct LLMWiki tools for
compatibility, but listing all direct source-tool schemas is not ideal when the
host supports a catalog-first workflow.

The bridge is not a general gateway platform. It is the LLMWiki Knowledge
Gateway layer for source fan-out, evidence assembly, graph context, and
normalized artifacts. Progressive discovery should therefore stay scoped to
LLMWiki source tools and should not replace external gateway policy, identity,
or deployment controls.

## Decision

Add an opt-in MCP tool exposure mode:

- `direct` is the default and preserves the existing `tools/list` behavior.
- `gateway` lists only `llmwiki_gateway_search_tools`,
  `llmwiki_gateway_get_tool_details`, and `llmwiki_gateway_call_tool`.
- `both` intentionally lists direct and gateway tools together.
- `progressive` is accepted as an alias for `gateway`.

The gateway tools implement a three-step flow:

- search compact catalog entries without full input schemas
- inspect exactly one selected source tool and return its input schema
- call the selected source tool through the existing read-only source-tool
  handlers

`tools/call` continues to accept direct tools even in `gateway` exposure mode
so existing clients that know the direct names are not broken. Gateway wrapper
outputs redact URL-like, credential-like, and local-path fields more
aggressively than legacy direct source-tool outputs because they are intended to
flow back through model context after catalog selection.

## Consequences

- Existing MCP clients keep the default direct tool list.
- Operators can select `LLMWIKI_AGENT_BRIDGE_MCP_TOOL_EXPOSURE=gateway` when a
  host should avoid injecting every direct LLMWiki source-tool schema at
  conversation start.
- The bridge gains a practical progressive-discovery path without claiming full
  MCP platform gateway behavior.
- Direct and gateway paths share source-tool execution code, so retrieval,
  graph traversal, source policy, and source fan-out behavior remain aligned.

## Follow-ups

- Measure token savings with representative MCP hosts that support tool search
  or delayed schema injection.
- Revisit whether gateway mode should become the default only after common MCP
  clients can reliably search and inspect tools on demand.
- Add richer output schemas for gateway wrapper results if downstream typed
  clients need stronger generated types.

## Links

- Spec: `specs/mcp-2026-07-28-compatibility/`
- Contract docs: `docs/message-send-contract.md`
- Placement docs: `docs/external-gateways.md`
