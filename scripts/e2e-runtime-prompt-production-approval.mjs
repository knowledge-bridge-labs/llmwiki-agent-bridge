#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const E2E_SCHEMA = 'llmwiki-agent-bridge.runtime-prompt-production-approval.v1'
const LIVE_SAFE_SCHEMA = 'llmwiki-agent-bridge.runtime-prompt-live-safe.v1'
const LIVE_SAFE_SCRIPT = 'scripts/validate-runtime-prompt-live-safe.mjs'
const DEFAULT_PROFILE = 'prod-approval-smoke'
const DEFAULT_RENDERER = 'compact-json'
const DEFAULT_RUNTIME_ALIAS = 'configured-runtime'
const DEFAULT_MODEL_CLASS = 'configured-model-class'
const DEFAULT_REQUIRED_FIXTURES = [
  'single-source',
  'multi-source',
  'insufficient-evidence',
  'graph-linear-chain',
  'graph-strict-evidence-fidelity',
]
const DEFAULT_REQUIRED_FIXTURE_CLASSES = [
  'global-multi-source',
  'graph-relation',
  'insufficient-evidence',
  'local-single-source',
  'strict-evidence-fidelity',
]
const DEFAULT_REQUIRED_QUERY_CLASSES = [
  'global-query',
  'graph-query',
  'insufficient-evidence-query',
  'local-query',
]
const SENSITIVE_ENV_NAMES = [
  'LLMWIKI_AGENT_BRIDGE_BASE_URL',
  'LLMWIKI_AGENT_BRIDGE_MODEL',
  'LLMWIKI_AGENT_BRIDGE_API_KEY',
  'HERMES_BASE_URL',
  'HERMES_MODEL',
  'HERMES_API_KEY',
  'OPENAI_API_KEY',
]

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    process.stdout.write(helpText())
    return
  }

  const wrapperResult = await runLiveSafeWrapper(args)
  const parseResult = parseJson(wrapperResult.stdout)
  const approval = evaluateDefaultApproval(parseResult.summary, args, wrapperResult, parseResult)
  const report = buildE2eReport({
    args,
    wrapperResult,
    parseResult,
    approval,
    finalScan: null,
  })
  const finalScan = scanSensitiveText(JSON.stringify(report), {
    envValues: collectSensitiveEnvValues(),
  })
  const finalReport = buildE2eReport({
    args,
    wrapperResult,
    parseResult,
    approval: finalScan.ok ? approval : blockApprovalForFinalScan(approval, finalScan),
    finalScan,
  })

  process.stdout.write(`${JSON.stringify(finalReport, null, 2)}\n`)
  if (wrapperResult.exitCode !== 0 || !parseResult.ok || !approval.approved || !finalScan.ok) {
    process.exitCode = 1
  }
}

function buildE2eReport({ args, wrapperResult, parseResult, approval, finalScan }) {
  return {
    schema: E2E_SCHEMA,
    mode: 'live-safe-wrapper',
    runtimeAlias: safeAlias(args.runtimeAlias),
    modelClass: safeAlias(args.modelClass, DEFAULT_MODEL_CLASS),
    wrapper: {
      script: LIVE_SAFE_SCRIPT,
      profile: args.profile,
      status: wrapperResult.status,
      exitCode: wrapperResult.exitCode,
      signal: wrapperResult.signal,
      stdoutLength: wrapperResult.stdout.length,
      stderrLength: wrapperResult.stderr.length,
      jsonParse: {
        ok: parseResult.ok,
      },
    },
    sourceSummary: sanitizeSourceSummary(parseResult.summary),
    sensitiveScan: {
      finalOutput: summarizeScan(finalScan || emptyScanResult()),
      ok: finalScan ? finalScan.ok : true,
      totalMatches: finalScan ? finalScan.totalMatches : 0,
      categories: finalScan ? finalScan.categories : emptyScanResult().categories,
    },
    defaultApproval: approval,
  }
}

