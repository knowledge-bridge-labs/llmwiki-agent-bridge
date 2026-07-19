#!/usr/bin/env node

import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const BENCHMARK_SCRIPT = 'scripts/benchmark-runtime-prompt.mjs'
const DEFAULT_OVERALL_TIMEOUT_MS = 180_000
const SAFE_SUMMARY_SCHEMA = 'llmwiki-agent-bridge.runtime-prompt-live-safe.v1'
const LIVE_SAFE_TIMEOUT_ENV = 'LLMWIKI_AGENT_BRIDGE_LIVE_SAFE_OVERALL_TIMEOUT_MS'
const SENSITIVE_ENV_NAMES = [
  'LLMWIKI_AGENT_BRIDGE_BASE_URL',
  'LLMWIKI_AGENT_BRIDGE_MODEL',
  'LLMWIKI_AGENT_BRIDGE_API_KEY',
  'HERMES_BASE_URL',
  'HERMES_MODEL',
  'HERMES_API_KEY',
  'OPENAI_API_KEY',
]

const EMPTY_SCAN_CATEGORIES = Object.freeze({
  rawOutputTextField: 0,
  configuredEnvValue: 0,
  keyLikeToken: 0,
  bearerToken: 0,
  apiKeyQueryValue: 0,
  tempPath: 0,
  absoluteLocalPath: 0,
  scanReadError: 0,
})

const PROFILES = {
  'loop17-smoke': {
    id: 'loop17-smoke',
    description: 'Private-safe one-run strict-fixture smoke for Loop 17 docs aggregates.',
    defaults: [
      ['--fixture', 'graph-linear-chain,graph-strict-evidence-fidelity'],
      ['--renderer', 'compact-json'],
      ['--live-runs', '1'],
      ['--temperature', '0.2'],
      ['--max-tokens', '768'],
      ['--timeout-ms', '120000'],
    ],
  },
  'loop17-full': {
    id: 'loop17-full',
    description: 'Private-safe repeated strict-fixture calibration across live renderer candidates.',
    defaults: [
      ['--fixture', 'graph-linear-chain,graph-strict-evidence-fidelity'],
      ['--renderer', 'compact-json,markdown-summary,toon'],
      ['--live-runs', '3'],
      ['--temperature', '0.2'],
      ['--max-tokens', '768'],
      ['--timeout-ms', '120000'],
    ],
  },
  none: {
    id: 'none',
    description: 'No wrapper defaults; pass-through arguments are used as provided and --live is still forced.',
    defaults: [],
  },
}

async function main(argv = process.argv.slice(2)) {
  const wrapperArgs = parseWrapperArgs(argv)
  if (wrapperArgs.help) {
    process.stdout.write(helpText())
    return
  }

  if (wrapperArgs.scanFiles.length) {
    const summary = await runScanOnly(wrapperArgs)
    await printSummaryAndSetExit(summary, summary.sensitiveScan.raw, !summary.sensitiveScan.raw.ok)
    return
  }

  const benchmarkCommand = buildBenchmarkCommand(wrapperArgs)
  const childResult = await runBenchmarkChild(benchmarkCommand.args, wrapperArgs.overallTimeoutMs)
  const rawScan = await scanSensitiveFiles(childResult.rawFiles)
  const parseResult = await parseBenchmarkJson(childResult.rawFiles.find((file) => file.kind === 'stdout'))
  const summary = buildLiveSafeSummary({
    wrapperArgs,
    benchmarkCommand,
    childResult,
    parseResult,
    rawScan,
  })
  const exitNonzero = childResult.timedOut
    || childResult.exitCode !== 0
    || !parseResult.ok
    || !rawScan.ok

  await printSummaryAndSetExit(summary, rawScan, exitNonzero)
}

