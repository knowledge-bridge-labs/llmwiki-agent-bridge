# Message Send Contract

`POST /message:send` is the bridge's A2A-style answer endpoint. It accepts one
question plus selected Knowledge Source descriptors, gathers source evidence,
optionally calls the configured OpenAI-compatible runtime, and returns one
completed task with a `llmwiki_agent_result` data artifact.

The bridge is not a writer. It only reads selected Knowledge Sources and does
not mutate wiki files, source descriptors, browser state, or runtime
configuration.

## Request Envelope

Send JSON with either an A2A-style `data` object or the same fields at the root:

```json
{
  "data": {
    "query": "What should I know before releasing?",
    "orchestrationMode": "delegated-runtime",
    "knowledgeSources": [
      {
        "id": "sample-wiki",
        "name": "Sample Wiki",
        "description": "Synthetic release notes and operations wiki.",
        "protocol": "llmwiki-http",
        "status": "ready",
        "url": "http://127.0.0.1:8765",
        "selected": true
      }
    ]
  }
}
```

`data.query` is the legacy current-turn query and must be a non-empty string
when no A2A `message` text is supplied. Source retrieval uses this current-turn
query only; conversation history is not sent to Knowledge Sources. A2A-style
clients may instead supply a top-level `message` or `data.message` with text
parts; the bridge uses that text as the current-turn query. The bridge also
accepts `knowledge_sources` for clients that use snake_case field names.

## Additive Conversation Runtime Context

Clients may include bounded conversation context without changing the legacy
`data.query` contract:

```json
{
  "data": {
    "query": "What should I do next?",
    "message": {
      "kind": "message",
      "messageId": "message-789",
      "contextId": "thread-123",
      "role": "user",
      "parts": [{ "kind": "text", "text": "What should I do next?" }],
      "metadata": {
        "llmwiki": {
          "schemaVersion": "llmwiki-chat.conversation.v1",
          "threadId": "thread-123",
          "sessionId": "session-456",
          "turnId": "turn-789"
        }
      }
    },
    "messages": [
      { "role": "user", "content": "Earlier question" },
      { "role": "assistant", "content": "Earlier answer" },
      { "role": "user", "content": "What should I do next?" }
    ],
    "threadId": "thread-123",
    "sessionId": "session-456",
    "turnId": "turn-789",
    "runtimeContext": {
      "conversation": {
        "title": "Release readiness chat",
        "messageCount": 3
      }
    }
  },
  "configuration": {
    "historyLength": 2
  },
  "metadata": {
    "threadId": "thread-123"
  }
}
```

`data.messages` accepts OpenAI/LangChain-compatible messages with `user`,
`assistant`, or `system` roles and string `content`. The bridge normalizes the
array leniently, bounds message content, and passes only bounded `user` and
`assistant` history to the runtime after the bridge's evidence system prompt.
The forwarded history is trimmed to valid role alternation before the current
runtime user prompt. If the latest `user` message exactly matches the current
query, that current turn is not duplicated as history; it is represented by the
final runtime user prompt that contains the current query and evidence bundle.
Client `system` messages are accepted for counting but are not forwarded as
runtime system prompts.

`data.message` and top-level `message` accept the A2A `Message` shape with
`kind: "message"`, `role: "user"`, `messageId`, optional `contextId`, text
parts, and optional metadata. `data.threadId`, `data.sessionId`, and
`data.turnId` take precedence over the same fields in `data.metadata`,
`message.contextId`, `message.metadata.llmwiki`, and top-level `metadata`.
`data.runtimeContext.conversation` is treated as a caller-provided safe
descriptor, bounded, and included inside the final runtime evidence bundle when
present. A2A-style
`configuration.historyLength` limits how many normalized user/assistant history
messages are forwarded; the bridge also caps the value internally.

`data.orchestrationMode` or `data.mode` is optional and defaults to
`delegated-runtime`, preserving the original behavior of gathering evidence and
calling the configured runtime. Supported values are:

| Mode | Behavior |
| --- | --- |
| `delegated-runtime` | Gather selected source evidence, then call the configured OpenAI-compatible runtime. |
| `evidence-only` | Gather selected source evidence and return a deterministic bridge answer without calling the runtime. |
| `hybrid` | Supported as a first orchestration slice; currently gathers evidence and delegates to the configured runtime like `delegated-runtime`. |

If a request does not include `knowledgeSources` or `knowledge_sources`, the
bridge uses the persistent source registry from `/settings/sources.json`.
Sending an empty array is treated as an explicit request with no sources.

