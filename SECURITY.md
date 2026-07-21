# Security Policy

## Supported Versions

Security fixes target `main` and the latest published 0.x public-preview
release unless otherwise noted in an advisory or release note. While the
project is pre-1.0, maintainers may ship security fixes in the next 0.x release
without preserving every experimental API.

| Version | Support status |
| --- | --- |
| `main` | Supported development branch for security fixes. |
| Latest published `0.x` public-preview release | Supported. |
| Older `0.x` public-preview releases | Best effort unless an advisory says otherwise. |

## Reporting a Vulnerability

Use GitHub private vulnerability reporting for this repository when available.
The organization private reporting route is:

<https://github.com/knowledge-bridge-labs/llmwiki-agent-bridge/security/advisories/new>

If private reporting is unavailable, open a public issue only to request a
private security contact path, then stop. Do not include exploitable details,
private data, credentials, private wiki content, request logs, screenshots, or
proof-of-concept payloads in a public issue, pull request, or discussion.

Maintainers should acknowledge private reports within 7 calendar days and
provide a remediation plan, mitigation, or status update as soon as practical.

Please include:

- Affected version or commit.
- Impact and affected deployment shape.
- Reproduction steps with sanitized URLs and credentials.
- Whether the bridge was bound to loopback or a non-loopback interface.
- Relevant source policy and authentication configuration.

## Security Model

`llmwiki-agent-bridge` is intended to run as a local companion bridge between Hermes, DeepAgents, or a generic OpenAI-compatible runtime and selected LLMWiki Knowledge Sources. It does not authenticate users by default on loopback and it is not a hosted multi-tenant RAG service.

Important boundaries:

- Browser CORS is controlled by `LLMWIKI_AGENT_BRIDGE_ALLOWED_ORIGINS`.
- Outbound Knowledge Source fetches are controlled by `LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY` and `LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS`. The default policy name is `private-http`.
- Bridge HTTP request authentication is controlled by `LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN`.
- Public binds require `LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND=1`.

Do not expose the bridge on public or shared interfaces without a bearer token and a restrictive source policy. Treat Knowledge Source URLs, runtime API keys, and returned citations as potentially sensitive local development data.

## Dependency Surface

This package currently uses a small runtime npm dependency set documented in
`THIRD_PARTY_NOTICES.md`, plus Node.js built-ins. Continue to review changes
for SSRF, token leakage, unsafe public binds, CORS regressions, dependency
updates, and citation or trace data leaks.