function parseWrapperArgs(argv) {
  const args = {
    profileId: 'loop17-smoke',
    overallTimeoutMs: parsePositiveInteger(
      process.env[LIVE_SAFE_TIMEOUT_ENV],
      DEFAULT_OVERALL_TIMEOUT_MS,
      LIVE_SAFE_TIMEOUT_ENV,
    ),
    passThroughArgs: [],
    scanFiles: [],
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--profile') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--profile requires a profile id.')
      args.profileId = value
      index += 1
    } else if (arg.startsWith('--profile=')) {
      const value = arg.slice('--profile='.length)
      if (!value) throw new Error('--profile requires a profile id.')
      args.profileId = value
    } else if (arg === '--overall-timeout-ms') {
      const value = argv[index + 1]
      if (!value) throw new Error('--overall-timeout-ms requires a positive integer.')
      args.overallTimeoutMs = parsePositiveInteger(value, null, '--overall-timeout-ms')
      index += 1
    } else if (arg.startsWith('--overall-timeout-ms=')) {
      args.overallTimeoutMs = parsePositiveInteger(
        arg.slice('--overall-timeout-ms='.length),
        null,
        '--overall-timeout-ms',
      )
    } else if (arg === '--scan-file') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--scan-file requires a file path.')
      args.scanFiles.push(value)
      index += 1
    } else if (arg.startsWith('--scan-file=')) {
      const value = arg.slice('--scan-file='.length)
      if (!value) throw new Error('--scan-file requires a file path.')
      args.scanFiles.push(value)
    } else if (arg === '--') {
      args.passThroughArgs.push(...argv.slice(index + 1))
      break
    } else {
      args.passThroughArgs.push(arg)
    }
  }

  if (!PROFILES[args.profileId]) {
    throw new Error(`Unknown --profile value. Available profiles: ${Object.keys(PROFILES).join(', ')}`)
  }

  return args
}

function helpText() {
  return [
    'Usage: node scripts/validate-runtime-prompt-live-safe.mjs [wrapper-options] [benchmark-options]',
    '',
    'Runs scripts/benchmark-runtime-prompt.mjs --live through a private-safe wrapper.',
    'Raw child stdout/stderr are written only to OS temp files, are scanned for',
    'sensitive patterns, and are never printed with paths or matched values.',
    '',
    'Wrapper options:',
    '  --profile <id>              Defaults profile: loop17-smoke, loop17-full, or none.',
    `                              Default: loop17-smoke.`,
    '  --overall-timeout-ms <ms>   Wall-clock timeout for the entire benchmark child.',
    `                              Default: ${DEFAULT_OVERALL_TIMEOUT_MS}.`,
    '  --scan-file <path>          Test-only scan mode for one or more raw files; no benchmark is run.',
    '',
    'Benchmark options are passed through. Wrapper defaults are only added when',
    'the matching benchmark option is not already present. --live is always added.',
    '',
  ].join('\n')
}

function buildBenchmarkCommand(wrapperArgs) {
  const profile = PROFILES[wrapperArgs.profileId]
  const args = [...wrapperArgs.passThroughArgs]
  const defaultsApplied = []

  if (!hasOption(args, '--live')) {
    args.unshift('--live')
    defaultsApplied.push('--live')
  }

  for (const [option, value] of profile.defaults) {
    if (!hasOption(args, option)) {
      args.push(option, value)
      defaultsApplied.push(option)
    }
  }

  return {
    script: BENCHMARK_SCRIPT,
    args,
    profile,
    defaultsApplied,
    summary: summarizeCommandArguments(args, defaultsApplied),
  }
}

async function runBenchmarkChild(args, overallTimeoutMs) {
  const rawDir = await mkdtemp(join(tmpdir(), 'llmwiki-runtime-prompt-live-safe-'))
  const stdoutPath = join(rawDir, 'benchmark.stdout.json')
  const stderrPath = join(rawDir, 'benchmark.stderr.txt')
  const stdoutStream = createWriteStream(stdoutPath, { flags: 'wx' })
  const stderrStream = createWriteStream(stderrPath, { flags: 'wx' })
  const stdoutFinished = writableFinished(stdoutStream)
  const stderrFinished = writableFinished(stderrStream)
  const child = spawn(process.execPath, [BENCHMARK_SCRIPT, ...args], {
    cwd: packageRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.pipe(stdoutStream)
  child.stderr.pipe(stderrStream)

  let timedOut = false
  let forcedKillTimer = null
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
    forcedKillTimer = setTimeout(() => {
      child.kill('SIGKILL')
    }, 5_000)
    forcedKillTimer.unref()
  }, overallTimeoutMs)
  timeout.unref()

  const { exitCode, signal } = await childClosed(child)
  clearTimeout(timeout)
  if (forcedKillTimer) clearTimeout(forcedKillTimer)
  await Promise.all([stdoutFinished, stderrFinished])

  return {
    status: timedOut ? 'timeout' : (exitCode === 0 ? 'ok' : 'failed'),
    exitCode,
    signal,
    timedOut,
    rawFiles: [
      { kind: 'stdout', path: stdoutPath },
      { kind: 'stderr', path: stderrPath },
    ],
  }
}