function parseArgs(argv) {
  const args = {
    profile: DEFAULT_PROFILE,
    defaultRenderer: DEFAULT_RENDERER,
    runtimeAlias: DEFAULT_RUNTIME_ALIAS,
    modelClass: DEFAULT_MODEL_CLASS,
    minRuns: 1,
    overallTimeoutMs: null,
    requiredFixtures: [...DEFAULT_REQUIRED_FIXTURES],
    requiredFixtureClasses: [...DEFAULT_REQUIRED_FIXTURE_CLASSES],
    requiredQueryClasses: [...DEFAULT_REQUIRED_QUERY_CLASSES],
    requiredModelClasses: [DEFAULT_MODEL_CLASS],
    passThroughArgs: [],
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--profile') {
      args.profile = requiredValue(argv, index, '--profile')
      index += 1
    } else if (arg.startsWith('--profile=')) {
      args.profile = nonEmptyValue(arg.slice('--profile='.length), '--profile')
    } else if (arg === '--default-renderer') {
      args.defaultRenderer = requiredValue(argv, index, '--default-renderer')
      index += 1
    } else if (arg.startsWith('--default-renderer=')) {
      args.defaultRenderer = nonEmptyValue(arg.slice('--default-renderer='.length), '--default-renderer')
    } else if (arg === '--runtime-alias') {
      args.runtimeAlias = requiredValue(argv, index, '--runtime-alias')
      index += 1
    } else if (arg.startsWith('--runtime-alias=')) {
      args.runtimeAlias = nonEmptyValue(arg.slice('--runtime-alias='.length), '--runtime-alias')
    } else if (arg === '--model-class') {
      args.modelClass = requiredValue(argv, index, '--model-class')
      index += 1
    } else if (arg.startsWith('--model-class=')) {
      args.modelClass = nonEmptyValue(arg.slice('--model-class='.length), '--model-class')
    } else if (arg === '--min-runs') {
      args.minRuns = parsePositiveInteger(requiredValue(argv, index, '--min-runs'), '--min-runs')
      index += 1
    } else if (arg.startsWith('--min-runs=')) {
      args.minRuns = parsePositiveInteger(arg.slice('--min-runs='.length), '--min-runs')
    } else if (arg === '--overall-timeout-ms') {
      args.overallTimeoutMs = parsePositiveInteger(requiredValue(argv, index, '--overall-timeout-ms'), '--overall-timeout-ms')
      index += 1
    } else if (arg.startsWith('--overall-timeout-ms=')) {
      args.overallTimeoutMs = parsePositiveInteger(arg.slice('--overall-timeout-ms='.length), '--overall-timeout-ms')
    } else if (arg === '--required-fixture') {
      args.requiredFixtures = splitCsv(requiredValue(argv, index, '--required-fixture'))
      index += 1
    } else if (arg.startsWith('--required-fixture=')) {
      args.requiredFixtures = splitCsv(arg.slice('--required-fixture='.length))
    } else if (arg === '--required-fixture-class') {
      args.requiredFixtureClasses = splitCsv(requiredValue(argv, index, '--required-fixture-class'))
      index += 1
    } else if (arg.startsWith('--required-fixture-class=')) {
      args.requiredFixtureClasses = splitCsv(arg.slice('--required-fixture-class='.length))
    } else if (arg === '--required-query-class') {
      args.requiredQueryClasses = splitCsv(requiredValue(argv, index, '--required-query-class'))
      index += 1
    } else if (arg.startsWith('--required-query-class=')) {
      args.requiredQueryClasses = splitCsv(arg.slice('--required-query-class='.length))
    } else if (arg === '--required-model-class') {
      args.requiredModelClasses = splitCsv(requiredValue(argv, index, '--required-model-class'))
      index += 1
    } else if (arg.startsWith('--required-model-class=')) {
      args.requiredModelClasses = splitCsv(arg.slice('--required-model-class='.length))
    } else if (arg === '--') {
      args.passThroughArgs.push(...argv.slice(index + 1))
      break
    } else {
      args.passThroughArgs.push(arg)
    }
  }

  return args
}

