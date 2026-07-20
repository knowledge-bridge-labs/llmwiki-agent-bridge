#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { startAgentBridge } from '../src/index.mjs'

const REPORT_SCHEMA = 'llmwiki-agent-bridge.chat-api-query-matrix.v1'
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8788'
const DEFAULT_SOURCE_URL = 'http://127.0.0.1:8765'
const MESSAGE_SEND_PATH = '/message:send'
const DEFAULT_TIMEOUT_MS = 15000
const PROMPT_CANARY = 'MATRIX_PROMPT_CANARY_DO_NOT_PRINT'
const ANSWER_CANARY = 'MATRIX_ANSWER_CANARY_DO_NOT_PRINT'
const TOKEN_CANARY = 'matrix-token-canary-do-not-print'
const SYSTEM_CANARY = 'MATRIX_SYSTEM_CANARY_DO_NOT_FORWARD'
const RUNTIME_SECRET_CANARY = 'matrix-runtime-secret-do-not-print'
const MOCK_MODEL = 'matrix-mock-model'

const SAFE_AUDIT_KEYS = new Set([
  'schemaVersion',
  'event',
  'timestamp',
  'requestId',
  'traceId',
  'method',
  'route',
  'statusCode',
  'durationMs',
  'sourcePolicy',
  'orchestrationMode',
  'runtimeCalled',
  'selectedSourceCount',
  'selectedReadySourceCount',
  'citationCount',
  'sourceBundleCount',
  'graphNodeCount',
  'artifactCount',
  'diagnosticCount',
  'conversationMessageCount',
  'conversationHistoryLength',
  'conversationContextProvided',
  'mcpMethod',
  'mcpToolName',
  'mcpError',
  'mcpErrorCode',
  'errorCode',
  'authorized',
  'originAllowed',
  'redacted',
  'routePatternOnly',
  'queryStringLogged',
  'requestBodyLogged',
  'responseBodyLogged',
  'credentialsLogged',
  'sourceUrlsLogged',
])

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    process.stdout.write(helpText())
    return
  }

  let context
  const caseSummaries = []
  try {
    context = await createContext(args)
    for (const definition of matrixCases()) {
      caseSummaries.push(await runCase(context, definition))
    }
  } finally {
    if (context) await context.close()
  }

  const report = buildReport({ args, caseSummaries, context })
  const finalScan = scanSensitiveText(JSON.stringify(report), sensitiveValues(args, context))
  const finalReport = {
    ...report,
    sensitiveScan: summarizeScan(finalScan),
  }
  const failed = caseSummaries.some((item) => item.status === 'failed') || !finalScan.ok
  finalReport.status = failed ? 'failed' : 'passed'

  process.stdout.write(`${JSON.stringify(finalReport, null, 2)}\n`)
  if (failed) process.exitCode = 1
}

function parseArgs(argv) {
  const args = {
    mode: normalizeMode(process.env.LLMWIKI_AGENT_BRIDGE_E2E_MODE) || 'mock',
    bridgeUrl: process.env.LLMWIKI_AGENT_BRIDGE_E2E_BRIDGE_URL
      || process.env.LLMWIKI_AGENT_BRIDGE_URL
      || DEFAULT_BRIDGE_URL,
    sourceUrl: process.env.LLMWIKI_AGENT_BRIDGE_E2E_SOURCE_URL
      || process.env.LLMWIKI_AGENT_BRIDGE_SOURCE_URL
      || DEFAULT_SOURCE_URL,
    bridgeBearerToken: process.env.LLMWIKI_AGENT_BRIDGE_E2E_BEARER_TOKEN || '',
    auditLogPath: process.env.LLMWIKI_AGENT_BRIDGE_E2E_AUDIT_LOG_PATH || '',
    timeoutMs: numberFromValue(process.env.LLMWIKI_AGENT_BRIDGE_E2E_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--mock') {
      args.mode = 'mock'
    } else if (arg === '--live') {
      args.mode = 'live'
    } else if (arg === '--mode') {
      args.mode = requiredMode(argv, index, '--mode')
      index += 1
    } else if (arg.startsWith('--mode=')) {
      args.mode = requiredMode([arg.slice('--mode='.length)], -1, '--mode')
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
    } else if (arg === '--bearer-token') {
      args.bridgeBearerToken = requiredValue(argv, index, '--bearer-token')
      index += 1
    } else if (arg.startsWith('--bearer-token=')) {
      args.bridgeBearerToken = nonEmptyValue(arg.slice('--bearer-token='.length), '--bearer-token')
    } else if (arg === '--audit-log-path') {
      args.auditLogPath = requiredValue(argv, index, '--audit-log-path')
      index += 1
    } else if (arg.startsWith('--audit-log-path=')) {
      args.auditLogPath = nonEmptyValue(arg.slice('--audit-log-path='.length), '--audit-log-path')
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = positiveInteger(requiredValue(argv, index, '--timeout-ms'), '--timeout-ms')
      index += 1
    } else if (arg.startsWith('--timeout-ms=')) {
      args.timeoutMs = positiveInteger(arg.slice('--timeout-ms='.length), '--timeout-ms')
    } else {
      throw new Error(`Unsupported option: ${arg}`)
    }
  }

  return args
}