function childClosed(child) {
  return new Promise((resolve) => {
    child.once('error', () => {
      resolve({ exitCode: null, signal: null })
    })
    child.once('close', (exitCode, signal) => {
      resolve({ exitCode, signal })
    })
  })
}

function writableFinished(stream) {
  return new Promise((resolve, reject) => {
    stream.once('finish', resolve)
    stream.once('error', reject)
  })
}

async function parseBenchmarkJson(stdoutFile) {
  if (!stdoutFile) return { ok: false, report: null }

  let text = ''
  try {
    text = await readFile(stdoutFile.path, 'utf8')
  } catch {
    return { ok: false, report: null }
  }

  try {
    return {
      ok: true,
      report: JSON.parse(text),
    }
  } catch {
    return {
      ok: false,
      report: null,
    }
  }
}

async function runScanOnly(wrapperArgs) {
  const rawScan = await scanSensitiveFiles(
    wrapperArgs.scanFiles.map((path) => ({ kind: 'scan-input', path })),
  )
  const summary = {
    schema: SAFE_SUMMARY_SCHEMA,
    mode: 'scan-only',
    profile: {
      id: wrapperArgs.profileId,
      description: PROFILES[wrapperArgs.profileId].description,
    },
    command: {
      optionNames: ['--scan-file'],
      safeValues: {
        scanFileCount: wrapperArgs.scanFiles.length,
      },
    },
    child: null,
    live: null,
    sensitiveScan: {
      raw: summarizeScanForReport(rawScan),
      sanitizedOutput: summarizeScanForReport(emptyScanResult()),
      ok: rawScan.ok,
      totalMatches: rawScan.totalMatches,
      categories: { ...rawScan.categories },
    },
  }
  return summary
}

async function printSummaryAndSetExit(summary, rawScan, exitNonzero) {
  const sanitizedOutputScan = scanSensitiveText(JSON.stringify(summary), {
    envValues: collectSensitiveEnvValues(),
  })
  let printableSummary = summary
  if (!sanitizedOutputScan.ok) {
    printableSummary = buildWithheldSummary(summary)
  }
  printableSummary.sensitiveScan = combineScanReports(rawScan, sanitizedOutputScan)
  const finalText = `${JSON.stringify(printableSummary, null, 2)}\n`
  process.stdout.write(finalText)
  if (exitNonzero || !sanitizedOutputScan.ok) {
    process.exitCode = 1
  }
}

function buildWithheldSummary(summary) {
  return {
    schema: SAFE_SUMMARY_SCHEMA,
    mode: safeString(summary?.mode),
    profile: summary?.profile ? { id: safeNameOrNull(summary.profile.id) } : null,
    command: summary?.command ? {
      script: summary.command.script ? BENCHMARK_SCRIPT : null,
      forcedLive: Boolean(summary.command.forcedLive),
      optionNames: Array.isArray(summary.command.optionNames) ? summary.command.optionNames.map(safeString) : [],
    } : null,
    child: summary?.child ? {
      status: safeString(summary.child.status),
      exitCode: numberOrNull(summary.child.exitCode),
      signal: safeString(summary.child.signal),
      timedOut: Boolean(summary.child.timedOut),
      overallTimeoutMs: numberOrNull(summary.child.overallTimeoutMs),
      jsonParse: {
        ok: Boolean(summary.child.jsonParse?.ok),
      },
    } : null,
    live: summary?.live ? {
      status: safeString(summary.live.status),
      validation: {
        ok: Boolean(summary.live.validation?.ok),
        failureCount: numberOrZero(summary.live.validation?.failureCount),
      },
      recommendation: {
        status: safeString(summary.live.recommendation?.status),
        recommendedRendererId: safeNameOrNull(summary.live.recommendation?.recommendedRendererId),
      },
    } : null,
    note: 'Sanitized summary withheld because the sanitized-output scan detected sensitive content.',
  }
}

