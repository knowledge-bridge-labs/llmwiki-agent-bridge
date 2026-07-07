# LLMWiki Serve Direct Query

Use this skill when a coding agent needs local wiki context from a configured
`llmwiki-serve` instance. The server is read-only from the client perspective
and is addressed through the `LLMWIKI_SERVE_URL` environment variable.

## Preconditions

- `LLMWIKI_SERVE_URL` is set by the user or project environment.
- The value points to the intended `llmwiki-serve` instance.
- Do not hard-code private hosts, ports, credentials, or bearer tokens in this
  skill or in generated project files.

If `LLMWIKI_SERVE_URL` is missing, ask the user to configure it instead of
guessing an endpoint.

## Privacy and Safety

- Treat every query as content disclosed to the configured server operator.
- Do not send secrets, credentials, private keys, tokens, customer data, or
  unrelated source files.
- Send the minimum query text needed to retrieve useful context.
- Avoid `include_drafts=true` unless the user explicitly confirms that the
  server is trusted and configured for draft access.
- Use direct calls for read-only context. Do not infer that the wiki content is
  authoritative when the response includes limitations or low evidence.

## Direct HTTP Workflow

Prefer `/query` first. It returns a context pack with wiki metadata,
orientation, evidence, limitations, and optional graph snippets.

```bash
curl -s "${LLMWIKI_SERVE_URL}/query" \
  -H "content-type: application/json" \
  -d '{"query":"release readiness checklist","limit":4}'
```

Use `/search` when you need ranked candidates before reading pages.

```bash
curl -s "${LLMWIKI_SERVE_URL}/search" \
  -H "content-type: application/json" \
  -d '{"query":"requester return policy","limit":5}'
```

Use `/read/{page_id}` only after `/query` or `/search` returns a relevant
`page_id`. URL-encode page ids or paths that contain spaces or reserved
characters.

```bash
curl -s "${LLMWIKI_SERVE_URL}/read/PAGE_ID"
```

Use `/graph` for relationship inspection, navigation, or source-link context.
Keep limits modest unless the user asks for a broad graph.

```bash
curl -s "${LLMWIKI_SERVE_URL}/graph?limit=120"
```

## Optional MCP-Style Surface

`llmwiki-serve` may expose `POST /mcp` as an experimental MCP-style JSON-RPC
compatibility surface. Treat it as compatible tooling, not certified protocol
conformance.

List tools:

```bash
curl -s "${LLMWIKI_SERVE_URL}/mcp" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Call the context tool:

```bash
curl -s "${LLMWIKI_SERVE_URL}/mcp" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"llmwiki_context","arguments":{"query":"release readiness checklist","limit":4}}}'
```

Expected tool names include:

- `llmwiki_context`
- `llmwiki_search`
- `llmwiki_read`
- `llmwiki_graph`

## Answering With Wiki Context

When using wiki results in a coding task:

- Separate wiki-derived facts from your own code inspection.
- Cite page ids, titles, or paths from returned evidence when useful.
- Mention limitations from `/query` when they affect confidence.
- Prefer reading specific pages before making precise claims.
- If direct access fails, report the failure and continue with local repository
  inspection when that is sufficient.

## When To Use llmwiki-agent-bridge Instead

Use `llmwiki-agent-bridge` instead of direct HTTP when the task requires a
mediated runtime, shared policy enforcement, centralized audit logs, runtime
adapters, access control, or a client that cannot call `llmwiki-serve`
directly.
