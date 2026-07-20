# Plan

1. Extend `/message:send` parsing to normalize optional conversation fields,
   including A2A `message` objects.
2. Keep source calls on the current `query` path.
3. Insert bounded alternating user/assistant history into runtime
   chat-completions messages after the bridge system prompt and before the
   current grounded query.
4. Add audit count/boolean fields without logging raw content.
5. Update OpenAPI and message contract docs.
6. Add unit/integration tests for legacy compatibility, runtime forwarding, and
   audit redaction.