function buildLiveSafeSummary({ wrapperArgs, benchmarkCommand, childResult, parseResult, rawScan }) {
  const report = parseResult.report
  return {
    schema: SAFE_SUMMARY_SCHEMA,
    mode: 'live-safe',
    profile: {
      id: benchmarkCommand.profile.id,
      description: benchmarkCommand.profile.description,
    },
    command: {
      script: BENCHMARK_SCRIPT,
      forcedLive: true,
      optionNames: benchmarkCommand.summary.optionNames,
      defaultsApplied: benchmarkCommand.defaultsApplied,
      safeValues: benchmarkCommand.summary.safeValues,
    },
    child: {
      status: childResult.status,
      exitCode: childResult.exitCode,
      signal: childResult.signal,
      timedOut: childResult.timedOut,
      overallTimeoutMs: wrapperArgs.overallTimeoutMs,
      jsonParse: {
        ok: parseResult.ok,
      },
    },
    live: parseResult.ok ? sanitizeBenchmarkLiveReport(report) : null,
    sensitiveScan: {
      raw: summarizeScanForReport(rawScan),
      sanitizedOutput: summarizeScanForReport(emptyScanResult()),
      ok: rawScan.ok,
      totalMatches: rawScan.totalMatches,
      categories: { ...rawScan.categories },
    },
  }
}

function sanitizeBenchmarkLiveReport(report) {
  const live = report?.live || {}
  const rendererSummaries = {}
  for (const [rendererId, renderer] of Object.entries(live.totals?.renderers || {})) {
    rendererSummaries[rendererId] = sanitizeLiveRendererTotal(renderer)
  }

  return {
    status: live.status || 'unknown',
    configured: Boolean(live.configured),
    runtime: sanitizeRuntimeConfig(live.runtime),
    validation: {
      ok: Boolean(live.validation?.ok),
      checkCount: Array.isArray(live.validation?.checks) ? live.validation.checks.length : 0,
      failureCount: Array.isArray(live.validation?.failures) ? live.validation.failures.length : 0,
    },
    recommendation: sanitizeRecommendation(live.recommendation),
    totals: sanitizeLiveTotals(live.totals, rendererSummaries),
    renderers: rendererSummaries,
  }
}

function sanitizeRuntimeConfig(runtime = {}) {
  return {
    baseUrlConfigured: Boolean(runtime.baseUrlConfigured),
    modelConfigured: Boolean(runtime.modelConfigured),
    apiKeyConfigured: Boolean(runtime.apiKeyConfigured),
    endpointRedacted: runtime.endpointRedacted !== false,
    timeoutMs: numberOrNull(runtime.timeoutMs),
    maxTokens: numberOrNull(runtime.maxTokens),
    temperature: numberOrNull(runtime.temperature),
    liveRuns: numberOrNull(runtime.liveRuns),
  }
}

function sanitizeLiveTotals(totals = {}, rendererSummaries = {}) {
  const rendererValues = Object.values(rendererSummaries)
  const runCount = sumNumbers(rendererValues.map((renderer) => renderer.runCount))
  const passCount = sumNumbers(rendererValues.map((renderer) => renderer.passCount))
  const failCount = sumNumbers(rendererValues.map((renderer) => renderer.failCount))
  return {
    fixtureCount: numberOrNull(totals.fixtureCount),
    requestCount: numberOrNull(totals.requestCount),
    runCount,
    passCount,
    failCount,
    passRatePct: percentage(passCount, runCount),
    failureCodeCounts: mergeCountMaps(rendererValues.map((renderer) => renderer.failureCodeCounts)),
    finishReasonCounts: mergeCountMaps(rendererValues.map((renderer) => renderer.finishReasonCounts)),
    truncation: {
      truncatedCount: sumNumbers(rendererValues.map((renderer) => renderer.truncation.truncatedCount)),
      inferredTruncatedCount: sumNumbers(rendererValues.map((renderer) => renderer.truncation.inferredTruncatedCount)),
    },
    citationCoverage: {
      averageRequiredCitationAnchorCoveragePct: weightedAverage(
        rendererValues.map((renderer) => renderer.citationCoverage.averageRequiredCitationAnchorCoveragePct),
        rendererValues.map((renderer) => renderer.runCount),
      ),
      invalidCitationAnchorCount: sumNumbers(rendererValues.map((renderer) => renderer.citationCoverage.invalidCitationAnchorCount)),
      allRequiredCitationAnchorsCoveredCount: sumNumbers(rendererValues.map((renderer) => renderer.citationCoverage.allRequiredCitationAnchorsCoveredCount)),
    },
    answerOracle: pickAnswerOracleMetrics(totals.answerOracle),
    expectedCitationMappings: pickExpectedCitationMappingMetrics(totals.expectedCitationMappings),
    outputTextLength: combineNumberSummaries(
      rendererValues.map((renderer) => renderer.outputTextLength),
      rendererValues.map((renderer) => renderer.runCount),
    ),
  }
}

