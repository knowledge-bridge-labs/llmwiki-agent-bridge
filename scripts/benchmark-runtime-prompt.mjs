#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { decode as decodeToon, encode as encodeToon } from '@toon-format/toon'

const TOKEN_ESTIMATE_DESCRIPTION = 'rough estimate only: ceil(utf8Bytes / 4); not a model tokenizer'
const DEFAULT_OFFLINE_RENDERER_IDS = ['pretty-json', 'compact-json', 'markdown-summary', 'toon']
const DEFAULT_LIVE_RENDERER_IDS = ['compact-json', 'markdown-summary', 'toon']
const DEFAULT_LIVE_TIMEOUT_MS = 120_000
const DEFAULT_LIVE_MAX_TOKENS = 384
const DEFAULT_LIVE_TEMPERATURE = 0.2
const DEFAULT_LIVE_RUNS = 1
const DEFAULT_GRAPHIFY_QUERY = 'What graph evidence should the runtime cite from the Graphify fixture?'
const LIVE_ENV = {
  baseUrl: 'LLMWIKI_AGENT_BRIDGE_BASE_URL',
  model: 'LLMWIKI_AGENT_BRIDGE_MODEL',
  apiKey: 'LLMWIKI_AGENT_BRIDGE_API_KEY',
  timeoutMs: 'LLMWIKI_AGENT_BRIDGE_EVAL_TIMEOUT_MS',
  legacyBaseUrl: 'HERMES_BASE_URL',
  legacyModel: 'HERMES_MODEL',
  legacyApiKey: 'HERMES_API_KEY',
}

const RENDERERS = [
  {
    id: 'pretty-json',
    label: 'Pretty JSON',
    mediaType: 'application/json',
    renderEvidenceBundle: (evidenceBundle) => JSON.stringify(evidenceBundle, null, 2),
  },
  {
    id: 'compact-json',
    label: 'Compact JSON',
    mediaType: 'application/json',
    renderEvidenceBundle: (evidenceBundle) => JSON.stringify(evidenceBundle),
  },
  {
    id: 'markdown-summary',
    label: 'Markdown summary projection',
    mediaType: 'text/markdown',
    renderEvidenceBundle: renderEvidenceBundleAsMarkdown,
  },
  {
    id: 'toon',
    label: 'TOON',
    mediaType: 'text/toon',
    renderEvidenceBundle: renderEvidenceBundleAsToon,
    validateRenderedEvidenceBundle: validateToonRoundTrip,
  },
  // Future renderer slots, for example ONTO-style row digests, can be added here without changing
  // the fixture builder or evaluation report shape.
]

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(helpText())
    return
  }

  const fixtureCandidates = buildEvidenceBundleFixtures()
  if (args.graphifyGraphPath) {
    fixtureCandidates.push(await buildGraphifyFixtureFromFile(args.graphifyGraphPath, args.graphifyQuery))
  }
  const fixtures = selectFixtures(fixtureCandidates, args.fixtureIds)
  const offlineRenderers = selectRenderers(args.rendererIds.length ? args.rendererIds : DEFAULT_OFFLINE_RENDERER_IDS)
  const report = buildBenchmarkReport(fixtures, offlineRenderers, args)

  if (args.live) {
    const liveRendererIds = args.rendererIds.length ? args.rendererIds : DEFAULT_LIVE_RENDERER_IDS
    const liveRenderers = selectRenderers(liveRendererIds)
    report.live = await evaluateLiveRuntime(fixtures, liveRenderers, args)
    report.validation = mergeValidation(report.validation, report.live.validation)
  } else {
    report.live = {
      enabled: false,
      note: 'Live runtime evaluation skipped. Pass --live and configure LLMWIKI_AGENT_BRIDGE_BASE_URL plus LLMWIKI_AGENT_BRIDGE_MODEL to call an OpenAI-compatible runtime.',
    }
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (args.validate && !report.validation.ok) {
    for (const failure of report.validation.failures) {
      process.stderr.write(`${failure}\n`)
    }
    process.exitCode = 1
  }
}

function parseArgs(argv) {
  const args = {
    fixtureIds: [],
    rendererIds: [],
    help: false,
    live: false,
    liveRuns: DEFAULT_LIVE_RUNS,
    maxTokens: DEFAULT_LIVE_MAX_TOKENS,
    temperature: DEFAULT_LIVE_TEMPERATURE,
    timeoutMs: parsePositiveInteger(process.env[LIVE_ENV.timeoutMs], DEFAULT_LIVE_TIMEOUT_MS),
    validate: true,
    graphifyGraphPath: '',
    graphifyQuery: DEFAULT_GRAPHIFY_QUERY,
    graphifyQueryProvided: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--live') {
      args.live = true
    } else if (arg === '--no-validate') {
      args.validate = false
    } else if (arg === '--fixture') {
      const value = argv[index + 1]
      if (!value) throw new Error('--fixture requires a fixture id or comma-separated fixture ids.')
      args.fixtureIds.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      index += 1
    } else if (arg.startsWith('--fixture=')) {
      args.fixtureIds.push(...arg.slice('--fixture='.length).split(',').map((item) => item.trim()).filter(Boolean))
    } else if (arg === '--renderer') {
      const value = argv[index + 1]
      if (!value) throw new Error('--renderer requires a renderer id or comma-separated renderer ids.')
      args.rendererIds.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      index += 1
    } else if (arg.startsWith('--renderer=')) {
      args.rendererIds.push(...arg.slice('--renderer='.length).split(',').map((item) => item.trim()).filter(Boolean))
    } else if (arg === '--graphify-graph') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--graphify-graph requires a path to graphify-out/graph.json.')
      args.graphifyGraphPath = value
      index += 1
    } else if (arg.startsWith('--graphify-graph=')) {
      const value = arg.slice('--graphify-graph='.length)
      if (!value) throw new Error('--graphify-graph requires a path to graphify-out/graph.json.')
      args.graphifyGraphPath = value
    } else if (arg === '--graphify-query') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--graphify-query requires a query string.')
      args.graphifyQuery = value
      args.graphifyQueryProvided = true
      index += 1
    } else if (arg.startsWith('--graphify-query=')) {
      const value = arg.slice('--graphify-query='.length)
      if (!value) throw new Error('--graphify-query requires a query string.')
      args.graphifyQuery = value
      args.graphifyQueryProvided = true
    } else if (arg === '--timeout-ms') {
      const value = argv[index + 1]
      if (!value) throw new Error('--timeout-ms requires a positive integer.')
      args.timeoutMs = parsePositiveInteger(value, null, '--timeout-ms')
      index += 1
    } else if (arg.startsWith('--timeout-ms=')) {
      args.timeoutMs = parsePositiveInteger(arg.slice('--timeout-ms='.length), null, '--timeout-ms')
    } else if (arg === '--live-runs') {
      const value = argv[index + 1]
      if (!value) throw new Error('--live-runs requires a positive integer.')
      args.liveRuns = parsePositiveInteger(value, null, '--live-runs')
      index += 1
    } else if (arg.startsWith('--live-runs=')) {
      args.liveRuns = parsePositiveInteger(arg.slice('--live-runs='.length), null, '--live-runs')
    } else if (arg === '--max-tokens') {
      const value = argv[index + 1]
      if (!value) throw new Error('--max-tokens requires a positive integer.')
      args.maxTokens = parsePositiveInteger(value, null, '--max-tokens')
      index += 1
    } else if (arg.startsWith('--max-tokens=')) {
      args.maxTokens = parsePositiveInteger(arg.slice('--max-tokens='.length), null, '--max-tokens')
    } else if (arg === '--temperature') {
      const value = argv[index + 1]
      if (!value) throw new Error('--temperature requires a number between 0 and 2.')
      args.temperature = parseTemperature(value)
      index += 1
    } else if (arg.startsWith('--temperature=')) {
      args.temperature = parseTemperature(arg.slice('--temperature='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (args.graphifyQueryProvided && !args.graphifyGraphPath) {
    throw new Error('--graphify-query requires --graphify-graph.')
  }
  delete args.graphifyQueryProvided

  return args
}

function helpText() {
  return [
    'Usage: node scripts/benchmark-runtime-prompt.mjs [--fixture single-source,multi-source] [--renderer compact-json,markdown-summary,toon] [--graphify-graph graphify-out/graph.json] [--graphify-query "..."] [--live] [--live-runs N] [--no-validate]',
    '',
    'Builds local synthetic LLMWiki runtime evidence bundles and compares prompt',
    'renderers. Offline mode is the default and performs no provider, network, or',
    'runtime calls. Live mode calls an OpenAI-compatible /chat/completions endpoint',
    'only when --live is passed and the required environment variables are set.',
    '',
    'Renderers:',
    `  ${RENDERERS.map((renderer) => renderer.id).join(', ')}`,
    '',
    'Graphify options:',
    '  --graphify-graph <path>  Add one eval-only fixture from a pre-generated Graphify-like graph.json. This benchmark does not install, import, or call Graphify.',
    `  --graphify-query <query> Query used for the Graphify fixture. Default: ${DEFAULT_GRAPHIFY_QUERY}`,
    '',
    'Live environment variables:',
    `  ${LIVE_ENV.baseUrl}=https://runtime.example/v1`,
    `  ${LIVE_ENV.model}=model-name`,
    `  ${LIVE_ENV.apiKey}=optional-api-key`,
    `  ${LIVE_ENV.timeoutMs}=optional-timeout-ms`,
    '',
    `Legacy aliases are also accepted: ${LIVE_ENV.legacyBaseUrl}, ${LIVE_ENV.legacyModel}, ${LIVE_ENV.legacyApiKey}`,
    '',
    'Live options:',
    '  --live-runs <n>      Repeat each live fixture/renderer run. Default: 1.',
    '  --timeout-ms <ms>      Request timeout. Default: 120000.',
    '  --max-tokens <n>       Chat completions max_tokens. Default: 384.',
    '  --temperature <0..2>   Chat completions temperature. Default: 0.2.',
    '',
  ].join('\n')
}

function selectRenderers(rendererIds) {
  const rendererById = new Map(RENDERERS.map((renderer) => [renderer.id, renderer]))
  return rendererIds.map((rendererId) => {
    const renderer = rendererById.get(rendererId)
    if (!renderer) {
      throw new Error(`Unknown renderer "${rendererId}". Available renderers: ${RENDERERS.map(({ id }) => id).join(', ')}`)
    }
    return renderer
  })
}

function selectFixtures(fixtures, fixtureIds) {
  if (!fixtureIds.length) return fixtures

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]))
  const selected = fixtureIds.map((fixtureId) => {
    const fixture = fixtureById.get(fixtureId)
    if (!fixture) {
      throw new Error(`Unknown fixture "${fixtureId}". Available fixtures: ${fixtures.map(({ id }) => id).join(', ')}`)
    }
    return fixture
  })
  return selected
}

function buildBenchmarkReport(fixtures, renderers, args) {
  const fixtureReports = fixtures.map((fixture) => benchmarkFixture(fixture, renderers))
  const totals = sumFixtureReports(fixtureReports, renderers)
  const validation = validateFixtureReports(fixtureReports)

  return {
    schema: 'llmwiki-agent-bridge.runtime-prompt-evaluation.v1',
    mode: args.live ? 'offline+live' : 'offline',
    rendererBaseline: 'pretty-json',
    rendererCandidates: ['compact-json', 'markdown-summary', 'toon'],
    rendererDebug: ['pretty-json'],
    renderers: renderers.map(({ id, label, mediaType }) => ({ id, label, mediaType })),
    tokenEstimate: TOKEN_ESTIMATE_DESCRIPTION,
    note: 'Synthetic local fixtures only. Offline measurements never use provider credentials, network, or runtime calls. markdown-summary is a lossy prompt projection; compare it separately from lossless JSON/TOON codecs.',
    fixtures: fixtureReports,
    totals,
    validation,
  }
}

function benchmarkFixture(fixture, renderers) {
  const rendererReports = Object.fromEntries(renderers.map((renderer) => {
    const baseReport = {
      label: renderer.label,
      mediaType: renderer.mediaType,
    }

    let evidenceJson
    try {
      evidenceJson = renderer.renderEvidenceBundle(fixture.evidenceBundle)
    } catch (error) {
      return [
        renderer.id,
        {
          ...baseReport,
          validation: {
            ok: false,
            failures: [`render failed: ${redactForReport(error?.message || String(error))}`],
          },
        },
      ]
    }

    const runtimeUserPrompt = renderRuntimeUserPrompt(fixture.query, evidenceJson)
    const rendererValidation = renderer.validateRenderedEvidenceBundle
      ? renderer.validateRenderedEvidenceBundle(fixture.evidenceBundle, evidenceJson)
      : { ok: true, failures: [] }

    return [
      renderer.id,
      {
        ...baseReport,
        evidenceJson: measureText(evidenceJson),
        runtimeUserPrompt: measureText(runtimeUserPrompt),
        validation: rendererValidation,
      },
    ]
  }))
  const quality = evaluateEvidenceBundleQuality(fixture.evidenceBundle)

  return {
    id: fixture.id,
    description: fixture.description,
    sourceCount: fixture.evidenceBundle.sources.length,
    citationCount: fixture.evidenceBundle.citations.length,
    sourceFailureCount: fixture.evidenceBundle.sourceFailures.length,
    sourceSummaryCount: Array.isArray(fixture.evidenceBundle.sourceSummaries)
      ? fixture.evidenceBundle.sourceSummaries.length
      : 0,
    graphNodeCount: Array.isArray(fixture.evidenceBundle.graphNodes)
      ? fixture.evidenceBundle.graphNodes.length
      : 0,
    graphEdgeCount: Array.isArray(fixture.evidenceBundle.graphEdges)
      ? fixture.evidenceBundle.graphEdges.length
      : 0,
    graphNeighborhoodCount: Array.isArray(fixture.evidenceBundle.graphNeighborhood)
      ? fixture.evidenceBundle.graphNeighborhood.length
      : 0,
    mergedGraphSummary: fixture.evidenceBundle.mergedGraphSummary,
    mergedCorpusSummary: {
      sourceCount: fixture.evidenceBundle.mergedCorpusSummary.sourceCount,
      pageCount: fixture.evidenceBundle.mergedCorpusSummary.pageCount,
      approvedPageCount: fixture.evidenceBundle.mergedCorpusSummary.approvedPageCount,
    },
    quality,
    renderers: rendererReports,
    comparisons: buildComparisons(rendererReports),
  }
}

function renderRuntimeUserPrompt(query, renderedEvidenceBundle) {
  return [
    '# User question',
    query,
    '',
    '# LLMWiki evidence bundle',
    renderedEvidenceBundle,
  ].join('\n')
}

function measureText(text) {
  const utf8Bytes = Buffer.byteLength(text, 'utf8')
  return {
    utf8Bytes,
    chars: Array.from(text).length,
    estimatedTokens: Math.ceil(utf8Bytes / 4),
  }
}