function helpText() {
  return [
    'Usage: node scripts/e2e-runtime-prompt-production-approval.mjs [options] [-- benchmark-options]',
    '',
    'Runs the private-safe live runtime prompt wrapper and emits a sanitized',
    'production-default approval report for a named renderer.',
    '',
    'Options:',
    `  --profile <id>                  live-safe profile. Default: ${DEFAULT_PROFILE}`,
    `  --default-renderer <id>         renderer to approve. Default: ${DEFAULT_RENDERER}`,
    `  --runtime-alias <safe-name>     safe alias only; no model or endpoint values. Default: ${DEFAULT_RUNTIME_ALIAS}`,
    `  --model-class <safe-name>       safe model class label. Default: ${DEFAULT_MODEL_CLASS}`,
    '  --min-runs <n>                  minimum repeated runs per required fixture. Default: 1',
    '  --overall-timeout-ms <ms>       passed through to the live-safe wrapper.',
    '  --required-fixture <csv>        required fixture ids.',
    '  --required-fixture-class <csv>  required fixture classes.',
    '  --required-query-class <csv>    required query classes.',
    '  --required-model-class <csv>    required model classes for this invocation.',
    '',
    'Benchmark options after -- are forwarded to the live-safe wrapper.',
    '',
  ].join('\n')
}

async function runLiveSafeWrapper(args) {
  const childArgs = [LIVE_SAFE_SCRIPT, '--profile', args.profile]
  if (args.overallTimeoutMs) {
    childArgs.push('--overall-timeout-ms', String(args.overallTimeoutMs))
  }
  childArgs.push(...args.passThroughArgs)

  const child = spawn(process.execPath, childArgs, {
    cwd: packageRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const [stdout, stderr, closed] = await Promise.all([
    readStream(child.stdout),
    readStream(child.stderr),
    childClosed(child),
  ])

  const exitCode = closed.exitCode
  return {
    status: exitCode === 0 ? 'ok' : 'failed',
    exitCode,
    signal: closed.signal,
    stdout,
    stderr,
  }
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let text = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      text += chunk
    })
    stream.once('end', () => resolve(text))
    stream.once('error', reject)
  })
}

function childClosed(child) {
  return new Promise((resolve) => {
    child.once('error', () => resolve({ exitCode: 1, signal: null }))
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }))
  })
}

function parseJson(text) {
  try {
    return {
      ok: true,
      summary: JSON.parse(text),
    }
  } catch {
    return {
      ok: false,
      summary: null,
    }
  }
}