function sanitizeLiveRendererTotal(renderer = {}) {
  return {
    fixtureCount: numberOrNull(renderer.fixtureCount),
    requestCount: numberOrNull(renderer.requestCount),
    runCount: numberOrZero(renderer.runCount),
    passCount: numberOrZero(renderer.passCount),
    failCount: numberOrZero(renderer.failCount),
    passRatePct: numberOrNull(renderer.passRatePct),
    errorCount: numberOrZero(renderer.errorCount),
    runtimeUserPrompt: sanitizeMeasurement(renderer.runtimeUserPrompt),
    failureCodeCounts: sanitizeCountMap(renderer.failureCodeCounts),
    failureBucketCounts: sanitizeCountMap(renderer.failureBucketCounts),
    finishReasonCounts: sanitizeCountMap(renderer.finishReasonCounts),
    truncation: {
      truncatedCount: numberOrZero(renderer.truncatedCount),
      inferredTruncatedCount: numberOrZero(renderer.inferredTruncatedCount),
    },
    citationCoverage: {
      averageRequiredCitationAnchorCoveragePct: numberOrNull(renderer.averageRequiredCitationAnchorCoveragePct),
      invalidCitationAnchorCount: numberOrZero(renderer.invalidCitationAnchorCount),
      allRequiredCitationAnchorsCoveredCount: numberOrZero(renderer.allRequiredCitationAnchorsCoveredCount),
    },
    answerOracle: pickAnswerOracleMetrics(renderer.answerOracle),
    expectedCitationMappings: pickExpectedCitationMappingMetrics(renderer.expectedCitationMappings),
    outputTextLength: sanitizeNumberSummary(renderer.outputTextLength),
  }
}

function sanitizeRecommendation(recommendation = null) {
  if (!recommendation || typeof recommendation !== 'object') return null
  return {
    basis: safeString(recommendation.basis),
    sizeMetric: safeString(recommendation.sizeMetric),
    status: safeString(recommendation.status),
    recommendedRendererId: recommendation.recommendedRendererId || null,
    blockedReasonCount: Array.isArray(recommendation.blockedReasons) ? recommendation.blockedReasons.length : 0,
    ranking: Array.isArray(recommendation.ranking)
      ? recommendation.ranking.map(sanitizeRecommendationEntry)
      : [],
  }
}

function sanitizeRecommendationEntry(entry = {}) {
  return {
    id: safeString(entry.id),
    label: safeString(entry.label),
    mediaType: safeString(entry.mediaType),
    rank: numberOrNull(entry.rank),
    sizeRank: numberOrNull(entry.sizeRank),
    status: safeString(entry.status),
    eligible: Boolean(entry.eligible),
    blockingReasonCount: Array.isArray(entry.blockingReasons) ? entry.blockingReasons.length : 0,
    blockingReasons: Array.isArray(entry.blockingReasons) ? entry.blockingReasons.map(safeString) : [],
    runtimeUserPrompt: sanitizeMeasurement(entry.runtimeUserPrompt),
    strictLive: {
      runCount: numberOrZero(entry.strictLive?.runCount),
      passCount: numberOrZero(entry.strictLive?.passCount),
      failCount: numberOrZero(entry.strictLive?.failCount),
      passRatePct: numberOrNull(entry.strictLive?.passRatePct),
      failureCodeCount: numberOrZero(entry.strictLive?.failureCodeCount),
      truncatedCount: numberOrZero(entry.strictLive?.truncatedCount),
      inferredTruncatedCount: numberOrZero(entry.strictLive?.inferredTruncatedCount),
      strictOracleHitCount: numberOrZero(entry.strictLive?.strictOracleHitCount),
      strictCitationMappingFailureCount: numberOrZero(entry.strictLive?.strictCitationMappingFailureCount),
      strictMetricFailureCount: numberOrZero(entry.strictLive?.strictMetricFailureCount),
      strictQualityFailureCount: numberOrZero(entry.strictLive?.strictQualityFailureCount),
    },
  }
}

function pickAnswerOracleMetrics(answerOracle = {}) {
  return pickNumberFields(answerOracle, [
    'enabledRunCount',
    'strictFailureCount',
    'reportOnlyFailureCount',
    'missingRequiredTermCount',
    'missingRequiredPhraseCount',
    'missingRequiredRelationCount',
    'unsupportedClaimHitCount',
    'contradictoryClaimHitCount',
    'distortionCount',
    'strictUnsupportedClaimHitCount',
    'strictContradictoryClaimHitCount',
    'strictDistortionCount',
    'reportOnlyUnsupportedClaimHitCount',
    'reportOnlyContradictoryClaimHitCount',
    'reportOnlyDistortionCount',
    'averageOmissionRate',
    'averageRequiredItemCoveragePct',
    'averageRequiredTermCoveragePct',
    'averageRequiredPhraseCoveragePct',
    'averageRequiredRelationCoveragePct',
  ])
}

