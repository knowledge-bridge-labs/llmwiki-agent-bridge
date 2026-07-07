# Copilot Instructions: LLMWiki Serve

This project may provide local wiki context through `llmwiki-serve`. Use it
only when the environment explicitly provides `LLMWIKI_SERVE_URL`.

## Direct Usage

Prefer direct read-only HTTP calls when the editor or task environment can reach
the configured server:

```text
Copilot or editor client -> llmwiki-serve
```

Available direct endpoints:

- `POST /query` with JSON `{ "query": "...", "limit": 4 }` for a context pack.
- `POST /search` with JSON `{ "query": "...", "limit": 5 }` for ranked page
  matches.
- `GET /read/{page_id}` for a page returned by query or search.
- `GET /graph?limit=120` for page, link, and source relationships.
- `POST /mcp` for an experimental MCP-style JSON-RPC compatibility surface.

Use `/query` before making claims from the wiki. Use `/read/{page_id}` for
specific details after a relevant page id is known.

## Privacy Rules

- Do not send secrets, tokens, credentials, private keys, customer data, or
  unrelated source files.
- Keep query text concise and task-specific.
- Treat queries and returned content as visible to the configured server
  operator.
- Do not assume draft access. Avoid `include_drafts=true` unless the user has
  explicitly requested trusted local draft inspection.
- Do not hard-code private endpoints or credentials in repository files.

## Optional MCP and A2A Surfaces

`llmwiki-serve` and related bridge tooling may expose MCP-compatible or
A2A-compatible surfaces for agent runtimes. Treat these as experimental
compatibility surfaces unless the project documents formal certification.

## When To Use llmwiki-agent-bridge

Use the bridge path when direct HTTP is not enough:

```text
Copilot or editor client
  -> llmwiki-agent-bridge
  -> selected llmwiki-serve sources
  -> configured OpenAI-compatible runtime
  -> grounded answer artifact
```

Prefer the bridge for centralized policy checks, audit logging, runtime
adapters, access control, network isolation, or workflows that combine wiki
context with other tools. Prefer direct `llmwiki-serve` calls for simple local
read-only lookup.
