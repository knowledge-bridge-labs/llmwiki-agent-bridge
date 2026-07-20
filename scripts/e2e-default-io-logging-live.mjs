#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPORT_SCHEMA = 'llmwiki-agent-bridge.default-io-logging-live.v1'
const BRIDGE_IO_EVENT = 'llmwiki.agent_bridge.io'
const SERVE_IO_EVENT = 'serve_io'
const MESSAGE_SEND_PATH = '/message:send'
const SETTINGS_JSON_PATH = '/settings.json'
const HEALTH_PATH = '/health'
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8788'
const DEFAULT_SOURCE_URL = 'http://127.0.0.1:8765'
const DEFAULT_BRIDGE_IO_LOG_PATH = '.runtime-logs/llmwiki-agent-bridge-io.jsonl'
const DEFAULT_TIMEOUT_MS = 120_000
const LOG_POLL_INTERVAL_MS = 250
const LOG_POLL_MAX_MS = 5000
const DEFAULT_RUNTIME_BASE_URL = 'http://127.0.0.1:8642/v1'

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    process.stdout.write(helpText())
    return
  }

  const runId = safeIdentifier(`default-io-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`)
  const canaries = buildCanaries(args, runId)
  const logRefs = resolveLogRefs(args)
  const beforeLogs = await snapshotLogs(logRefs)
  const bridgeProbe = await probeBridge(args)
  const runtime = inferRuntimeConfigured(bridgeProbe)
  const cases = []

  cases.push(await runEvidenceOnlyCase(args, canaries))
  if (runtime.configured) {
    cases.push(await runDelegatedRuntimeCase(args, canaries))
    cases.push(await runMultiTurnRuntimeCase(args, canaries))
  } else {
    cases.push(skippedCase('delegated-runtime-selected-ready-source', 'runtime_not_configured'))
    cases.push(skippedCase('multi-turn-follow-up-history', 'runtime_not_configured'))
  }
  cases.push(await runUnreachableSourceCase(args, canaries))
  cases.push(await runRedactionCanaryCase(args, canaries))

  let logData = await waitForRelevantLogs({ logRefs, beforeLogs, cases, canaries, timeoutMs: args.timeoutMs })
  validateBridgeIoLog({ logRef: logRefs.bridge, logData: logData.bridge, cases, canaries })
  validateServeIoLog({ logRef: logRefs.serve, logData: logData.serve, cases })

  // Read once more after validation in case the last validation wait overlapped
  // with a final file append. Re-validate from the same offsets.
  logData = await readLogsAfter(logRefs, beforeLogs)
  clearLogValidationFailures(cases)
  validateBridgeIoLog({ logRef: logRefs.bridge, logData: logData.bridge, cases, canaries })
  validateServeIoLog({ logRef: logRefs.serve, logData: logData.serve, cases })

  const sensitiveScan = scanSensitiveLogs({
    logData,
    cases,
    canaries,
    args,
  })
  finalizeCaseStatuses(cases)

  const report = buildReport({
    args,
    runId,
    cases,
    runtime,
    bridgeProbe,
    logRefs,
    logData,
    sensitiveScan,
  })
  const stdoutScan = scanSensitiveText(JSON.stringify(report), {
    canaries,
    args,
    runtimeBaseValues: runtimeBaseValuesForScan(),
    includeBroadPatterns: false,
  })
  report.sensitiveScan.stdout = summarizeScan(stdoutScan)
  report.sensitiveScan.ok = report.sensitiveScan.logs.ok && stdoutScan.ok
  report.sensitiveScan.totalMatches = report.sensitiveScan.logs.totalMatches + stdoutScan.totalMatches
  report.status = finalStatus({ cases, report })
  report.totals = buildTotals(cases, report)

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.status !== 'passed') process.exitCode = 1
}

function parseArgs(argv) {
  const args = {
    bridgeUrl: process.env.LLMWIKI_AGENT_BRIDGE_E2E_BRIDGE_URL || DEFAULT_BRIDGE_URL,
    sourceUrl: process.env.LLMWIKI_AGENT_BRIDGE_E2E_SOURCE_URL || DEFAULT_SOURCE_URL,
    bridgeIoLogPath: process.env.LLMWIKI_AGENT_BRIDGE_E2E_BRIDGE_IO_LOG_PATH || DEFAULT_BRIDGE_IO_LOG_PATH,
    serveIoLogPath: process.env.LLMWIKI_AGENT_BRIDGE_E2E_SERVE_IO_LOG_PATH || '',
    timeoutMs: numberFromValue(process.env.LLMWIKI_AGENT_BRIDGE_E2E_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    bridgeBearerToken: process.env.LLMWIKI_AGENT_BRIDGE_E2E_BEARER_TOKEN || '',
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--bridge-url') {
      args.bridgeUrl = requiredValue(argv, index, '--bridge-url')
      index += 1
    } else if (arg.startsWith('--bridge-url=')) {
      args.bridgeUrl = nonEmptyValue(arg.slice('--bridge-url='.length), '--bridge-url')
    } else if (arg === '--source-url') {
      args.sourceUrl = requiredValue(argv, index, '--source-url')
      index += 1
    } else if (arg.startsWith('--source-url=')) {
      args.sourceUrl = nonEmptyValue(arg.slice('--source-url='.length), '--source-url')
    } else if (arg === '--bridge-io-log-path') {
      args.bridgeIoLogPath = requiredValue(argv, index, '--bridge-io-log-path')
      index += 1
    } else if (arg.startsWith('--bridge-io-log-path=')) {
      args.bridgeIoLogPath = nonEmptyValue(arg.slice('--bridge-io-log-path='.length), '--bridge-io-log-path')
    } else if (arg === '--serve-io-log-path') {
      args.serveIoLogPath = requiredValue(argv, index, '--serve-io-log-path')
      index += 1
    } else if (arg.startsWith('--serve-io-log-path=')) {
      args.serveIoLogPath = nonEmptyValue(arg.slice('--serve-io-log-path='.length), '--serve-io-log-path')
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = positiveInteger(requiredValue(argv, index, '--timeout-ms'), '--timeout-ms')
      index += 1
    } else if (arg.startsWith('--timeout-ms=')) {
      args.timeoutMs = positiveInteger(arg.slice('--timeout-ms='.length), '--timeout-ms')
    } else if (arg === '--bridge-bearer-token') {
      args.bridgeBearerToken = requiredValue(argv, index, '--bridge-bearer-token')
      index += 1
    } else if (arg.startsWith('--bridge-bearer-token=')) {
      args.bridgeBearerToken = nonEmptyValue(arg.slice('--bridge-bearer-token='.length), '--bridge-bearer-token')
    } else {
      throw new Error(`Unsupported option: ${arg}`)
    }
  }

  validateUrl(args.bridgeUrl, '--bridge-url')
  validateUrl(args.sourceUrl, '--source-url')
  return args
}