function pickExpectedCitationMappingMetrics(expectedCitationMappings = {}) {
  return pickNumberFields(expectedCitationMappings, [
    'enabledRunCount',
    'strictFailureCount',
    'expectedMappingCount',
    'strictMappingCount',
    'reportOnlyMappingCount',
    'satisfiedMappingCount',
    'averageCoveragePct',
    'claimOccurrenceCount',
    'satisfiedOccurrenceCount',
    'unsatisfiedOccurrenceCount',
    'occurrenceCoveragePct',
    'averageOccurrenceCoveragePct',
    'missingClaimCount',
    'expectedCitationMismatchCount',
    'everyOccurrenceFailureCount',
    'proximityFailureCount',
    'targetResolutionFailureCount',
    'strictMappingFailureCount',
    'reportOnlyFailureCount',
    'strictMissingClaimCount',
    'strictExpectedCitationMismatchCount',
    'strictEveryOccurrenceFailureCount',
    'strictProximityFailureCount',
    'strictTargetResolutionFailureCount',
  ])
}

function pickNumberFields(source = {}, fields) {
  const picked = {}
  for (const field of fields) {
    picked[field] = numberOrNull(source?.[field])
  }
  return picked
}

function summarizeCommandArguments(args, defaultsApplied) {
  const optionNames = safeOptionNames(args)
  return {
    optionNames,
    defaultsApplied,
    safeValues: {
      fixtureIds: splitCsv(lastOptionValue(args, '--fixture')),
      rendererIds: splitCsv(lastOptionValue(args, '--renderer')),
      liveRuns: parseOptionalNumber(lastOptionValue(args, '--live-runs')),
      maxTokens: parseOptionalNumber(lastOptionValue(args, '--max-tokens')),
      timeoutMs: parseOptionalNumber(lastOptionValue(args, '--timeout-ms')),
      temperature: parseOptionalNumber(lastOptionValue(args, '--temperature')),
      graphifyGraphProvided: hasOption(args, '--graphify-graph'),
      graphifyQueryProvided: hasOption(args, '--graphify-query'),
      noValidate: hasOption(args, '--no-validate'),
    },
  }
}

async function scanSensitiveFiles(files, { envValues = collectSensitiveEnvValues() } = {}) {
  const merged = emptyScanResult()
  const perFile = []

  for (const file of files) {
    let text = ''
    let result
    try {
      text = await readFile(file.path, 'utf8')
      result = scanSensitiveText(text, { envValues })
    } catch {
      result = emptyScanResult()
      result.categories.scanReadError = 1
      result.totalMatches = 1
      result.ok = false
    }
    mergeScanInto(merged, result)
    perFile.push({
      kind: file.kind,
      totalMatches: result.totalMatches,
      categories: { ...result.categories },
      ok: result.ok,
    })
  }

  merged.fileCount = files.length
  merged.files = perFile
  merged.ok = merged.totalMatches === 0
  return merged
}

