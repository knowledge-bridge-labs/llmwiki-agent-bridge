# Spec: A2A Latest Agent Card Compatibility

## Status

Implemented locally.

## Problem

`llmwiki-agent-bridge` 0.5.0 exposes an A2A-style `/message:send` route and
well-known agent card, but the public card still centers on older
`url`/metadata fields. A2A 1.x discovery clients expect an Agent Card with
`supportedInterfaces`, protocol version metadata, default media modes, skills,
and security requirements when an agent requires bearer authentication.

The bridge should improve its discovery, explicit latest-version send surface,
and current A2A lifecycle routes without renaming `/message:send`, changing
legacy single-shot task-like responses, or claiming external A2A certification.

## Goals

- Update the JavaScript A2A SDK dependency from `0.3.14` to `1.1.0` when local
  tests continue to pass.
- Export explicit bridge A2A protocol constants for the supported wire version
  and HTTP version header.
- Add current Agent Card fields while preserving legacy `url`, `capabilities`,
  and `metadata` fields.
- Advertise `Authorization: Bearer` security metadata when bridge bearer auth
  is configured, without exposing the configured token.
- Add safe `A2A-Version` request/response handling for `/message:send`.
- Return the current HTTP+JSON wrapper shape only for explicit current-version
  requests.
- Keep legacy `/message:send` as one immediate completed task-like response.
- Store explicit current-version task snapshots in bounded process-local memory
  so A2A 1.0 clients can list and look up recent bridge runs.
- Add `/message:stream` for synchronous Server-Sent Events over the same
  request/run path.
- Add `/tasks`, `/tasks/{id}`, `/tasks/{id}:cancel`,
  `/tasks/{id}:subscribe`, `/extendedAgentCard`, and push-notification config
  routes with clean protocol-shaped success or unsupported/not-cancelable
  errors.
- Keep generated OpenAPI in sync with the A2A 1.0 route slice.

## Non-Goals

- Do not rename routes or move to SDK-owned routing.
- Do not implement durable task storage, background workflow persistence,
  cancelable asynchronous execution, or push notification delivery.
- Do not expose source URLs, bearer tokens, runtime API keys, or local paths in
  card metadata.
- Do not claim externally certified A2A conformance.

## Requirements

- `REQ-001`: The package dependency is `@a2a-js/sdk@1.1.0` if install and tests
  allow it.
- `REQ-002`: The bridge exports `BRIDGE_A2A_PROTOCOL_VERSION`,
  `BRIDGE_A2A_VERSION_HEADER`, and supported version metadata.
- `REQ-003`: `/.well-known/agent-card.json` includes
  `supportedInterfaces[0]` for `/message:send` with `HTTP+JSON` and the current
  A2A protocol version.
- `REQ-004`: The card includes `protocolVersion`, package `version`,
  provider URL and organization, `defaultInputModes`, `defaultOutputModes`,
  `skills`, `securitySchemes`, `securityRequirements`, and `signatures`
  fields.
- `REQ-005`: The card preserves the legacy `url`, `runtime`, `agentRuntime`,
  `capabilities`, and `metadata` fields used by existing clients.
- `REQ-006`: When `LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN` or equivalent config is
  set, the authenticated card advertises bearer HTTP auth requirements without
  including the token value.
- `REQ-007`: `/message:send` accepts missing or empty `A2A-Version` as legacy
  `0.3`, accepts the current version, returns the current version header on
  A2A route JSON responses, and rejects explicit unsupported versions before
  source fan-out or runtime calls.
- `REQ-008`: Explicit current-version `/message:send` requests receive
  `Content-Type: application/a2a+json` and a `{ "task": ... }` HTTP+JSON
  response wrapper with current role, part, artifact, and task-state labels.
- `REQ-009`: The generated OpenAPI contract covers the additive card fields and
  message version behavior at the schema level where practical.
- `REQ-010`: Explicit current-version `/message:send` responses store a
  bounded process-local task snapshot that can be returned by `GET /tasks` and
  `GET /tasks/{id}`.
- `REQ-011`: `POST /message:stream` accepts current-version requests and emits
  SSE task events for submitted, working, terminal status, and final task
  snapshots.
- `REQ-012`: `/tasks/{id}:cancel` and `/tasks/{id}:subscribe` return
  protocol-shaped lifecycle responses. Completed synchronous tasks are not
  cancelable, and subscribe returns the current terminal snapshot when
  available.
- `REQ-013`: Push-notification config routes return A2A unsupported errors
  because the bridge does not advertise push notifications.
- `REQ-014`: `/extendedAgentCard` returns the same safe additive card metadata
  as discovery and enforces bearer auth when configured.
- `REQ-015`: A2A REST-style lifecycle errors include a stable error code,
  message, and `google.rpc.ErrorInfo` detail without leaking source URLs,
  credentials, or local paths.

## Compatibility

Existing A2A-style clients can continue to post the legacy `data.query`
envelope to `/message:send` and read the same completed task-like response.
Discovery clients that understand the newer Agent Card fields can select the
preferred interface from `supportedInterfaces[0]`. Legacy card consumers can
continue reading `url`, `capabilities`, and `metadata`.
