# Plan

1. Add CLI option handling in the existing CLI entry path before server start.
2. Add focused Node test coverage for `--help` and `--version`.
3. Replace stale README and release guidance install commands with
   `llmwiki-agent-bridge@latest`.
4. Narrow `package.json` `files` to explicit runtime and public documentation
   paths.
5. Extend the npm dry-pack test to assert excluded planning/private-context
   documents stay out of the tarball.

## Affected Modules

- `src/index.mjs`
- `bin/llmwiki-agent-bridge.mjs`
- `test/agent-bridge.test.mjs`
- `package.json`
- `README.md`
- `docs/release.md`

## Risks

- The CLI path imports the full bridge module before printing help; help still
  must not start listeners or read/write persistent settings.
- Narrowing `files` can remove documentation package users expect, so public
  README-linked docs should remain included explicitly.