function helpText() {
  return [
    'Usage: node scripts/e2e-chat-api-query-matrix.mjs [--mock|--live] [options]',
    '',
    'Runs a sanitized /message:send query matrix against the chat API shape used by llmwiki-chat.',
    'Default mode is self-contained mock mode. Live mode targets an already running bridge and source.',
    '',
    'Options:',
    '  --mock                         Start an in-process bridge plus mock source/runtime. Default.',
    '  --live                         Use an already running bridge and source.',
    '  --mode <mock|live>             Equivalent explicit mode selector.',
    '  --bridge-url <url>             Live bridge URL; env override is LLMWIKI_AGENT_BRIDGE_E2E_BRIDGE_URL.',
    '  --source-url <url>             Live source URL; env override is LLMWIKI_AGENT_BRIDGE_E2E_SOURCE_URL.',
    '  --bearer-token <token>         Optional bridge bearer token for live mode.',
    '  --audit-log-path <path>        Optional live-mode JSONL audit sink to inspect after a request.',
    '  --timeout-ms <ms>              Per-request timeout.',
    '',
    'Stdout intentionally reports only case ids, statuses, counts, and failure codes.',
    '',
  ].join('\n')
}

function matrixCases() {
  return [
    {
      id: 'evidence-only-selected-ready-source',
      run: runEvidenceOnlySelectedReadySource,
    },
    {
      id: 'delegated-runtime-selected-ready-source',
      run: runDelegatedRuntimeSelectedReadySource,
    },
    {
      id: 'multi-turn-follow-up-stable-thread',
      run: runMultiTurnFollowUp,
    },
    {
      id: 'top-level-a2a-message-without-data-query',
      run: runTopLevelA2aMessage,
    },
    {
      id: 'long-history-role-order-safety',
      run: runLongHistoryRoleOrderSafety,
    },
    {
      id: 'unreachable-selected-source-diagnostics',
      run: runUnreachableSelectedSourceDiagnostics,
    },
    {
      id: 'audit-redaction-safe-fields',
      run: runAuditRedactionSafeFields,
    },
  ]
}

async function createContext(args) {
  if (args.mode === 'mock') return createMockContext(args)
  return createLiveContext(args)
}

async function createMockContext(args) {
  const logger = recordingLogger()
  const runtime = await startRecordingServer(mockRuntimeHandler)
  const source = await startRecordingServer(mockSourceHandler)
  let bridge

  try {
    bridge = await startAgentBridge({
      host: '127.0.0.1',
      port: 0,
      baseUrl: `${runtime.url}/v1`,
      model: MOCK_MODEL,
      apiKey: RUNTIME_SECRET_CANARY,
      sourcePolicy: 'private-http',
      auditLog: true,
      requestTimeoutMs: Math.min(args.timeoutMs, 5000),
      logger,
      env: {},
    })
  } catch (error) {
    await closeServer(runtime.server)
    await closeServer(source.server)
    throw error
  }

  return {
    mode: 'mock',
    args,
    bridgeUrl: bridge.url,
    sourceUrl: source.url,
    bridgeBearerToken: '',
    bridge,
    source,
    runtime,
    logger,
    async close() {
      await closeAll([
        () => closeServer(bridge.server),
        () => closeServer(source.server),
        () => closeServer(runtime.server),
      ])
    },
  }
}

function createLiveContext(args) {
  return {
    mode: 'live',
    args,
    bridgeUrl: args.bridgeUrl,
    sourceUrl: args.sourceUrl,
    bridgeBearerToken: args.bridgeBearerToken,
    source: null,
    runtime: null,
    logger: null,
    async close() {},
  }
}

async function runCase(context, definition) {
  const before = snapshotContext(context)
  const failureCodes = []
  let response = null
  let counts = {}
  let status = 'passed'
  let skipCodes = []

  try {
    const result = await definition.run(context, before)
    response = result.response || null
    counts = {
      ...result.counts,
      ...deltaCounts(context, before),
    }
    failureCodes.push(...(result.failureCodes || []))
    skipCodes = result.skipCodes || []
    status = result.skipped ? 'skipped' : failureCodes.length ? 'failed' : 'passed'
  } catch {
    status = 'failed'
    failureCodes.push('case_exception')
    counts = deltaCounts(context, before)
  }

  return removeUndefinedProperties({
    id: definition.id,
    status,
    httpStatus: response?.httpStatus ?? undefined,
    counts: compactCounts(counts),
    failureCodes,
    ...(skipCodes.length ? { skipCodes } : {}),
  })
}

