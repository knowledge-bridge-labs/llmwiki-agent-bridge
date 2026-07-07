# llmwiki-query

Query a configured `llmwiki-serve` instance directly from a local project.

## Usage

Use this command when you need wiki context for the current task and the project
environment provides `LLMWIKI_SERVE_URL`.

Input:

```text
$ARGUMENTS
```

If the input is empty, ask for a concise wiki query. If `LLMWIKI_SERVE_URL` is
not set, ask the user to configure it. Do not guess private endpoints or commit
endpoint values into the repository.

## Privacy Rules

- Treat the query as disclosed to the configured server.
- Do not include secrets, tokens, private keys, credentials, customer data, or
  unrelated source files.
- Keep query text focused on the task.
- Do not request drafts unless the user explicitly confirms the server is
  trusted and draft serving is enabled.

## Direct HTTP Calls

Start with `/query`:

```bash
curl -s "${LLMWIKI_SERVE_URL}/query" \
  -H "content-type: application/json" \
  -d "{\"query\":\"$ARGUMENTS\",\"limit\":4}"
```

Use `/search` to find candidate pages:

```bash
curl -s "${LLMWIKI_SERVE_URL}/search" \
  -H "content-type: application/json" \
  -d "{\"query\":\"$ARGUMENTS\",\"limit\":5}"
```

Use `/read/{page_id}` after a relevant page id is found. URL-encode page ids or
paths before placing them in the URL.

```bash
curl -s "${LLMWIKI_SERVE_URL}/read/PAGE_ID"
```

Use `/graph` when relationships between pages, links, or sources matter:

```bash
curl -s "${LLMWIKI_SERVE_URL}/graph?limit=120"
```

## Optional MCP-Style Call

If the client prefers tool-shaped calls, `llmwiki-serve` may expose `POST /mcp`
as an experimental MCP-style JSON-RPC compatibility surface. This is a
compatible surface, not a certification claim.

```bash
curl -s "${LLMWIKI_SERVE_URL}/mcp" \
  -H "content-type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"llmwiki_context\",\"arguments\":{\"query\":\"$ARGUMENTS\",\"limit\":4}}}"
```

Known tool names:

- `llmwiki_context`
- `llmwiki_search`
- `llmwiki_read`
- `llmwiki_graph`

## Response Handling

Summarize the useful context, cite returned page ids, titles, or paths when
helpful, and preserve any limitations from the response. If context is
insufficient, say so and continue with repository inspection or ask a narrower
follow-up question.

## Bridge Option

Use `llmwiki-agent-bridge` instead of direct calls when the workflow needs a
mediated runtime, policy checks, audit logs, runtime adapters, access control,
or a client environment that cannot reach `llmwiki-serve` directly.
