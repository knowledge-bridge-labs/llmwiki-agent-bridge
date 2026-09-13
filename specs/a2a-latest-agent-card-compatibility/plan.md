# Plan: A2A Latest Agent Card Compatibility

1. Confirm the current `@a2a-js/sdk` npm version and inspect exported
   constants/resolver behavior.
2. Update `package.json` and `package-lock.json` to `@a2a-js/sdk@1.1.0`.
3. Add bridge A2A protocol constants sourced from the SDK.
4. Extend the Agent Card with current discovery fields while preserving legacy
   fields.
5. Add bearer auth card metadata only when bridge bearer auth is configured.
6. Add conservative `A2A-Version` request validation and response headers for
   `/message:send`.
7. Add bounded process-local task storage for explicit current-version bridge
   runs.
8. Add `/message:stream`, task list/lookup, cancel, subscribe,
   push-notification config, and `/extendedAgentCard` routes.
9. Add protocol-shaped REST error helpers with safe `google.rpc.ErrorInfo`
   details.
10. Update OpenAPI schemas, focused tests, README, contract docs, and runtime
   profile docs.
11. Run focused tests, full tests, lint, contract checks, packaging dry run,
   and audit as practical.