async function runEvidenceOnlySelectedReadySource(context, before) {
  const query = `${PROMPT_CANARY} evidence only selected ready source`
  const response = await sendMessage(context, {
    data: {
      query,
      orchestrationMode: 'evidence-only',
      knowledgeSources: [readySource(context.sourceUrl)],
    },
  }, 'evidence-only-selected-ready-source')
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)

  requireCase(failureCodes, artifact?.orchestrationMode === 'evidence-only', 'orchestration_mode_mismatch')
  if (context.mode === 'mock') {
    requireCase(failureCodes, countArray(artifact?.citations) >= 2, 'citation_count_low')
  } else {
    requireCase(failureCodes, hasGroundingEvidence(artifact), 'grounding_evidence_missing')
  }
  requireCase(failureCodes, !hasStep(artifact, 'runtime-chat-completions'), 'runtime_step_present_in_evidence_only')
  if (context.mode === 'mock') {
    const sourceRequests = requestsSince(context.source, before.sourceRequests)
    const runtimeRequests = requestsSince(context.runtime, before.runtimeRequests)
    requireCase(failureCodes, sourceRequests.some((item) => item.url.pathname === '/query'), 'selected_source_not_queried')
    requireCase(failureCodes, runtimeRequests.length === 0, 'runtime_called_in_evidence_only')
    requireCase(failureCodes, sourceRequests.some((item) => item.body?.query === query), 'source_query_mismatch')
  }

  return {
    response,
    failureCodes,
    counts: artifactCounts(artifact),
  }
}

async function runDelegatedRuntimeSelectedReadySource(context, before) {
  const query = `${PROMPT_CANARY} delegated runtime selected ready source`
  const response = await sendMessage(context, {
    data: {
      query,
      orchestrationMode: 'delegated-runtime',
      knowledgeSources: [readySource(context.sourceUrl)],
    },
  }, 'delegated-runtime-selected-ready-source')
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)

  requireCase(failureCodes, artifact?.orchestrationMode === 'delegated-runtime', 'orchestration_mode_mismatch')
  requireCase(failureCodes, hasStep(artifact, 'runtime-chat-completions'), 'runtime_step_missing')
  if (context.mode === 'mock') {
    requireCase(failureCodes, countArray(artifact?.citations) >= 2, 'citation_count_low')
  } else {
    requireCase(failureCodes, hasGroundingEvidence(artifact), 'grounding_evidence_missing')
  }

  if (context.mode === 'mock') {
    const runtimeRequests = requestsSince(context.runtime, before.runtimeRequests)
    const body = runtimeRequests.at(-1)?.body
    requireCase(failureCodes, runtimeRequests.length === 1, 'runtime_call_count_mismatch')
    requireCase(failureCodes, openAiMessages(body).at(0)?.role === 'system', 'runtime_system_message_missing')
    requireCase(failureCodes, openAiMessages(body).at(-1)?.role === 'user', 'runtime_final_user_missing')
    requireCase(failureCodes, lastRuntimeUserContent(body).includes('# LLMWiki evidence bundle'), 'runtime_evidence_bundle_missing')
  }

  return {
    response,
    failureCodes,
    counts: artifactCounts(artifact),
  }
}