function evaluateDefaultApproval(summary, args, wrapperResult, parseResult) {
  const reasons = []
  const live = summary?.live
  const renderer = live?.renderers?.[args.defaultRenderer]
  const fixtureCoverage = live?.fixtureCoverage || {}
  const requiredRequestCount = args.requiredFixtures.length * args.minRuns

  requireCondition(reasons, parseResult.ok, 'live-safe wrapper stdout must be parseable JSON')
  requireCondition(reasons, summary?.schema === LIVE_SAFE_SCHEMA, `live-safe summary schema must be ${LIVE_SAFE_SCHEMA}`)
  requireCondition(reasons, wrapperResult.exitCode === 0, 'live-safe wrapper process must exit 0')
  requireCondition(reasons, summary?.child?.status === 'ok', 'benchmark child status must be ok')
  requireCondition(reasons, summary?.child?.jsonParse?.ok === true, 'benchmark child stdout must be parseable JSON')
  requireCondition(reasons, summary?.sensitiveScan?.ok === true, 'sensitive scan must pass')
  requireCondition(reasons, numberOrZero(summary?.sensitiveScan?.totalMatches) === 0, 'sensitive scan must find zero matches')
  requireCondition(reasons, Boolean(live), 'live summary must be present')
  requireCondition(reasons, live?.configured === true, 'live runtime must be explicitly configured')
  requireCondition(reasons, live?.status === 'ok', 'live benchmark status must be ok')
  requireCondition(reasons, live?.validation?.ok === true, 'live validation must pass')

  const fixtureIds = fixtureCoverage.fixtureIds || []
  const fixtureClasses = fixtureCoverage.fixtureClasses || []
  const queryClasses = fixtureCoverage.queryClasses || []
  const modelClasses = [safeAlias(args.modelClass, DEFAULT_MODEL_CLASS)]
  const missingFixtures = missingValues(args.requiredFixtures, fixtureIds)
  const missingFixtureClasses = missingValues(args.requiredFixtureClasses, fixtureClasses)
  const missingQueryClasses = missingValues(args.requiredQueryClasses, queryClasses)
  const missingModelClasses = missingValues(args.requiredModelClasses, modelClasses)

  requireCondition(reasons, missingFixtures.length === 0, `required fixtures missing: ${missingFixtures.join(', ') || 'none'}`)
  requireCondition(reasons, missingFixtureClasses.length === 0, `required fixture classes missing: ${missingFixtureClasses.join(', ') || 'none'}`)
  requireCondition(reasons, missingQueryClasses.length === 0, `required query classes missing: ${missingQueryClasses.join(', ') || 'none'}`)
  requireCondition(reasons, missingModelClasses.length === 0, `required model classes missing: ${missingModelClasses.join(', ') || 'none'}`)
  requireCondition(reasons, Boolean(renderer), `default renderer summary missing: ${args.defaultRenderer}`)

  if (renderer) {
    const failureCodeCounts = renderer.failureCodeCounts || {}
    const answerOracle = renderer.answerOracle || {}
    const expectedCitationMappings = renderer.expectedCitationMappings || {}
    const citationCoverage = renderer.citationCoverage || {}
    const truncation = renderer.truncation || {}

    requireCondition(reasons, numberOrZero(renderer.runCount) >= requiredRequestCount, `default renderer must have at least ${requiredRequestCount} runs`)
    requireCondition(reasons, numberOrZero(renderer.passCount) === numberOrZero(renderer.runCount), 'default renderer passCount must equal runCount')
    requireCondition(reasons, numberOrZero(renderer.failCount) === 0, 'default renderer failCount must be 0')
    requireCondition(reasons, renderer.passRatePct === 100, 'default renderer passRatePct must be 100')
    requireCondition(reasons, Object.keys(failureCodeCounts).length === 0, 'default renderer failureCodeCounts must be empty')
    requireCondition(reasons, numberOrZero(truncation.truncatedCount) === 0, 'default renderer truncatedCount must be 0')
    requireCondition(reasons, numberOrZero(truncation.inferredTruncatedCount) === 0, 'default renderer inferredTruncatedCount must be 0')
    requireCondition(reasons, numberOrZero(citationCoverage.invalidCitationAnchorCount) === 0, 'default renderer invalid citation anchors must be 0')
    requireCondition(reasons, citationCoverage.averageRequiredCitationAnchorCoveragePct === 100, 'default renderer citation-anchor coverage must be 100%')
    requireCondition(reasons, numberOrZero(answerOracle.strictFailureCount) === 0, 'default renderer strict answer-oracle failures must be 0')
    requireCondition(reasons, numberOrZero(answerOracle.strictUnsupportedClaimHitCount) === 0, 'default renderer strict unsupported-claim hits must be 0')
    requireCondition(reasons, numberOrZero(answerOracle.strictContradictoryClaimHitCount) === 0, 'default renderer strict contradictory-claim hits must be 0')
    requireCondition(reasons, numberOrZero(answerOracle.strictDistortionCount) === 0, 'default renderer strict distortion hits must be 0')
    requireCondition(reasons, answerOracle.averageRequiredItemCoveragePct === 100, 'default renderer required oracle item coverage must be 100%')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictFailureCount) === 0, 'default renderer strict expected-citation failures must be 0')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictMappingFailureCount) === 0, 'default renderer strict mapping failures must be 0')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictMissingClaimCount) === 0, 'default renderer strict missing-claim count must be 0')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictExpectedCitationMismatchCount) === 0, 'default renderer strict expected-citation mismatches must be 0')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictEveryOccurrenceFailureCount) === 0, 'default renderer strict every-occurrence failures must be 0')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictProximityFailureCount) === 0, 'default renderer strict proximity failures must be 0')
    requireCondition(reasons, numberOrZero(expectedCitationMappings.strictTargetResolutionFailureCount) === 0, 'default renderer strict target-resolution failures must be 0')
    requireCondition(reasons, expectedCitationMappings.averageCoveragePct === 100, 'default renderer expected-citation mapping coverage must be 100%')
    requireCondition(reasons, expectedCitationMappings.averageOccurrenceCoveragePct === 100, 'default renderer expected-citation occurrence coverage must be 100%')
  }

  return {
    rendererId: args.defaultRenderer,
    approved: reasons.length === 0,
    status: reasons.length === 0 ? 'approved' : 'blocked',
    runtimeAlias: safeAlias(args.runtimeAlias),
    modelClass: safeAlias(args.modelClass, DEFAULT_MODEL_CLASS),
    minRunsPerRequiredFixture: args.minRuns,
    requiredRequestCount,
    fixtureCoverage: {
      fixtureIds,
      fixtureClasses,
      queryClasses,
      requiredFixtures: args.requiredFixtures,
      requiredFixtureClasses: args.requiredFixtureClasses,
      requiredQueryClasses: args.requiredQueryClasses,
      modelClasses,
      requiredModelClasses: args.requiredModelClasses,
      missingFixtures,
      missingFixtureClasses,
      missingQueryClasses,
      missingModelClasses,
    },
    metrics: renderer ? {
      runCount: numberOrZero(renderer.runCount),
      passCount: numberOrZero(renderer.passCount),
      failCount: numberOrZero(renderer.failCount),
      passRatePct: renderer.passRatePct ?? null,
      failureCodeCounts: renderer.failureCodeCounts || {},
      truncation: renderer.truncation || {},
      citationCoverage: renderer.citationCoverage || {},
      answerOracle: renderer.answerOracle || {},
      expectedCitationMappings: renderer.expectedCitationMappings || {},
    } : null,
    blockingReasons: reasons,
  }
}