function helpText() {
  return [
    'Usage: node scripts/e2e-default-io-logging-live.mjs [options]',
    '',
    'Exercises a live llmwiki-agent-bridge plus live llmwiki-serve source through direct HTTP /message:send calls,',
    'then validates recent bridge and serve I/O JSONL records for request/response bodies and redaction canaries.',
    '',
    'Options:',
    `  --bridge-url <url>             Bridge base URL. Default: ${DEFAULT_BRIDGE_URL}`,
    `  --source-url <url>             llmwiki-serve base URL. Default: ${DEFAULT_SOURCE_URL}`,
    `  --bridge-io-log-path <path>    Bridge I/O JSONL path. Default: ${DEFAULT_BRIDGE_IO_LOG_PATH}`,
    '  --serve-io-log-path <path>     Serve I/O JSONL path. If omitted, ../llmwiki-serve/.runtime-logs/llmwiki-serve-io.jsonl is used when present.',
    `  --timeout-ms <ms>              Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}`,
    '  --bridge-bearer-token <token>  Optional bridge auth token; value is never printed.',
    '',
    'Stdout is a sanitized JSON report with schema, status, totals, cases, and sensitiveScan.',
    '',
  ].join('\n')
}

function resolveLogRefs(args) {
  const inferredServePath = resolve(packageRoot(), '..', 'llmwiki-serve', '.runtime-logs', 'llmwiki-serve-io.jsonl')
  const explicitServePath = Boolean(args.serveIoLogPath)
  const servePath = explicitServePath
    ? resolveUserPath(args.serveIoLogPath)
    : existsSync(inferredServePath)
      ? inferredServePath
      : ''

  return {
    bridge: {
      kind: 'bridge',
      path: resolveUserPath(args.bridgeIoLogPath),
      required: true,
      pathMode: args.bridgeIoLogPath === DEFAULT_BRIDGE_IO_LOG_PATH ? 'default' : 'explicit',
    },
    serve: {
      kind: 'serve',
      path: servePath,
      required: explicitServePath || Boolean(servePath),
      pathMode: explicitServePath ? 'explicit' : servePath ? 'inferred' : 'not-found',
    },
  }
}

async function snapshotLogs(logRefs) {
  return {
    bridge: await snapshotLog(logRefs.bridge),
    serve: await snapshotLog(logRefs.serve),
  }
}

async function snapshotLog(logRef) {
  if (!logRef.path) {
    return { exists: false, size: 0 }
  }
  try {
    const info = await stat(logRef.path)
    return { exists: true, size: info.size }
  } catch {
    return { exists: false, size: 0 }
  }
}

async function readLogsAfter(logRefs, beforeLogs) {
  return {
    bridge: await readLogAfter(logRefs.bridge, beforeLogs.bridge),
    serve: await readLogAfter(logRefs.serve, beforeLogs.serve),
  }
}

async function readLogAfter(logRef, before) {
  if (!logRef.path) {
    return {
      kind: logRef.kind,
      pathMode: logRef.pathMode,
      status: 'skipped',
      text: '',
      lines: [],
      events: [],
      invalidLineCount: 0,
      lineCount: 0,
      byteCount: 0,
      failureCodes: ['log_path_not_inferred'],
    }
  }

  try {
    const bytes = await readFile(logRef.path)
    const start = before.exists && bytes.length >= before.size ? before.size : 0
    const text = bytes.subarray(start).toString('utf8')
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const parsed = parseJsonLines(lines)
    return {
      kind: logRef.kind,
      pathMode: logRef.pathMode,
      status: 'read',
      text,
      lines,
      events: parsed.events,
      invalidLineCount: parsed.invalidLineCount,
      lineCount: lines.length,
      byteCount: Buffer.byteLength(text),
      failureCodes: [],
    }
  } catch {
    return {
      kind: logRef.kind,
      pathMode: logRef.pathMode,
      status: logRef.required ? 'failed' : 'skipped',
      text: '',
      lines: [],
      events: [],
      invalidLineCount: 0,
      lineCount: 0,
      byteCount: 0,
      failureCodes: [logRef.required ? 'log_read_failed' : 'log_read_skipped'],
    }
  }
}