async function runMultiTurnFollowUp(context, before) {
  const threadId = 'matrix-thread-stable'
  const sessionId = 'matrix-session-stable'
  const firstQuery = `${PROMPT_CANARY} first thread turn`
  const followUpQuery = `${PROMPT_CANARY} bounded follow up turn`
  const firstResponse = await sendMessage(context, {
    data: {
      query: firstQuery,
      orchestrationMode: 'delegated-runtime',
      threadId,
      sessionId,
      turnId: 'matrix-turn-1',
      runtimeContext: {
        conversation: {
          title: 'Matrix Conversation',
          messageCount: 1,
        },
      },
      messages: [
        { role: 'user', content: firstQuery },
      ],
      knowledgeSources: [readySource(context.sourceUrl)],
    },
    configuration: {
      historyLength: 2,
    },
  }, 'multi-turn-follow-up-stable-thread-1')

  const sourceBeforeFollowUp = context.source?.requests.length ?? 0
  const runtimeBeforeFollowUp = context.runtime?.requests.length ?? 0
  const response = await sendMessage(context, {
    data: {
      query: followUpQuery,
      orchestrationMode: 'delegated-runtime',
      threadId,
      sessionId,
      turnId: 'matrix-turn-2',
      message: {
        kind: 'message',
        role: 'user',
        messageId: 'matrix-turn-2',
        contextId: threadId,
        parts: [{ kind: 'text', text: followUpQuery }],
        metadata: {
          llmwiki: {
            schemaVersion: 'llmwiki-chat.conversation.v1',
            threadId: 'metadata-thread-ignored',
            sessionId: 'metadata-session-ignored',
            turnId: 'metadata-turn-ignored',
          },
        },
      },
      runtimeContext: {
        conversation: {
          title: 'Matrix Conversation',
          messageCount: 3,
        },
      },
      messages: [
        { role: 'user', content: firstQuery },
        { role: 'assistant', content: ANSWER_CANARY },
        { role: 'user', content: followUpQuery },
      ],
      knowledgeSources: [readySource(context.sourceUrl)],
    },
    configuration: {
      historyLength: 2,
    },
    metadata: {
      threadId: 'envelope-thread-ignored',
    },
  }, 'multi-turn-follow-up-stable-thread-2')

  const firstArtifact = artifactData(firstResponse.json)
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)

  requireCase(failureCodes, firstResponse.httpStatus === 200 && Boolean(firstArtifact), 'first_turn_failed')
  if (context.mode === 'mock') {
    const followSourceRequests = context.source.requests.slice(sourceBeforeFollowUp)
    const followRuntimeRequests = context.runtime.requests.slice(runtimeBeforeFollowUp)
    const runtimeBody = followRuntimeRequests.at(-1)?.body
    const bundle = runtimeEvidenceBundle(runtimeBody)
    requireCase(failureCodes, followRuntimeRequests.length === 1, 'follow_up_runtime_call_count_mismatch')
    requireCase(failureCodes, followSourceRequests.some((item) => item.url.pathname === '/query' && item.body?.query === followUpQuery), 'follow_up_source_query_mismatch')
    requireCase(failureCodes, !followSourceRequests.some((item) => JSON.stringify(item.body).includes(ANSWER_CANARY)), 'source_received_prior_answer')
    requireCase(failureCodes, roles(runtimeBody).join(',') === 'system,user,assistant,user', 'follow_up_runtime_role_order_invalid')
    requireCase(failureCodes, bundle?.conversationContext?.threadId === threadId, 'thread_context_not_stable')
    requireCase(failureCodes, bundle?.conversationContext?.sessionId === sessionId, 'session_context_not_stable')
    requireCase(failureCodes, bundle?.conversationContext?.historyLength === 2, 'history_length_not_bounded')
  }

  return {
    response,
    failureCodes,
    counts: artifactCounts(artifact),
  }
}

async function runTopLevelA2aMessage(context, before) {
  const messageText = `${PROMPT_CANARY} top level a2a message text`
  const response = await sendMessage(context, {
    message: {
      kind: 'message',
      role: 'user',
      messageId: 'matrix-top-level-message',
      contextId: 'matrix-top-level-context',
      parts: [{ kind: 'text', text: messageText }],
    },
    data: {
      orchestrationMode: 'evidence-only',
      knowledgeSources: [readySource(context.sourceUrl)],
    },
  }, 'top-level-a2a-message-without-data-query')
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)

  requireCase(failureCodes, artifact?.orchestrationMode === 'evidence-only', 'orchestration_mode_mismatch')
  if (context.mode === 'mock') {
    const sourceRequests = requestsSince(context.source, before.sourceRequests)
    const runtimeRequests = requestsSince(context.runtime, before.runtimeRequests)
    requireCase(failureCodes, sourceRequests.some((item) => item.url.pathname === '/query' && item.body?.query === messageText), 'a2a_message_query_not_used')
    requireCase(failureCodes, runtimeRequests.length === 0, 'runtime_called_in_evidence_only')
  }

  return {
    response,
    failureCodes,
    counts: artifactCounts(artifact),
  }
}

async function runLongHistoryRoleOrderSafety(context, before) {
  const query = `${PROMPT_CANARY} long history role order safety`
  const response = await sendMessage(context, {
    data: {
      query,
      orchestrationMode: 'delegated-runtime',
      messages: [
        { role: 'system', content: SYSTEM_CANARY },
        { role: 'assistant', content: 'orphan assistant history item' },
        { role: 'user', content: 'history user one' },
        { role: 'user', content: 'history user one replacement' },
        { role: 'assistant', content: 'history assistant one' },
        { role: 'assistant', content: 'history assistant one replacement' },
        { role: 'user', content: 'history user two' },
        { role: 'assistant', content: 'history assistant two' },
        { role: 'user', content: 'history user three' },
        { role: 'assistant', content: 'history assistant three' },
        { role: 'user', content: 'history user four' },
        { role: 'assistant', content: 'history assistant four' },
        { role: 'user', content: query },
      ],
      knowledgeSources: [readySource(context.sourceUrl)],
    },
    configuration: {
      historyLength: 4,
    },
  }, 'long-history-role-order-safety')
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)

  if (context.mode === 'mock') {
    const runtimeRequests = requestsSince(context.runtime, before.runtimeRequests)
    const runtimeBody = runtimeRequests.at(-1)?.body
    const runtimeMessages = openAiMessages(runtimeBody)
    const runtimeRoles = runtimeMessages.map((message) => message.role)
    const historyMessages = runtimeMessages.slice(1, -1)
    const historyRoles = historyMessages.map((message) => message.role)
    requireCase(failureCodes, runtimeRequests.length === 1, 'runtime_call_count_mismatch')
    requireCase(failureCodes, runtimeRoles.join(',') === 'system,user,assistant,user,assistant,user', 'runtime_role_order_invalid')
    requireCase(failureCodes, historyMessages.length <= 4, 'runtime_history_unbounded')
    requireCase(failureCodes, historyRoles.join(',') === 'user,assistant,user,assistant', 'runtime_history_alternation_invalid')
    requireCase(failureCodes, !JSON.stringify(runtimeMessages).includes(SYSTEM_CANARY), 'caller_system_forwarded')
    requireCase(failureCodes, !historyMessages.some((message) => message.content === query), 'current_query_duplicated')
  }

  return {
    response,
    failureCodes,
    counts: artifactCounts(artifact),
  }
}

