# Spec: Runtime Prompt Projection Quality

## Status

Draft.

## Problem

Runtime prompt projections can reduce context size but may make agents omit
facts, distort graph relations, or cite the wrong source. The bridge needs an
evaluation path that treats provenance and relation preservation as primary
quality gates.

## Goals

- Define machine-readable quality gates for runtime prompt evidence fixtures.
- Allow optional external graph fixtures, including Graphify-like `graph.json`,
  without adding production dependencies.
- Keep public bridge API and artifact contracts unchanged.
- Separate lossless codecs from lossy prompt projections in reports.

## Non-Goals

- Do not make Graphify a package dependency.
- Do not claim compatibility with any external CKG standard.
- Do not change runtime synthesis defaults based only on token reduction.
- Do not expose local paths, private endpoints, credentials, or raw sensitive
  logs in reports or fixtures.

## Requirements

- `REQ-001`: Offline benchmark reports quality gates before renderer-size
  comparisons.
- `REQ-002`: Graph fixtures report citation coverage for nodes and edges.
- `REQ-003`: Graphify-like `graph.json` can be loaded as eval-only input.
- `REQ-004`: Graphify-like local or absolute source paths are converted to
  portable evidence paths.
- `REQ-005`: Live smoke fails responses that omit any required exact citation
  anchor or include invalid exact anchors.
- `REQ-006`: Live smoke fails responses that violate a fixture's deterministic
  answer oracle.
- `REQ-007`: Live evaluation can run each fixture/renderer multiple times and
  reports pass rate plus variance-sensitive aggregate metrics.
