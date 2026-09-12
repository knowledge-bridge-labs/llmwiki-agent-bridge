# Tests: A2A Latest Agent Card Compatibility

## Acceptance Criteria

- `/.well-known/agent-card.json` still returns HTTP `200` for unauthenticated
  local bridges and preserves `url: "/message:send"`.
- The default Agent Card includes:
  - `protocolVersion` matching `BRIDGE_A2A_PROTOCOL_VERSION`;
  - `supportedInterfaces[0].url: "/message:send"`;
  - `supportedInterfaces[0].protocolBinding: "HTTP+JSON"`;
  - default input and output modes;
  - at least one `llmwiki-grounded-answer` skill;
  - empty security fields when bearer auth is not configured.
- The official A2A SDK resolver can still discover the card.
- When bridge bearer auth is configured, the authenticated Agent Card includes
  bearer HTTP security metadata and does not include the token value.
- `POST /message:send` with `A2A-Version` equal to the current bridge protocol
  version returns HTTP `200`, `A2A-Version` response header,
  `application/a2a+json`, and a completed `{ "task": ... }` HTTP+JSON response.
- `POST /message:send` without `A2A-Version` preserves the existing direct task
  response and `application/json`.
- `POST /message:send` with an explicit unsupported `A2A-Version` returns HTTP
  `400` before source/runtime work.
- Explicit current-version `/message:send` stores a bounded process-local task
  snapshot visible through `GET /tasks` and `GET /tasks/{id}`.
- `POST /message:stream` returns Server-Sent Events containing submitted,
  working, terminal status, and final task snapshots.
- `POST /tasks/{id}:cancel` returns a protocol-shaped not-cancelable response
  for completed synchronous tasks.
- `GET/POST /tasks/{id}:subscribe` returns the current terminal task snapshot
  when it exists.
- Push-notification config routes return the A2A unsupported error shape and do
  not advertise push support in the Agent Card.
- `GET /extendedAgentCard` returns safe Agent Card metadata and enforces bearer
  auth when configured.
- Lifecycle error responses include stable code/message details and
  `google.rpc.ErrorInfo` without leaking source URLs, credentials, or local
  paths.
- Generated OpenAPI includes Agent Card interface, skill, security, and A2A
  protocol metadata schemas plus the current lifecycle routes.

## Commands

```sh
npm test -- --test-name-pattern "A2A"
npm test -- --test-name-pattern "message:stream|tasks|pushNotification|extendedAgentCard"
npm test -- --test-name-pattern "MCP 2026-07-28"
npm run contracts:check
npm test
```