function buildComparisons(rendererReports) {
  const comparisons = {}
  addComparison(comparisons, rendererReports, 'pretty-json', 'compact-json', 'compactVsPrettyEvidenceJson', 'evidenceJson')
  addComparison(comparisons, rendererReports, 'pretty-json', 'compact-json', 'compactVsPrettyRuntimeUserPrompt', 'runtimeUserPrompt')
  addComparison(comparisons, rendererReports, 'compact-json', 'markdown-summary', 'markdownSummaryVsCompactEvidence', 'evidenceJson')
  addComparison(comparisons, rendererReports, 'compact-json', 'markdown-summary', 'markdownSummaryVsCompactRuntimeUserPrompt', 'runtimeUserPrompt')
  addComparison(comparisons, rendererReports, 'compact-json', 'toon', 'toonVsCompactEvidence', 'evidenceJson')
  addComparison(comparisons, rendererReports, 'compact-json', 'toon', 'toonVsCompactRuntimeUserPrompt', 'runtimeUserPrompt')
  addComparison(comparisons, rendererReports, 'markdown-summary', 'toon', 'toonVsMarkdownSummaryEvidence', 'evidenceJson')
  addComparison(comparisons, rendererReports, 'markdown-summary', 'toon', 'toonVsMarkdownSummaryRuntimeUserPrompt', 'runtimeUserPrompt')
  return comparisons
}

function addComparison(comparisons, rendererReports, baselineId, candidateId, name, section) {
  if (!rendererReports[baselineId]?.[section] || !rendererReports[candidateId]?.[section]) return
  comparisons[name] = compareMeasurements(
    rendererReports[baselineId][section],
    rendererReports[candidateId][section],
    baselineId,
    candidateId,
  )
}

function compareMeasurements(baseline, candidate, baselineId = 'pretty-json', candidateId = 'compact-json') {
  const utf8BytesSaved = baseline.utf8Bytes - candidate.utf8Bytes
  const charsSaved = baseline.chars - candidate.chars
  const estimatedTokensSaved = baseline.estimatedTokens - candidate.estimatedTokens

  return {
    baseline: baselineId,
    candidate: candidateId,
    utf8BytesSaved,
    charsSaved,
    estimatedTokensSaved,
    utf8BytesReductionPct: percentSaved(utf8BytesSaved, baseline.utf8Bytes),
    charsReductionPct: percentSaved(charsSaved, baseline.chars),
    estimatedTokensReductionPct: percentSaved(estimatedTokensSaved, baseline.estimatedTokens),
  }
}

function percentSaved(saved, baseline) {
  if (!baseline) return 0
  return Number(((saved / baseline) * 100).toFixed(2))
}

function sumFixtureReports(fixtureReports, renderers) {
  const totals = {
    fixtureCount: fixtureReports.length,
    renderers: {},
  }

  for (const renderer of renderers) {
    const rendererFixtureReports = fixtureReports.map((fixture) => fixture.renderers[renderer.id]).filter(Boolean)
    const evidenceMeasurements = rendererFixtureReports.map((fixture) => fixture.evidenceJson).filter(Boolean)
    const promptMeasurements = rendererFixtureReports.map((fixture) => fixture.runtimeUserPrompt).filter(Boolean)
    totals.renderers[renderer.id] = {
      fixtureCount: rendererFixtureReports.length,
      measuredFixtureCount: Math.min(evidenceMeasurements.length, promptMeasurements.length),
      failedFixtureCount: rendererFixtureReports.filter((fixture) => fixture.validation && !fixture.validation.ok).length,
      evidenceJson: evidenceMeasurements.length === fixtureReports.length ? sumMeasurements(evidenceMeasurements) : null,
      runtimeUserPrompt: promptMeasurements.length === fixtureReports.length ? sumMeasurements(promptMeasurements) : null,
    }
  }

  totals.comparisons = buildComparisons(totals.renderers)

  return totals
}

function sumMeasurements(measurements) {
  return measurements.reduce((total, measurement) => ({
    utf8Bytes: total.utf8Bytes + measurement.utf8Bytes,
    chars: total.chars + measurement.chars,
    estimatedTokens: total.estimatedTokens + measurement.estimatedTokens,
  }), {
    utf8Bytes: 0,
    chars: 0,
    estimatedTokens: 0,
  })
}

function validateFixtureReports(fixtureReports) {
  const failures = []

  for (const fixture of fixtureReports) {
    if (fixture.quality && !fixture.quality.ok) {
      failures.push(...fixture.quality.failures.map((failure) => `${fixture.id}: ${failure}`))
    }
    if (fixture.renderers['pretty-json'] && fixture.renderers['compact-json']) {
      assertCandidateSmaller(failures, fixture, 'compact-json', 'pretty-json', 'evidenceJson')
      assertCandidateSmaller(failures, fixture, 'compact-json', 'pretty-json', 'runtimeUserPrompt')
    }
    if (fixture.renderers['markdown-summary']) {
      assertRendererNonEmpty(failures, fixture, 'markdown-summary', 'evidenceJson')
      assertRendererNonEmpty(failures, fixture, 'markdown-summary', 'runtimeUserPrompt')
    }
    if (fixture.renderers.toon) {
      assertRendererNonEmpty(failures, fixture, 'toon', 'evidenceJson')
      assertRendererNonEmpty(failures, fixture, 'toon', 'runtimeUserPrompt')
      if (!fixture.renderers.toon.validation.ok) {
        failures.push(...fixture.renderers.toon.validation.failures.map((failure) => `${fixture.id}: toon ${failure}`))
      }
    }
  }

  return {
    ok: failures.length === 0,
    checks: [
      'evidence quality gates preserve citation/source mappings before renderer size comparisons',
      'compact-json evidenceJson/runtimeUserPrompt utf8Bytes are smaller than pretty-json when both renderers are selected',
      'markdown-summary evidenceJson/runtimeUserPrompt outputs are non-empty when markdown-summary is selected',
      'toon evidenceJson/runtimeUserPrompt outputs are non-empty and losslessly decode when toon is selected',
    ],
    failures,
  }
}

function evaluateEvidenceBundleQuality(evidenceBundle) {
  const citations = Array.isArray(evidenceBundle?.citations) ? evidenceBundle.citations : []
  const citationDigest = Array.isArray(evidenceBundle?.citationDigest) ? evidenceBundle.citationDigest : []
  const graphNodes = Array.isArray(evidenceBundle?.graphNodes) ? evidenceBundle.graphNodes : []
  const graphEdges = Array.isArray(evidenceBundle?.graphEdges) ? evidenceBundle.graphEdges : []
  const citationIds = new Set(citations.map((citation) => citation.id).filter(Boolean))
  const failures = []
  const missingDigestCitationIds = citationDigest
    .map((citation) => citation.id)
    .filter((id) => id && !citationIds.has(id))

  if (missingDigestCitationIds.length) {
    failures.push(`citationDigest ids must exist in citations: ${missingDigestCitationIds.slice(0, 5).join(', ')}`)
  }

  const graphNodeCitationCoverage = citationReferenceCoverage(graphNodes, citations.length)
  const graphEdgeCitationCoverage = citationReferenceCoverage(graphEdges, citations.length)
  if (graphNodeCitationCoverage.missingCount) {
    failures.push(`graphNodes must have valid citation indexes (${graphNodeCitationCoverage.missingCount} missing or invalid)`)
  }
  if (graphEdgeCitationCoverage.missingCount) {
    failures.push(`graphEdges must have valid citation indexes (${graphEdgeCitationCoverage.missingCount} missing or invalid)`)
  }

  const nonPortableSourcePaths = evidenceSourcePaths(evidenceBundle).filter((sourcePath) => !isPortableSourcePath(sourcePath))
  if (nonPortableSourcePaths.length) {
    failures.push(`evidence source paths must be portable (${nonPortableSourcePaths.length} non-portable path-like values)`)
  }

  return {
    ok: failures.length === 0,
    rubric: {
      primaryGoal: 'minimize omission and distortion before token savings',
      requiredGates: [
        'citationDigest entries map to top-level citations',
        'graph nodes and edges carry valid citation indexes when graph evidence is present',
        'source paths in benchmark evidence are portable and must not expose local roots',
        'lossy renderers remain explicit candidates, not default production contracts',
      ],
    },
    metrics: {
      citationCount: citations.length,
      citationDigestCount: citationDigest.length,
      missingDigestCitationIdCount: missingDigestCitationIds.length,
      graphNodeCount: graphNodes.length,
      graphEdgeCount: graphEdges.length,
      graphNodeCitationCoveragePct: graphNodeCitationCoverage.coveragePct,
      graphEdgeCitationCoveragePct: graphEdgeCitationCoverage.coveragePct,
      nonPortableSourcePathCount: nonPortableSourcePaths.length,
    },
    failures,
  }
}

function citationReferenceCoverage(items, citationCount) {
  if (!items.length) return { totalCount: 0, coveredCount: 0, missingCount: 0, coveragePct: 100 }
  let coveredCount = 0
  for (const item of items) {
    const citationIndex = Number(item?.citationIndex ?? item?.citationIdx)
    if (Number.isInteger(citationIndex) && citationIndex >= 1 && citationIndex <= citationCount) {
      coveredCount += 1
    }
  }
  const missingCount = items.length - coveredCount
  return {
    totalCount: items.length,
    coveredCount,
    missingCount,
    coveragePct: Number(((coveredCount / items.length) * 100).toFixed(2)),
  }
}

function evidenceSourcePaths(evidenceBundle) {
  const values = []
  for (const citation of Array.isArray(evidenceBundle?.citations) ? evidenceBundle.citations : []) {
    values.push(citation.path, citation.sourceFile)
  }
  for (const citation of Array.isArray(evidenceBundle?.citationDigest) ? evidenceBundle.citationDigest : []) {
    values.push(citation.path, citation.sourceFile)
  }
  for (const node of Array.isArray(evidenceBundle?.graphNodes) ? evidenceBundle.graphNodes : []) {
    values.push(node.sourceFile, node.path)
  }
  for (const edge of Array.isArray(evidenceBundle?.graphEdges) ? evidenceBundle.graphEdges : []) {
    values.push(edge.sourceFile, edge.path)
  }
  return values.filter((value) => typeof value === 'string' && value.trim())
}

function isPortableSourcePath(value) {
  const text = value.replace(/\\/g, '/').trim()
  if (!text) return true
  if (/^[a-zA-Z]:\//.test(text)) return false
  if (text.startsWith('/') || text.startsWith('//') || text.startsWith('~')) return false
  if (text.split('/').includes('..')) return false
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false
  return true
}

function assertCandidateSmaller(failures, fixture, candidateId, baselineId, section) {
  if (!fixture.renderers[baselineId]?.[section] || !fixture.renderers[candidateId]?.[section]) {
    failures.push(`${fixture.id}: ${candidateId} and ${baselineId} ${section} measurements must both exist`)
    return
  }
  const baselineBytes = fixture.renderers[baselineId][section].utf8Bytes
  const candidateBytes = fixture.renderers[candidateId][section].utf8Bytes
  if (candidateBytes >= baselineBytes) {
    failures.push(
      `${fixture.id}: ${candidateId} ${section} must be smaller than ${baselineId} (${candidateBytes} >= ${baselineBytes})`,
    )
  }
}

function assertRendererNonEmpty(failures, fixture, rendererId, section) {
  if (!fixture.renderers[rendererId]?.[section]) {
    failures.push(`${fixture.id}: ${rendererId} ${section} measurement must exist`)
    return
  }
  if (fixture.renderers[rendererId][section].utf8Bytes <= 0) {
    failures.push(`${fixture.id}: ${rendererId} ${section} must not be empty`)
  }
}

function parsePositiveInteger(value, fallback, label = 'value') {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return number
}

function parseTemperature(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 2) {
    throw new Error('--temperature must be a number between 0 and 2.')
  }
  return number
}

function renderEvidenceBundleAsMarkdown(evidenceBundle) {
  return [
    `schema: ${evidenceBundle.schema}`,
    '',
    '## Runtime contract',
    `- citations: ${evidenceBundle.runtimeContract.citations}`,
    `- graph: ${evidenceBundle.runtimeContract.graph}`,
    '',
    '## Citation digest',
    markdownTable(
      ['idx', 'id', 'title', 'path', 'snippet'],
      evidenceBundle.citationDigest.map((citation) => [
        citationAnchor(citationIndex(evidenceBundle.citations, citation.id)),
        citation.id,
        citation.title,
        citation.path || '',
        citation.snippet || '',
      ]),
    ),
    '',
    '## Citations',
    markdownTable(
      ['idx', 'id', 'sourceId', 'title', 'path', 'snippet'],
      evidenceBundle.citations.map((citation, index) => [
        citationAnchor(index + 1),
        citation.id,
        citation.sourceId || '',
        citation.title || '',
        citation.path || '',
        citation.snippet || '',
      ]),
    ),
    '',
    '## Sources',
    markdownTable(
      ['id', 'name', 'protocol', 'citationIndexes', 'citationCount', 'limitations', 'graph'],
      evidenceBundle.sources.map((source) => [
        source.id,
        source.name,
        source.protocol,
        source.citationIndexes.map(citationAnchor).join(' '),
        source.citationCount,
        source.limitations.join('; '),
        `${source.graph.nodeCount} nodes / ${source.graph.edgeCount} edges`,
      ]),
    ),
    '',
    ...(Array.isArray(evidenceBundle.sourceSummaries) && evidenceBundle.sourceSummaries.length
      ? [
        '## Source summaries',
        markdownTable(
          ['id', 'protocol', 'pageCount', 'approvedPageCount', 'citationCount', 'graphNodes', 'graphEdges', 'note'],
          evidenceBundle.sourceSummaries.map((source) => [
            source.id,
            source.protocol,
            source.pageCount,
            source.approvedPageCount,
            source.citationCount,
            source.graphNodeCount,
            source.graphEdgeCount,
            source.note || '',
          ]),
        ),
        '',
      ]
      : []),
    '## Source failures',
    evidenceBundle.sourceFailures.length
      ? markdownTable(
        ['id', 'name', 'protocol', 'error', 'message', 'remediation'],
        evidenceBundle.sourceFailures.map((failure) => [
          failure.id,
          failure.name,
          failure.protocol,
          failure.error,
          failure.message || '',
          failure.remediation || '',
        ]),
      )
      : '- none',
    '',
    ...(Array.isArray(evidenceBundle.graphEdges) && evidenceBundle.graphEdges.length
      ? [
        '## Graph edges',
        markdownTable(
          ['from', 'relation', 'to', 'citationIdx', 'sourceId', 'weight', 'confidence', 'context'],
          evidenceBundle.graphEdges.map((edge) => [
            edge.from,
            edge.relation,
            edge.to,
            edge.citationIndex ?? edge.citationIdx ?? '',
            edge.sourceId ?? '',
            edge.weight ?? '',
            edge.confidence ?? edge.confidenceScore ?? '',
            edge.context ?? '',
          ]),
        ),
        '',
      ]
      : []),
    ...(Array.isArray(evidenceBundle.graphNodes) && evidenceBundle.graphNodes.length
      ? [
        '## Graph nodes',
        markdownTable(
          ['id', 'label', 'kind', 'sourceId', 'citationIdx'],
          evidenceBundle.graphNodes.map((node) => [
            node.id,
            node.label,
            node.kind,
            node.sourceId ?? '',
            node.citationIdx ?? '',
          ]),
        ),
        '',
      ]
      : []),
    ...(Array.isArray(evidenceBundle.graphNeighborhood) && evidenceBundle.graphNeighborhood.length
      ? [
        '## Graph neighborhood',
        markdownTable(
          ['focus', 'neighbor', 'direction', 'relation', 'hops', 'citationIdx', 'sourceId', 'metadata'],
          evidenceBundle.graphNeighborhood.map((neighbor) => [
            neighbor.focus,
            neighbor.neighbor,
            neighbor.direction,
            neighbor.relation,
            neighbor.hops,
            neighbor.citationIndex ?? neighbor.citationIdx ?? '',
            neighbor.sourceId ?? '',
            neighbor.metadata || '',
          ]),
        ),
        '',
      ]
      : []),
    '## Merged graph summary',
    `- nodes: ${evidenceBundle.mergedGraphSummary.nodeCount}`,
    `- edges: ${evidenceBundle.mergedGraphSummary.edgeCount}`,
    `- corpus pages: ${evidenceBundle.mergedGraphSummary.corpusPageCount}`,
    `- approved corpus pages: ${evidenceBundle.mergedGraphSummary.corpusApprovedPageCount}`,
    '',
    '## Merged corpus summary',
    `- sources: ${evidenceBundle.mergedCorpusSummary.sourceCount}`,
    `- pages: ${evidenceBundle.mergedCorpusSummary.pageCount}`,
    `- approved pages: ${evidenceBundle.mergedCorpusSummary.approvedPageCount}`,
    '',
    `citationCount: ${evidenceBundle.citationCount}`,
  ].join('\n')
}

