# Third-Party Notices

`llmwiki-agent-bridge` currently declares these runtime npm dependencies. The
licenses below are verified from the local `package-lock.json`.

| Package | Locked version | Relationship | Local lockfile license | Use |
| --- | --- | --- | --- | --- |
| `@a2a-js/sdk` | `0.3.13` | Direct dependency | Apache-2.0 | A2A agent-card constants and SDK-based compatibility checks. |
| `@toon-format/toon` | `2.3.1` | Direct dependency | MIT | TOON prompt renderer used by repository evaluation and benchmark helpers. |
| `uuid` | `11.1.1` | Transitive dependency of `@a2a-js/sdk` | MIT | UUID helper pulled in by the A2A SDK. |

The package runs on Node.js and uses Node.js built-in modules such as `node:http`, `node:crypto`, `node:test`, and Web Platform APIs available in supported Node.js versions.

Development and CI may use npm and GitHub Actions. Their use is governed by their respective licenses and terms.

If runtime dependencies are added later, update this file with package names,
versions or ranges, licenses verified from local package metadata, and any
required notices.
