# Release Checklist

Use this checklist before publishing `llmwiki-agent-bridge` or tagging a public
preview.

## Status

`0.1.0` is reserved for the first public preview package. Until the npm package
is published, keep installation guidance focused on source checkout usage and
do not add npm badges that imply a live registry package.

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

Before publishing:

1. Confirm the package name is still available or owned by the project:

   ```sh
   npm view llmwiki-agent-bridge version --json
   ```

2. Confirm repository URLs point at the final GitHub organization.
3. Confirm the cross-repo status matrix records the intended bridge release
   version and current registry state. After upload and install-smoke
   verification finish, the bridge package should be marked as npm published.
4. Confirm the `CHANGELOG.md` `0.1.0` public package preview entry matches the
   publication date and release contents.
5. Confirm npm Trusted Publishing is configured for this package and workflow.

Before publishing to npm, run the central package-publication gate documented
in the sibling `llmwiki-docs` repository and confirm the toolchain release
status is at least `public-unpublished`.
If packages are being published sequentially, use the central staging preflight
or a package-specific registry expectation until the matrix has a mode for the
current partial state.

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

If npm requires the package to already exist before adding the trusted publisher
relationship, a maintainer may need to create the initial public package or
package settings manually with npm 2FA. Do not invent credentials or commit
tokens as a workaround.