function sanitizeSourceSummary(summary) {
  if (!summary || typeof summary !== 'object') return null
  return {
    schema: summary.schema === LIVE_SAFE_SCHEMA ? LIVE_SAFE_SCHEMA : null,
    profile: summary.profile ? {
      id: safeNameOrNull(summary.profile.id),
    } : null,
    child: summary.child ? {
      status: safeNameOrNull(summary.child.status),
      exitCode: numberOrNull(summary.child.exitCode),
      jsonParse: {
        ok: Boolean(summary.child.jsonParse?.ok),
      },
    } : null,
    live: summary.live ? {
      status: safeNameOrNull(summary.live.status),
      configured: Boolean(summary.live.configured),
      validation: {
        ok: Boolean(summary.live.validation?.ok),
        failureCount: numberOrZero(summary.live.validation?.failureCount),
      },
      recommendation: {
        status: safeNameOrNull(summary.live.recommendation?.status),
        recommendedRendererId: safeNameOrNull(summary.live.recommendation?.recommendedRendererId),
      },
      fixtureCoverage: summary.live.fixtureCoverage || null,
      totals: summary.live.totals ? {
        runCount: numberOrZero(summary.live.totals.runCount),
        passCount: numberOrZero(summary.live.totals.passCount),
        failCount: numberOrZero(summary.live.totals.failCount),
        passRatePct: summary.live.totals.passRatePct ?? null,
        failureCodeCounts: summary.live.totals.failureCodeCounts || {},
      } : null,
    } : null,
    sensitiveScan: summary.sensitiveScan ? {
      ok: Boolean(summary.sensitiveScan.ok),
      totalMatches: numberOrZero(summary.sensitiveScan.totalMatches),
      categories: summary.sensitiveScan.categories || {},
    } : null,
  }
}

