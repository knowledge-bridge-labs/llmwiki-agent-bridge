# Tests

## Acceptance

- `node ./bin/llmwiki-agent-bridge.mjs --help` exits 0, prints usage text, and
  does not print the bridge `ready` event.
- `node ./bin/llmwiki-agent-bridge.mjs --version` exits 0 and prints the
  current package version.
- `npm pack --dry-run --json --ignore-scripts` excludes `specs/`,
  `docs/decisions/`, `.llmwiki-work/`, and runtime logs.

## Local Validation

```sh
npm test -- --test-name-pattern "CLI|dry packs"
npm pack --dry-run --json --ignore-scripts
node ./bin/llmwiki-agent-bridge.mjs --help
node ./bin/llmwiki-agent-bridge.mjs --version
```
