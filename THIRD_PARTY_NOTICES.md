# Third-Party Notices

`llmwiki-agent-bridge` currently declares these runtime npm dependencies. The
licenses below are verified from the local `package-lock.json`.

| Package | Locked version | Relationship | Local lockfile license | Use |
| --- | --- | --- | --- | --- |
| `@a2a-js/sdk` | `1.1.0` | Direct dependency | Apache-2.0 | A2A agent-card constants, protocol version metadata, and SDK-based compatibility checks. |
| `@agentclientprotocol/sdk` | `1.3.0` | Direct dependency | Apache-2.0 | Stable ACP v1 client used by the opt-in DeepAgents ACP runtime adapter. |
| `@toon-format/toon` | `2.3.1` | Direct dependency | MIT | TOON prompt renderer used by repository evaluation and benchmark helpers. |
| `jose` | `6.2.12` | Transitive dependency of `@a2a-js/sdk` | MIT | JOSE helper pulled in by the A2A SDK for agent-card signature support. |
| `zod` | `4.4.3` | Peer dependency installed for `@agentclientprotocol/sdk` | MIT | Runtime schema dependency required by the ACP SDK package. |

The package runs on Node.js and uses Node.js built-in modules such as `node:http`, `node:crypto`, `node:test`, and Web Platform APIs available in supported Node.js versions.

Development and CI may use npm and GitHub Actions. Their use is governed by their respective licenses and terms.

If runtime dependencies are added later, update this file with package names,
versions or ranges, licenses verified from local package metadata, and any
required notices.