function requireCondition(reasons, condition, reason) {
  if (!condition) reasons.push(reason)
}

function missingValues(required, actual) {
  const actualSet = new Set((actual || []).filter(Boolean))
  return (required || []).filter((value) => !actualSet.has(value))
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`)
  return value
}

function nonEmptyValue(value, option) {
  if (!value) throw new Error(`${option} requires a value.`)
  return value
}

function parsePositiveInteger(value, option) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${option} must be a positive integer.`)
  return number
}

function splitCsv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null
}

function safeAlias(value, fallback = DEFAULT_RUNTIME_ALIAS) {
  const alias = String(value || '').trim()
  if (isSafeAlias(alias)) return alias
  return fallback
}

function isSafeAlias(value) {
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false
  if (/[/\\]/.test(value)) return false
  if (/(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|sk|hf)[_-]/i.test(value)) return false
  if (/bearer|api[_-]?key|token|secret|password/i.test(value)) return false
  return true
}

function scanSensitiveText(text, { envValues = [] } = {}) {
  const content = String(text || '')
  const categories = {
    rawOutputTextField: countRegExp(content, /"outputText"\s*:/g),
    configuredEnvValue: countConfiguredEnvValues(content, envValues),
    keyLikeToken: countRegExp(content, /\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|sk|hf)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi)
      + countRegExp(content, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g)
      + countRegExp(content, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g),
    bearerToken: countRegExp(content, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi),
    apiKeyQueryValue: countRegExp(content, /[?&]api[_-]?key=[^&\s"'<>]+/gi),
    tempPath: 0,
    absoluteLocalPath: countRegExp(content, /\b[A-Za-z]:[\\/](?:[^\\/\r\n"'<>|*?]+[\\/])+[^\\/\r\n"'<>|*?]*/g)
      + countRegExp(content, /(^|[\s"'])\/(?:Users|home|tmp|var\/folders|private\/var|mnt|workspace)\/[^\s"']+/g),
  }
  const totalMatches = Object.values(categories).reduce((total, count) => total + count, 0)
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
    }
  }
  return [...new Set(values)]
}

function countConfiguredEnvValues(text, envValues) {
  return envValues.reduce((total, value) => total + countExactValue(text, value), 0)
}

function countExactValue(text, value) {
  const needle = String(value || '').trim()
  if (needle.length < 3) return 0
  return countRegExp(text, new RegExp(escapeRegExp(needle), 'g'))
}

function countRegExp(text, pattern) {
  return (String(text || '').match(pattern) || []).length
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function emptyScanResult() {
  return {
    ok: true,
    totalMatches: 0,
    categories: {
      rawOutputTextField: 0,
      configuredEnvValue: 0,
      keyLikeToken: 0,
      bearerToken: 0,
      apiKeyQueryValue: 0,
      tempPath: 0,
      absoluteLocalPath: 0,
    },
  }
}

function summarizeScan(scan) {
  return {
    ok: Boolean(scan?.ok),
    totalMatches: numberOrZero(scan?.totalMatches),
    categories: scan?.categories || emptyScanResult().categories,
  }
}

function blockApprovalForFinalScan(approval, scan) {
  return {
    ...approval,
    approved: false,
    status: 'blocked',
    blockingReasons: [
      ...(approval?.blockingReasons || []),
      `final e2e output sensitive scan failed with ${numberOrZero(scan?.totalMatches)} matches`,
    ],
  }
}

function safeNameOrNull(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const safe = text.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
  return safe || null
}

function packageRoot() {
  return fileURLToPath(new URL('..', import.meta.url))
}

function isCliEntrypoint() {
  return Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isCliEntrypoint()) {
  await main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`)
    process.exitCode = 1
  })
}