function parseJsonLines(lines) {
  const events = []
  let invalidLineCount = 0
  for (const line of lines) {
    try {
      events.push(JSON.parse(line))
    } catch {
      invalidLineCount += 1
    }
  }
  return { events, invalidLineCount }
}

async function waitForRelevantLogs({ logRefs, beforeLogs, cases, canaries, timeoutMs }) {
  const waitMs = Math.min(LOG_POLL_MAX_MS, Math.max(LOG_POLL_INTERVAL_MS, Math.floor(timeoutMs / 12)))
  const deadline = Date.now() + waitMs
  let last = await readLogsAfter(logRefs, beforeLogs)

  while (Date.now() < deadline) {
    if (logsContainExpectedMarkers(last, cases, canaries, logRefs)) return last
    await delay(LOG_POLL_INTERVAL_MS)
    last = await readLogsAfter(logRefs, beforeLogs)
  }

  return last
}

function logsContainExpectedMarkers(logData, cases, canaries, logRefs) {
  const requestIds = cases.map((item) => item.requestId).filter(Boolean)
  const bridgeReady = requestIds.every((requestId) => logData.bridge.text.includes(requestId))
  const serveExpected = logRefs.serve.path && cases.some((item) => item.expectServeQuery && item.status !== 'skipped')
  const serveReady = !serveExpected || canaries.promptCanaries().some((prompt) => logData.serve.text.includes(prompt))
  return bridgeReady && serveReady
}

async function probeBridge(args) {
  const settings = await getJson(args, SETTINGS_JSON_PATH)
  const health = settings.ok ? null : await getJson(args, HEALTH_PATH)
  return { settings, health }
}

