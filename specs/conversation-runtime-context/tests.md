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
node --check scripts/e2e-chat-api-query-matrix.mjs
npm run e2e:chat-api:matrix
npm run contracts:check
npm test
npm run check
```

## Reusable chat API query matrix

`scripts/e2e-chat-api-query-matrix.mjs` exercises the direct `/message:send`
HTTP shape used by `llmwiki-chat`, not the browser UI. The default npm script
starts a deterministic in-process bridge with mock Knowledge Source and mock
OpenAI-compatible runtime servers, emits only case IDs, statuses, counts, and
failure codes, and exits non-zero on failed checks. Live mode can target an
already running bridge/source through environment or CLI overrides. Mock mode
requires citation-bearing evidence. Live mode accepts citation, graph, or source
bundle evidence because deployed `llmwiki-serve` sources may expose graph-first
context without citation rows. Audit checks run in live mode only when an audit
log path is provided.

Covered matrix cases:

- evidence-only request with a selected ready source;
- delegated-runtime request with a selected ready source;
- multi-turn follow-up with stable thread/context and bounded runtime history;
- top-level A2A `message` without `data.query`;
- long history truncation and runtime role-order safety;
- unreachable selected source diagnostics with sanitized output checks;
- bridge audit redaction safe-field checks when audit output is observable.