function renderEvidenceBundleAsToon(evidenceBundle) {
  return encodeToon(evidenceBundle)
}

function validateToonRoundTrip(evidenceBundle, renderedEvidenceBundle) {
  try {
    const decoded = decodeToon(renderedEvidenceBundle)
    const originalJson = JSON.stringify(evidenceBundle)
    const decodedJson = JSON.stringify(decoded)
    if (decodedJson !== originalJson) {
      return {
        ok: false,
        failures: ['round-trip JSON mismatch'],
      }
    }
    return { ok: true, failures: [] }
  } catch (error) {
    return {
      ok: false,
      failures: [`decode failed: ${redactForReport(error?.message || String(error))}`],
    }
  }
}

function citationIndex(citations, citationId) {
  const index = citations.findIndex((citation) => citation.id === citationId)
  return index >= 0 ? index + 1 : ''
}

function citationAnchor(index) {
  return index ? `[${index}](#citation-${index})` : ''
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`),
  ].join('\n')
}

function markdownCell(value) {
  const text = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
  return text
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

async function evaluateLiveRuntime(fixtures, renderers, args) {
  const config = liveRuntimeConfig(args)
  const baseReport = {
    enabled: true,
    configured: config.ok,
    renderers: renderers.map(({ id, label, mediaType }) => ({ id, label, mediaType })),
    runtime: {
      baseUrlConfigured: Boolean(config.baseUrl),
      modelConfigured: Boolean(config.model),
      apiKeyConfigured: Boolean(config.apiKey),
      timeoutMs: args.timeoutMs,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      liveRuns: args.liveRuns,
      endpointRedacted: true,
    },
    runCount: args.liveRuns,
  }

  if (!config.ok) {
    const failures = config.missing.map((name) => `live: missing required environment variable ${name}`)
    return {
      ...baseReport,
      status: 'not-configured',
      fixtures: [],
      totals: {
        fixtureCount: fixtures.length,
        requestCount: 0,
      },
      validation: {
        ok: false,
        checks: ['live runtime requires explicit --live plus configured base URL and model'],
        failures,
      },
    }
  }

  const fixtureReports = []
  for (const fixture of fixtures) {
    const rendererReports = {}
    for (const renderer of renderers) {
      rendererReports[renderer.id] = await evaluateLiveRenderer({
        args,
        config,
        fixture,
        renderer,
      })
    }
    fixtureReports.push({
      id: fixture.id,
      citationCount: fixture.evidenceBundle.citationCount,
      renderers: rendererReports,
    })
  }

  const validation = validateLiveFixtureReports(fixtureReports)
  return {
    ...baseReport,
    status: validation.ok ? 'ok' : 'failed',
    fixtures: fixtureReports,
    totals: summarizeLiveFixtureReports(fixtureReports, renderers),
    validation,
  }
}

function liveRuntimeConfig(args) {
  const baseUrl = stringEnv(LIVE_ENV.baseUrl) || stringEnv(LIVE_ENV.legacyBaseUrl)
  const model = stringEnv(LIVE_ENV.model) || stringEnv(LIVE_ENV.legacyModel)
  const apiKey = process.env[LIVE_ENV.apiKey] || process.env[LIVE_ENV.legacyApiKey] || ''
  const missing = []
  if (!baseUrl) missing.push(`${LIVE_ENV.baseUrl} or ${LIVE_ENV.legacyBaseUrl}`)
  if (!model) missing.push(`${LIVE_ENV.model} or ${LIVE_ENV.legacyModel}`)

  if (missing.length) return { ok: false, missing }

  try {
    return {
      ok: true,
      missing,
      baseUrl,
      model,
      apiKey,
      timeoutMs: args.timeoutMs,
      chatCompletionsUrl: chatCompletionsUrl(baseUrl),
    }
  } catch {
    return {
      ok: false,
      missing: [`${LIVE_ENV.baseUrl} must be an absolute URL`],
    }
  }
}

function stringEnv(name) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

async function evaluateLiveRenderer({ args, config, fixture, renderer }) {
  const renderedEvidenceBundle = renderer.renderEvidenceBundle(fixture.evidenceBundle)
  const runtimeUserPrompt = renderRuntimeUserPrompt(fixture.query, renderedEvidenceBundle)
  const prompt = measureText(runtimeUserPrompt)
  const runs = []

  for (let runIndex = 1; runIndex <= args.liveRuns; runIndex += 1) {
    runs.push(await evaluateLiveRendererRun({
      args,
      config,
      fixture,
      runtimeUserPrompt,
      runIndex,
    }))
  }

  const aggregate = summarizeLiveRendererRuns(runs)
  const representativeRun = chooseRepresentativeLiveRun(runs)
  const { runIndex: representativeRunIndex = null, ...representativeReport } = representativeRun

  return {
    ...representativeReport,
    status: aggregate.status,
    prompt,
    latencyMs: aggregate.latencyMs.average,
    outputTextLength: aggregate.outputTextLength.average,
    averageUsage: aggregate.usage.average,
    runCount: aggregate.runCount,
    passCount: aggregate.passCount,
    passRatePct: aggregate.passRatePct,
    averageRequiredCitationAnchorCoveragePct: aggregate.averageRequiredCitationAnchorCoveragePct,
    averageAnswerOracleRequiredTermCoveragePct: aggregate.averageAnswerOracleRequiredTermCoveragePct,
    averageAnswerOracleRequiredRelationCoveragePct: aggregate.averageAnswerOracleRequiredRelationCoveragePct,
    averageExpectedCitationMappingCoveragePct: aggregate.averageExpectedCitationMappingCoveragePct,
    representativeRunIndex,
    pass: aggregate.runCount > 0 && aggregate.passCount === aggregate.runCount,
    invalidCitationAnchorCount: aggregate.invalidCitationAnchorCount,
    allRequiredCitationAnchorsCovered: aggregate.runCount > 0
      && aggregate.allRequiredCitationAnchorsCoveredCount === aggregate.runCount,
    aggregate,
    runs,
  }
}

async function evaluateLiveRendererRun({ args, config, fixture, runtimeUserPrompt, runIndex }) {
  const started = performance.now()
  const citationMappingGate = expectedCitationMappingsGate(fixture.answerOracle)
  try {
    const response = await callChatCompletions({
      config,
      messages: liveRuntimeMessages(runtimeUserPrompt),
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs,
    })
    const latencyMs = Math.round(performance.now() - started)

    if (!response.ok) {
      return withLiveRunFailureBuckets({
        runIndex,
        status: response.status,
        httpStatus: response.httpStatus,
        finishReason: null,
        truncation: analyzeOutputTruncation({ finishReason: null, usage: undefined, maxTokens: args.maxTokens }),
        truncated: false,
        latencyMs,
        outputTextLength: 0,
        citationAnchorsFound: [],
        requiredCitationAnchors: citationCoverage([], fixture.evidenceBundle.citationCount),
        expectedCitationMappings: evaluateExpectedCitationMappings(
          '',
          fixture.answerOracle?.expectedCitationMappings,
          fixture.evidenceBundle,
          citationMappingGate,
        ),
        pass: false,
        allRequiredCitationAnchorsCovered: false,
        error: response.error,
      })
    }

    const outputText = extractChatCompletionText(response.payload)
    const finishReason = extractChatCompletionFinishReason(response.payload)
    const usage = summarizeUsage(response.payload?.usage)
    const truncation = analyzeOutputTruncation({ finishReason, usage, maxTokens: args.maxTokens })
    const truncated = truncation.detected
    const citationAnchors = analyzeCitationAnchors(outputText, fixture.evidenceBundle.citationCount)
    const answerOracle = evaluateAnswerOracle(outputText, fixture.answerOracle)
    const expectedCitationMappings = evaluateExpectedCitationMappings(
      outputText,
      fixture.answerOracle?.expectedCitationMappings,
      fixture.evidenceBundle,
      citationMappingGate,
      citationAnchors.found,
    )

    return withLiveRunFailureBuckets({
      runIndex,
      status: 'ok',
      httpStatus: response.httpStatus,
      finishReason,
      truncation,
      truncated,
      latencyMs,
      outputTextLength: Array.from(outputText).length,
      citationAnchorsFound: citationAnchors.found,
      requiredCitationAnchors: citationAnchors.coverage,
      answerOracle,
      expectedCitationMappings,
      pass: citationAnchors.coverage.coveredCount === citationAnchors.coverage.requiredCount
        && citationAnchors.invalidCount === 0
        && !truncated
        && (answerOracle.gate === 'report-only' || answerOracle.ok)
        && (expectedCitationMappings.gate === 'report-only' || expectedCitationMappings.ok),
      invalidCitationAnchorCount: citationAnchors.invalidCount,
      allRequiredCitationAnchorsCovered: citationAnchors.coverage.coveredCount === citationAnchors.coverage.requiredCount,
      usage,
    })
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started)
    return withLiveRunFailureBuckets({
      runIndex,
      status: 'error',
      httpStatus: null,
      finishReason: null,
      truncation: analyzeOutputTruncation({ finishReason: null, usage: undefined, maxTokens: args.maxTokens }),
      truncated: false,
      latencyMs,
      outputTextLength: 0,
      citationAnchorsFound: [],
      requiredCitationAnchors: citationCoverage([], fixture.evidenceBundle.citationCount),
      expectedCitationMappings: evaluateExpectedCitationMappings(
        '',
        fixture.answerOracle?.expectedCitationMappings,
        fixture.evidenceBundle,
        citationMappingGate,
      ),
      pass: false,
      allRequiredCitationAnchorsCovered: false,
      error: redactForReport(error?.message || String(error), config),
    })
  }
}

function withLiveRunFailureBuckets(result) {
  return {
    ...result,
    failureBuckets: classifyLiveRunFailureBuckets(result),
    failureCodes: classifyLiveRunFailureCodes(result),
  }
}

function analyzeOutputTruncation({ finishReason, usage, maxTokens }) {
  const completionTokens = usage?.completionTokens
  const normalizedFinishReason = typeof finishReason === 'string' && finishReason.trim()
    ? finishReason.trim()
    : null
  const normalizedMaxTokens = Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : null

  if (normalizedFinishReason === 'length') {
    return {
      detected: true,
      inferred: false,
      reason: 'finish_reason_length',
      finishReason: normalizedFinishReason,
      completionTokens: Number.isFinite(completionTokens) ? completionTokens : null,
      maxTokens: normalizedMaxTokens,
    }
  }

  if (!normalizedFinishReason
    && Number.isFinite(completionTokens)
    && normalizedMaxTokens
    && completionTokens >= normalizedMaxTokens
  ) {
    return {
      detected: true,
      inferred: true,
      reason: 'completion_tokens_reached_max_tokens',
      finishReason: null,
      completionTokens,
      maxTokens: normalizedMaxTokens,
    }
  }

  return {
    detected: false,
    inferred: false,
    reason: null,
    finishReason: normalizedFinishReason,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : null,
    maxTokens: normalizedMaxTokens,
  }
}

function classifyLiveRunFailureBuckets(result) {
  const buckets = []
  if (result.status !== 'ok') buckets.push('runtime-error')
  if (result.truncation?.detected || result.truncated) buckets.push('truncated')
  if (result.invalidCitationAnchorCount > 0) buckets.push('invalid-citation-anchor')
  if (result.requiredCitationAnchors?.missing?.length) buckets.push('missing-required-citation-anchor')
  if (result.answerOracle?.enabled && result.answerOracle.gate !== 'report-only' && !result.answerOracle.ok) {
    const metrics = result.answerOracle.metrics || {}
    if (
      metrics.missingRequiredTermCount > 0
      || metrics.missingRequiredPhraseCount > 0
      || metrics.missingRequiredRelationCount > 0
    ) {
      buckets.push('answer-oracle-omission')
    }
    if (metrics.distortionCount > 0) buckets.push('answer-oracle-distortion')
    if (metrics.unsupportedClaimHitCount > 0) buckets.push('answer-oracle-unsupported')
    if (metrics.contradictoryClaimHitCount > 0) buckets.push('answer-oracle-contradiction')
  }
  if (result.status === 'ok' && result.expectedCitationMappings?.enabled && !result.expectedCitationMappings.ok) {
    const metrics = result.expectedCitationMappings.metrics || {}
    if (strictExpectedCitationMappingMetric(metrics, 'targetResolutionFailureCount') > 0) {
      buckets.push('expected-citation-target-unresolved')
    }
    if (strictExpectedCitationMappingMetric(metrics, 'missingClaimCount') > 0) {
      buckets.push('expected-claim-missing')
    }
    if (strictExpectedCitationMappingMetric(metrics, 'expectedCitationMismatchCount') > 0) {
      buckets.push('expected-citation-mismatch')
    }
    if (strictExpectedCitationMappingMetric(metrics, 'everyOccurrenceFailureCount') > 0) {
      buckets.push('expected-citation-every-occurrence')
    }
    if (strictExpectedCitationMappingMetric(metrics, 'proximityFailureCount') > 0) {
      buckets.push('citation-proximity')
    }
  }
  return buckets
}

function classifyLiveRunFailureCodes(result) {
  const codes = []
  if (result.status !== 'ok') codes.push('runtime_call_failed')
  if (result.truncation?.detected || result.truncated) codes.push('runtime_output_incomplete')
  if (result.invalidCitationAnchorCount > 0) codes.push('citation_anchor_invalid')
  if (result.requiredCitationAnchors?.missing?.length) codes.push('citation_anchor_missing')
  if (result.answerOracle?.enabled && result.answerOracle.gate !== 'report-only' && !result.answerOracle.ok) {
    const metrics = result.answerOracle.metrics || {}
    if (
      metrics.missingRequiredTermCount > 0
      || metrics.missingRequiredPhraseCount > 0
      || metrics.missingRequiredRelationCount > 0
    ) {
      codes.push('oracle_omission')
    }
    if (metrics.distortionCount > 0) codes.push('oracle_distortion')
    if (metrics.unsupportedClaimHitCount > 0) codes.push('oracle_unsupported_claim')
    if (metrics.contradictoryClaimHitCount > 0) codes.push('oracle_contradiction')
  }
  if (result.status === 'ok' && result.expectedCitationMappings?.enabled && !result.expectedCitationMappings.ok) {
    const metrics = result.expectedCitationMappings.metrics || {}
    if (strictExpectedCitationMappingMetric(metrics, 'targetResolutionFailureCount') > 0) {
      codes.push('expected_citation_target_unresolved')
    }
    if (strictExpectedCitationMappingMetric(metrics, 'missingClaimCount') > 0) codes.push('expected_claim_missing')
    if (strictExpectedCitationMappingMetric(metrics, 'expectedCitationMismatchCount') > 0) codes.push('expected_citation_mismatch')
    if (strictExpectedCitationMappingMetric(metrics, 'everyOccurrenceFailureCount') > 0) codes.push('expected_citation_every_occurrence_failed')
    if (strictExpectedCitationMappingMetric(metrics, 'proximityFailureCount') > 0) codes.push('claim_citation_proximity_failed')
  }
  return codes
}

function strictExpectedCitationMappingMetric(metrics, name) {
  const strictName = `strict${name[0].toUpperCase()}${name.slice(1)}`
  return Number.isFinite(metrics[strictName]) ? metrics[strictName] : (metrics[name] || 0)
}

function chooseRepresentativeLiveRun(runs) {
  return runs.find((run) => !run.pass) || runs[0] || {}
}

function summarizeLiveRendererRuns(runs) {
  const runCount = runs.length
  const passCount = runs.filter((run) => run.pass).length
  const okCount = runs.filter((run) => run.status === 'ok').length
  const latencyMs = summarizeNumbers(runs.map((run) => run.latencyMs))
  const outputTextLength = summarizeNumbers(runs.map((run) => run.outputTextLength))
  const usage = summarizeLiveRunUsage(runs)
  const citationCoveragePct = summarizeNumbers(
    runs.map((run) => run.requiredCitationAnchors?.coveragePct),
  )
  const statusCounts = countBy(runs.map((run) => run.status || 'unknown'))
  const finishReasonCounts = countBy(runs.map((run) => run.finishReason || 'none'))
  const failureBucketCounts = countBy(runs.flatMap((run) => run.failureBuckets || []))
  const failureCodeCounts = countBy(runs.flatMap((run) => run.failureCodes || []))
  const invalidCitationAnchorCount = sumNumbers(runs.map((run) => run.invalidCitationAnchorCount))
  const allRequiredCitationAnchorsCoveredCount = runs.filter((run) => run.allRequiredCitationAnchorsCovered).length
  const truncatedCount = runs.filter((run) => run.truncation?.detected || run.truncated).length

  return {
    runCount,
    okCount,
    passCount,
    failCount: runCount - passCount,
    passRatePct: percentage(passCount, runCount),
    status: summarizeLiveRunStatus(statusCounts),
    statusCounts,
    finishReasonCounts,
    failureBucketCounts,
    failureCodeCounts,
    errorCount: runCount - okCount,
    truncatedCount,
    latencyMs,
    outputTextLength,
    usage,
    averageRequiredCitationAnchorCoveragePct: citationCoveragePct.average,
    averageAnswerOracleRequiredTermCoveragePct: average(
      runs.map((run) => run.answerOracle?.metrics?.requiredTermCoveragePct),
    ),
    averageAnswerOracleRequiredRelationCoveragePct: average(
      runs.map((run) => run.answerOracle?.metrics?.requiredRelationCoveragePct),
    ),
    averageExpectedCitationMappingCoveragePct: average(
      runs.map((run) => run.expectedCitationMappings?.metrics?.coveragePct),
    ),
    invalidCitationAnchorCount,
    allRequiredCitationAnchorsCoveredCount,
    variance: {
      mixedPassStatus: passCount > 0 && passCount < runCount,
      latencyRangeMs: numericRange(latencyMs),
      outputTextLengthRange: numericRange(outputTextLength),
      requiredCitationAnchorCoverageRangePct: numericRange(citationCoveragePct),
    },
  }
}

function summarizeLiveRunUsage(runs) {
  const promptTokens = summarizeNumbers(runs.map((run) => run.usage?.promptTokens))
  const completionTokens = summarizeNumbers(runs.map((run) => run.usage?.completionTokens))
  const totalTokens = summarizeNumbers(runs.map((run) => run.usage?.totalTokens))
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    average: {
      promptTokens: promptTokens.average,
      completionTokens: completionTokens.average,
      totalTokens: totalTokens.average,
    },
  }
}

function summarizeLiveRunStatus(statusCounts) {
  const statuses = Object.keys(statusCounts)
  if (!statuses.length) return 'not-run'
  if (statuses.length === 1) return statuses[0]
  if (statusCounts.ok) return 'mixed'
  return 'failed'
}

function countBy(values) {
  const counts = {}
  for (const value of values) {
    counts[value] = (counts[value] || 0) + 1
  }
  return counts
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0)
}

function percentage(count, total) {
  if (!total) return null
  return Number(((count / total) * 100).toFixed(2))
}

function numericRange(summary) {
  if (!Number.isFinite(summary?.min) || !Number.isFinite(summary?.max)) return null
  return Number((summary.max - summary.min).toFixed(2))
}

function liveRuntimeMessages(runtimeUserPrompt) {
  return [
    {
      role: 'system',
      content: [
        'You are evaluating LLMWiki evidence prompt formats.',
        'Answer using only the provided evidence.',
        'Every factual claim that relies on evidence must include markdown citation anchors near the claim, formatted exactly as [n](#citation-n).',
        'Use n as the 1-based index of the matching evidence citation.',
        'If evidence is insufficient, state the limitation and cite the closest available evidence.',
      ].join(' '),
    },
    {
      role: 'user',
      content: runtimeUserPrompt,
    },
  ]
}

async function callChatCompletions({ config, messages, maxTokens, temperature, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(config.chatCompletionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    })
    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }
    if (!response.ok) {
      return {
        ok: false,
        status: 'http-error',
        httpStatus: response.status,
        error: `runtime HTTP ${response.status}: ${redactForReport(extractRuntimeError(payload) || text || response.statusText, config)}`,
      }
    }
    return { ok: true, status: 'ok', httpStatus: response.status, payload }
  } catch (error) {
    return {
      ok: false,
      status: error?.name === 'AbortError' ? 'timeout' : 'error',
      httpStatus: null,
      error: redactForReport(error?.message || String(error), config),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function chatCompletionsUrl(baseUrl) {
  const url = new URL(baseUrl)
  const normalizedPath = url.pathname.replace(/\/+$/, '')
  if (!normalizedPath.endsWith('/chat/completions')) {
    url.pathname = `${normalizedPath}/chat/completions`
  }
  url.hash = ''
  return url.toString()
}

function extractRuntimeError(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.error === 'string') return payload.error
  if (payload.error && typeof payload.error.message === 'string') return payload.error.message
  if (typeof payload.message === 'string') return payload.message
  return ''
}

function extractChatCompletionText(payload) {
  const choice = firstChatCompletionChoice(payload)
  const content = choice?.message?.content ?? choice?.text
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part
      if (typeof part?.text === 'string') return part.text
      return ''
    }).join('')
  }
  return ''
}

function extractChatCompletionFinishReason(payload) {
  const choice = firstChatCompletionChoice(payload)
  const finishReason = choice?.finish_reason ?? choice?.finishReason
  return typeof finishReason === 'string' && finishReason.trim() ? finishReason.trim() : null
}

function firstChatCompletionChoice(payload) {
  return Array.isArray(payload?.choices) ? payload.choices[0] : null
}

function analyzeCitationAnchors(text, citationCount) {
  const found = []
  const validIndexes = new Set()
  let invalidCount = 0
  const anchorPattern = /\[(\d+)\]\(#citation-(\d+)\)/g
  let match
  while ((match = anchorPattern.exec(text)) !== null) {
    if (match.index > 0 && text[match.index - 1] === '!') continue
    const citationIndex = Number(match[1])
    const linkedIndex = Number(match[2])
    const valid = Number.isInteger(citationIndex)
      && citationIndex === linkedIndex
      && citationIndex >= 1
      && citationIndex <= citationCount
    const anchor = `[${match[1]}](#citation-${match[2]})`
    found.push({ anchor, index: citationIndex, valid, start: match.index, end: match.index + anchor.length })
    if (valid) validIndexes.add(citationIndex)
    else invalidCount += 1
  }
  return {
    found,
    invalidCount,
    coverage: citationCoverage([...validIndexes], citationCount),
  }
}

