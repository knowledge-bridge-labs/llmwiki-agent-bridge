# ADR: Conversation Runtime Context Normalization

## Status

Accepted.

## Context

Follow-up chat turns need multi-turn context at the delegated runtime boundary.
At the same time, Knowledge Source queries must avoid leaking prior assistant
answers or raw transcript history to source endpoints.

Common runtime conventions differ:

- A2A uses `message`, `messageId`, `contextId`, parts, and metadata for
  continuity.
- Hermes, LangChain, DeepAgents, and generic OpenAI-compatible runtimes use
  ordered role/content `messages`.

## Decision

`/message:send` accepts both shapes additively:

- legacy `data.query`;
- A2A `data.message` or top-level `message`;
- OpenAI/LangChain-style `data.messages`;
- thread/session/turn identifiers and bounded conversation descriptors.

The bridge derives the current query from `data.query` first, or A2A text parts
when `data.query` is absent. Knowledge Source retrieval uses only that current
query. Prior user/assistant history is forwarded only to the final
OpenAI-compatible runtime call, after the bridge system prompt and before the
current query/evidence user prompt. Caller-provided system messages are counted
but not forwarded as runtime system prompts.

Safe audit logs include only conversation counts and booleans, never raw
messages, descriptor values, thread/session/turn IDs, or message IDs.

## Consequences

- Legacy clients remain compatible.
- A2A-style clients can preserve context through `contextId`.
- OpenAI/LangChain/Hermes-style runtimes receive bounded alternating
  user/assistant history.
- Source retrieval remains conservative. Follow-up retrieval-query expansion,
  if needed, must be a separate opt-in design with leakage tests.

## Follow-ups

- Add live E2E coverage proving stable `contextId` across chat turns.
- Evaluate prompt-cache support inside runtime adapters after the contract is
  stable.
- Design a separate, safe retrieval-query expansion gate only if runtime-only
  history does not resolve follow-up misses.

## Links

- Spec: `specs/conversation-runtime-context/`
- Message contract: `docs/message-send-contract.md`