async function runUnreachableSelectedSourceDiagnostics(context) {
  const query = `${PROMPT_CANARY} unreachable selected source diagnostics`
  const unreachableUrl = context.mode === 'mock'
    ? await closedLoopbackUrl()
    : `${trimTrailingSlashes(context.sourceUrl)}/matrix-unreachable`
  const response = await sendMessage(context, {
    data: {
      query,
      orchestrationMode: 'evidence-only',
      knowledgeSources: [
        {
          ...readySource(unreachableUrl),
          id: 'matrix-unreachable-source',
          name: 'Matrix Unreachable Source',
        },
      ],
    },
  }, 'unreachable-selected-source-diagnostics')
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)
  const diagnosticText = JSON.stringify({
    diagnostics: artifact?.diagnostics,
    steps: artifact?.steps,
    response: response.json,
  })

  requireCase(failureCodes, countArray(artifact?.diagnostics) > 0, 'source_diagnostics_missing')
  requireCase(failureCodes, readArray(artifact?.diagnostics).every((item) => item.redacted === true), 'diagnostic_redaction_missing')
  requireCase(failureCodes, !containsSensitiveText(diagnosticText, [unreachableUrl, query, TOKEN_CANARY]), 'response_sensitive_leak')

  return {
    response,
    failureCodes,
    counts: artifactCounts(artifact),
  }
}

async function runAuditRedactionSafeFields(context, before) {
  if (context.mode === 'live' && !context.args.auditLogPath) {
    return {
      skipped: true,
      skipCodes: ['audit_log_not_observable'],
      counts: deltaCounts(context, before),
    }
  }

  const query = `${PROMPT_CANARY} audit redaction safe fields`
  const beforeAuditText = context.mode === 'live'
    ? await readTextIfPresent(context.args.auditLogPath)
    : ''
  const response = await sendMessage(context, {
    data: {
      query,
      orchestrationMode: 'delegated-runtime',
      threadId: 'matrix-audit-thread',
      messages: [
        { role: 'user', content: 'audit history user' },
        { role: 'assistant', content: ANSWER_CANARY },
        { role: 'user', content: query },
      ],
      knowledgeSources: [readySource(context.sourceUrl)],
    },
    configuration: {
      historyLength: 2,
    },
  }, 'audit-redaction-safe-fields')
  const artifact = artifactData(response.json)
  const failureCodes = commonSuccessFailures(response, artifact)
  const auditLines = context.mode === 'live'
    ? newAuditLines(beforeAuditText, await readTextIfPresent(context.args.auditLogPath))
    : context.logger.auditLines.slice(before.auditLines)
  const auditEvents = auditLines.map(parseJsonLine).filter((item) => item?.event === 'llmwiki.agent_bridge.request')
  const event = auditEvents.at(-1)
  const eventText = JSON.stringify(auditEvents)

  requireCase(failureCodes, auditEvents.length > 0, 'audit_event_missing')
  requireCase(failureCodes, Boolean(event) && event.route === MESSAGE_SEND_PATH, 'audit_route_mismatch')
  requireCase(failureCodes, Boolean(event) && event.orchestrationMode === 'delegated-runtime', 'audit_mode_mismatch')
  requireCase(failureCodes, Boolean(event) && event.runtimeCalled === true, 'audit_runtime_called_mismatch')
  requireCase(failureCodes, Boolean(event) && event.redacted === true, 'audit_redaction_flag_missing')
  requireCase(failureCodes, Boolean(event) && event.requestBodyLogged === false && event.responseBodyLogged === false, 'audit_body_redaction_flag_invalid')
  requireCase(failureCodes, Boolean(event) && event.sourceUrlsLogged === false && event.credentialsLogged === false, 'audit_url_or_credential_flag_invalid')
  requireCase(failureCodes, auditEvents.every((item) => safeAuditKeys(item)), 'audit_event_keys_unsafe')
  requireCase(failureCodes, !containsSensitiveText(eventText, [
    query,
    ANSWER_CANARY,
    TOKEN_CANARY,
    RUNTIME_SECRET_CANARY,
    context.sourceUrl,
    context.bridgeUrl,
  ]), 'audit_sensitive_leak')

  return {
    response,
    failureCodes,
    counts: {
      ...artifactCounts(artifact),
      auditEventsObserved: auditEvents.length,
    },
  }
}