function citationCoverage(coveredIndexes, citationCount) {
  const covered = new Set(coveredIndexes)
  const required = Array.from({ length: citationCount }, (_, index) => index + 1)
  const missing = required.filter((index) => !covered.has(index))
  const coveredCount = required.length - missing.length
  return {
    requiredCount: required.length,
    coveredCount,
    coveragePct: required.length ? Number(((coveredCount / required.length) * 100).toFixed(2)) : 100,
    required,
    missing,
  }
}

function expectedCitationMappingsGate(oracle = null) {
  const explicitGate = String(oracle?.expectedCitationMappingsGate || oracle?.citationMappingsGate || '').trim().toLowerCase()
  return explicitGate === 'report-only' ? 'report-only' : 'strict'
}

function evaluateExpectedCitationMappings(text, mappings = null, evidenceBundleOrCitationCount = 0, gate = 'strict', citationAnchors = null) {
  const expectedMappings = Array.isArray(mappings) ? mappings.filter(Boolean) : []
  const mappingGate = gate === 'report-only' ? 'report-only' : 'strict'
  if (!expectedMappings.length) {
    return {
      enabled: false,
      gate: mappingGate,
      ok: true,
      failures: [],
    }
  }

  const context = expectedCitationMappingContext(evidenceBundleOrCitationCount)
  const anchors = Array.isArray(citationAnchors)
    ? citationAnchors
    : analyzeCitationAnchors(text, context.citationCount).found
  const validAnchorOffsets = anchors.filter((anchor) => (
    anchor.valid
    && Number.isFinite(anchor.start)
    && Number.isFinite(anchor.end)
  ))
  const failures = []
  const missingClaims = []
  const proximityFailures = []
  const expectedCitationMismatches = []
  const everyOccurrenceFailures = []
  const satisfiedMappings = []
  const reportOnlyFailures = []
  const mappingResults = []
  const targetResolutionFailures = []
  const strictMetrics = {
    missingClaimCount: 0,
    expectedCitationMismatchCount: 0,
    everyOccurrenceFailureCount: 0,
    proximityFailureCount: 0,
    targetResolutionFailureCount: 0,
  }
  let strictMappingCount = 0
  let reportOnlyMappingCount = 0
  let anyOccurrenceMappingCount = 0
  let everyOccurrenceMappingCount = 0
  let claimOccurrenceCount = 0
  let satisfiedOccurrenceCount = 0
  let unsatisfiedOccurrenceCount = 0

  for (const mapping of expectedMappings) {
    const claim = mapping?.claim
    const windowChars = Number.isInteger(mapping?.windowChars) && mapping.windowChars > 0
      ? mapping.windowChars
      : 180
    const require = expectedCitationMappingRequirement(mapping)
    const occurrenceMode = expectedCitationMappingOccurrenceMode(mapping)
    const effectiveGate = expectedCitationMappingGate(mapping, mappingGate)
    const resolved = resolveExpectedCitationMapping(mapping, context)
    const claimRanges = findOraclePhraseRanges(text, claim)
    const label = formatExpectedCitationMapping(mapping, resolved, require)
    const mappingResult = {
      mapping: label,
      claim: formatOracleItem(claim),
      gate: effectiveGate,
      require,
      occurrenceMode,
      windowChars,
      expectedCitationIds: resolved.expectedCitationIds,
      expectedCitationIndexes: resolved.expectedCitationIndexes,
      resolvedCitationIndexes: resolved.citationIndexes,
      resolvedTargets: resolved.targets,
      unresolvedCitationIds: resolved.unresolvedCitationIds,
      invalidCitationIndexes: resolved.invalidCitationIndexes,
      invalidTargets: resolved.invalidTargets,
      occurrenceCount: claimRanges.length,
      satisfied: false,
    }

    if (effectiveGate === 'report-only') reportOnlyMappingCount += 1
    else strictMappingCount += 1
    if (occurrenceMode === 'every') everyOccurrenceMappingCount += 1
    else anyOccurrenceMappingCount += 1

    if (resolved.invalidTargets.length) {
      const failure = `expected citation target unresolved: ${label} (${resolved.invalidTargets.join('; ')})`
      recordExpectedCitationMappingFailure({
        failure,
        category: 'targetResolutionFailureCount',
        effectiveGate,
        failures,
        reportOnlyFailures,
        strictMetrics,
      })
      const resolutionFailure = {
        mapping: label,
        gate: effectiveGate,
        require,
        expectedCitationIds: resolved.expectedCitationIds,
        expectedCitationIndexes: resolved.expectedCitationIndexes,
        unresolvedCitationIds: resolved.unresolvedCitationIds,
        invalidCitationIndexes: resolved.invalidCitationIndexes,
        invalidTargets: resolved.invalidTargets,
      }
      targetResolutionFailures.push(resolutionFailure)
      mappingResult.failure = failure
      mappingResult.failureCode = 'expected_citation_target_unresolved'
      mappingResults.push(mappingResult)
      continue
    }
    if (!claimRanges.length) {
      const failure = `expected claim missing: ${label}`
      recordExpectedCitationMappingFailure({
        failure,
        category: 'missingClaimCount',
        effectiveGate,
        failures,
        reportOnlyFailures,
        strictMetrics,
      })
      missingClaims.push(label)
      mappingResult.failure = failure
      mappingResult.failureCode = 'claim_missing'
      mappingResults.push(mappingResult)
      continue
    }

    const occurrenceEvaluation = evaluateExpectedCitationMappingOccurrences({
      text,
      claimRanges,
      validAnchorOffsets,
      expectedCitationIndexes: resolved.citationIndexes,
      require,
      windowChars,
    })
    mappingResult.occurrences = occurrenceEvaluation.occurrences
    mappingResult.anyOccurrenceSatisfied = occurrenceEvaluation.satisfied
    mappingResult.everyOccurrenceSatisfied = occurrenceEvaluation.everyOccurrenceSatisfied
    mappingResult.unsatisfiedOccurrenceCount = occurrenceEvaluation.unsatisfiedOccurrences.length
    mappingResult.unsatisfiedOccurrences = occurrenceEvaluation.unsatisfiedOccurrences
    claimOccurrenceCount += occurrenceEvaluation.occurrences.length
    satisfiedOccurrenceCount += occurrenceEvaluation.satisfiedOccurrences.length
    unsatisfiedOccurrenceCount += occurrenceEvaluation.unsatisfiedOccurrences.length
    const mappingSatisfied = occurrenceMode === 'every'
      ? occurrenceEvaluation.everyOccurrenceSatisfied
      : occurrenceEvaluation.satisfied

    if (!mappingSatisfied) {
      if (occurrenceMode === 'every') {
        const failure = `expected citation ${formatExpectedCitationTargets(resolved, require)} did not satisfy occurrenceMode=every for ${occurrenceEvaluation.unsatisfiedOccurrences.length} of ${occurrenceEvaluation.occurrences.length} claim occurrences: ${label}`
        recordExpectedCitationMappingFailure({
          failure,
          category: 'everyOccurrenceFailureCount',
          effectiveGate,
          failures,
          reportOnlyFailures,
          strictMetrics,
        })
        everyOccurrenceFailures.push(label)
        mappingResult.failure = (effectiveGate === 'report-only' ? reportOnlyFailures : failures).at(-1)
        mappingResult.failureCode = 'expected_citation_every_occurrence_failed'
        mappingResults.push(mappingResult)
        continue
      }
      if (occurrenceEvaluation.nearbyAnchors.length) {
        const failure = `expected citation ${formatExpectedCitationTargets(resolved, require)} did not satisfy require=${require} near any claim occurrence; nearby citation anchors included ${formatNearbyCitationAnchors(occurrenceEvaluation.nearbyAnchors)} for claim: ${label}`
        recordExpectedCitationMappingFailure({
          failure,
          category: 'expectedCitationMismatchCount',
          effectiveGate,
          failures,
          reportOnlyFailures,
          strictMetrics,
        })
        expectedCitationMismatches.push(label)
      } else {
        const failure = `expected citation ${formatExpectedCitationTargets(resolved, require)} not within ${windowChars} chars of any claim occurrence: ${label}`
        recordExpectedCitationMappingFailure({
          failure,
          category: 'proximityFailureCount',
          effectiveGate,
          failures,
          reportOnlyFailures,
          strictMetrics,
        })
        proximityFailures.push(label)
      }
      mappingResult.failure = (effectiveGate === 'report-only' ? reportOnlyFailures : failures).at(-1)
      mappingResult.failureCode = occurrenceEvaluation.nearbyAnchors.length
        ? 'expected_citation_mismatch'
        : 'citation_proximity_failed'
      mappingResults.push(mappingResult)
      continue
    }

    mappingResult.satisfied = true
    mappingResult.satisfiedOccurrence = occurrenceEvaluation.satisfiedOccurrence
    satisfiedMappings.push(label)
    mappingResults.push(mappingResult)
  }

  const strictFailureCount = failures.length
  const reportOnlyFailureCount = reportOnlyFailures.length
  return {
    enabled: true,
    gate: mappingGate,
    ok: strictFailureCount === 0,
    metrics: {
      expectedMappingCount: expectedMappings.length,
      strictMappingCount,
      reportOnlyMappingCount,
      anyOccurrenceMappingCount,
      everyOccurrenceMappingCount,
      satisfiedMappingCount: satisfiedMappings.length,
      coveragePct: percentage(satisfiedMappings.length, expectedMappings.length),
      claimOccurrenceCount,
      satisfiedOccurrenceCount,
      unsatisfiedOccurrenceCount,
      occurrenceCoveragePct: percentage(satisfiedOccurrenceCount, claimOccurrenceCount),
      missingClaimCount: missingClaims.length,
      expectedCitationMismatchCount: expectedCitationMismatches.length,
      everyOccurrenceFailureCount: everyOccurrenceFailures.length,
      proximityFailureCount: proximityFailures.length,
      missingCitationWithinWindowCount: proximityFailures.length,
      targetResolutionFailureCount: targetResolutionFailures.length,
      unresolvedExpectedCitationIdCount: sumNumbers(targetResolutionFailures.map((failure) => failure.unresolvedCitationIds.length)),
      invalidExpectedCitationIndexCount: sumNumbers(targetResolutionFailures.map((failure) => failure.invalidCitationIndexes.length)),
      strictFailureCount,
      reportOnlyFailureCount,
      strictMissingClaimCount: strictMetrics.missingClaimCount,
      strictExpectedCitationMismatchCount: strictMetrics.expectedCitationMismatchCount,
      strictEveryOccurrenceFailureCount: strictMetrics.everyOccurrenceFailureCount,
      strictProximityFailureCount: strictMetrics.proximityFailureCount,
      strictTargetResolutionFailureCount: strictMetrics.targetResolutionFailureCount,
    },
    missingClaims,
    expectedCitationMismatches,
    everyOccurrenceFailures,
    missingCitationWithinWindow: proximityFailures,
    targetResolutionFailures,
    mappingResults,
    satisfiedMappings,
    failures,
    reportOnlyFailures,
  }
}