async function getJson(args, path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(args.timeoutMs, 10_000))
  try {
    const headers = {}
    if (args.bridgeBearerToken) headers.Authorization = `Bearer ${args.bridgeBearerToken}`
    const response = await fetch(new URL(path, normalizedBaseUrl(args.bridgeUrl)), {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    const text = await response.text()
    return {
      ok: response.ok && isJson(text),
      httpStatus: response.status,
      json: parseJson(text),
      jsonOk: isJson(text),
    }
  } catch {
    return {
      ok: false,
      httpStatus: null,
      json: null,
      jsonOk: false,
    }
  } finally {
    clearTimeout(timer)
  }
}

function inferRuntimeConfigured(bridgeProbe) {
  const settings = bridgeProbe.settings
  const health = bridgeProbe.health
  if (settings?.ok) {
    const connection = settings.json?.runtimeConnection || {}
    const baseUrl = String(connection.baseUrl || '').trim().toLowerCase()
    const configured = Boolean(baseUrl && baseUrl !== 'none' && connection.modelConfigured === true)
    return {
      configured,
      basis: 'settings.json',
      probeStatus: 'ok',
    }
  }
  if (health?.ok) {
    const configured = health.json?.modelConfigured === true || health.json?.hermesModelConfigured === true
    return {
      configured,
      basis: 'health',
      probeStatus: 'ok',
    }
  }
  return {
    configured: true,
    basis: 'probe-unavailable-assume-configured',
    probeStatus: 'unavailable',
  }
}

async function runEvidenceOnlyCase(args, canaries) {
  const id = 'evidence-only-selected-ready-source'
  const requestId = requestIdFor(canaries.runId, id)
  const promptCanary = canaries.casePrompt(id)
  const response = await sendMessage(args, requestId, {
    data: {
      query: `${promptCanary} selected ready source evidence-only check`,
      orchestrationMode: 'evidence-only',
      knowledgeSources: [readySource(args.sourceUrl, 'default-io-ready-source')],
    },
  })

  const artifact = artifactData(response.json)
  const item = baseCase({
    id,
    requestId,
    traceId: traceIdFor(requestId),
    response,
    promptCanary,
    expectsRuntime: false,
    expectServeQuery: true,
    expectBridgeResponse: true,
    answer: artifact?.answer,
  })
  requireCase(item, response.httpStatus === 200, 'message_send_http_status')
  requireCase(item, response.jsonOk, 'message_send_invalid_json')
  requireCase(item, Boolean(artifact), 'agent_result_missing')
  requireCase(item, artifact?.orchestrationMode === 'evidence-only', 'orchestration_mode_mismatch')
  requireCase(item, hasGroundingEvidence(artifact), 'grounding_evidence_missing')
  requireCase(item, !hasStep(artifact, 'runtime-chat-completions'), 'runtime_step_present_in_evidence_only')
  return item
}

async function runDelegatedRuntimeCase(args, canaries) {
  const id = 'delegated-runtime-selected-ready-source'
  const requestId = requestIdFor(canaries.runId, id)
  const promptCanary = canaries.casePrompt(id)
  const response = await sendMessage(args, requestId, {
    data: {
      query: `${promptCanary} selected ready source delegated runtime check`,
      orchestrationMode: 'delegated-runtime',
      knowledgeSources: [readySource(args.sourceUrl, 'default-io-runtime-source')],
    },
  })

  const artifact = artifactData(response.json)
  const item = baseCase({
    id,
    requestId,
    traceId: traceIdFor(requestId),
    response,
    promptCanary,
    expectsRuntime: true,
    expectServeQuery: true,
    expectBridgeResponse: response.httpStatus === 200,
    answer: artifact?.answer,
  })
  requireCase(item, response.httpStatus === 200, 'message_send_http_status')
  requireCase(item, response.jsonOk, 'message_send_invalid_json')
  requireCase(item, Boolean(artifact), 'agent_result_missing')
  requireCase(item, artifact?.orchestrationMode === 'delegated-runtime', 'orchestration_mode_mismatch')
  requireCase(item, hasStep(artifact, 'runtime-chat-completions'), 'runtime_step_missing')
  requireCase(item, hasGroundingEvidence(artifact), 'grounding_evidence_missing')
  return item
}

async function runMultiTurnRuntimeCase(args, canaries) {
  const id = 'multi-turn-follow-up-history'
  const requestId = requestIdFor(canaries.runId, id)
  const promptCanary = canaries.casePrompt(id)
  const historyAssistantCanary = canaries.historyAssistantCanary
  const response = await sendMessage(args, requestId, {
    data: {
      query: `${promptCanary} bounded follow-up runtime history check`,
      orchestrationMode: 'delegated-runtime',
      threadId: `${canaries.runId}-thread`,
      sessionId: `${canaries.runId}-session`,
      turnId: `${canaries.runId}-turn-2`,
      runtimeContext: {
        conversation: {
          title: 'Default I/O logging live validator',
          messageCount: 3,
        },
      },
      messages: [
        { role: 'user', content: `${canaries.historyUserCanary} previous user turn` },
        { role: 'assistant', content: `${historyAssistantCanary} previous assistant answer` },
        { role: 'user', content: `${promptCanary} bounded follow-up runtime history check` },
      ],
      knowledgeSources: [readySource(args.sourceUrl, 'default-io-history-source')],
    },
    configuration: {
      historyLength: 2,
    },
  })

  const artifact = artifactData(response.json)
  const item = baseCase({
    id,
    requestId,
    traceId: traceIdFor(requestId),
    response,
    promptCanary,
    historyAssistantCanary,
    expectsRuntime: true,
    expectServeQuery: true,
    expectBridgeResponse: response.httpStatus === 200,
    answer: artifact?.answer,
  })
  requireCase(item, response.httpStatus === 200, 'message_send_http_status')
  requireCase(item, response.jsonOk, 'message_send_invalid_json')
  requireCase(item, Boolean(artifact), 'agent_result_missing')
  requireCase(item, artifact?.orchestrationMode === 'delegated-runtime', 'orchestration_mode_mismatch')
  requireCase(item, hasStep(artifact, 'runtime-chat-completions'), 'runtime_step_missing')
  return item
}

async function runUnreachableSourceCase(args, canaries) {
  const id = 'unreachable-selected-source-diagnostics'
  const requestId = requestIdFor(canaries.runId, id)
  const promptCanary = canaries.casePrompt(id)
  const unreachableSourceUrl = appendUrlPath(args.sourceUrl, `/default-io-unreachable-${canaries.runId}`)
  const response = await sendMessage(args, requestId, {
    data: {
      query: `${promptCanary} selected source diagnostics check`,
      orchestrationMode: 'evidence-only',
      knowledgeSources: [readySource(unreachableSourceUrl, 'default-io-unreachable-source')],
    },
  })

  const artifact = artifactData(response.json)
  const item = baseCase({
    id,
    requestId,
    traceId: traceIdFor(requestId),
    response,
    promptCanary,
    expectsRuntime: false,
    expectServeQuery: true,
    expectBridgeResponse: true,
    answer: artifact?.answer,
    unreachableSource: true,
    servePathMarker: `/default-io-unreachable-${canaries.runId}/query`,
  })
  requireCase(item, response.httpStatus === 200, 'message_send_http_status')
  requireCase(item, response.jsonOk, 'message_send_invalid_json')
  requireCase(item, Boolean(artifact), 'agent_result_missing')
  requireCase(item, hasSourceDiagnostic(artifact), 'source_diagnostic_missing')
  return item
}

async function runRedactionCanaryCase(args, canaries) {
  const id = 'redaction-canary-query'
  const requestId = requestIdFor(canaries.runId, id)
  const promptCanary = canaries.casePrompt(id)
  const response = await sendMessage(args, requestId, {
    data: {
      query: [
        promptCanary,
        'redaction canary',
        canaries.bearerText,
        canaries.skLikeKey,
        canaries.secretSourceUrl,
        canaries.windowsPath,
      ].join(' '),
      orchestrationMode: 'evidence-only',
      knowledgeSources: [
        readySource(args.sourceUrl, 'default-io-redaction-ready-source'),
        {
          ...readySource(canaries.secretSourceUrl, 'default-io-redaction-secret-source'),
          selected: false,
        },
      ],
    },
  })

  const artifact = artifactData(response.json)
  const item = baseCase({
    id,
    requestId,
    traceId: traceIdFor(requestId),
    response,
    promptCanary,
    expectsRuntime: false,
    expectServeQuery: true,
    expectBridgeResponse: true,
    answer: artifact?.answer,
    redactionCase: true,
  })
  requireCase(item, response.httpStatus === 200, 'message_send_http_status')
  requireCase(item, response.jsonOk, 'message_send_invalid_json')
  requireCase(item, Boolean(artifact), 'agent_result_missing')
  requireCase(item, artifact?.orchestrationMode === 'evidence-only', 'orchestration_mode_mismatch')
  requireCase(item, hasGroundingEvidence(artifact), 'grounding_evidence_missing')
  return item
}

async function sendMessage(args, requestId, payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      'x-trace-id': traceIdFor(requestId),
    }
    if (args.bridgeBearerToken) headers.Authorization = `Bearer ${args.bridgeBearerToken}`

    const response = await fetch(new URL(MESSAGE_SEND_PATH, normalizedBaseUrl(args.bridgeUrl)), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    return {
      httpStatus: response.status,
      json: parseJson(text),
      jsonOk: isJson(text),
      responseBytes: Buffer.byteLength(text),
      errorCode: parseJson(text)?.error?.code || null,
      networkError: false,
    }
  } catch (error) {
    return {
      httpStatus: null,
      json: null,
      jsonOk: false,
      responseBytes: 0,
      errorCode: error?.name === 'AbortError' ? 'request_timeout' : 'network_error',
      networkError: true,
    }
  } finally {
    clearTimeout(timer)
  }
}

