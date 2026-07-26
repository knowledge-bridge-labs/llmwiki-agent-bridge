# Onboarding Quality

## Problem

First-run package users should be able to inspect CLI usage and version without
starting the local bridge server. Public installation docs should not pin stale
preview package versions, and npm package contents should avoid shipping
repository planning artifacts that are not needed at runtime.

## Goals

- `llmwiki-agent-bridge --help` prints usage text and exits successfully.
- `llmwiki-agent-bridge --version` prints the package version and exits
  successfully.
- README and release guidance use `llmwiki-agent-bridge@latest` for normal
  install/run commands.
- npm package contents include only runtime, public docs, examples,
  integrations, and release metadata needed by package users.

## Non-goals

- No package version bump, publish, git tag, commit, or workflow execution.
- No change to bridge HTTP, MCP, A2A-style, source, or runtime adapter
  contracts.
- No change to default runtime profile or adapter behavior.

## Requirements

1. CLI help/version handling must run before `startAgentBridge`.
2. Help output must not print configured endpoint values, model values, bearer
   tokens, API keys, secrets, or local paths.
3. Version output must derive from package metadata or an equivalent single
   source aligned with `package.json`.
4. The package dry-run must exclude `specs/`, `docs/decisions/`, and local
   generated/runtime work files.

## Compatibility

Running `llmwiki-agent-bridge` without arguments keeps starting the local bridge
server with the existing environment and persistent-settings behavior.
