# ADR: A2A Latest Agent Card Compatibility

## Status

Accepted.

## Context

The bridge already exposes a stable A2A-style HTTP route at
`POST /message:send` and a well-known Agent Card. Existing clients rely on the
legacy card `url`, runtime labels, `capabilities`, and `metadata`. Newer A2A
SDKs and discovery clients prefer current Agent Card fields such as
`supportedInterfaces`, protocol version metadata, default media modes, skills,
and security requirements.

The bridge remains a local LLMWiki Knowledge Gateway. It should improve
interoperability without becoming a durable A2A task server or changing route
names.

## Decision

Implement an additive compatibility slice:

- Use `@a2a-js/sdk@1.1.0` and source the bridge A2A wire version/header
  constants from the SDK.
- Keep `/message:send` as the single A2A-style route and advertise it through
  both legacy `url` and `supportedInterfaces[0]`.
- Include current card fields for protocol version, package version, media
  modes, skill descriptors, provider URL, empty signatures, and security
  arrays.
- When bridge bearer auth is configured, advertise bearer HTTP auth in the
  authenticated card without exposing the token.
- Return `A2A-Version` on A2A route JSON responses and reject only explicit
  unsupported request versions.
- Return `application/a2a+json` and the `{ "task": ... }` HTTP+JSON wrapper
  only when a request explicitly asks for the current A2A version; keep the
  legacy direct task response when the version is missing or legacy.

## Consequences

- Newer discovery clients have enough metadata to select the bridge interface
  and understand input/output modes.
- Legacy clients can continue using the same route, direct task response, and
  legacy card fields.
- The bridge does not support streaming, push notifications, long-lived task
  storage, task polling, cancellation, or complete A2A certification.
- Public docs must continue to describe this as A2A-style or compatible unless
  a separate conformance effort is completed.

## Follow-ups

- Revisit absolute interface URLs if a production deployment layer starts
  owning public HTTPS Agent Card publication.
- Evaluate SDK-owned A2A routing only if the bridge intentionally implements a
  broader A2A task lifecycle.

## Links

- Spec: `specs/a2a-latest-agent-card-compatibility/`
- Contract docs: `docs/message-send-contract.md`
