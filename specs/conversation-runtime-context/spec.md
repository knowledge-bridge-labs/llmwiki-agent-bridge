# Conversation Runtime Context

## Problem

Follow-up chat turns currently reach the bridge as isolated `data.query` values.
That preserves the legacy source-retrieval contract, but it prevents delegated
runtimes such as Hermes, DeepAgents, LangChain-style agents, and generic
OpenAI-compatible adapters from seeing bounded conversation history.

## Goals

- Preserve legacy `data.query` behavior and compatibility.
- Accept additive conversation fields aligned with common runtime shapes:
  `message`, `messages`, `threadId`, `sessionId`, `turnId`,
  `configuration.historyLength`, `metadata`, and `runtimeContext.conversation`.
- Forward bounded user/assistant history to the configured runtime.
- Keep Knowledge Source retrieval based on the current query only: `data.query`
  when present, otherwise A2A message text.
- Keep request audit logs safe: counts and booleans only, no raw messages or
  thread/session identifiers.

## Non-goals

- No custom lossy summary format as the canonical context contract.
- No server-side transcript persistence.
- No automatic source-retrieval query rewriting from prior turns.
- No product-specific Hermes or DeepAgents client library dependency.

## Requirements

- Query-only `/message:send` requests must continue to work.
- A2A `data.message` and top-level `message` requests must work when they
  provide text parts.
- Conversation messages must be bounded by count and string length.
- Client `system` messages may be accepted for counting but must not override
  the bridge runtime system prompt.
- The latest user message must not be duplicated when it matches `data.query`.
- `data.threadId/sessionId/turnId` must take precedence over metadata aliases.
- Forwarded runtime history must preserve valid user/assistant alternation
  before the final current-query user prompt.
- Audit events may include `conversationMessageCount`,
  `conversationHistoryLength`, and `conversationContextProvided` only.

## Compatibility

This is an additive contract extension. Existing clients that send only
`data.query` and source descriptors do not need to change.