function validateBridgeIoLog({ logRef, logData, cases, canaries }) {
  if (logRef.required && logData.status !== 'read') {
    for (const item of runnableCases(cases)) addLogFailure(item, 'bridge_io_log_read_failed')
    return
  }
  if (logData.invalidLineCount > 0) {
    for (const item of runnableCases(cases)) addLogFailure(item, 'bridge_io_invalid_jsonl')
  }

  const bridgeEvents = logData.events.filter((event) => event?.event === BRIDGE_IO_EVENT)
  for (const item of runnableCases(cases)) {
    const events = bridgeEvents.filter((event) => event.requestId === item.requestId)
    const bridgeRequest = events.find((event) => event.phase === 'bridge.request')
    const bridgeResponse = events.find((event) => event.phase === 'bridge.response')
    const bridgeError = events.find((event) => event.phase === 'bridge.error')
    const sourceRequests = events.filter((event) => event.phase === 'source.request')
    const sourceResponses = events.filter((event) => event.phase === 'source.response')
    const sourceErrors = events.filter((event) => event.phase === 'source.error')
    const runtimeRequests = events.filter((event) => event.phase === 'runtime.request')
    const runtimeResponses = events.filter((event) => event.phase === 'runtime.response')

    requireCase(item, events.length > 0, 'bridge_io_request_id_missing', true)
    requireCase(item, Boolean(bridgeRequest), 'bridge_io_bridge_request_missing', true)
    requireCase(item, item.expectBridgeResponse ? Boolean(bridgeResponse) : Boolean(bridgeResponse || bridgeError), 'bridge_io_bridge_response_missing', true)
    requireCase(item, sourceRequests.length > 0, 'bridge_io_source_request_missing', true)
    requireCase(item, sourceResponses.length > 0 || sourceErrors.length > 0, 'bridge_io_source_response_or_error_missing', true)
    requireCase(item, objectContainsString(bridgeRequest?.request?.body, item.promptCanary), 'bridge_io_prompt_canary_missing_in_request_body', true)
    requireCase(item, sourceRequests.some((event) => objectContainsString(event.request?.body, item.promptCanary)) || sourceErrors.some((event) => objectContainsString(event.request?.body, item.promptCanary)), 'bridge_io_source_query_body_missing', true)

    if (item.expectBridgeResponse && item.answerExpected) {
      requireCase(item, bridgeResponseHasAnswer(bridgeResponse), 'bridge_io_response_answer_missing', true)
    }

    if (item.expectsRuntime) {
      requireCase(item, runtimeRequests.length > 0, 'bridge_io_runtime_request_missing', true)
      requireCase(item, runtimeResponses.length > 0, 'bridge_io_runtime_response_missing', true)
    } else {
      requireCase(item, runtimeRequests.length === 0, 'bridge_io_unexpected_runtime_request', true)
    }

    if (item.historyAssistantCanary) {
      requireCase(item, runtimeRequests.some((event) => objectContainsString(event.request?.body, item.historyAssistantCanary)), 'bridge_io_runtime_history_missing', true)
      requireCase(item, !sourceRequests.some((event) => objectContainsString(event.request?.body, item.historyAssistantCanary)), 'bridge_io_source_received_history', true)
    }
  }

  if (canaries.promptCanaries().length && !bridgeEvents.some((event) => canaries.promptCanaries().some((prompt) => objectContainsString(event.request?.body, prompt)))) {
    for (const item of runnableCases(cases)) addLogFailure(item, 'bridge_io_no_prompt_canaries_observed')
  }
}

function validateServeIoLog({ logRef, logData, cases }) {
  if (!logRef.path && !logRef.required) return
  if (logRef.required && logData.status !== 'read') {
    for (const item of runnableCases(cases).filter((entry) => entry.expectServeQuery)) {
      addLogFailure(item, 'serve_io_log_read_failed')
    }
    return
  }
  if (logData.invalidLineCount > 0) {
    for (const item of runnableCases(cases).filter((entry) => entry.expectServeQuery)) {
      addLogFailure(item, 'serve_io_invalid_jsonl')
    }
  }

  const serveEvents = logData.events.filter((event) => event?.event === SERVE_IO_EVENT)
  for (const item of runnableCases(cases).filter((entry) => entry.expectServeQuery)) {
    const matchingQueries = serveEvents.filter((event) => serveEventMatchesCaseQuery(event, item))
    requireCase(item, matchingQueries.length > 0, 'serve_io_query_event_missing', true)
    requireCase(item, matchingQueries.some((event) => hasObjectBody(event.request)), 'serve_io_request_body_missing', true)
    requireCase(item, matchingQueries.some((event) => hasObjectBody(event.response)), 'serve_io_response_body_missing', true)
  }
}

function clearLogValidationFailures(cases) {
  for (const item of cases) {
    item.failureCodes = item.failureCodes.filter((code) => !item.logFailureCodes.has(code))
    item.logFailureCodes.clear()
  }
}