## Knowledge Source Descriptor

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | no | Stable client-side connection ID. Defaults to `source-<n>` when omitted. |
| `name` or `title` | no | Human-readable source name used in trace steps. |
| `description` | no | Optional source description for client bookkeeping. |
| `protocol` | yes | One of `llmwiki-http`, `mcp`, or `a2a`. Other protocols are ignored. |
| `status` | yes | Must be `ready` to be queried. Non-ready sources are ignored. |
| `url` | yes | Base URL or agent-card URL, depending on protocol. |
| `selected` | no | Set to `false` to skip the source even when it is ready. |
| `capabilities` | no | Optional client metadata. |
| `adapter` | no | Optional client metadata. |
| `implementation` | no | Optional client metadata. |

The bridge queries only descriptors where `status` is `ready`, `selected` is
not `false`, `protocol` is supported, and `url` passes the configured source URL
policy.

When multiple ready sources are selected, the bridge gathers source evidence
with bounded internal concurrency. It then normalizes citations, graph data,
source bundles, diagnostics, trace steps, and per-source failures back to the
selected source order. Clients should preserve the returned order rather than
sorting by completion time.

## Protocol URL Meaning

| Protocol | URL expectation | Bridge behavior |
| --- | --- | --- |
| `llmwiki-http` | Base URL of a compatible Knowledge Source, such as `http://127.0.0.1:8765`. | Calls `/query` for context and augments evidence with compact `/search` variants. |
| `mcp` | Base URL of a compatible MCP-style JSON-RPC endpoint. | Calls `llmwiki_source_bundle` for safe bundle metadata when available, then calls `llmwiki_context` through JSON-RPC. |
| `a2a` | Agent-card URL or service URL for an A2A-style source. | Reads the agent card, posts to its `message:send` URL, and prefers a `llmwiki_context` artifact when present. |