function expectedCitationMappingContext(evidenceBundleOrCitationCount) {
  if (Number.isInteger(evidenceBundleOrCitationCount)) {
    return {
      citationCount: evidenceBundleOrCitationCount,
      citationIdToIndex: new Map(),
    }
  }

  const evidenceBundle = evidenceBundleOrCitationCount && typeof evidenceBundleOrCitationCount === 'object'
    ? evidenceBundleOrCitationCount
    : {}
  const citations = Array.isArray(evidenceBundle.citations) ? evidenceBundle.citations : []
  const citationCount = Number.isInteger(evidenceBundle.citationCount)
    ? evidenceBundle.citationCount
    : citations.length
  const citationIdToIndex = new Map()
  citations.forEach((citation, index) => {
    if (typeof citation?.id === 'string' && citation.id.trim()) {
      citationIdToIndex.set(citation.id.trim(), index + 1)
    }
  })

  return {
    citationCount,
    citationIdToIndex,
  }
}

function resolveExpectedCitationMapping(mapping, context) {
  const targets = []
  const invalidTargets = []
  const citationIds = expectedCitationIds(mapping)
  const citationIndexValues = expectedCitationIndexValues(mapping)
  const unresolvedCitationIds = []
  const invalidCitationIndexes = []

  for (const citationId of citationIds) {
    const normalizedCitationId = String(citationId || '').trim()
    if (!normalizedCitationId) continue
    const resolvedIndex = context.citationIdToIndex.get(normalizedCitationId)
    if (Number.isInteger(resolvedIndex)) {
      targets.push({ id: normalizedCitationId, index: resolvedIndex })
    } else {
      unresolvedCitationIds.push(normalizedCitationId)
      invalidTargets.push(`unknown citation id ${normalizedCitationId}`)
    }
  }

  for (const citationIndexValue of citationIndexValues) {
    const citationIndex = Number(citationIndexValue)
    if (Number.isInteger(citationIndex) && citationIndex >= 1 && citationIndex <= context.citationCount) {
      targets.push({ index: citationIndex })
    } else {
      const invalidCitationIndex = String(citationIndexValue)
      invalidCitationIndexes.push(invalidCitationIndex)
      invalidTargets.push(`invalid citation index ${invalidCitationIndex}`)
    }
  }

  const resolvedCitationIndexes = [...new Set(targets.map((target) => target.index))]
  if (!resolvedCitationIndexes.length && !invalidTargets.length) {
    invalidTargets.push('missing expected citation id or index')
  }

  return {
    targets,
    expectedCitationIds: citationIds,
    expectedCitationIndexes: citationIndexValues.map((value) => Number(value)),
    citationIndexes: resolvedCitationIndexes,
    unresolvedCitationIds,
    invalidCitationIndexes,
    invalidTargets,
  }
}

function expectedCitationIds(mapping) {
  if (!mapping || typeof mapping !== 'object') return []
  return [
    ...(Array.isArray(mapping.expectedCitationIds) ? mapping.expectedCitationIds : []),
    mapping.expectedCitationId,
    mapping.citationId,
  ].filter((value) => typeof value === 'string' && value.trim())
}

function expectedCitationIndexValues(mapping) {
  if (!mapping || typeof mapping !== 'object') return []
  return [
    ...(Array.isArray(mapping.citationIndexes) ? mapping.citationIndexes : []),
    mapping.citationIndex ?? mapping.citation,
  ]
    .filter((value) => value !== undefined && value !== null && value !== '')
}

function expectedCitationMappingRequirement(mapping) {
  return String(mapping?.require ?? mapping?.expectedCitationMode ?? '').trim().toLowerCase() === 'all' ? 'all' : 'any'
}

function expectedCitationMappingOccurrenceMode(mapping) {
  const mode = String(
    mapping?.occurrenceMode
    ?? mapping?.claimOccurrenceMode
    ?? mapping?.expectedClaimOccurrenceMode
    ?? '',
  ).trim().toLowerCase()
  return ['every', 'each', 'all'].includes(mode) ? 'every' : 'any'
}

function expectedCitationMappingGate(mapping, defaultGate) {
  const normalizedDefaultGate = defaultGate === 'report-only' ? 'report-only' : 'strict'
  if (normalizedDefaultGate === 'report-only') return 'report-only'
  if (!mapping || typeof mapping !== 'object') return normalizedDefaultGate
  if (mapping.reportOnly === true) return 'report-only'
  if (mapping.reportOnly === false) return 'strict'
  const explicitGate = String(mapping.gate || '').trim().toLowerCase()
  if (explicitGate === 'report-only') return 'report-only'
  if (explicitGate === 'strict') return 'strict'
  return normalizedDefaultGate
}

function recordExpectedCitationMappingFailure({
  failure,
  category,
  effectiveGate,
  failures,
  reportOnlyFailures,
  strictMetrics,
}) {
  if (effectiveGate === 'report-only') {
    reportOnlyFailures.push(failure)
    return
  }

  failures.push(failure)
  strictMetrics[category] += 1
}

function evaluateExpectedCitationMappingOccurrences({
  text,
  claimRanges,
  validAnchorOffsets,
  expectedCitationIndexes,
  require,
  windowChars,
}) {
  const expectedIndexes = [...new Set(expectedCitationIndexes)]
  const occurrences = claimRanges.map((claimRange) => {
    const windowStart = Math.max(0, claimRange.start - windowChars)
    const windowEnd = Math.min(String(text || '').length, claimRange.end + windowChars)
    const nearbyAnchors = validAnchorOffsets.filter((anchor) => (
      anchor.end >= windowStart && anchor.start <= windowEnd
    ))
    const matchedCitationIndexes = [...new Set(
      nearbyAnchors
        .filter((anchor) => expectedIndexes.includes(anchor.index))
        .map((anchor) => anchor.index),
    )]
    const missingCitationIndexes = expectedIndexes.filter((index) => !matchedCitationIndexes.includes(index))
    const satisfied = require === 'all'
      ? missingCitationIndexes.length === 0
      : matchedCitationIndexes.length > 0

    return {
      start: claimRange.start,
      end: claimRange.end,
      phrase: claimRange.phrase,
      windowStart,
      windowEnd,
      nearbyCitationIndexes: [...new Set(nearbyAnchors.map((anchor) => anchor.index))],
      matchedCitationIndexes,
      missingCitationIndexes,
      satisfied,
    }
  })
  const satisfiedOccurrence = occurrences.find((occurrence) => occurrence.satisfied) || null
  const satisfiedOccurrences = occurrences.filter((occurrence) => occurrence.satisfied)
  const unsatisfiedOccurrences = occurrences.filter((occurrence) => !occurrence.satisfied)
  const nearbyAnchors = validAnchorOffsets.filter((anchor) => (
    occurrences.some((occurrence) => anchor.end >= occurrence.windowStart && anchor.start <= occurrence.windowEnd)
  ))

  return {
    occurrences,
    satisfied: Boolean(satisfiedOccurrence),
    everyOccurrenceSatisfied: occurrences.length > 0 && unsatisfiedOccurrences.length === 0,
    satisfiedOccurrence,
    satisfiedOccurrences,
    unsatisfiedOccurrences,
    nearbyAnchors,
  }
}

function findOraclePhraseRanges(text, item) {
  const candidates = oraclePhraseCandidates(item)
  const lowerText = String(text || '').toLowerCase()
  const ranges = []
  const seen = new Set()
  for (const candidate of candidates) {
    const phrase = String(candidate || '').trim().toLowerCase()
    if (!phrase) continue
    let searchStart = 0
    while (searchStart <= lowerText.length) {
      const start = lowerText.indexOf(phrase, searchStart)
      if (start < 0) break
      const end = start + phrase.length
      const key = `${start}:${end}`
      if (!seen.has(key)) {
        ranges.push({ start, end, phrase: candidate })
        seen.add(key)
      }
      searchStart = start + Math.max(phrase.length, 1)
    }
  }
  return ranges.sort((left, right) => left.start - right.start || left.end - right.end)
}

function oraclePhraseCandidates(item) {
  if (item && typeof item === 'object' && Array.isArray(item.anyOf)) return item.anyOf
  return [item]
}

function formatExpectedCitationMapping(mapping, resolved = null, require = 'any') {
  if (!mapping || typeof mapping !== 'object') return String(mapping)
  return `${formatOracleItem(mapping.claim)} -> ${formatExpectedCitationTargets(resolved, require)}`
}

function formatExpectedCitationTargets(resolved, require = 'any') {
  if (!resolved || typeof resolved !== 'object') return 'invalid-citation'
  const labels = resolved.targets.map((target) => {
    const anchor = citationAnchor(target.index) || 'invalid-citation'
    return target.id ? `${target.id} (${anchor})` : anchor
  })
  const separator = require === 'all' ? ' and ' : ' or '
  return labels.length ? labels.join(separator) : 'invalid-citation'
}

function formatNearbyCitationAnchors(anchors) {
  return anchors.slice(0, 5).map((anchor) => anchor.anchor).join(', ') || 'none'
}