function scanSensitiveLogs({ logData, cases, canaries, args }) {
  const relevantBridgeText = relevantLogText(logData.bridge.lines, [
    canaries.runId,
    ...cases.map((item) => item.requestId).filter(Boolean),
    ...canaries.promptCanaries(),
  ])
  const relevantServeText = relevantLogText(logData.serve.lines, [
    canaries.runId,
    ...canaries.promptCanaries(),
  ])
  const relevantText = [relevantBridgeText, relevantServeText].join('\n')
  const logs = scanSensitiveText(relevantText, {
    canaries,
    args,
    runtimeBaseValues: runtimeBaseValuesForScan(),
    includeBroadPatterns: true,
    includeNormalSourceUrl: false,
  })
  logs.categories.bridgeRawSourceUrl = countExact(relevantBridgeText, normalizedBaseUrl(args.sourceUrl))
  logs.categories.bridgeRawUrlPattern = countRegExp(relevantBridgeText, /https?:\/\/[^\s"']+/gi)
  logs.totalMatches += logs.categories.bridgeRawSourceUrl
  logs.totalMatches += logs.categories.bridgeRawUrlPattern
  logs.ok = logs.totalMatches === 0
  if (!logs.ok) {
    const redactionCase = cases.find((item) => item.redactionCase)
    if (redactionCase) addLogFailure(redactionCase, 'sensitive_scan_failed')
  }
  return {
    logs: summarizeScan(logs),
  }
}

function scanSensitiveText(text, { canaries, args, runtimeBaseValues = [], includeBroadPatterns = false, includeNormalSourceUrl = false }) {
  const content = String(text || '')
  const categories = {
    rawBearerValue: countExact(content, canaries.bearerTokenValue) + countExact(content, canaries.bearerText),
    skLikeKey: countExact(content, canaries.skLikeKey),
    secretSourceUrl: countExact(content, canaries.secretSourceUrl),
    querySecretValue: countExact(content, canaries.querySecretValue),
    windowsUserPath: countExact(content, canaries.windowsPath) + countRegExp(content, /C:\\Users\\angel\b/gi),
    normalSourceUrl: includeNormalSourceUrl ? countExact(content, normalizedBaseUrl(args.sourceUrl)) : 0,
    bridgeBearerToken: args.bridgeBearerToken ? countExact(content, args.bridgeBearerToken) : 0,
    runtimeBaseUrl: runtimeBaseValues.reduce((total, value) => total + countExact(content, value), 0),
  }

  if (includeBroadPatterns) {
    categories.keyLikePattern = countRegExp(content, /\b(?:sk-proj|sk-ant|sk|hf)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi)
    categories.bearerPattern = countRegExp(content, /\bBearer\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]{8,}/gi)
    categories.windowsUserPathPattern = countRegExp(content, /\b[A-Za-z]:\\Users\\angel\\[^\s"'<>|*?]*/gi)
  }

  const totalMatches = Object.values(categories).reduce((total, count) => total + count, 0)
  return {
    ok: totalMatches === 0,
    totalMatches,
    categories,
  }
}

function buildReport({ args, runId, cases, runtime, bridgeProbe, logRefs, logData, sensitiveScan }) {
  finalizeCaseStatuses(cases)
  const report = {
    schema: REPORT_SCHEMA,
    status: 'pending',
    run: {
      id: runId,
    },
    options: {
      timeoutMs: args.timeoutMs,
      bridgeBearerTokenProvided: Boolean(args.bridgeBearerToken),
      bridgeIoLogPathMode: logRefs.bridge.pathMode,
      serveIoLogPathMode: logRefs.serve.pathMode,
    },
    runtime: {
      configured: runtime.configured,
      basis: runtime.basis,
      probeStatus: runtime.probeStatus,
      runtimeCases: runtime.configured ? 'run' : 'skipped',
    },
    bridgeProbe: {
      settingsStatus: bridgeProbe.settings?.httpStatus ?? null,
      healthStatus: bridgeProbe.health?.httpStatus ?? null,
      settingsJsonOk: Boolean(bridgeProbe.settings?.jsonOk),
      healthJsonOk: Boolean(bridgeProbe.health?.jsonOk),
    },
    logs: {
      bridge: logSummary(logRefs.bridge, logData.bridge, cases, BRIDGE_IO_EVENT),
      serve: logSummary(logRefs.serve, logData.serve, cases, SERVE_IO_EVENT),
    },
    totals: {},
    cases: cases.map(caseReport),
    sensitiveScan: {
      ok: sensitiveScan.logs.ok,
      totalMatches: sensitiveScan.logs.totalMatches,
      logs: sensitiveScan.logs,
      stdout: summarizeScan(emptyScan()),
    },
  }
  report.status = finalStatus({ cases, report })
  report.totals = buildTotals(cases, report)
  return report
}

function logSummary(logRef, logData, cases, eventName) {
  const requestIds = new Set(cases.map((item) => item.requestId).filter(Boolean))
  const events = logData.events.filter((event) => event?.event === eventName)
  const matchedEvents = logRef.kind === 'bridge'
    ? events.filter((event) => requestIds.has(event.requestId))
    : events.filter((event) => cases.some((item) => serveEventMatchesCaseQuery(event, item)))
  return {
    status: logData.status,
    pathMode: logRef.pathMode,
    required: logRef.required,
    lineCount: logData.lineCount,
    eventCount: events.length,
    matchedEventCount: matchedEvents.length,
    invalidLineCount: logData.invalidLineCount,
    failureCodes: logData.failureCodes,
  }
}

function buildTotals(cases, report) {
  const failedCases = cases.filter((item) => item.status === 'failed')
  const skippedCases = cases.filter((item) => item.status === 'skipped')
  return {
    caseCount: cases.length,
    passCount: cases.filter((item) => item.status === 'passed').length,
    failCount: failedCases.length,
    skippedCount: skippedCases.length,
    bridgeIoEventCount: report.logs.bridge.matchedEventCount,
    serveIoEventCount: report.logs.serve.matchedEventCount,
    failureCodeCounts: failureCodeCounts(cases),
  }
}

function finalStatus({ cases, report }) {
  const caseFailed = cases.some((item) => item.status === 'failed' || item.failureCodes.length > 0)
  const logFailed = report?.logs
    ? [report.logs.bridge, report.logs.serve].some((item) => item.required && item.status === 'failed')
    : false
  const sensitiveFailed = report?.sensitiveScan ? !report.sensitiveScan.ok : false
  return caseFailed || logFailed || sensitiveFailed ? 'failed' : 'passed'
}

function caseReport(item) {
  return removeUndefinedProperties({
    id: item.id,
    status: item.status,
    requestId: item.requestId,
    traceId: item.traceId,
    httpStatus: item.httpStatus,
    responseBytes: item.responseBytes,
    expectsRuntime: item.expectsRuntime,
    expectServeQuery: item.expectServeQuery,
    counts: compactCounts(item.counts),
    failureCodes: item.failureCodes,
    skipCodes: item.skipCodes.length ? item.skipCodes : undefined,
  })
}

function baseCase({ id, requestId, traceId, response, promptCanary, historyAssistantCanary = '', expectsRuntime, expectServeQuery, expectBridgeResponse, answer, redactionCase = false, unreachableSource = false, servePathMarker = '' }) {
  return {
    id,
    status: 'pending',
    requestId,
    traceId,
    httpStatus: response.httpStatus,
    responseBytes: response.responseBytes,
    promptCanary,
    historyAssistantCanary,
    expectsRuntime,
    expectServeQuery,
    expectBridgeResponse,
    answerExpected: typeof answer === 'string' && answer.trim().length > 0,
    redactionCase,
    unreachableSource,
    servePathMarker,
    failureCodes: [],
    logFailureCodes: new Set(),
    skipCodes: [],
    counts: {
      citations: countArray(artifactData(response.json)?.citations),
      diagnostics: countArray(artifactData(response.json)?.diagnostics),
      steps: countArray(artifactData(response.json)?.steps),
      sourceBundles: countArray(artifactData(response.json)?.sourceBundles),
    },
  }
}

function skippedCase(id, code) {
  return {
    id,
    status: 'skipped',
    requestId: undefined,
    traceId: undefined,
    httpStatus: undefined,
    responseBytes: 0,
    promptCanary: '',
    historyAssistantCanary: '',
    expectsRuntime: true,
    expectServeQuery: false,
    expectBridgeResponse: false,
    answerExpected: false,
    redactionCase: false,
    unreachableSource: false,
    failureCodes: [],
    logFailureCodes: new Set(),
    skipCodes: [code],
    counts: {},
  }
}

function finalizeCaseStatuses(cases) {
  for (const item of cases) {
    if (item.skipCodes.length) {
      item.status = 'skipped'
    } else {
      item.status = item.failureCodes.length ? 'failed' : 'passed'
    }
  }
}

function requireCase(item, condition, code, logFailure = false) {
  if (condition) return
  if (!item.failureCodes.includes(code)) item.failureCodes.push(code)
  if (logFailure) item.logFailureCodes.add(code)
}

function addLogFailure(item, code) {
  requireCase(item, false, code, true)
}

function runnableCases(cases) {
  return cases.filter((item) => item.status !== 'skipped')
}

function buildCanaries(args, runId) {
  const runKey = runId.replace(/[^A-Za-z0-9]/g, '')
  const querySecretValue = `live-query-secret-${runKey}-value`
  const secretSourceUrl = urlWithCanaryQuery(
    appendUrlPath(args.sourceUrl, `/default-io-secret-source-${runId}`),
    querySecretValue,
  )
  const promptPrefix = `LIVE_IO_PROMPT_${runKey}`
  const prompts = new Map()
  return {
    runId,
    querySecretValue,
    secretSourceUrl,
    bearerTokenValue: `live-default-io-bearer-${runKey}-raw-value`,
    get bearerText() {
      return `Bearer ${this.bearerTokenValue}`
    },
    skLikeKey: `sk-${`proj-live-default-io-${runKey}-1234567890abcdef`}`,
    windowsPath: `C:\\Users\\example-user\\AppData\\Local\\Temp\\llmwiki-default-io-${runKey}.md`,
    historyUserCanary: `LIVE_IO_HISTORY_USER_${runKey}`,
    historyAssistantCanary: `LIVE_IO_HISTORY_ASSISTANT_${runKey}`,
    casePrompt(id) {
      if (!prompts.has(id)) prompts.set(id, `${promptPrefix}_${safeIdentifier(id).replace(/-/g, '_').toUpperCase()}`)
      return prompts.get(id)
    },
    promptCanaries() {
      return [...prompts.values()]
    },
  }
}

function readySource(url, id) {
  return {
    id,
    name: 'Default I/O Logging Live Source',
    title: 'Default I/O Logging Live Source',
    description: 'Live source descriptor used by the default I/O logging validator.',
    protocol: 'llmwiki-http',
    status: 'ready',
    selected: true,
    url,
    capabilities: ['llmwiki_context', 'llmwiki_search', 'llmwiki_source_bundle'],
    adapter: 'live-e2e',
    implementation: 'default-io-logging-live',
  }
}

function artifactData(body) {
  for (const artifact of readArray(body?.artifacts)) {
    if (artifact?.name !== 'llmwiki_agent_result') continue
    for (const part of readArray(artifact.parts)) {
      if (part?.kind === 'data' && part.data && typeof part.data === 'object') return part.data
    }
  }
  return null
}

function hasGroundingEvidence(artifact) {
  return countArray(artifact?.citations) > 0
    || countArray(artifact?.graph?.nodes) > 0
    || countArray(artifact?.sourceBundles) > 0
}

function hasStep(artifact, id) {
  return readArray(artifact?.steps).some((step) => step?.id === id)
}

function hasSourceDiagnostic(artifact) {
  return countArray(artifact?.diagnostics) > 0
    || readArray(artifact?.steps).some((step) => step?.status === 'error' && step?.diagnostic)
}

function bridgeResponseHasAnswer(event) {
  const answer = artifactData(event?.response?.body)?.answer
  return typeof answer === 'string' && answer.trim().length > 0
}

function objectContainsString(value, needle) {
  if (!needle) return false
  return JSON.stringify(value ?? '').includes(needle)
}

function hasObjectBody(value) {
  if (!value || typeof value !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(value, 'body')) return value.body !== undefined && value.body !== null
  return Object.keys(value).length > 0
}

function isQueryLikeServeRoute(path) {
  const text = String(path || '')
  return text === '/query' || text.endsWith('/query') || text === '/mcp'
}

function serveEventMatchesCaseQuery(event, item) {
  if (!isQueryLikeServeRoute(event?.path)) return false
  if (item.servePathMarker) return String(event.path || '').includes(item.servePathMarker)
  return objectContainsString(event.request, item.promptCanary)
}

function relevantLogText(lines, markers) {
  const activeMarkers = markers.filter(Boolean)
  return lines.filter((line) => activeMarkers.some((marker) => line.includes(marker))).join('\n')
}

function requestIdFor(runId, id) {
  return safeIdentifier(`${runId}-${id}`).slice(0, 120)
}

function traceIdFor(requestId) {
  return safeIdentifier(`trace-${requestId}`).slice(0, 120)
}

function safeIdentifier(value) {
  return String(value || '').replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalizedBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function appendUrlPath(base, path) {
  const url = new URL(base)
  const current = url.pathname.replace(/\/+$/, '')
  url.pathname = `${current}${path.startsWith('/') ? path : `/${path}`}`
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function urlWithCanaryQuery(value, secret) {
  const url = new URL(value)
  url.searchParams.set('query_secret', secret)
  url.searchParams.set('api_key', secret)
  return url.toString()
}

function validateUrl(value, option) {
  try {
    new URL(value)
  } catch {
    throw new Error(`${option} must be an absolute URL.`)
  }
}

function resolveUserPath(value) {
  return isAbsolute(value) ? value : resolve(packageRoot(), value)
}

function runtimeBaseValuesForScan() {
  return uniqueNonEmpty([
    DEFAULT_RUNTIME_BASE_URL,
    process.env.LLMWIKI_AGENT_BRIDGE_BASE_URL,
    process.env.HERMES_BASE_URL,
    process.env.LLMWIKI_AGENT_BRIDGE_E2E_RUNTIME_BASE_URL,
  ])
}

function summarizeScan(scan) {
  return {
    ok: Boolean(scan?.ok),
    totalMatches: numberOrZero(scan?.totalMatches),
    categories: scan?.categories || {},
  }
}

function emptyScan() {
  return {
    ok: true,
    totalMatches: 0,
    categories: {},
  }
}

function failureCodeCounts(cases) {
  const counts = {}
  for (const item of cases) {
    for (const code of item.failureCodes) {
      counts[code] = (counts[code] || 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function compactCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts || {})
      .filter(([, value]) => Number.isFinite(value))
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function isJson(text) {
  if (!text) return true
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0
}

function numberFromValue(value) {
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function countExact(text, value) {
  const needle = String(value || '').trim()
  if (!needle || needle.length < 3) return 0
  return countRegExp(text, new RegExp(escapeRegExp(needle), 'g'))
}

function countRegExp(text, pattern) {
  return (String(text || '').match(pattern) || []).length
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))]
}

function removeUndefinedProperties(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`)
  return value
}

function nonEmptyValue(value, option) {
  const trimmed = String(value || '').trim()
  if (!trimmed) throw new Error(`${option} requires a value.`)
  return trimmed
}

function positiveInteger(value, option) {
  const number = numberFromValue(value)
  if (!number || number <= 0) throw new Error(`${option} must be a positive integer.`)
  return number
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

function packageRoot() {
  return fileURLToPath(new URL('..', import.meta.url))
}

function isCliEntrypoint() {
  return Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isCliEntrypoint()) {
  await main().catch(() => {
    const report = {
      schema: REPORT_SCHEMA,
      status: 'failed',
      totals: {
        caseCount: 0,
        passCount: 0,
        failCount: 1,
        skippedCount: 0,
        bridgeIoEventCount: 0,
        serveIoEventCount: 0,
        failureCodeCounts: {
          validator_exception: 1,
        },
      },
      cases: [],
      sensitiveScan: {
        ok: true,
        totalMatches: 0,
        categories: {},
      },
      failureCodes: ['validator_exception'],
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = 1
  })
}
