# LLMWiki Client Integrations

This directory contains companion templates for clients that can use
`llmwiki-serve` directly, plus guidance for when to route through
`llmwiki-agent-bridge`.

## Path 1: Direct client to llmwiki-serve

Use the direct path when the client can make local HTTP calls and only needs
read-only wiki context:

```text
client -> llmwiki-serve
```

Configure the client with `LLMWIKI_SERVE_URL` and call the server endpoints:

- `POST /query` for a context pack with orientation and evidence.
- `POST /search` for ranked page matches.
- `GET /read/{page_id}` for a specific page by id or path.
- `GET /graph` for page, link, and source graph data.
- `POST /mcp` for the experimental MCP-style JSON-RPC compatibility surface.

This path is simple, low-latency, and useful for local coding agents, command
templates, and editor instructions. Treat all queries as data disclosed to the
configured server. Do not send secrets, credentials, private keys, or unrelated
source code.

## Path 2: Client through llmwiki-agent-bridge

Use the bridge path when a client needs a mediated runtime:

```text
client
  -> llmwiki-agent-bridge
  -> selected llmwiki-serve sources
  -> configured OpenAI-compatible runtime
  -> grounded answer artifact
```

The bridge path is appropriate when you need one or more of these properties:

- A shared integration point for multiple clients or agent runtimes.
- Runtime-specific profiles, validation, or policy checks.
- Centralized logging, auditing, access control, or network placement.
- Normalized behavior for clients that cannot call `llmwiki-serve` directly.
- A higher-level workflow that gathers wiki evidence before model synthesis.

The bridge can expose MCP-compatible or A2A-compatible surfaces where useful,
but those compatibility layers should be described as experimental unless the
project has completed formal certification for a given protocol.