Source fetch URLs are always validated by the source policy documented in
[Client Paths](./client-paths.md#source-url-policy). Invalid, non-HTTP,
userinfo-bearing, or disallowed origins are skipped with redacted trace errors.

## Response Shape

Successful requests return HTTP `200` and a completed A2A-style task:

```json
{
  "id": "generated-task-id",
  "requestId": "generated-request-id",
  "traceId": "generated-trace-id",
  "status": {
    "state": "completed",
    "message": {
      "parts": [{ "kind": "text", "text": "Answer markdown..." }]
    }
  },
  "message": {
    "role": "agent",
    "parts": [{ "kind": "text", "text": "Answer markdown..." }]
  },
  "artifacts": [
    {
      "name": "llmwiki_agent_result",
      "parts": [
        {
          "kind": "data",
          "data": {
            "requestId": "generated-request-id",
            "traceId": "generated-trace-id",
            "answer": "Answer markdown...",
            "orchestrationMode": "delegated-runtime",
            "citations": [],
            "graph": { "nodes": [], "edges": [] },
            "steps": [],
            "sourceBundles": [],
            "diagnostics": []
          }
        }
      ]
    }
  ]
}
```

The `llmwiki_agent_result` artifact is the stable integration target for
clients that need structured output.
The generated OpenAPI contract for this endpoint is committed at
[openapi.json](./openapi.json) and checked by `npm run contracts:check`.

## MCP Tool Compatibility

The bridge also exposes `POST /mcp` as an MCP-style JSON-RPC compatibility
surface for tool-oriented clients. It supports:

| Method | Behavior |
| --- | --- |
| `tools/list` | Returns `llmwiki_agent_run` plus read-only source exploration tools. |
| `tools/call` | Runs a named tool. `llmwiki_agent_run` uses the `/message:send` run path; source tools query registered or request-supplied Knowledge Sources directly. |

Example call:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "llmwiki_agent_run",
    "arguments": {
      "query": "What should I know before releasing?",
      "knowledgeSources": []
    }
  }
}
```

The tool uses the same internal run path as `/message:send`. Successful calls
return answer text in `result.content` and the structured result in
`result.structuredContent.llmwiki_agent_result`.

Read-only source tools are intended for progressive disclosure by a host agent:

| Tool | Required args | Structured result |
| --- | --- | --- |
| `llmwiki_list_sources` | none | `structuredContent.llmwiki_sources` |
| `llmwiki_context` | `query` | `structuredContent.llmwiki_context` |
| `llmwiki_search` | `query` | `structuredContent.llmwiki_search` |
| `llmwiki_read` | `pageId` | `structuredContent.llmwiki_read` |
| `llmwiki_graph` | none | `structuredContent.llmwiki_graph` |
| `llmwiki_graph_neighbors` | `nodeId` or `nodeIds` | `structuredContent.llmwiki_graph_neighbors` |
| `llmwiki_source_bundle` | none | `structuredContent.llmwiki_source_bundle` |

Each source-specific tool accepts `sourceId`/`source_id` and optional
`knowledgeSources`/`knowledge_sources`. If no inline sources are supplied, the
bridge uses sources registered through `/settings`. When more than one ready
selected source is available, source-specific tools require `sourceId`. Source
tools do not call the configured Hermes, DeepAgents, or OpenAI-compatible
runtime and do not mutate bridge settings or wiki content.

`llmwiki_list_sources` text content returns source IDs, names, protocol,
selected status, and readiness metadata without endpoint URLs. Its structured
`llmwiki_sources.sources` descriptors include source URLs so local workbenches
can select bridge-managed sources and pass the selected descriptors back to
`/message:send` or `llmwiki_agent_run`. Do not copy private local URLs into
public docs, issues, examples, or traces.

Source tools return citation, search result, graph node, and graph-neighborhood
ids with the bridge source prefix (`<sourceId>:<upstreamId>`) when needed to
avoid collisions across sources. Host agents may pass those source-prefixed ids
back to `llmwiki_read`. If the prefix matches a ready selected source, the
bridge routes the read to that source and strips the prefix before calling the
upstream Knowledge Source. If `sourceId` is also supplied, the prefix must match
that source; mismatches return a JSON-RPC bad-request error without reading the
wrong source.

Use `llmwiki_context` first for orientation, then call
`llmwiki_graph_neighbors` when the question depends on relationships such as
dependencies, ownership, prerequisites, policy, or source lineage. The
neighborhood tool proxies `llmwiki-serve` bounded traversal over HTTP or MCP and
keeps node and citation ids source-prefixed in the bridge result.

## Result Artifact

| Field | Meaning |
| --- | --- |
| `requestId` | Per-run request identifier. If the HTTP request includes `x-request-id` with a safe identifier value, the bridge echoes it; otherwise it generates one. |
| `traceId` | Per-run trace identifier. If the HTTP request includes `x-trace-id` with a safe identifier value, the bridge echoes it; otherwise it generates one. |
| `answer` | Markdown answer text. In `delegated-runtime` and `hybrid`, this is returned by the configured runtime. In `evidence-only`, this is generated by the bridge and starts with `Evidence-only result:`. |
| `orchestrationMode` | Resolved run mode: `evidence-only`, `delegated-runtime`, or `hybrid`. |
| `citations` | Deduplicated source citations gathered from selected Knowledge Sources. |
| `graph` | Merged graph context with `nodes` and `edges` arrays. Empty arrays are valid. |
| `steps` | Trace steps for planning, source calls, evidence preparation, runtime call, and final artifact return. |
| `sourceBundles` | Safe source bundle metadata gathered from `llmwiki-http` and MCP sources that expose source-bundle discovery. Empty arrays are valid. |
| `diagnostics` | Small redacted diagnostic envelope for warning/error trace steps. Empty arrays are valid. |

Trace steps include stable IDs such as `bridge-plan`, `bridge-evidence`,
and per-source `tool-<source-id>` entries. `runtime-chat-completions` appears
only when the resolved orchestration mode calls the configured runtime
(`delegated-runtime` or `hybrid`); it is intentionally absent for
`evidence-only`. Source failure steps are redacted and do not expose blocked
private URLs.
Successful per-source tool steps include `citationIds` in the order the bridge
read citations from that source. They also include bounded `citationRefs`
preview records with only safe `id`, `title`, relative `path`, and `sourceRefs`
fields. The bridge omits local absolute paths, URL-like paths, query strings,
fragments, credentials, and other unsafe source ref shapes from this preview.
The step `detail` string includes a short first-citations path/title preview so
clients can show whether pages such as `hot.md` or `index.md` were read first.
Clients such as `llmwiki-chat` can use these fields to display evidence in
runtime read order while preserving original markdown citation references.
`citationRefs` are a trace preview only; the authoritative citation mapping
remains the result artifact `citations` array.

Failed or warning trace steps can include a `diagnostic` object, and the same
objects are collected in result-level `diagnostics`. Diagnostics are intentionally
small and factual; they do not define a large failure-code taxonomy. Fields are:
`schemaVersion`, `severity`, `scope`, `phase`, `protocol`, `subject`,
`retryable`, `redacted`, `observations`, `remediation`, and `message`.
`observations` are bounded name/value facts such as `httpStatus`, `timeout`,
`invalidJson`, `jsonRpcError`, `policy`, `sourcePolicy`, `runtimeProfile`, and
`timeoutMs`. Raw source URLs, credentials, request headers, provider API keys,
and upstream response bodies are omitted from diagnostics.

The runtime evidence bundle sent to Hermes/DeepAgents also preserves per-source
corpus metadata from LLMWiki context responses, including `pageCount`,
`approvedPageCount`, `adapter`, `implementation`, `description`, and
`limitations`. Its merged corpus summary keeps corpus page counts separate from
the merged graph summary, so graph node counts are not treated as page counts.
For delegated-runtime and hybrid answers, the bridge instructs the runtime to
put markdown citation anchors next to each evidence-backed claim using
`[n](#citation-n)`, where `n` is the 1-based index in the result artifact
`citations` array. `citationDigest` and `sourceRefs` can help the runtime choose
evidence but do not define citation numbering.
If the runtime returns an answer with citations available but no valid
`[n](#citation-n)` anchors, the bridge appends a short bounded `Evidence used:`
line with fallback anchors that map to the same 1-based `citations` array.

For `llmwiki-http` sources, the bridge attempts `GET /source-bundle` during a
run when the URL is allowed by the configured source policy, then falls back to
legacy `GET /manifest` if needed. For MCP sources, it attempts the
`llmwiki_source_bundle` tool before `llmwiki_context`. Discovery failures do
not fail the run; they appear as redacted trace steps.

Successful responses are normalized into `sourceBundles` with an explicit
allowlist: `connectionId`, `sourceId`, `bundleId`, `title`, `capabilities`,
`adapter`, `implementation`, projection signatures/counts, raw-origin
booleans/counts, bounded `sourceRefs` with only `id`, `label`, `type`, and
safe `uri`, plus `sourceRefCount`. Unknown nested metadata, local path/root
fields, locators, linked page paths, credential-like fields, URL credentials,
and query strings are not returned.

## Safe Request Audit Logging

Request audit logging is opt-in. Set `LLMWIKI_AGENT_BRIDGE_AUDIT_LOG=1`, pass
`auditLog: true`, or set `"auditLog": true` in the persistent bridge config to
emit one JSON line per audited request through the existing logger.

The audit event schema is `llmwiki.agent-bridge.audit.v1` with event name
`llmwiki.agent_bridge.request`. Events are route-level facts only: timestamp,
request/trace IDs, HTTP method, route pattern, status, duration, source policy,
orchestration mode, whether a runtime call was attempted, selected/ready source
counts, citation/source-bundle/graph/artifact/diagnostic counts, MCP method/tool
labels when allowlisted, and explicit redaction flags.

Audit events never include raw request bodies, user messages, runtime answers,
upstream response bodies, full query strings, source URLs, runtime base URLs,
model names, API keys, bearer tokens, or local paths.

For conversation-aware requests, audit events may include only allowlisted
conversation facts: `conversationMessageCount`, `conversationHistoryLength`,
and `conversationContextProvided`. They never include thread/session/turn IDs,
message content, or `runtimeContext.conversation` descriptor values.

## Failure Behavior

| HTTP status | Common cause |
| --- | --- |
| `400` | Body is not a JSON object or `query` is missing. |
| `401` | Bridge bearer token is configured and the request is missing or has the wrong `Authorization: Bearer ...` header. |
| `403` | Browser `Origin` is not allowed by CORS policy. |
| `502` | Configured runtime chat-completions request failed. |
| `500` | Unexpected bridge failure. |

Per-source failures do not fail the whole request when other evidence can still
be used. They appear as `status: "error"` entries in `steps`, and the bridge
continues to call the runtime with surviving evidence plus source failure notes.
Those source failure notes include the same redacted diagnostic facts that appear
in the trace step.

Fatal runtime failures keep the existing `error.code` contract, such as
`chat_completions_failed`, and return HTTP `502`. When the bridge has already
started a `/message:send` run, the `ErrorResponse` also includes `requestId`,
`traceId`, any partial `steps`, and runtime `diagnostics` collected before the
failure.

## Security Notes

- Keep provider API keys in the bridge process environment, not in client
  payloads.
- `GET /settings` serves the local guided setup UI. Step 1 saves runtime
  connection fields through `PUT /settings/config.json`, Step 2 saves source
  registrations through `GET/PUT /settings/sources.json`, and Step 3 verifies
  the bridge with `POST /message:send`.
- The agent card advertises `metadata.settingsUrl` so clients can discover the
  local settings screen.
- Runtime settings and advanced access/source-policy settings saved through
  `/settings` apply live; host and port changes require a bridge restart.
- Use `LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN` for shared or non-loopback bridge
  deployments.
- Use `LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY` and
  `LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS` to control outbound source
  access.
- Do not include raw credentials, private wiki exports, or private endpoint
  paths in `knowledgeSources`.
