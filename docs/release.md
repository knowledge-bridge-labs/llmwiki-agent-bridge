# Release Checklist

Use this checklist before publishing the next `llmwiki-agent-bridge` release or
tagging a public preview.

## Status

`0.1.0` is the published first public-preview npm package. Current installation
guidance may point at `llmwiki-agent-bridge@0.1.0` plus source checkout as the
supported development path.

For the next release, verify the current registry state, choose a new package
version, and update package metadata, changelog entries, docs, and release
status together. Do not imply a newer npm release exists until registry upload
and install-smoke verification have completed.

## Local Gates

Run:

```sh
npm ci
npm run contracts:check
npm run check
npm run audit
```

`npm run check` runs syntax checks, OpenAPI freshness checks, the Node test
suite, and a dry npm package inspection. If the bridge HTTP surface or artifact
shape changed, run `npm run contracts:generate` and commit the refreshed
`docs/openapi.json`.

## Smoke Test

Start a local OpenAI-compatible runtime or mock gateway, then run the bridge:

```sh
LLMWIKI_AGENT_BRIDGE_BASE_URL=http://127.0.0.1:8642/v1 \
LLMWIKI_AGENT_BRIDGE_MODEL=hermes-agent \
LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE=hermes \
node ./bin/llmwiki-agent-bridge.mjs
```

Verify:

```sh
curl -s http://127.0.0.1:8788/health
curl -s http://127.0.0.1:8788/.well-known/agent-card.json
```

For release claims that mention Hermes, DeepAgents, generic OpenAI-compatible
runtimes, MCP-style sources, or A2A-style sources, record the exact smoke setup
used and whether it was a local mock, a local runtime, or an external runtime.

## Package Contents

Confirm the npm dry-run includes only public runtime files and release metadata:

- `bin/llmwiki-agent-bridge.mjs`
- `src/index.mjs`
- `scripts/export-openapi.mjs`
- `docs/`
- `docs/openapi.json`
- `docs/message-send-contract.md`
- `examples/`
- `integrations/`
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `THIRD_PARTY_NOTICES.md`

Do not ship credentials, token caches, local environment files, private endpoint
URLs, private wiki content, generated traces, or GitHub workflow internals in
the npm package.

## Publication Gate

Before publishing a new npm version:

1. Confirm the current package is owned by the project and note the latest
   published version:

   ```sh
   npm view llmwiki-agent-bridge version --json
   ```

2. Confirm the target version is not already published:

   ```sh
   npm view llmwiki-agent-bridge@<target-version> version --json
   ```

3. Confirm repository URLs point at the final GitHub organization.
4. Confirm the cross-repo status matrix records `0.1.0` as published and the
   intended next bridge release state. After upload and install-smoke
   verification finish, update the matrix to the new npm-published version.
5. Confirm the `CHANGELOG.md` entry for the target version matches the
   publication date and release contents.
6. Confirm npm Trusted Publishing is configured for this package and workflow.

Before publishing to npm, run the central package-publication gate documented
in the sibling `llmwiki-docs` repository. If packages are being published
sequentially, use the central staging preflight or a package-specific registry
expectation until the matrix records the current partial state.

### npm Trusted Publisher

Configure npm Trusted Publishing on npmjs.com for:

- Package: `llmwiki-agent-bridge`
- Publisher: GitHub Actions
- GitHub organization/user: `knowledge-bridge-labs`
- Repository: `llmwiki-agent-bridge`
- Workflow filename: `publish.yml`
- GitHub environment: `npm`
- Allowed action: `npm publish`

The workflow lives at `.github/workflows/publish.yml`, uses the `npm`
environment, grants `contents: read` and `id-token: write`, runs on a
GitHub-hosted Ubuntu runner with Node 24, installs with `npm ci`, runs
`npm run check`, `npm run audit`, performs a dry package inspection, and then
runs tokenless `npm publish`.

Do not add `NPM_TOKEN` or token-based publishing secrets to this workflow.
Trusted Publishing uses GitHub Actions OIDC, and npm automatically emits
provenance for eligible public GitHub publishes.

Because the public package already exists, next releases should use Trusted
Publishing unless the maintainers explicitly document a registry-side blocker.
If package settings need manual repair, use npm 2FA in the registry UI. Do not
invent credentials or commit tokens as a workaround.
