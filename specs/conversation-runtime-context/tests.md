# Tests

## Acceptance

- Legacy query-only delegated-runtime request still sends a system/user runtime
  message pair and returns the runtime answer.
- A2A top-level `message` request without `data.query` derives the current
  query from text parts and returns the runtime answer.
- Conversation-aware request:
  - sends only the current query to Knowledge Sources;
  - forwards bounded prior user/assistant messages to the runtime;
  - preserves `system -> user/assistant history -> current user` role order;
  - does not forward caller-provided system messages as runtime system prompts;
  - does not duplicate the latest user message when it matches `data.query`;
  - honors `configuration.historyLength`;
  - prefers data-level thread/session/turn IDs over metadata aliases.
- Audit events for conversation-aware requests contain only allowlisted counts
  and booleans, not raw queries, messages, runtime answers, descriptor values,
  thread/session/turn IDs, source URLs, model names, or credentials.

## Commands

```sh
npm run contracts:check
npm test
npm run check
```