async function sendMessage(context, payload, caseId) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), context.args.timeoutMs)
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-request-id': safeHeaderIdentifier(`matrix-${caseId}`),
      'x-trace-id': safeHeaderIdentifier(`trace-${caseId}`),
    }
    if (context.bridgeBearerToken) headers.Authorization = `Bearer ${context.bridgeBearerToken}`

    const response = await fetch(new URL(MESSAGE_SEND_PATH, context.bridgeUrl), {
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
    }
  } catch {
    return {
      httpStatus: null,
      json: null,
      jsonOk: false,
      networkError: true,
      responseBytes: 0,
    }
  } finally {
    clearTimeout(timer)
  }
}

function commonSuccessFailures(response, artifact) {
  const failureCodes = []
  requireCase(failureCodes, response?.httpStatus === 200, 'message_send_http_status')
  requireCase(failureCodes, response?.jsonOk === true, 'message_send_invalid_json')
  requireCase(failureCodes, Boolean(artifact), 'agent_result_missing')
  return failureCodes
}

function hasGroundingEvidence(artifact) {
  return countArray(artifact?.citations) > 0
    || countArray(artifact?.graph?.nodes) > 0
    || countArray(artifact?.sourceBundles) > 0
}

function requireCase(failureCodes, condition, code) {
  if (!condition) failureCodes.push(code)
}

function readySource(url) {
  return {
    id: 'matrix-source',
    name: 'Matrix Knowledge Source',
    title: 'Matrix Knowledge Source',
    description: 'Synthetic deterministic Knowledge Source for the chat API matrix.',
    protocol: 'llmwiki-http',
    status: 'ready',
    selected: true,
    url,
    capabilities: ['llmwiki_context'],
    adapter: 'matrix-mock',
    implementation: 'chat-api-query-matrix',
  }
}

async function mockRuntimeHandler({ url, body, response }) {
  if (url.pathname !== '/v1/chat/completions') {
    writeJson(response, 404, { error: 'not_found' })
    return
  }

  writeJson(response, 200, {
    choices: [
      {
        message: {
          role: 'assistant',
          content: `${ANSWER_CANARY} grounded matrix answer [1](#citation-1).`,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: estimateTokenCount(JSON.stringify(body?.messages || [])),
      completion_tokens: 8,
      total_tokens: estimateTokenCount(JSON.stringify(body?.messages || [])) + 8,
    },
  })
}

async function mockSourceHandler({ url, response }) {
  if (url.pathname === '/source-bundle' || url.pathname === '/manifest') {
    writeJson(response, 200, {
      source_id: 'matrix-source',
      bundle_id: 'matrix-bundle',
      title: 'Matrix Bundle',
      capabilities: ['llmwiki_context', 'llmwiki_search', 'llmwiki_source_bundle'],
      adapter: 'matrix-mock',
      implementation: 'chat-api-query-matrix',
      projection: {
        signature: 'matrix-projection',
        pageCount: 3,
        approvedPageCount: 3,
        graphNodeCount: 2,
        graphEdgeCount: 1,
      },
      rawOrigins: {
        enabled: false,
        originCount: 0,
      },
      sourceRefs: [
        {
          id: 'matrix-ref',
          label: 'Matrix Reference',
          type: 'synthetic',
          uri: 'urn:llmwiki:source-ref:matrix-ref',
        },
      ],
    })
    return
  }

  if (url.pathname === '/query') {
    writeJson(response, 200, {
      wiki_title: 'Matrix Wiki',
      description: 'Synthetic matrix wiki.',
      adapter: 'matrix-mock',
      implementation: 'chat-api-query-matrix',
      pageCount: 3,
      approvedPageCount: 3,
      orientation: [
        {
          page_id: 'overview',
          title: 'Matrix Overview',
          path: 'overview.md',
          snippet: 'The matrix fixture is deterministic and local.',
          role: 'orientation',
        },
      ],
      evidence: [
        {
          page_id: 'release-readiness',
          title: 'Release Readiness',
          path: 'release-readiness.md',
          snippet: 'Release readiness requires evidence-only and delegated-runtime checks.',
          source_refs: ['matrix-ref'],
        },
        {
          page_id: 'conversation-context',
          title: 'Conversation Context',
          path: 'conversation-context.md',
          snippet: 'Follow-up turns preserve bounded user and assistant history only at the runtime boundary.',
          source_refs: ['matrix-ref'],
        },
      ],
      graph: {
        nodes: [
          { id: 'release-readiness', label: 'Release Readiness', kind: 'page', path: 'release-readiness.md' },
          { id: 'conversation-context', label: 'Conversation Context', kind: 'page', path: 'conversation-context.md' },
        ],
        edges: [
          { source: 'conversation-context', target: 'release-readiness', relation: 'supports' },
        ],
      },
      limitations: ['Synthetic local fixture only.'],
    })
    return
  }

  if (url.pathname === '/search') {
    writeJson(response, 200, {
      results: [
        {
          page_id: 'search-augmentation',
          title: 'Search Augmentation',
          path: 'search-augmentation.md',
          snippet: 'Search augmentation adds a compact supporting citation.',
          source_refs: ['matrix-ref'],
        },
      ],
    })
    return
  }

  writeJson(response, 404, { error: 'not_found' })
}

async function startRecordingServer(handler) {
  const requests = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : value || '',
    ]))
    const body = request.method === 'GET' ? {} : await readJsonBody(request)
    requests.push({ method: request.method, url, headers, body })

    try {
      await handler({ request, url, headers, body, response })
    } catch {
      writeJson(response, 500, { error: 'fixture_handler_failed' })
    }
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })

  const address = server.address()
  if (!address || typeof address !== 'object') throw new Error('Fixture server did not expose an address.')
  return {
    server,
    requests,
    url: `http://127.0.0.1:${address.port}`,
  }
}

