# Changelog

All notable changes to this project will be documented in this file.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses Apache-2.0 licensing.

## [Unreleased]

No unreleased changes.

## [0.4.0] - 2026-08-01

### Added

- Additive retrieval-mode forwarding for `/message:send` and MCP tools,
  including `data.retrieval`, exact source capability strings, lexical fallback
  diagnostics, and vector/hybrid routing to capable HTTP, MCP, and A2A sources.
- Agent-guided lexical controls for source tools and one-shot runs, including
  strict Serve `retrieval_guidance` to public `retrievalGuidance` mapping,
  Korean and non-Latin Unicode-preserving `queryVariants`, exact
  `llmwiki_agent_guided_lexical_v1` gating for upstream `query_variants`, and
  old-source fallback distinctions that keep unsupported fields out of legacy
  request bodies.

### Changed

- Bumped package metadata for the retrieval forwarding public contract while
  keeping the bridge free of ML, embedding, vector-store, ANN, numeric, and
  provider SDK dependency additions.

## [0.3.0] - 2026-07-28

### Added

- MCP lifecycle handling for `initialize`, `notifications/initialized`, and
  `ping` before tool discovery and tool calls.
- Redacted `GET /sources` source-registry visibility, with `?probe=1` live
  health checks and safe source manifest metadata.
- Local CLI source inspection commands: `sources`, `ls`, and `status`.
- Public runtime configuration and reachability metadata for health, settings,
  agent card, and source registry consumers.
- Source registry visibility spec and ADR coverage.

### Changed

- Chat-completions runtime failures now return more actionable redacted error
  details without exposing prompts, upstream response bodies, credentials, or
  private endpoint values.
- Duplicate source IDs are rejected on persisted settings writes and surfaced as
  warnings in read-only registry views.

## [0.2.1] - 2026-07-27

### Added

- CLI `--help` and `--version` handling so package users can inspect the bridge
  command without starting the HTTP server.
- Onboarding quality spec coverage for CLI usage, package contents, and stale
  install guidance.

### Changed

- Updated README and release guidance to use `llmwiki-agent-bridge@latest`
  instead of stale `0.1.0` install commands.
- Narrowed npm package contents to runtime files, public docs, examples,
  integrations, and release metadata while excluding repository planning
  artifacts.
- Generalized private live-provider validation wording in specs and decisions.

## [0.2.0] - 2026-07-26

### Added

- Opt-in `deepagents-acp` runtime adapter with ACP subprocess execution,
  diagnostics, and Windows no-shell-safe launcher coverage.
- Runtime profile documentation and ADR coverage for separating runtime profile
  labels from runtime adapter transport.
- QuickStart integration support for selecting the DeepAgents ACP adapter from
  `llmwiki-bridge-start`.

### Changed

- Redacted private live provider smoke details from release-packaged specs and
  decision records while preserving the validation outcome.

## [0.1.0] - 2026-07-21 public package preview

### Added

- Initial bridge runtime for connecting OpenAI-compatible local agent runtimes to LLMWiki Knowledge Sources.
- Support for `llmwiki-http`, MCP-style `llmwiki_context`, and A2A-style source adapters.
- Grounded answer response with citations, graph data, and trace steps.
- CODEOWNERS for the planned Knowledge Bridge Labs maintainer team and safer
  changed-file rendering in the automated PR review guide.
- Usage-question issue form so public support routing works while blank issues
  remain disabled.
- Contributor and support guidance for issue routing, validation expectations,
  and AI-assisted contribution review.
- README public-preview status and cross-repo LLMWiki toolchain positioning.
- README release status link to the cross-repo status and compatibility matrix.
- Release checklist for package contents, local gates, smoke checks, and npm
  publication prerequisites.
- Public governance wording that points to Knowledge Bridge Labs without
  temporary transfer language.
- OSS-ready package metadata for `llmwiki-agent-bridge`.
- Documentation for the generic companion runtime bridge model with initial Hermes, DeepAgents, and generic runtime profiles.
- Documentation for direct `llmwiki-serve` client usage versus bridge-mediated runtime usage.
- Security, support, contribution, third-party notice, and CI metadata.