function scanSensitiveText(text, { envValues = collectSensitiveEnvValues() } = {}) {
  const categories = { ...EMPTY_SCAN_CATEGORIES }
  const content = String(text || '')

  categories.rawOutputTextField += countRegExp(content, /"outputText"\s*:/g)
  categories.configuredEnvValue += countConfiguredEnvValues(content, envValues)
  categories.keyLikeToken += countRegExp(
    content,
    /\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|sk|hf)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi,
  )
  categories.keyLikeToken += countRegExp(content, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g)
  categories.keyLikeToken += countRegExp(content, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g)
  categories.bearerToken += countRegExp(content, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi)
  categories.apiKeyQueryValue += countRegExp(content, /[?&]api[_-]?key=[^&\s"'<>]+/gi)
  categories.tempPath += countTempPathMatches(content)
  categories.absoluteLocalPath += countRegExp(content, /\b[A-Za-z]:[\\/](?:[^\\/\r\n"'<>|*?]+[\\/])+[^\\/\r\n"'<>|*?]*/g)
  categories.absoluteLocalPath += countRegExp(content, /(^|[\s"'])\/(?:Users|home|tmp|var\/folders|private\/var|mnt|workspace)\/[^\s"']+/g)

  const totalMatches = sumNumbers(Object.values(categories))
  return {
    ok: totalMatches === 0,
    totalMatches,
    categories,
  }
}

function collectSensitiveEnvValues() {
  const values = []
  for (const name of SENSITIVE_ENV_NAMES) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim()) {
      values.push(value.trim())
      if (name.endsWith('BASE_URL')) {
        const chatCompletionsUrl = configuredChatCompletionsUrl(value.trim())
        if (chatCompletionsUrl) values.push(chatCompletionsUrl)
      }
    }
  }
  return [...new Set(values)]
}

function configuredChatCompletionsUrl(baseUrl) {
  try {
    const url = new URL(baseUrl)
    const pathname = url.pathname.replace(/\/+$/, '')
    url.pathname = `${pathname}/chat/completions`
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function countConfiguredEnvValues(text, envValues) {
  let count = 0
  for (const rawValue of envValues) {
    const value = String(rawValue || '').trim()
    if (value.length < 3) continue
    count += countExactValue(text, value)
  }
  return count
}

function countExactValue(text, value) {
  const escaped = escapeRegExp(value)
  const tokenLike = /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value)
  const pattern = tokenLike
    ? `(?<![A-Za-z0-9._~-])${escaped}(?![A-Za-z0-9._~-])`
    : escaped
  return countRegExp(text, new RegExp(pattern, 'g'))
}

function countTempPathMatches(text) {
  let count = 0
  const tempRoot = tmpdir()
  if (tempRoot) count += countExactValue(text, tempRoot)
  count += countRegExp(text, /\b[A-Za-z]:[\\/]Users[\\/][^\\/]+[\\/]AppData[\\/]Local[\\/]Temp[\\/][^ \r\n"'<>]+/gi)
  count += countRegExp(text, /(^|[\s"'])(?:\/tmp|\/var\/folders|\/private\/var\/folders)\/[^\s"']+/g)
  return count
}

function countRegExp(text, regex) {
  const matches = text.match(regex)
  return matches ? matches.length : 0
}

function emptyScanResult() {
  return {
    ok: true,
    totalMatches: 0,
    categories: { ...EMPTY_SCAN_CATEGORIES },
  }
}

function mergeScanInto(target, source) {
  for (const [category, count] of Object.entries(source.categories || {})) {
    target.categories[category] = (target.categories[category] || 0) + count
  }
  target.totalMatches += source.totalMatches || 0
  target.ok = target.totalMatches === 0
}

function combineScanReports(rawScan, sanitizedOutputScan) {
  const combined = emptyScanResult()
  mergeScanInto(combined, rawScan || emptyScanResult())
  mergeScanInto(combined, sanitizedOutputScan || emptyScanResult())
  return {
    ok: combined.ok,
    totalMatches: combined.totalMatches,
    categories: combined.categories,
    raw: summarizeScanForReport(rawScan || emptyScanResult()),
    sanitizedOutput: summarizeScanForReport(sanitizedOutputScan || emptyScanResult()),
  }
}

function summarizeScanForReport(scan) {
  return {
    ok: Boolean(scan.ok),
    totalMatches: scan.totalMatches || 0,
    categories: { ...EMPTY_SCAN_CATEGORIES, ...(scan.categories || {}) },
    fileCount: scan.fileCount || 0,
    files: Array.isArray(scan.files)
      ? scan.files.map((file) => ({
        kind: file.kind,
        ok: Boolean(file.ok),
        totalMatches: file.totalMatches || 0,
        categories: { ...EMPTY_SCAN_CATEGORIES, ...(file.categories || {}) },
      }))
      : [],
  }
}

function hasOption(args, option) {
  return args.some((arg) => arg === option || arg.startsWith(`${option}=`))
}

function lastOptionValue(args, option) {
  let value = null
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === option) {
      value = args[index + 1] || null
      index += 1
    } else if (arg.startsWith(`${option}=`)) {
      value = arg.slice(option.length + 1)
    }
  }
  return value
}

function safeOptionNames(args) {
  const names = []
  const seen = new Set()
  for (const arg of args) {
    if (!arg.startsWith('--')) continue
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

function splitCsv(value) {
  if (typeof value !== 'string' || !value.trim()) return []
  return value.split(',').map((item) => item.trim()).filter(isSafeName)
}

function parsePositiveInteger(value, fallback, label = 'value') {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return number
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sanitizeMeasurement(measurement = null) {
  if (!measurement || typeof measurement !== 'object') return null
  return {
    utf8Bytes: numberOrNull(measurement.utf8Bytes),
    chars: numberOrNull(measurement.chars),
    estimatedTokens: numberOrNull(measurement.estimatedTokens),
  }
}

function sanitizeNumberSummary(summary = null) {
  if (!summary || typeof summary !== 'object') return { min: null, max: null, average: null }
  return {
    min: numberOrNull(summary.min),
    max: numberOrNull(summary.max),
    average: numberOrNull(summary.average),
  }
}

function combineNumberSummaries(summaries, counts) {
  const usable = summaries
    .map((summary, index) => ({
      summary: sanitizeNumberSummary(summary),
      count: numberOrZero(counts[index]),
    }))
    .filter(({ summary, count }) => count > 0 && Number.isFinite(summary.average))
  if (!usable.length) return { min: null, max: null, average: null }
  const totalCount = sumNumbers(usable.map(({ count }) => count))
  return {
    min: Math.min(...usable.map(({ summary }) => summary.min).filter(Number.isFinite)),
    max: Math.max(...usable.map(({ summary }) => summary.max).filter(Number.isFinite)),
    average: Number((usable.reduce((total, { summary, count }) => (
      total + summary.average * count
    ), 0) / totalCount).toFixed(2)),
  }
}

function sanitizeCountMap(counts = {}) {
  const sanitized = {}
  for (const [key, value] of Object.entries(counts || {})) {
    if (!Number.isFinite(value) || value <= 0) continue
    sanitized[safeString(key)] = value
  }
  return sanitized
}

function mergeCountMaps(countMaps) {
  const merged = {}
  for (const countMap of countMaps) {
    for (const [key, value] of Object.entries(countMap || {})) {
      if (!Number.isFinite(value) || value <= 0) continue
      merged[key] = (merged[key] || 0) + value
    }
  }
  return merged
}

function weightedAverage(values, counts) {
  const pairs = values
    .map((value, index) => ({ value, count: numberOrZero(counts[index]) }))
    .filter(({ value, count }) => Number.isFinite(value) && count > 0)
  const totalCount = sumNumbers(pairs.map(({ count }) => count))
  if (!totalCount) return null
  return Number((pairs.reduce((total, { value, count }) => total + value * count, 0) / totalCount).toFixed(2))
}

function percentage(part, total) {
  if (!total) return null
  return Number(((part / total) * 100).toFixed(2))
}

function sumNumbers(values) {
  return values
    .filter(Number.isFinite)
    .reduce((total, value) => total + value, 0)
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function safeString(value) {
  return String(value || '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|sk|hf)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi, '[redacted-key]')
    .replace(/[?&]api[_-]?key=[^&\s"'<>]+/gi, '?api_key=[redacted]')
    .replace(/\b[A-Za-z]:[\\/](?:[^\\/\r\n"'<>|*?]+[\\/])+[^\\/\r\n"'<>|*?]*/g, '[redacted-path]')
    .replace(/(^|[\s"'])\/(?:Users|home|tmp|var\/folders|private\/var|mnt|workspace)\/[^\s"']+/g, '$1[redacted-path]')
    .replace(/https?:\/\/[^\s)"'<>]+/gi, '[redacted-url]')
    .slice(0, 200)
}

function safeNameOrNull(value) {
  return isSafeName(value) ? String(value) : null
}

function isSafeName(value) {
  return /^[A-Za-z0-9._-]+$/.test(String(value || ''))
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function packageRoot() {
  return fileURLToPath(new URL('..', import.meta.url))
}

function isCliEntrypoint() {
  return Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isCliEntrypoint()) {
  await main().catch(async () => {
    const rawScan = emptyScanResult()
    const summary = {
      schema: SAFE_SUMMARY_SCHEMA,
      mode: 'live-safe',
      profile: null,
      command: null,
      child: null,
      live: null,
      sensitiveScan: {
        raw: summarizeScanForReport(rawScan),
        sanitizedOutput: summarizeScanForReport(emptyScanResult()),
        ok: true,
        totalMatches: 0,
        categories: { ...EMPTY_SCAN_CATEGORIES },
      },
      error: {
        code: 'wrapper_error',
      },
    }
    await printSummaryAndSetExit(summary, rawScan, true)
  })
}

export {
  buildBenchmarkCommand,
  parseWrapperArgs,
  scanSensitiveFiles,
  scanSensitiveText,
  sanitizeBenchmarkLiveReport,
}