async function closedLoopbackUrl() {
  const server = createServer((_request, response) => {
    response.destroy()
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  if (!address || typeof address !== 'object') {
    await closeServer(server)
    throw new Error('Unable to reserve a loopback port.')
  }
  const url = `http://127.0.0.1:${address.port}/matrix-unreachable?api_key=${TOKEN_CANARY}`
  await closeServer(server)
  return url
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function writeJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function recordingLogger() {
  const auditLines = []
  const otherLines = []
  return {
    auditLines,
    otherLines,
    log(...args) {
      auditLines.push(args.map(String).join(' '))
    },
    warn(...args) {
      otherLines.push(args.map(String).join(' '))
    },
    error(...args) {
      otherLines.push(args.map(String).join(' '))
    },
  }
}

function artifactData(body) {
  const artifacts = readArray(body?.artifacts)
  for (const artifact of artifacts) {
    if (artifact?.name !== 'llmwiki_agent_result') continue
    for (const part of readArray(artifact.parts)) {
      if (part?.kind === 'data' && part.data && typeof part.data === 'object') return part.data
    }
  }
  return null
}

function artifactCounts(artifact) {
  return removeUndefinedProperties({
    citations: countArray(artifact?.citations),
    diagnostics: countArray(artifact?.diagnostics),
    steps: countArray(artifact?.steps),
    sourceBundles: countArray(artifact?.sourceBundles),
    graphNodes: countArray(artifact?.graph?.nodes),
    graphEdges: countArray(artifact?.graph?.edges),
  })
}

function snapshotContext(context) {
  return {
    sourceRequests: context.source?.requests.length ?? null,
    runtimeRequests: context.runtime?.requests.length ?? null,
    auditLines: context.logger?.auditLines.length ?? null,
  }
}

function deltaCounts(context, before) {
  const sourceRequests = context.source ? requestsSince(context.source, before.sourceRequests) : []
  const runtimeRequests = context.runtime ? requestsSince(context.runtime, before.runtimeRequests) : []
  const auditLines = context.logger ? context.logger.auditLines.slice(before.auditLines) : []
  return removeUndefinedProperties({
    sourceRequests: context.source ? sourceRequests.length : undefined,
    sourceQueries: context.source ? sourceRequests.filter((item) => item.url.pathname === '/query').length : undefined,
    sourceSearches: context.source ? sourceRequests.filter((item) => item.url.pathname === '/search').length : undefined,
    runtimeRequests: context.runtime ? runtimeRequests.length : undefined,
    auditEvents: context.logger ? auditLines.length : undefined,
  })
}

function requestsSince(server, startIndex) {
  if (!server || !Number.isInteger(startIndex)) return []
  return server.requests.slice(startIndex)
}

function compactCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts || {})
      .filter(([, value]) => Number.isFinite(value))
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function hasStep(artifact, id) {
  return readArray(artifact?.steps).some((step) => step?.id === id)
}

function openAiMessages(body) {
  return readArray(body?.messages)
}

function roles(body) {
  return openAiMessages(body).map((message) => message.role)
}

function lastRuntimeUserContent(body) {
  return String(openAiMessages(body).filter((message) => message.role === 'user').at(-1)?.content || '')
}

function runtimeEvidenceBundle(body) {
  const content = lastRuntimeUserContent(body)
  const marker = '# LLMWiki evidence bundle\n'
  const markerIndex = content.indexOf(marker)
  if (markerIndex < 0) return null
  try {
    return JSON.parse(content.slice(markerIndex + marker.length))
  } catch {
    return null
  }
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

function safeAuditKeys(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false
  return Object.keys(event).every((key) => SAFE_AUDIT_KEYS.has(key))
}

function newAuditLines(beforeText, afterText) {
  const suffix = afterText.startsWith(beforeText) ? afterText.slice(beforeText.length) : afterText
  return suffix.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

async function readTextIfPresent(path) {
  if (!path) return ''
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function buildReport({ args, caseSummaries, context }) {
  const failedCases = caseSummaries.filter((item) => item.status === 'failed')
  const skippedCases = caseSummaries.filter((item) => item.status === 'skipped')
  return {
    schema: REPORT_SCHEMA,
    mode: args.mode,
    status: failedCases.length ? 'failed' : 'passed',
    targets: {
      bridge: args.mode === 'mock' ? 'self-contained-mock' : 'live-running-bridge',
      source: args.mode === 'mock' ? 'self-contained-mock' : 'live-running-source',
      runtime: args.mode === 'mock' ? 'self-contained-mock' : 'configured-live-runtime',
      audit: args.mode === 'mock'
        ? 'bridge-audit-enabled'
        : args.auditLogPath
          ? 'external-audit-log-path'
          : 'not-observable',
    },
    options: {
      timeoutMs: args.timeoutMs,
      bridgeBearerTokenProvided: Boolean(args.bridgeBearerToken),
      auditLogPathProvided: Boolean(args.auditLogPath),
    },
    totals: {
      caseCount: caseSummaries.length,
      passCount: caseSummaries.filter((item) => item.status === 'passed').length,
      failCount: failedCases.length,
      skippedCount: skippedCases.length,
      failureCodeCounts: failureCodeCounts(caseSummaries),
      citationCount: sumCaseCount(caseSummaries, 'citations'),
      diagnosticCount: sumCaseCount(caseSummaries, 'diagnostics'),
      runtimeRequestCount: sumCaseCount(caseSummaries, 'runtimeRequests'),
      sourceQueryCount: sumCaseCount(caseSummaries, 'sourceQueries'),
      auditEventCount: sumCaseCount(caseSummaries, 'auditEvents'),
      loggerLineCount: context?.logger?.otherLines?.length,
    },
    cases: caseSummaries,
  }
}

function failureCodeCounts(caseSummaries) {
  const counts = {}
  for (const item of caseSummaries) {
    for (const code of item.failureCodes || []) {
      counts[code] = (counts[code] || 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function sumCaseCount(caseSummaries, key) {
  return caseSummaries.reduce((total, item) => total + numberOrZero(item.counts?.[key]), 0)
}

function scanSensitiveText(text, values) {
  const content = String(text || '')
  const configuredValueMatches = uniqueNonEmpty(values)
    .filter((value) => value.length >= 3)
    .reduce((total, value) => total + countExact(content, value), 0)
  const categories = {
    configuredValue: configuredValueMatches,
    keyLikeToken: countRegExp(content, /\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|sk|hf)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi),
    bearerToken: countRegExp(content, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi),
    rawUrl: countRegExp(content, /https?:\/\/[^\s"']+/gi),
    promptField: countRegExp(content, /"(?:prompt|query|answer|url|token)"\s*:/gi),
  }
  const totalMatches = Object.values(categories).reduce((total, count) => total + count, 0)
  return {
    ok: totalMatches === 0,
    totalMatches,
    categories,
  }
}

function summarizeScan(scan) {
  return {
    ok: Boolean(scan?.ok),
    totalMatches: numberOrZero(scan?.totalMatches),
    categories: scan?.categories || {},
  }
}

function sensitiveValues(args, context) {
  return [
    PROMPT_CANARY,
    ANSWER_CANARY,
    TOKEN_CANARY,
    SYSTEM_CANARY,
    RUNTIME_SECRET_CANARY,
    args.bridgeUrl,
    args.sourceUrl,
    args.bridgeBearerToken,
    context?.bridgeUrl,
    context?.sourceUrl,
  ].filter(Boolean)
}

function containsSensitiveText(text, values) {
  return uniqueNonEmpty(values)
    .filter((value) => value.length >= 3)
    .some((value) => String(text || '').includes(value))
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (!mode) return ''
  if (mode === 'mock' || mode === 'live') return mode
  throw new Error('Mode must be mock or live.')
}

function requiredMode(argv, index, option) {
  return normalizeMode(requiredValue(argv, index, option))
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

function numberFromValue(value) {
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))]
}

function countExact(text, value) {
  const pattern = new RegExp(escapeRegExp(String(value)), 'g')
  return countRegExp(text, pattern)
}

function countRegExp(text, pattern) {
  return (String(text || '').match(pattern) || []).length
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeHeaderIdentifier(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .slice(0, 120)
}

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '')
}

function estimateTokenCount(value) {
  return Math.max(1, Math.ceil(String(value || '').length / 4))
}

function removeUndefinedProperties(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

async function closeAll(closers) {
  for (const close of closers) {
    try {
      await close()
    } catch {
      // Best-effort cleanup only.
    }
  }
}

async function closeServer(server) {
  if (!server?.listening) return
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })
}

function isCliEntrypoint() {
  return Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isCliEntrypoint()) {
  await main().catch(() => {
    process.stderr.write('e2e_chat_api_query_matrix_failed\n')
    process.exitCode = 1
  })
}