function evaluateAnswerOracle(text, oracle = null) {
  if (!oracle || typeof oracle !== 'object') {
    return {
      enabled: false,
      ok: true,
      failures: [],
    }
  }

  const requiredTerms = Array.isArray(oracle.requiredTerms) ? oracle.requiredTerms.filter(Boolean) : []
  const requiredPhrases = Array.isArray(oracle.requiredPhrases) ? oracle.requiredPhrases.filter(Boolean) : []
  const requiredRelations = Array.isArray(oracle.requiredRelations) ? oracle.requiredRelations : []
  const forbiddenTerms = Array.isArray(oracle.forbiddenTerms) ? oracle.forbiddenTerms.filter(Boolean) : []
  const forbiddenClaims = Array.isArray(oracle.forbiddenClaims) ? oracle.forbiddenClaims.filter(Boolean) : []
  const unsupportedClaims = Array.isArray(oracle.unsupportedClaims) ? oracle.unsupportedClaims.filter(Boolean) : []
  const contradictoryClaims = Array.isArray(oracle.contradictoryClaims) ? oracle.contradictoryClaims.filter(Boolean) : []
  const missingTerms = requiredTerms.filter((term) => !answerContainsAnyOf(text, term))
  const missingPhrases = requiredPhrases.filter((phrase) => !answerContainsAnyOf(text, phrase))
  const missingRelations = requiredRelations.filter((relation) => !answerContainsRelation(text, relation))
  const forbiddenFound = forbiddenTerms.filter((term) => answerContainsAnyOf(text, term))
  const forbiddenClaimFound = forbiddenClaims.filter((claim) => answerContainsAllOf(text, claim))
  const unsupportedClaimFound = unsupportedClaims.filter((claim) => answerContainsAllOf(text, claim))
  const contradictoryClaimFound = contradictoryClaims.filter((claim) => answerContainsAllOf(text, claim))
  const requiredTermCoveragePct = requiredTerms.length
    ? Number((((requiredTerms.length - missingTerms.length) / requiredTerms.length) * 100).toFixed(2))
    : 100
  const requiredPhraseCoveragePct = requiredPhrases.length
    ? Number((((requiredPhrases.length - missingPhrases.length) / requiredPhrases.length) * 100).toFixed(2))
    : 100
  const requiredRelationCoveragePct = requiredRelations.length
    ? Number((((requiredRelations.length - missingRelations.length) / requiredRelations.length) * 100).toFixed(2))
    : 100
  const requiredItemCount = requiredTerms.length + requiredPhrases.length + requiredRelations.length
  const missingRequiredItemCount = missingTerms.length + missingPhrases.length + missingRelations.length
  const failures = []

  if (missingTerms.length) {
    failures.push(`missing required terms: ${missingTerms.slice(0, 5).map(formatOracleItem).join(', ')}`)
  }
  if (missingPhrases.length) {
    failures.push(`missing required phrases: ${missingPhrases.slice(0, 5).map(formatOracleItem).join(', ')}`)
  }
  if (missingRelations.length) {
    failures.push(`missing required relations: ${missingRelations.slice(0, 5).map(formatRequiredRelation).join('; ')}`)
  }
  if (forbiddenFound.length) {
    failures.push(`forbidden terms present: ${forbiddenFound.slice(0, 5).map(formatOracleItem).join(', ')}`)
  }
  if (forbiddenClaimFound.length) {
    failures.push(`forbidden claims present: ${forbiddenClaimFound.slice(0, 5).map(formatOracleItem).join(', ')}`)
  }
  if (unsupportedClaimFound.length) {
    failures.push(`unsupported claims present: ${unsupportedClaimFound.slice(0, 5).map(formatOracleItem).join(', ')}`)
  }
  if (contradictoryClaimFound.length) {
    failures.push(`contradictory claims present: ${contradictoryClaimFound.slice(0, 5).map(formatOracleItem).join(', ')}`)
  }

  return {
    enabled: true,
    gate: oracle.gate === 'report-only' ? 'report-only' : 'strict',
    ok: failures.length === 0,
    metrics: {
      requiredTermCount: requiredTerms.length,
      requiredTermCoveragePct,
      missingRequiredTermCount: missingTerms.length,
      requiredPhraseCount: requiredPhrases.length,
      requiredPhraseCoveragePct,
      missingRequiredPhraseCount: missingPhrases.length,
      requiredRelationCount: requiredRelations.length,
      requiredRelationCoveragePct,
      missingRequiredRelationCount: missingRelations.length,
      omissionRate: requiredItemCount ? Number((missingRequiredItemCount / requiredItemCount).toFixed(4)) : 0,
      forbiddenTermCount: forbiddenTerms.length,
      forbiddenTermHitCount: forbiddenFound.length,
      forbiddenClaimCount: forbiddenClaims.length,
      forbiddenClaimHitCount: forbiddenClaimFound.length,
      unsupportedClaimCount: unsupportedClaims.length,
      unsupportedClaimHitCount: unsupportedClaimFound.length,
      contradictoryClaimCount: contradictoryClaims.length,
      contradictoryClaimHitCount: contradictoryClaimFound.length,
      distortionCount: forbiddenFound.length
        + forbiddenClaimFound.length
        + unsupportedClaimFound.length
        + contradictoryClaimFound.length,
    },
    missingTerms: missingTerms.map(formatOracleItem),
    missingPhrases: missingPhrases.map(formatOracleItem),
    missingRelations: missingRelations.map(formatRequiredRelation),
    forbiddenFound: forbiddenFound.map(formatOracleItem),
    forbiddenClaimFound: forbiddenClaimFound.map(formatOracleItem),
    unsupportedClaimFound: unsupportedClaimFound.map(formatOracleItem),
    contradictoryClaimFound: contradictoryClaimFound.map(formatOracleItem),
    failures,
  }
}

function answerContainsRelation(text, relation) {
  const requiredPhrases = Array.isArray(relation?.terms) && relation.terms.length
    ? relation.terms
    : [relation?.from, relation?.relation, relation?.to]
  return requiredPhrases.filter(Boolean).every((phrase) => answerContainsAnyOf(text, phrase))
}

function answerContainsAnyOf(text, item) {
  if (item && typeof item === 'object' && Array.isArray(item.anyOf)) {
    return item.anyOf.some((value) => textContainsPhrase(text, value))
  }
  return textContainsPhrase(text, item)
}

function answerContainsAllOf(text, item) {
  if (item && typeof item === 'object' && Array.isArray(item.allOf)) {
    return item.allOf.every((value) => textContainsPhrase(text, value))
  }
  if (item && typeof item === 'object' && Array.isArray(item.anyOf)) {
    return item.anyOf.some((value) => textContainsPhrase(text, value))
  }
  return textContainsPhrase(text, item)
}

function textContainsPhrase(text, phrase) {
  const normalizedText = normalizeOracleText(text)
  const normalizedPhrase = normalizeOracleText(phrase)
  return Boolean(normalizedPhrase) && normalizedText.includes(normalizedPhrase)
}

function normalizeOracleText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function formatRequiredRelation(relation) {
  if (!relation || typeof relation !== 'object') return String(relation)
  if (Array.isArray(relation.terms) && relation.terms.length) return relation.terms.map(formatOracleItem).join(' + ')
  return [relation.from, relation.relation, relation.to].map(formatOracleItem).filter(Boolean).join(' ')
}

function formatOracleItem(item) {
  if (item && typeof item === 'object' && Array.isArray(item.anyOf)) return `anyOf(${item.anyOf.join('|')})`
  if (item && typeof item === 'object' && Array.isArray(item.allOf)) return `allOf(${item.allOf.join('+')})`
  return String(item || '').trim()
}

function summarizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  return {
    promptTokens: numberOrUndefined(usage.prompt_tokens),
    completionTokens: numberOrUndefined(usage.completion_tokens),
    totalTokens: numberOrUndefined(usage.total_tokens),
  }
}

function numberOrUndefined(value) {
  return Number.isFinite(value) ? value : undefined
}

function validateLiveFixtureReports(fixtureReports) {
  const failures = []
  for (const fixture of fixtureReports) {
    for (const [rendererId, result] of Object.entries(fixture.renderers)) {
      const runs = Array.isArray(result.runs) && result.runs.length ? result.runs : [{ ...result, runIndex: 1 }]
      for (const run of runs) {
        if (run.pass) continue
        const reasons = liveRunFailureReasons(run)
        const runLabel = result.runCount > 1 ? ` run ${run.runIndex}/${result.runCount}` : ''
        failures.push(
          `${fixture.id}/${rendererId}${runLabel}: live response must complete, cover every required exact [n](#citation-n) anchor, include no invalid exact anchors, satisfy answer oracle checks, and keep expected claim citations near claims (${reasons.join('; ') || 'unknown'})`,
        )
      }
    }
  }
  return {
    ok: failures.length === 0,
    checks: ['every strict live renderer run completes, covers every required exact [n](#citation-n) anchor, includes no invalid exact anchors, satisfies answer oracle checks, and keeps configured expected citations near claims'],
    failures,
  }
}

function liveRunFailureReasons(result) {
  const reasons = []
  if (result.status !== 'ok') reasons.push(`runtime status: ${result.status}`)
  if (result.truncation?.detected || result.truncated) {
    if (result.truncation?.inferred) {
      reasons.push(`inferred truncation: completion_tokens ${result.truncation.completionTokens} reached max_tokens ${result.truncation.maxTokens}`)
    } else {
      reasons.push(`finish_reason indicates truncation: ${result.finishReason}`)
    }
  }
  if (result.invalidCitationAnchorCount > 0) {
    reasons.push(`invalid exact citation anchors: ${result.invalidCitationAnchorCount}`)
  }
  if (result.requiredCitationAnchors?.missing?.length) {
    reasons.push(`required citation anchors missing: ${result.requiredCitationAnchors.missing.join(', ')}`)
  }
  if (result.answerOracle?.enabled && !result.answerOracle.ok) {
    reasons.push(`answer oracle failed: ${result.answerOracle.failures.join('; ')}`)
  }
  if (result.status === 'ok' && result.expectedCitationMappings?.enabled && !result.expectedCitationMappings.ok) {
    reasons.push(`expected citation mappings failed: ${result.expectedCitationMappings.failures.join('; ')}`)
  }
  if (result.failureBuckets?.length) {
    reasons.push(`failure buckets: ${result.failureBuckets.join(', ')}`)
  }
  if (result.failureCodes?.length) {
    reasons.push(`failure codes: ${result.failureCodes.join(', ')}`)
  }
  return reasons
}

function summarizeLiveFixtureReports(fixtureReports, renderers) {
  const totals = {
    fixtureCount: fixtureReports.length,
    requestCount: 0,
    renderers: {},
  }

  for (const renderer of renderers) {
    const results = fixtureReports.map((fixture) => fixture.renderers[renderer.id]).filter(Boolean)
    const runs = results.flatMap((result) => (
      Array.isArray(result.runs) && result.runs.length ? result.runs : [result]
    ))
    totals.requestCount += runs.length
    const latencyMs = summarizeNumbers(runs.map((run) => run.latencyMs))
    const outputTextLength = summarizeNumbers(runs.map((run) => run.outputTextLength))
    const usage = summarizeLiveRunUsage(runs)
    const finishReasonCounts = countBy(runs.map((run) => run.finishReason || 'none'))
    const failureBucketCounts = countBy(runs.flatMap((run) => run.failureBuckets || []))
    const failureCodeCounts = countBy(runs.flatMap((run) => run.failureCodes || []))
    const passCount = runs.filter((run) => run.pass).length
    const okCount = runs.filter((run) => run.status === 'ok').length
    const truncatedCount = runs.filter((run) => run.truncation?.detected || run.truncated).length
    const citationCoveragePct = summarizeNumbers(
      runs.map((run) => run.requiredCitationAnchors?.coveragePct),
    )
    totals.renderers[renderer.id] = {
      fixtureCount: results.length,
      requestCount: runs.length,
      runCount: runs.length,
      okCount,
      passCount,
      failCount: runs.length - passCount,
      passRatePct: percentage(passCount, runs.length),
      errorCount: runs.length - okCount,
      truncatedCount,
      finishReasonCounts,
      failureBucketCounts,
      failureCodeCounts,
      latencyMs,
      outputTextLength,
      usage,
      averageRequiredCitationAnchorCoveragePct: citationCoveragePct.average,
      averageAnswerOracleRequiredTermCoveragePct: average(
        runs.map((run) => run.answerOracle?.metrics?.requiredTermCoveragePct),
      ),
      averageAnswerOracleRequiredRelationCoveragePct: average(
        runs.map((run) => run.answerOracle?.metrics?.requiredRelationCoveragePct),
      ),
      averageExpectedCitationMappingCoveragePct: average(
        runs.map((run) => run.expectedCitationMappings?.metrics?.coveragePct),
      ),
      variance: {
        mixedPassStatus: passCount > 0 && passCount < runs.length,
        latencyRangeMs: numericRange(latencyMs),
        outputTextLengthRange: numericRange(outputTextLength),
        requiredCitationAnchorCoverageRangePct: numericRange(citationCoveragePct),
      },
    }
  }

  return totals
}

function summarizeNumbers(values) {
  const numericValues = values.filter((value) => Number.isFinite(value))
  if (!numericValues.length) return { min: null, max: null, average: null }
  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
    average: average(numericValues),
  }
}

function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(value))
  if (!numericValues.length) return null
  return Number((numericValues.reduce((total, value) => total + value, 0) / numericValues.length).toFixed(2))
}

function redactForReport(value, config = {}) {
  let text = String(value || '')
  for (const secret of [config.apiKey, config.baseUrl, config.chatCompletionsUrl].filter(Boolean)) {
    text = text.split(secret).join('[redacted]')
  }
  if (config.baseUrl) {
    try {
      text = text.split(new URL(config.baseUrl).origin).join('[redacted-origin]')
    } catch {
      // Validation handles invalid URLs.
    }
  }
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|sk-proj|sk-ant|hf)[_-][A-Za-z0-9._~+/=-]+/gi, '[redacted-key]')
    .replace(/api[_-]?key=[^&\s]+/gi, 'api_key=[redacted]')
    .replace(/https?:\/\/[^\s)"'<>]+/g, '[redacted-url]')
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}

function mergeValidation(offlineValidation, liveValidation) {
  const failures = [
    ...(offlineValidation?.failures || []),
    ...(liveValidation?.failures || []),
  ]
  return {
    ok: failures.length === 0,
    checks: [
      ...(offlineValidation?.checks || []),
      ...(liveValidation?.checks || []),
    ],
    failures,
  }
}

async function buildGraphifyFixtureFromFile(graphPath, query) {
  let text
  try {
    text = await readFile(graphPath, 'utf8')
  } catch (error) {
    const reason = error?.code || 'read failed'
    throw new Error(`--graphify-graph could not be read (${basename(graphPath) || 'graph.json'}): ${reason}`)
  }

  let graph
  try {
    graph = JSON.parse(text)
  } catch {
    throw new Error('--graphify-graph must point to a JSON file with a top-level { nodes, edges } object.')
  }

  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error('--graphify-graph must contain a top-level object.')
  }

  return buildGraphifyFixture(graph, query, graphPath)
}

function buildGraphifyFixture(graph, query, graphPath) {
  const sourceId = 'graphify-graph'
  const citationIndexer = createGraphifyCitationIndexer(sourceId)
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : []
  const graphNodes = rawNodes.map((node, index) => normalizeGraphifyNode({
    node,
    index,
    sourceId,
    citationIndexer,
  }))
  const graphEdges = rawEdges.map((edge, index) => normalizeGraphifyEdge({
    edge,
    index,
    sourceId,
    citationIndexer,
  }))
  const citations = citationIndexer.citations
  const pageCount = new Set(citations.map((citation) => citation.path)).size
  const sourceName = 'Graphify Graph Fixture'
  const sourceDescription = 'Eval-only fixture generated from an existing Graphify-like graph.json. The benchmark does not install, import, or call Graphify.'
  const limitations = [
    'Graphify is optional and eval-only here; this fixture is loaded from a pre-generated graph.json file.',
    'markdown-summary is a lossy projection; use citation/graph omission and distortion as the primary evaluation metric, not token saving.',
    'This benchmark fixture does not change the runtime public API or OpenAPI contract.',
  ]
  const sourceDescriptor = {
    id: sourceId,
    name: sourceName,
    protocol: 'graphify-json',
    description: sourceDescription,
    wikiTitle: sourceName,
    adapter: 'graphify-json',
    implementation: 'precomputed-graphify-graph',
    pageCount,
    approvedPageCount: pageCount,
    orientation: citations.slice(0, 5).map((citation) => ({
      title: citation.title,
      path: citation.path,
      summary: citation.snippet,
    })),
    citationIndexes: citations.map((_, index) => index + 1),
    citationCount: citations.length,
    limitations,
    graph: {
      nodeCount: graphNodes.length,
      edgeCount: graphEdges.length,
    },
  }

  return {
    id: sourceId,
    description: `Optional eval-only Graphify/CKG-like fixture built from pre-generated ${basename(graphPath) || 'graph.json'}.`,
    query,
    evidenceBundle: {
      schema: 'llmwiki-agent-bridge.answer-evidence.v1',
      runtimeContract: {
        citations: 'Use the top-level citations array as the only citation anchor source.',
        graph: 'Graphify graph rows are optional eval-only prompt benchmark fixtures. Cite claims using citation indexes, not node ids.',
      },
      citationDigest: citations.map((citation) => ({
        id: citation.id,
        title: citation.title,
        path: citation.path,
        sourceLocation: citation.sourceLocation,
        snippet: citation.snippet,
        sourceRefs: citation.sourceRefs,
      })),
      citations,
      sources: [sourceDescriptor],
      sourceSummaries: [
        {
          id: sourceId,
          protocol: sourceDescriptor.protocol,
          pageCount,
          approvedPageCount: pageCount,
          citationCount: citations.length,
          graphNodeCount: graphNodes.length,
          graphEdgeCount: graphEdges.length,
          note: 'Eval-only Graphify graph fixture; inspect omission/distortion before token savings.',
        },
      ],
      sourceFailures: [],
      graphNodes,
      graphEdges,
      mergedGraphSummary: {
        nodeCount: graphNodes.length,
        edgeCount: graphEdges.length,
        corpusPageCount: pageCount,
        corpusApprovedPageCount: pageCount,
      },
      mergedCorpusSummary: {
        sourceCount: 1,
        pageCount,
        approvedPageCount: pageCount,
        sources: [
          {
            id: sourceDescriptor.id,
            name: sourceDescriptor.name,
            protocol: sourceDescriptor.protocol,
            description: sourceDescriptor.description,
            wikiTitle: sourceDescriptor.wikiTitle,
            adapter: sourceDescriptor.adapter,
            implementation: sourceDescriptor.implementation,
            pageCount,
            approvedPageCount: pageCount,
          },
        ],
      },
      citationCount: citations.length,
    },
  }
}

