# Tasks: A2A Latest Agent Card Compatibility

- [x] Confirm `@a2a-js/sdk@1.1.0` is current for this dependency update.
- [x] Inspect SDK 1.1.0 constants and resolver behavior.
- [x] Update package dependency and lockfile.
- [x] Export explicit bridge A2A protocol constants.
- [x] Add `supportedInterfaces`, protocol version metadata, default media
  modes, skills, and security fields to the Agent Card.
- [x] Preserve legacy Agent Card `url`, `capabilities`, and `metadata`.
- [x] Add bearer auth card coverage without exposing token values.
- [x] Add `/message:send` `A2A-Version` request/response handling.
- [x] Add bounded process-local task list and lookup for current-version runs.
- [x] Add `/message:stream` SSE events over the synchronous run path.
- [x] Add cancel, subscribe, extended-card, and push-notification unsupported
  routes.
- [x] Add protocol-shaped A2A lifecycle error responses.
- [x] Update docs and generated OpenAPI contract.
- [x] Run focused and full validation.
