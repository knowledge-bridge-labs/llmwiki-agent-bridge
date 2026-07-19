# Runtime Prompt Projection Evaluation

This document defines the evaluation rubric for runtime prompt renderers and
graph-shaped projection candidates. The primary objective is low omission and
distortion. Token reduction is useful only after provenance and relation
quality gates pass.

## Required Rubric

| Gate | Metric | Required outcome |
| --- | --- | --- |
| Canonical evidence safety | Public artifact/API remains JSON-shaped and unchanged | No OpenAPI or artifact contract change unless a separate contract spec exists |
| Citation mapping | `citationDigest` ids map to top-level `citations` | 100% |
| Graph provenance | Every `graphNodes` and `graphEdges` entry has a valid citation index | 100% for graph fixtures |
| Portable evidence | Benchmark evidence paths do not expose local roots, parent paths, URLs, or private endpoints | 0 non-portable paths |
| Runtime citation exactness | Live responses cover every required exact `[n](#citation-n)` anchor and no invalid exact anchors | Required for live smoke pass |
| Lossy renderer isolation | Lossy projections are labeled and cannot silently become the production contract | Must be explicit candidate/eval-only |
| Reproducibility | Offline benchmark does not call provider/runtime/network | Required |

## Flexible Rubric

These metrics can evolve as fixtures improve:

- Required fact recall.
- Required relation preservation.
- Unsupported claim rate.
- Contradiction or distorted relation count.
- Source/citation proximity around claims.
- Per-fixture and per-renderer variance over repeated live runs.
- Actual model tokenizer counts when the served model tokenizer is available.

## Current Candidate Classes

| Candidate | Role | Quality note |
| --- | --- | --- |
| Compact JSON | Lossless baseline runtime renderer | Safe shape, but live smoke must prove citation behavior |
| TOON | Lossless structured codec candidate | Useful mainly when repeated row structure dominates |
| Markdown summary | Lossy prompt projection | Must be evaluated separately for omission/distortion |
| Graphify/CKG-like fixture | External graph evidence candidate | Eval-only; loaded from pre-generated `graph.json`, not a runtime dependency |

## Iteration Log

### Loop 1: Graphify/CKG-like eval fixture

- Research/analysis: Graphify can generate `graph.json` with nodes, edges,
  relation, confidence, and source location fields. `ckg-mcp` domain graphs are
  separate human-reviewed CSV DAG catalogs.
- TDD target: a temporary Graphify-like `graph.json` can be loaded into the
  runtime prompt benchmark without adding a Graphify dependency.
- Quality gates added: graph citation coverage, citation digest mapping, and
  portable source path checks.
- Retrospective: this is still mostly an evidence-shape gate. The live citation
  smoke was tightened to require full required-anchor coverage, but semantic
  answer-level omission/distortion remains the next loop.