function normalizeGraphifyNode({ node, index, sourceId, citationIndexer }) {
  const rawNode = objectOrEmpty(node)
  const id = graphifyString(rawNode.id) || `node-${index + 1}`
  const label = graphifyString(rawNode.label) || id
  const kind = graphifyString(rawNode.file_type) || 'graph-node'
  const fallbackSourceFile = `graphify/generated-node-${index + 1}`
  const fallbackSourceLocation = `node:${id}`
  const rawSourceFile = graphifyString(rawNode.source_file)
  const rawSourceLocation = graphifyString(rawNode.source_location)
  const sourceFile = safeGraphifySourcePath(rawSourceFile, fallbackSourceFile)
  const sourceLocation = graphifyString(rawSourceLocation) || fallbackSourceLocation
  const citationIdx = citationIndexer.citationIndexFor({
    rawSourceFile: rawSourceFile || fallbackSourceFile,
    rawSourceLocation: rawSourceLocation || fallbackSourceLocation,
    sourceFile,
    sourceLocation,
    title: label,
    score: 0.84,
    snippet: `${label} (${kind}) appears as a Graphify graph node from ${sourceFile} at ${sourceLocation}.`,
  })

  return {
    id,
    label,
    kind,
    fileType: kind,
    sourceId,
    sourceFile,
    sourceLocation,
    citationIdx,
  }
}

function normalizeGraphifyEdge({ edge, index, sourceId, citationIndexer }) {
  const rawEdge = objectOrEmpty(edge)
  const from = graphifyString(rawEdge.source) || graphifyString(rawEdge.from) || `edge-${index + 1}:source`
  const to = graphifyString(rawEdge.target) || graphifyString(rawEdge.to) || `edge-${index + 1}:target`
  const relation = graphifyString(rawEdge.relation) || 'related_to'
  const fallbackSourceFile = `graphify/generated-edge-${index + 1}`
  const fallbackSourceLocation = `edge:${from}:${relation}:${to}`
  const rawSourceFile = graphifyString(rawEdge.source_file)
  const rawSourceLocation = graphifyString(rawEdge.source_location)
  const sourceFile = safeGraphifySourcePath(rawSourceFile, fallbackSourceFile)
  const sourceLocation = graphifyString(rawSourceLocation) || fallbackSourceLocation
  const context = graphifyString(rawEdge.context) || `${from} ${relation} ${to}.`
  const confidenceLabel = graphifyString(rawEdge.confidence) || 'EXTRACTED'
  const confidenceScore = graphifyConfidenceScore(rawEdge)
  const weight = graphifyNumber(rawEdge.weight, confidenceScore)
  const citationIdx = citationIndexer.citationIndexFor({
    rawSourceFile: rawSourceFile || fallbackSourceFile,
    rawSourceLocation: rawSourceLocation || fallbackSourceLocation,
    sourceFile,
    sourceLocation,
    title: `${from} ${relation} ${to}`,
    score: graphifyScore(confidenceScore),
    snippet: context,
  })

  return {
    from,
    relation,
    to,
    context,
    confidence: confidenceLabel,
    confidenceScore,
    sourceId,
    sourceFile,
    sourceLocation,
    citationIdx,
    weight,
  }
}

function createGraphifyCitationIndexer(sourceId) {
  const citations = []
  const citationIndexByKey = new Map()
  return {
    citations,
    citationIndexFor({ rawSourceFile, rawSourceLocation, sourceFile, sourceLocation, title, score, snippet }) {
      const citationKey = `${rawSourceFile}\u0000${rawSourceLocation}`
      const existingIndex = citationIndexByKey.get(citationKey)
      if (existingIndex) return existingIndex

      const pageId = `graphify-${safeSlug(sourceFile, 'source')}-${stableHash(citationKey)}`
      const citation = {
        id: `${sourceId}:${pageId}`,
        sourceId,
        pageId,
        title: title || sourceFile,
        path: sourceFile,
        sourceLocation,
        score: graphifyScore(score),
        snippet: snippet || `${sourceFile} at ${sourceLocation}`,
        sourceRefs: [{ sourceId, pageId }],
      }
      citations.push(citation)
      citationIndexByKey.set(citationKey, citations.length)
      return citations.length
    },
  }
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function graphifyString(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function graphifyNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function graphifyScore(value) {
  const number = graphifyNumber(value, 0.8)
  return Number(Math.max(0, Math.min(1, number)).toFixed(4))
}

function graphifyConfidenceScore(edge) {
  const rawEdge = objectOrEmpty(edge)
  const directScore = graphifyNumber(rawEdge.confidence_score, null)
  if (directScore !== null) return graphifyScore(directScore)
  const numericConfidence = graphifyNumber(rawEdge.confidence, null)
  if (numericConfidence !== null) return graphifyScore(numericConfidence)
  const confidenceLabel = graphifyString(rawEdge.confidence).toUpperCase()
  if (confidenceLabel === 'EXTRACTED') return 1
  if (confidenceLabel === 'INFERRED') return 0.75
  if (confidenceLabel === 'AMBIGUOUS') return 0.2
  return 0.8
}

function safeGraphifySourcePath(rawSourceFile, fallbackPath) {
  const text = graphifyString(rawSourceFile)
  if (!text) return fallbackPath

  const normalized = text.replace(/\\/g, '/').trim()
  if (!normalized) return fallbackPath

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized)
      return `graphify/${basename(url.pathname) || 'source'}`
    } catch {
      return 'graphify/source'
    }
  }

  const parts = normalized.split('/').filter((part) => part && part !== '.')
  if (!parts.length) return fallbackPath
  if (looksAbsoluteOrParentPath(normalized, parts)) {
    return `graphify/${basename(normalized) || 'source'}`
  }
  return parts.join('/')
}

function looksAbsoluteOrParentPath(normalizedPath, parts) {
  return /^[a-zA-Z]:\//.test(normalizedPath)
    || normalizedPath.startsWith('/')
    || normalizedPath.startsWith('//')
    || normalizedPath.startsWith('~')
    || parts.includes('..')
}

function safeSlug(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return slug || fallback
}

