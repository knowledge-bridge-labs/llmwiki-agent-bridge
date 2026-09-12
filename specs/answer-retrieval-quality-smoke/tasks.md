# Tasks

- [x] Inspect the current bridge and serve local protocol surfaces.
- [x] Add a deterministic local smoke script.
- [x] Add docs for running and interpreting the smoke.
- [x] Run the new smoke against the local patched checkouts.
- [x] Run relevant existing bridge checks.
- [x] Review the diff and report quality gaps.

Validated locally with:

```sh
node scripts/answer-retrieval-quality-smoke.mjs --serve-repo ../llmwiki-serve-protocol-modernization-20260912 --timeout-ms 15000 --pretty
```

The local run passed all seven smoke cases with zero quality gaps.