function stableHash(value) {
  let hash = 2166136261
  for (const char of String(value)) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function buildEvidenceBundleFixtures() {
  return [
    {
      id: 'single-source',
      description: 'One successful synthetic llmwiki-http source with citations, graph summary, corpus summary, and an explicit empty sourceFailures array.',
      query: 'What release-readiness evidence should the runtime cite?',
      evidenceBundle: {
        schema: 'llmwiki-agent-bridge.answer-evidence.v1',
        runtimeContract: {
          citations: 'Use the top-level citations array as the only citation anchor source.',
          graph: 'Graph and source bundle details are returned in the bridge artifact and source tools, not in this answer prompt.',
        },
        citationDigest: [
          {
            id: 'release-wiki:release-readiness',
            title: 'Release Readiness',
            path: 'docs/release-readiness.md',
            snippet: 'Release readiness depends on local checks, citation anchors, graph summaries, and explicit source limitations.',
            sourceRefs: [{ sourceId: 'release-wiki', pageId: 'release-readiness' }],
          },
          {
            id: 'release-wiki:runtime-profiles',
            title: 'Runtime Profiles',
            path: 'docs/runtime-profiles.md',
            snippet: 'Runtime profiles share the same evidence contract and differ only in local runtime configuration.',
            sourceRefs: [{ sourceId: 'release-wiki', pageId: 'runtime-profiles' }],
          },
        ],
        citations: [
          {
            id: 'release-wiki:release-readiness',
            sourceId: 'release-wiki',
            pageId: 'release-readiness',
            title: 'Release Readiness',
            path: 'docs/release-readiness.md',
            score: 0.94,
            snippet: 'Release readiness depends on local checks, citation anchors, graph summaries, and explicit source limitations.',
            sourceRefs: [{ sourceId: 'release-wiki', pageId: 'release-readiness' }],
          },
          {
            id: 'release-wiki:runtime-profiles',
            sourceId: 'release-wiki',
            pageId: 'runtime-profiles',
            title: 'Runtime Profiles',
            path: 'docs/runtime-profiles.md',
            score: 0.88,
            snippet: 'Runtime profiles share the same evidence contract and differ only in local runtime configuration.',
            sourceRefs: [{ sourceId: 'release-wiki', pageId: 'runtime-profiles' }],
          },
        ],
        sources: [
          {
            id: 'release-wiki',
            name: 'Synthetic Release Wiki',
            protocol: 'llmwiki-http',
            description: 'Synthetic source used only for local prompt rendering benchmarks.',
            wikiTitle: 'Synthetic Release Wiki',
            adapter: 'markdown',
            implementation: 'synthetic-fixture',
            pageCount: 42,
            approvedPageCount: 40,
            orientation: [
              {
                title: 'Release Readiness',
                path: 'docs/release-readiness.md',
                summary: 'Checks must pass before release, and runtime answers should cite the relevant evidence.',
              },
              {
                title: 'Runtime Profiles',
                path: 'docs/runtime-profiles.md',
                summary: 'Profiles configure local runtime identity while preserving the bridge evidence shape.',
              },
            ],
            citationIndexes: [1, 2],
            citationCount: 2,
            limitations: ['Synthetic benchmark fixture; no live Knowledge Source was queried.'],
            graph: {
              nodeCount: 5,
              edgeCount: 4,
            },
          },
        ],
        sourceFailures: [],
        mergedGraphSummary: {
          nodeCount: 5,
          edgeCount: 4,
          corpusPageCount: 42,
          corpusApprovedPageCount: 40,
        },
        mergedCorpusSummary: {
          sourceCount: 1,
          pageCount: 42,
          approvedPageCount: 40,
          sources: [
            {
              id: 'release-wiki',
              name: 'Synthetic Release Wiki',
              protocol: 'llmwiki-http',
              description: 'Synthetic source used only for local prompt rendering benchmarks.',
              wikiTitle: 'Synthetic Release Wiki',
              adapter: 'markdown',
              implementation: 'synthetic-fixture',
              pageCount: 42,
              approvedPageCount: 40,
            },
          ],
        },
        citationCount: 2,
      },
    },
    {
      id: 'multi-source',
      description: 'Two successful synthetic sources plus one redacted source failure, with citation refs, source summaries, and merged graph/corpus summaries.',
      query: 'How do client paths and runtime profiles affect bridge release risk?',
      evidenceBundle: {
        schema: 'llmwiki-agent-bridge.answer-evidence.v1',
        runtimeContract: {
          citations: 'Use the top-level citations array as the only citation anchor source.',
          graph: 'Graph and source bundle details are returned in the bridge artifact and source tools, not in this answer prompt.',
        },
        citationDigest: [
          {
            id: 'client-wiki:bridge-path',
            title: 'Bridge Client Path',
            path: 'docs/client-paths.md',
            snippet: 'Use the bridge path when a client wants source fan-out, evidence bundling, runtime synthesis, and one normalized artifact.',
            sourceRefs: [{ sourceId: 'client-wiki', pageId: 'bridge-path' }],
          },
          {
            id: 'runtime-wiki:generic-profile',
            title: 'Generic Runtime Profile',
            path: 'docs/runtime-profiles.md',
            snippet: 'The generic profile fits local OpenAI-compatible runtimes that do not need runtime-specific naming.',
            sourceRefs: [{ sourceId: 'runtime-wiki', pageId: 'generic-profile' }],
          },
          {
            id: 'runtime-wiki:evidence-only',
            title: 'Evidence-only Mode',
            path: 'docs/runtime-profiles.md',
            snippet: 'Evidence-only mode gathers citations, graph context, trace steps, and source bundle metadata without calling a runtime.',
            sourceRefs: [{ sourceId: 'runtime-wiki', pageId: 'evidence-only' }],
          },
        ],
        citations: [
          {
            id: 'client-wiki:bridge-path',
            sourceId: 'client-wiki',
            pageId: 'bridge-path',
            title: 'Bridge Client Path',
            path: 'docs/client-paths.md',
            score: 0.96,
            snippet: 'Use the bridge path when a client wants source fan-out, evidence bundling, runtime synthesis, and one normalized artifact.',
            sourceRefs: [{ sourceId: 'client-wiki', pageId: 'bridge-path' }],
          },
          {
            id: 'client-wiki:direct-path',
            sourceId: 'client-wiki',
            pageId: 'direct-path',
            title: 'Direct Client Path',
            path: 'docs/client-paths.md',
            score: 0.79,
            snippet: 'Use the direct path when the client can safely call the Knowledge Source and manage its own prompting.',
            sourceRefs: [{ sourceId: 'client-wiki', pageId: 'direct-path' }],
          },
          {
            id: 'runtime-wiki:generic-profile',
            sourceId: 'runtime-wiki',
            pageId: 'generic-profile',
            title: 'Generic Runtime Profile',
            path: 'docs/runtime-profiles.md',
            score: 0.91,
            snippet: 'The generic profile fits local OpenAI-compatible runtimes that do not need runtime-specific naming.',
            sourceRefs: [{ sourceId: 'runtime-wiki', pageId: 'generic-profile' }],
          },
          {
            id: 'runtime-wiki:evidence-only',
            sourceId: 'runtime-wiki',
            pageId: 'evidence-only',
            title: 'Evidence-only Mode',
            path: 'docs/runtime-profiles.md',
            score: 0.86,
            snippet: 'Evidence-only mode gathers citations, graph context, trace steps, and source bundle metadata without calling a runtime.',
            sourceRefs: [{ sourceId: 'runtime-wiki', pageId: 'evidence-only' }],
          },
        ],
        sources: [
          {
            id: 'client-wiki',
            name: 'Synthetic Client Path Wiki',
            protocol: 'llmwiki-http',
            description: 'Synthetic client-path source for comparing runtime prompt evidence renderers.',
            wikiTitle: 'Synthetic Client Path Wiki',
            adapter: 'markdown',
            implementation: 'synthetic-fixture',
            pageCount: 64,
            approvedPageCount: 62,
            orientation: [
              {
                title: 'Bridge Client Path',
                path: 'docs/client-paths.md',
                summary: 'Bridge clients delegate fan-out, evidence bundling, runtime synthesis, citations, graph data, and trace shaping.',
              },
              {
                title: 'Direct Client Path',
                path: 'docs/client-paths.md',
                summary: 'Direct clients call a Knowledge Source directly and own prompt construction and synthesis policy.',
              },
            ],
            citationIndexes: [1, 2],
            citationCount: 2,
            limitations: ['Synthetic source summary; contract fields are representative but not fetched.'],
            graph: {
              nodeCount: 4,
              edgeCount: 3,
            },
          },
          {
            id: 'runtime-wiki',
            name: 'Synthetic Runtime Profile Wiki',
            protocol: 'mcp',
            description: 'Synthetic runtime-profile source for local renderer baseline checks.',
            wikiTitle: 'Synthetic Runtime Profile Wiki',
            adapter: 'markdown',
            implementation: 'synthetic-fixture',
            pageCount: 37,
            approvedPageCount: 35,
            orientation: [
              {
                title: 'Generic Runtime Profile',
                path: 'docs/runtime-profiles.md',
                summary: 'The generic profile works with local OpenAI-compatible chat completions endpoints.',
              },
              {
                title: 'Evidence-only Mode',
                path: 'docs/runtime-profiles.md',
                summary: 'Evidence-only mode is useful for smoke tests that must not call a provider runtime.',
              },
            ],
            citationIndexes: [3, 4],
            citationCount: 2,
            limitations: ['Runtime behavior is not exercised by this benchmark.'],
            graph: {
              nodeCount: 6,
              edgeCount: 5,
            },
          },
        ],
        sourceFailures: [
          {
            id: 'archive-wiki',
            name: 'Synthetic Archive Wiki',
            protocol: 'a2a',
            error: 'Source query failed.',
            message: 'Synthetic Archive Wiki could not be queried by the bridge.',
            remediation: 'Confirm the local source is selected and ready before real runtime synthesis.',
          },
        ],
        mergedGraphSummary: {
          nodeCount: 10,
          edgeCount: 8,
          corpusPageCount: 101,
          corpusApprovedPageCount: 97,
        },
        mergedCorpusSummary: {
          sourceCount: 2,
          pageCount: 101,
          approvedPageCount: 97,
          sources: [
            {
              id: 'client-wiki',
              name: 'Synthetic Client Path Wiki',
              protocol: 'llmwiki-http',
              description: 'Synthetic client-path source for comparing runtime prompt evidence renderers.',
              wikiTitle: 'Synthetic Client Path Wiki',
              adapter: 'markdown',
              implementation: 'synthetic-fixture',
              pageCount: 64,
              approvedPageCount: 62,
            },
            {
              id: 'runtime-wiki',
              name: 'Synthetic Runtime Profile Wiki',
              protocol: 'mcp',
              description: 'Synthetic runtime-profile source for local renderer baseline checks.',
              wikiTitle: 'Synthetic Runtime Profile Wiki',
              adapter: 'markdown',
              implementation: 'synthetic-fixture',
              pageCount: 37,
              approvedPageCount: 35,
            },
          ],
        },
        citationCount: 4,
      },
    },
    graphFixture({
      id: 'graph-linear-chain',
      description: 'Graph-shaped evidence with a linear decision chain from problem to implementation to validation.',
      query: 'Which implementation and validation steps follow from the compact runtime prompt decision?',
      sourceId: 'graph-linear',
      sourceName: 'Synthetic Linear Graph Wiki',
      citationPrefix: 'linear',
      citations: [
        ['decision', 'Runtime Prompt Decision', 'docs/decisions/runtime-prompt.md', 'The bridge should keep canonical JSON but render runtime prompt evidence through an explicit prompt codec.'],
        ['implementation', 'Prompt Codec Implementation', 'specs/runtime-prompt-codec/plan.md', 'Implementation starts with compact JSON and a renderer seam before adding TOON or markdown projections.'],
        ['validation', 'Runtime Prompt Validation', 'specs/runtime-prompt-codec/tests.md', 'Validation requires citation anchors, source ids, graph summaries, and renderer size metrics to remain stable.'],
      ],
      graphNodes: [
        ['problem', 'Runtime prompt token overhead', 'problem', 1],
        ['decision', 'Use renderer seam', 'decision', 1],
        ['implementation', 'Compact JSON renderer', 'implementation', 2],
        ['benchmark', 'Prompt renderer benchmark', 'validation', 3],
        ['rollout', 'Codec default rollout', 'rollout', 3],
      ],
      graphEdges: [
        ['problem', 'motivates', 'decision', 1, 0.95],
        ['decision', 'requires', 'implementation', 2, 0.91],
        ['implementation', 'measured_by', 'benchmark', 3, 0.89],
        ['benchmark', 'gates', 'rollout', 3, 0.88],
      ],
      limitations: ['Synthetic linear CKG fixture; validates graph row rendering only.'],
      answerOracle: {
        schema: 'llmwiki-agent-bridge.answer-oracle.v1',
        gate: 'strict',
        requiredTerms: [
          { anyOf: ['Runtime Prompt Decision', 'runtime prompt decision'] },
          { anyOf: ['Prompt Codec Implementation', 'compact JSON renderer'] },
          { anyOf: ['Runtime Prompt Validation', 'validation'] },
        ],
        requiredRelations: [
          {
            from: { anyOf: ['Runtime Prompt Decision', 'decision'] },
            relation: { anyOf: ['requires', 'requires implementation'] },
            to: { anyOf: ['Prompt Codec Implementation', 'implementation'] },
          },
          {
            from: { anyOf: ['Prompt Codec Implementation', 'implementation'] },
            relation: { anyOf: ['measured by', 'measured'] },
            to: { anyOf: ['Prompt renderer benchmark', 'benchmark'] },
          },
        ],
        forbiddenTerms: [
          'production default is approved',
          'citations are optional',
        ],
        unsupportedClaims: [
          { allOf: ['Prompt Codec Implementation', 'is the production default'] },
        ],
        contradictoryClaims: [
          { allOf: ['Runtime Prompt Decision', 'does not require', 'Prompt Codec Implementation'] },
        ],
        expectedCitationMappings: [
          {
            claim: 'Runtime Prompt Decision requires Prompt Codec Implementation',
            expectedCitationIds: ['graph-linear:linear-implementation'],
            windowChars: 120,
          },
          {
            claim: 'Prompt Codec Implementation measured by Prompt renderer benchmark',
            expectedCitationIds: ['graph-linear:linear-validation'],
            windowChars: 120,
          },
        ],
      },
    }),
    graphFixture({
      id: 'graph-dense-crossrefs',
      description: 'Dense CKG-style cross-reference fixture with repeated edge rows across decisions, specs, tests, and docs.',
      query: 'Which specs and tests should be cited when deciding whether TOON can replace compact JSON?',
      sourceId: 'graph-dense',
      sourceName: 'Synthetic Dense Graph Wiki',
      citationPrefix: 'dense',
      citations: [
        ['toon-eval', 'TOON Evaluation Plan', 'specs/toon-eval/plan.md', 'TOON can only become a default renderer after compact JSON, markdown, and TOON pass the same citation-fidelity gates.'],
        ['graph-fixtures', 'Graph Fixture Matrix', 'specs/toon-eval/tests.md', 'The evaluation matrix must include linear chains, dense cross-references, and nested metadata graph records.'],
        ['runtime-docs', 'Runtime Prompt Docs', 'docs/runtime-prompts.md', 'Runtime docs should describe prompt codecs as ephemeral LLM input renderers, not canonical artifacts.'],
        ['fallback', 'Codec Fallback Policy', 'docs/decisions/codec-fallback.md', 'If a prompt codec loses citation anchors or inflates tokens on a fixture, the bridge falls back to compact JSON.'],
      ],
      graphNodes: [
        ['toon', 'TOON renderer', 'renderer', 1],
        ['compact-json', 'Compact JSON renderer', 'renderer', 1],
        ['markdown', 'Markdown row renderer', 'renderer', 1],
        ['fixture-matrix', 'Graph fixture matrix', 'test-plan', 2],
        ['runtime-docs', 'Runtime prompt docs', 'docs', 3],
        ['fallback', 'Codec fallback policy', 'policy', 4],
        ['citation-gate', 'Citation anchor gate', 'test-gate', 4],
      ],
      graphEdges: [
        ['toon', 'compared_with', 'compact-json', 1, 0.93],
        ['toon', 'compared_with', 'markdown', 1, 0.92],
        ['fixture-matrix', 'tests', 'toon', 2, 0.96],
        ['fixture-matrix', 'tests', 'compact-json', 2, 0.91],
        ['fixture-matrix', 'tests', 'markdown', 2, 0.91],
        ['runtime-docs', 'documents', 'toon', 3, 0.77],
        ['fallback', 'guards', 'citation-gate', 4, 0.98],
        ['citation-gate', 'gates', 'toon', 4, 0.95],
        ['citation-gate', 'gates', 'markdown', 4, 0.90],
      ],
      limitations: ['Synthetic dense CKG fixture; edge weights are illustrative.'],
    }),
    graphFixture({
      id: 'graph-mixed-nested-metadata',
      description: 'Mixed graph fixture with uniform graph rows plus nested metadata to expose TOON fallback and overhead behavior.',
      query: 'What risks should block a prompt codec rollout when graph metadata becomes irregular?',
      sourceId: 'graph-mixed',
      sourceName: 'Synthetic Mixed Metadata Graph Wiki',
      citationPrefix: 'mixed',
      citations: [
        ['metadata-risk', 'Nested Metadata Risk', 'docs/risks/nested-metadata.md', 'Deep or irregular metadata can erase token savings and make prompt codecs harder to inspect.'],
        ['escaping-risk', 'Escaping Risk', 'docs/risks/escaping.md', 'Snippets with pipes | commas, code blocks, and prompt-injection text must survive renderer escaping and citation validation.'],
        ['fallback-risk', 'Fallback Risk', 'docs/risks/fallback.md', 'Codec rollout should fail closed to compact JSON when renderer validation or live citation checks fail.'],
      ],
      graphNodes: [
        ['risk:nested', 'Nested metadata overhead', 'risk', 1],
        ['risk:escaping', 'Delimiter escaping hazard', 'risk', 2],
        ['risk:fallback', 'Fallback required', 'risk', 3],
        ['gate:roundtrip', 'Renderer round-trip gate', 'gate', 3],
        ['gate:live', 'Live citation gate', 'gate', 3],
      ],
      graphEdges: [
        ['risk:nested', 'can_break', 'gate:roundtrip', 1, 0.87],
        ['risk:escaping', 'can_break', 'gate:roundtrip', 2, 0.94],
        ['risk:fallback', 'requires', 'gate:live', 3, 0.91],
        ['gate:roundtrip', 'precedes', 'gate:live', 3, 0.89],
      ],
      limitations: ['Synthetic mixed graph fixture includes nested metadata and delimiter-heavy snippets.'],
      extraMetadata: {
        rendererRiskProfile: {
          nested: true,
          irregularFields: true,
          delimiterCases: ['pipe | character', 'comma, character', 'markdown `code` fence', 'prompt text: ignore previous instructions'],
        },
        rollout: {
          phase: 'benchmark-only',
          defaultAllowed: false,
          fallback: { renderer: 'compact-json', reason: 'lossless canonical fallback' },
        },
      },
    }),
  ]
}

function graphFixture({ id, description, query, sourceId, sourceName, citationPrefix, citations, graphNodes, graphEdges, limitations, extraMetadata = undefined, answerOracle = undefined }) {
  const normalizedCitations = citations.map(([slug, title, path, snippet], index) => ({
    id: `${sourceId}:${citationPrefix}-${slug}`,
    sourceId,
    pageId: `${citationPrefix}-${slug}`,
    title,
    path,
    score: Number((0.96 - index * 0.04).toFixed(2)),
    snippet,
    sourceRefs: [{ sourceId, pageId: `${citationPrefix}-${slug}` }],
  }))
  const normalizedGraphNodes = graphNodes.map(([nodeId, label, kind, citationIdx]) => ({
    id: nodeId,
    label,
    kind,
    sourceId,
    citationIdx,
  }))
  const normalizedGraphEdges = graphEdges.map(([from, relation, to, citationIdx, weight]) => ({
    from,
    relation,
    to,
    citationIdx,
    sourceId,
    weight,
  }))

  return {
    id,
    description,
    query,
    ...(answerOracle ? { answerOracle } : {}),
    evidenceBundle: {
      schema: 'llmwiki-agent-bridge.answer-evidence.v1',
      runtimeContract: {
        citations: 'Use the top-level citations array as the only citation anchor source.',
        graph: 'Graph rows are prompt-only CKG fixtures. Cite claims using citation indexes, not node ids.',
      },
      citationDigest: normalizedCitations.map((citation) => ({
        id: citation.id,
        title: citation.title,
        path: citation.path,
        snippet: citation.snippet,
        sourceRefs: citation.sourceRefs,
      })),
      citations: normalizedCitations,
      sources: [
        {
          id: sourceId,
          name: sourceName,
          protocol: 'llmwiki-http',
          description: 'Synthetic graph-focused source for prompt renderer benchmarks.',
          wikiTitle: sourceName,
          adapter: 'markdown',
          implementation: 'synthetic-graph-fixture',
          pageCount: 24,
          approvedPageCount: 24,
          orientation: normalizedCitations.slice(0, 2).map((citation) => ({
            title: citation.title,
            path: citation.path,
            summary: citation.snippet,
          })),
          citationIndexes: normalizedCitations.map((_, index) => index + 1),
          citationCount: normalizedCitations.length,
          limitations,
          graph: {
            nodeCount: normalizedGraphNodes.length,
            edgeCount: normalizedGraphEdges.length,
          },
        },
      ],
      sourceFailures: [],
      graphNodes: normalizedGraphNodes,
      graphEdges: normalizedGraphEdges,
      ...(extraMetadata ? { extraMetadata } : {}),
      mergedGraphSummary: {
        nodeCount: normalizedGraphNodes.length,
        edgeCount: normalizedGraphEdges.length,
        corpusPageCount: 24,
        corpusApprovedPageCount: 24,
      },
      mergedCorpusSummary: {
        sourceCount: 1,
        pageCount: 24,
        approvedPageCount: 24,
        sources: [
          {
            id: sourceId,
            name: sourceName,
            protocol: 'llmwiki-http',
            description: 'Synthetic graph-focused source for prompt renderer benchmarks.',
            wikiTitle: sourceName,
            adapter: 'markdown',
            implementation: 'synthetic-graph-fixture',
            pageCount: 24,
            approvedPageCount: 24,
          },
        ],
      },
      citationCount: normalizedCitations.length,
    },
  }
}

function isCliEntrypoint() {
  return Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isCliEntrypoint()) {
  await main().catch((error) => {
    process.stderr.write(`${redactForReport(error?.message || String(error))}\n`)
    process.exitCode = 1
  })
}

export {
  analyzeCitationAnchors,
  classifyLiveRunFailureBuckets,
  classifyLiveRunFailureCodes,
  evaluateAnswerOracle,
  evaluateExpectedCitationMappings,
}
