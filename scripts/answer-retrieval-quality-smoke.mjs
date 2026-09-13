#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  BRIDGE_A2A_CONTENT_TYPE,
  BRIDGE_A2A_PROTOCOL_VERSION,
  BRIDGE_A2A_VERSION_HEADER,
  startAgentBridge,
} from '../src/index.mjs'

const REPORT_SCHEMA = 'llmwiki-agent-bridge.answer-retrieval-quality-smoke.v1'
const MODERN_MCP_PROTOCOL_VERSION = '2026-07-28'
const DEFAULT_TIMEOUT_MS = 30_000
const SOURCE_HOST = '127.0.0.1'
const SOURCE_IDS = {
  http: 'sample-http',
  mcp: 'sample-mcp-stream',
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const queryCases = [
  {
    id: 'release-readiness',
    query: 'required label copy release readiness',
    expectedPageIds: ['hot', 'artwork-review', 'requester-return', 'index'],
    requestGraphContext: true,
  },
  {
    id: 'requester-return',
    query: 'when should requester packet be returned',
    expectedPageIds: ['requester-return'],
  },
  {
    id: 'artwork-review',
    query: 'artwork review handoff readiness',
    expectedPageIds: ['artwork-review', 'hot'],
  },
]

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    process.stdout.write(helpText())
    return
  }

  let context
  const cases = []
  const qualityGaps = []

  try {
    context = await createSmokeContext(args)
    cases.push(await runCase('direct-serve-http-query', (failures) => (
      runDirectServeHttpQueryCase(context, failures)
    )))
    cases.push(await runCase('direct-serve-mcp-stream-context', (failures) => (
      runDirectServeMcpStreamContextCase(context, failures)
    )))
    cases.push(await runCase('bridge-source-registry-probe', (failures) => (
      runBridgeSourceRegistryProbeCase(context, failures)
    )))
    cases.push(await runCase('bridge-http-message-send-a2a10', (failures) => (
      runBridgeHttpMessageSendCase(context, failures, qualityGaps)
    )))
    cases.push(await runCase('bridge-mcp-stream-agent-run', (failures) => (
      runBridgeMcpStreamAgentRunCase(context, failures, qualityGaps)
    )))
    cases.push(await runCase('bridge-mcp-source-tools', (failures) => (
      runBridgeMcpSourceToolsCase(context, failures)
    )))
    cases.push(await runCase('artifact-local-path-redaction', (failures) => (
      runArtifactLocalPathRedactionCase(context, failures)
    )))
  } finally {
    if (context) await context.close()
  }

  const failed = cases.some((item) => item.status === 'failed')
  const report = {
    schema: REPORT_SCHEMA,
    status: failed ? 'failed' : qualityGaps.length ? 'passed_with_gaps' : 'passed',
    targets: {
      source: 'local-llmwiki-serve-sample-wiki',
      bridge: 'local-llmwiki-agent-bridge',
      sourceProtocols: ['llmwiki-http', 'mcp-streamable-http'],
      runtime: 'not-called',
    },
    options: {
      serveRepo: context?.serveRepoLabel || 'detected',
      graphStore: 'sqlite-temp',
      timeoutMs: args.timeoutMs,
    },
    totals: {
      caseCount: cases.length,
      passed: cases.filter((item) => item.status === 'passed').length,
      failed: cases.filter((item) => item.status === 'failed').length,
      qualityGapCount: qualityGaps.length,
    },
    cases,
    qualityGaps: dedupeQualityGaps(qualityGaps),
  }

  process.stdout.write(`${JSON.stringify(report, null, args.pretty ? 2 : 0)}\n`)
  if (failed) process.exitCode = 1
}

function parseArgs(argv) {
  const args = {
    serveRepo: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pretty: false,
    keepTemp: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--pretty') {
      args.pretty = true
    } else if (arg === '--keep-temp') {
      args.keepTemp = true
    } else if (arg === '--serve-repo') {
      args.serveRepo = requiredValue(argv, index, '--serve-repo')
      index += 1
    } else if (arg.startsWith('--serve-repo=')) {
      args.serveRepo = nonEmptyValue(arg.slice('--serve-repo='.length), '--serve-repo')
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
    'Usage: node scripts/answer-retrieval-quality-smoke.mjs [options]',
    '',
    'Starts a local llmwiki-serve sample source and llmwiki-agent-bridge, then',
    'runs deterministic direct-vs-bridge retrieval and answer-artifact checks.',
    'No external LLM runtime is called.',
    '',
    'Options:',
    '  --serve-repo <path>   Local llmwiki-serve checkout. Env: LLMWIKI_SERVE_REPO.',
    '  --timeout-ms <ms>     Startup and per-request timeout. Default: 30000.',
    '  --pretty              Pretty-print the sanitized JSON report.',
    '  --keep-temp           Keep temporary graph-store/config files for debugging.',
    '  --help, -h            Show this help.',
    '',
  ].join('\n')
}

async function createSmokeContext(args) {
  const serveRepo = resolveServeRepo(args.serveRepo || process.env.LLMWIKI_SERVE_REPO || '')
  const sampleRoot = join(serveRepo, 'examples', 'sample-wiki')
  const tempDir = await mkdtemp(join(tmpdir(), 'llmwiki-answer-quality-'))
  const graphStorePath = join(tempDir, 'graph-store.sqlite')
  const bridgeConfigPath = join(tempDir, 'bridge-settings.json')
  const sourcePort = await openLoopbackPort()
  const serveUrl = `http://${SOURCE_HOST}:${sourcePort}`
  const serveProcess = startServeProcess({
    serveRepo,
    port: sourcePort,
    graphStorePath,
  })

  let bridge
  let closed = false
  try {
    await waitForServeHealth(serveUrl, serveProcess, args.timeoutMs)
    bridge = await startAgentBridge({
      host: SOURCE_HOST,
      port: 0,
      configPath: bridgeConfigPath,
      sourcePolicy: 'private-http',
      baseUrl: 'http://127.0.0.1:1/v1',
      model: 'quality-smoke-no-runtime',
      runtimeProfile: 'generic',
      requestTimeoutMs: Math.min(args.timeoutMs, 15_000),
      ioLog: false,
      auditLog: false,
      env: {},
      logger: silentLogger(),
    })

    return {
      args,
      serveRepo,
      serveRepoLabel: 'detected-local-checkout',
      sampleRoot,
      tempDir,
      graphStorePath,
      bridgeConfigPath,
      serveUrl,
      bridgeUrl: bridge.url,
      bridge,
      serveProcess,
      publicArtifacts: [],
      directHttpByCase: new Map(),
      directMcpByCase: new Map(),
      async close() {
        if (closed) return
        closed = true
        await closeBridge(bridge)
        await stopProcess(serveProcess)
        if (!args.keepTemp) await rm(tempDir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await closeBridge(bridge)
    await stopProcess(serveProcess)
    if (!args.keepTemp) await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

async function runCase(id, body) {
  const failures = []
  try {
    const summary = await body(failures)
    return removeUndefinedProperties({
      id,
      status: failures.length ? 'failed' : 'passed',
      failureCodes: failures,
      ...summary,
    })
  } catch (error) {
    return {
      id,
      status: 'failed',
      failureCodes: [failureCode(error)],
      error: safeErrorSummary(error),
    }
  }
}

async function runDirectServeHttpQueryCase(context, failures) {
  const bundle = await getJson(new URL('/source-bundle', context.serveUrl), context.args.timeoutMs)
  context.publicArtifacts.push(bundle.json)
  requireCase(failures, bundle.status === 200, 'source_bundle_http_status')
  requireCase(failures, hasSourceBundleMetadata(bundle.json), 'source_bundle_metadata_missing')

  const graph = await getJson(new URL('/graph?limit=500', context.serveUrl), context.args.timeoutMs)
  context.publicArtifacts.push(graph.json)
  requireCase(failures, graph.status === 200, 'graph_http_status')
  requireGraphCoverage(failures, graph.json, '')

  const perQuery = {}
  for (const queryCase of queryCases) {
    const response = await postJson(new URL('/query', context.serveUrl), {
      query: queryCase.query,
      limit: 8,
    }, context.args.timeoutMs)
    context.publicArtifacts.push(response.json)
    requireCase(failures, response.status === 200, `${queryCase.id}_http_status`)
    requireDirectContextQuality(failures, response.json, queryCase, '')
    const observed = directContextSummary(response.json)
    perQuery[queryCase.id] = observed
    context.directHttpByCase.set(queryCase.id, response.json)
  }

  const store = await stat(context.graphStorePath).catch(() => null)
  requireCase(failures, Boolean(store?.isFile() && store.size > 0), 'sqlite_graph_store_not_created')

  return {
    counts: {
      queryCount: queryCases.length,
      sourceBundleCount: hasSourceBundleMetadata(bundle.json) ? 1 : 0,
      graphNodes: countArray(graph.json?.nodes),
      graphEdges: countArray(graph.json?.edges),
      sqliteGraphStoreObserved: Boolean(store?.isFile() && store.size > 0),
    },
    observed: perQuery,
  }
}

async function runDirectServeMcpStreamContextCase(context, failures) {
  const tools = await directMcpToolList(context)
  requireCase(failures, tools.names.includes('llmwiki_context'), 'direct_mcp_context_tool_missing')
  requireCase(failures, tools.names.includes('llmwiki_source_bundle'), 'direct_mcp_source_bundle_tool_missing')

  const bundle = await directMcpToolCall(context, 'llmwiki_source_bundle', {})
  context.publicArtifacts.push(bundle)
  requireCase(failures, hasSourceBundleMetadata(bundle), 'direct_mcp_source_bundle_metadata_missing')

  const graph = await directMcpToolCall(context, 'llmwiki_graph', { limit: 500 })
  context.publicArtifacts.push(graph)
  requireGraphCoverage(failures, graph, '')

  const perQuery = {}
  for (const queryCase of queryCases) {
    const contextPayload = await directMcpToolCall(context, 'llmwiki_context', {
      query: queryCase.query,
      limit: 8,
    })
    context.publicArtifacts.push(contextPayload)
    requireDirectContextQuality(failures, contextPayload, queryCase, '')
    requireAlignedPageIds(
      failures,
      pageIds(context.directHttpByCase.get(queryCase.id)?.evidence),
      pageIds(contextPayload.evidence),
      `${queryCase.id}_direct_mcp_page_alignment`,
    )
    const observed = directContextSummary(contextPayload)
    perQuery[queryCase.id] = observed
    context.directMcpByCase.set(queryCase.id, contextPayload)
  }

  return {
    counts: {
      queryCount: queryCases.length,
      toolCount: tools.names.length,
      sourceBundleCount: hasSourceBundleMetadata(bundle) ? 1 : 0,
      graphNodes: countArray(graph?.nodes),
      graphEdges: countArray(graph?.edges),
    },
    observed: perQuery,
  }
}

async function runBridgeSourceRegistryProbeCase(context, failures) {
  await registerBridgeSources(context, 'both')
  const response = await getJson(new URL('/sources?probe=1', context.bridgeUrl), context.args.timeoutMs)
  context.publicArtifacts.push(response.json)
  const sources = readArray(response.json?.sources)
  const httpSource = sources.find((source) => source.id === SOURCE_IDS.http)
  const mcpSource = sources.find((source) => source.id === SOURCE_IDS.mcp)

  requireCase(failures, response.status === 200, 'bridge_sources_probe_status')
  requireCase(failures, response.json?.registeredCount === 2, 'bridge_registered_source_count')
  requireCase(failures, response.json?.selectedReadySourceCount === 2, 'bridge_selected_ready_source_count')
  requireCase(failures, Boolean(httpSource?.health?.ok), 'bridge_http_source_probe_unready')
  requireCase(failures, Boolean(mcpSource?.health?.ok), 'bridge_mcp_stream_source_probe_unready')
  requireCase(
    failures,
    String(mcpSource?.endpoint?.redactedUrl || '').endsWith('/mcp/stream'),
    'bridge_mcp_stream_url_not_preserved',
  )

  return {
    counts: {
      registeredSources: response.json?.registeredCount,
      selectedReadySources: response.json?.selectedReadySourceCount,
    },
    observed: {
      sourceIds: sources.map((source) => source.id).sort(),
      probeHealth: sources.map((source) => ({
        id: source.id,
        ok: Boolean(source.health?.ok),
        endpoint: source.health?.endpoint || '',
      })),
    },
  }
}

async function runBridgeHttpMessageSendCase(context, failures, qualityGaps) {
  await registerBridgeSources(context, 'http')
  const perQuery = {}

  for (const queryCase of queryCases) {
    const response = await postJson(new URL('/message:send', context.bridgeUrl), {
      data: removeUndefinedProperties({
        query: queryCase.query,
        mode: 'evidence-only',
        graphContext: queryCase.requestGraphContext ? graphContextRequest() : undefined,
      }),
    }, context.args.timeoutMs, {
      Accept: BRIDGE_A2A_CONTENT_TYPE,
      [BRIDGE_A2A_VERSION_HEADER]: BRIDGE_A2A_PROTOCOL_VERSION,
    })
    context.publicArtifacts.push(response.json)
    requireCase(failures, response.status === 200, `${queryCase.id}_bridge_http_status`)
    requireLatestA2aShape(failures, response.json, queryCase.id)
    const artifact = extractBridgeAgentResult(response.json)
    collectGraphContextGaps(qualityGaps, 'bridge-http-message-send-a2a10', artifact)
    requireBridgeArtifactQuality(failures, artifact, queryCase, SOURCE_IDS.http)
    requireBridgeAlignment(failures, context.directHttpByCase.get(queryCase.id), artifact, queryCase, SOURCE_IDS.http)
    perQuery[queryCase.id] = bridgeArtifactSummary(artifact, SOURCE_IDS.http)
  }

  return {
    counts: aggregateBridgeCounts(perQuery),
    observed: perQuery,
  }
}

async function runBridgeMcpStreamAgentRunCase(context, failures, qualityGaps) {
  await registerBridgeSources(context, 'mcp')
  const perQuery = {}

  for (const queryCase of queryCases) {
    const envelope = await bridgeMcpToolCall(context, 'llmwiki_agent_run', removeUndefinedProperties({
      query: queryCase.query,
      mode: 'evidence-only',
      graphContext: queryCase.requestGraphContext ? graphContextRequest() : undefined,
    }))
    context.publicArtifacts.push(envelope)
    requireCase(failures, !envelope.error, `${queryCase.id}_bridge_mcp_agent_run_error`)
    const artifact = envelope.result?.structuredContent?.llmwiki_agent_result
    collectGraphContextGaps(qualityGaps, 'bridge-mcp-stream-agent-run', artifact)
    requireBridgeArtifactQuality(failures, artifact, queryCase, SOURCE_IDS.mcp)
    requireBridgeAlignment(failures, context.directMcpByCase.get(queryCase.id), artifact, queryCase, SOURCE_IDS.mcp)
    perQuery[queryCase.id] = bridgeArtifactSummary(artifact, SOURCE_IDS.mcp)
  }

  return {
    counts: aggregateBridgeCounts(perQuery),
    observed: perQuery,
  }
}

async function runBridgeMcpSourceToolsCase(context, failures) {
  await registerBridgeSources(context, 'mcp')

  const listed = await bridgeMcpToolCall(context, 'llmwiki_list_sources', {})
  context.publicArtifacts.push(listed)
  const listedSources = readArray(listed.result?.structuredContent?.llmwiki_sources?.sources)
  requireCase(failures, listedSources.some((source) => source.id === SOURCE_IDS.mcp), 'bridge_mcp_source_list_missing')
  requireCase(failures, !JSON.stringify(listed.result?.content || '').includes(context.serveUrl), 'bridge_mcp_source_list_text_url_leak')

  const bundleEnvelope = await bridgeMcpToolCall(context, 'llmwiki_source_bundle', {
    sourceId: SOURCE_IDS.mcp,
  })
  context.publicArtifacts.push(bundleEnvelope)
  const bundle = bundleEnvelope.result?.structuredContent?.llmwiki_source_bundle?.sourceBundle
  requireCase(failures, hasBridgeSourceBundleMetadata(bundle), 'bridge_mcp_source_bundle_metadata_missing')

  const queryCase = queryCases[0]
  const contextEnvelope = await bridgeMcpToolCall(context, 'llmwiki_context', {
    sourceId: SOURCE_IDS.mcp,
    query: queryCase.query,
    limit: 8,
  })
  context.publicArtifacts.push(contextEnvelope)
  const sourceContext = contextEnvelope.result?.structuredContent?.llmwiki_context
  requireCase(failures, Boolean(sourceContext), 'bridge_mcp_context_structured_content_missing')
  requireBridgeContextToolQuality(failures, sourceContext, queryCase, SOURCE_IDS.mcp)
  requireAlignedPageIds(
    failures,
    pageIds(context.directMcpByCase.get(queryCase.id)?.evidence),
    strippedPrefixedIds(readArray(sourceContext?.citations).map((item) => item.id), SOURCE_IDS.mcp),
    'bridge_mcp_context_page_alignment',
  )

  return {
    counts: {
      listedSources: listedSources.length,
      bundleCount: hasBridgeSourceBundleMetadata(bundle) ? 1 : 0,
      citations: countArray(sourceContext?.citations),
      graphNodes: countArray(sourceContext?.graph?.nodes),
      graphEdges: countArray(sourceContext?.graph?.edges),
    },
    observed: {
      listedSourceIds: listedSources.map((source) => source.id).sort(),
      context: sourceContext ? bridgeContextToolSummary(sourceContext, SOURCE_IDS.mcp) : {},
    },
  }
}

async function runArtifactLocalPathRedactionCase(context, failures) {
  const scan = scanForSensitiveLeak(context.publicArtifacts, context)
  requireCase(failures, scan.totalMatches === 0, 'local_path_or_secret_leak')
  return {
    counts: {
      scannedArtifactCount: context.publicArtifacts.length,
      totalMatches: scan.totalMatches,
    },
    observed: {
      categories: scan.categories,
    },
  }
}

async function registerBridgeSources(context, selected) {
  const response = await putJson(new URL('/settings/sources.json', context.bridgeUrl), {
    sources: [
      bridgeSourceDescriptor(context, 'http', selected === 'http' || selected === 'both'),
      bridgeSourceDescriptor(context, 'mcp', selected === 'mcp' || selected === 'both'),
    ],
  }, context.args.timeoutMs)
  if (response.status !== 200) {
    throw new Error(`register_sources_failed_http_${response.status}`)
  }
}

function bridgeSourceDescriptor(context, kind, selected) {
  const isMcp = kind === 'mcp'
  return {
    id: isMcp ? SOURCE_IDS.mcp : SOURCE_IDS.http,
    name: isMcp ? 'Sample Wiki MCP Stream' : 'Sample Wiki HTTP',
    title: isMcp ? 'Sample Wiki MCP Stream' : 'Sample Wiki HTTP',
    description: 'Local deterministic sample wiki used by the answer retrieval quality smoke.',
    protocol: isMcp ? 'mcp' : 'llmwiki-http',
    status: 'ready',
    selected,
    url: isMcp ? `${context.serveUrl}/mcp/stream` : context.serveUrl,
    capabilities: [
      'llmwiki_source_bundle',
      'llmwiki_context',
      'llmwiki_search',
      'llmwiki_read',
      'llmwiki_graph',
      'mcp-streamable-http',
    ],
    capabilityBasis: 'descriptor',
    adapter: 'llmwiki-markdown',
    implementation: 'llmwiki-markdown',
    rootLabel: 'sample-wiki',
  }
}

function requireDirectContextQuality(failures, contextPayload, queryCase, prefix) {
  requireCase(failures, contextPayload?.answerable === true, `${queryCase.id}_not_answerable`)
  requireCase(failures, countArray(contextPayload?.evidence) > 0, `${queryCase.id}_evidence_empty`)
  requireCase(failures, countArray(contextPayload?.orientation) > 0, `${queryCase.id}_orientation_empty`)
  requireExpectedPageIds(failures, pageIds(contextPayload?.evidence), queryCase, prefix)
  requireCase(failures, !pageIds(contextPayload?.evidence).includes('draft-note'), `${queryCase.id}_draft_evidence_leak`)
  requireGraphCoverage(failures, contextPayload?.graph, prefix)
}

function requireBridgeArtifactQuality(failures, artifact, queryCase, sourceId) {
  requireCase(failures, Boolean(artifact), `${queryCase.id}_bridge_artifact_missing`)
  requireCase(failures, artifact?.orchestrationMode === 'evidence-only', `${queryCase.id}_bridge_mode_mismatch`)
  requireCase(failures, /^Evidence-only result:/.test(String(artifact?.answer || '')), `${queryCase.id}_evidence_only_answer_missing`)
  requireCase(failures, countArray(artifact?.citations) > 0, `${queryCase.id}_bridge_citations_empty`)
  requireCase(failures, countArray(artifact?.sourceBundles) > 0, `${queryCase.id}_bridge_source_bundle_missing`)
  requireCase(failures, countArray(artifact?.steps) > 0, `${queryCase.id}_bridge_steps_empty`)
  requireCase(
    failures,
    !readArray(artifact?.steps).some((step) => step.id === 'runtime-chat-completions'),
    `${queryCase.id}_runtime_called_in_evidence_only`,
  )
  requireGraphCoverage(failures, artifact?.graph, `${sourceId}:`)
  requireExpectedPageIds(
    failures,
    strippedPrefixedIds(readArray(artifact?.citations).map((citation) => citation.id), sourceId),
    queryCase,
    `${sourceId}:`,
  )
  requireCase(
    failures,
    !strippedPrefixedIds(readArray(artifact?.citations).map((citation) => citation.id), sourceId).includes('draft-note'),
    `${queryCase.id}_bridge_draft_citation_leak`,
  )
}

function requireBridgeContextToolQuality(failures, contextPayload, queryCase, sourceId) {
  requireCase(failures, countArray(contextPayload?.citations) > 0, `${queryCase.id}_bridge_context_citations_empty`)
  requireCase(failures, countArray(contextPayload?.orientation) > 0, `${queryCase.id}_bridge_context_orientation_empty`)
  requireGraphCoverage(failures, contextPayload?.graph, `${sourceId}:`)
  requireExpectedPageIds(
    failures,
    strippedPrefixedIds(readArray(contextPayload?.citations).map((citation) => citation.id), sourceId),
    queryCase,
    `${sourceId}:`,
  )
}

function requireBridgeAlignment(failures, directContext, artifact, queryCase, sourceId) {
  const directEvidenceIds = pageIds(directContext?.evidence)
  const bridgePageIds = strippedPrefixedIds(readArray(artifact?.citations).map((citation) => citation.id), sourceId)
  requireExpectedSubset(
    failures,
    directEvidenceIds,
    bridgePageIds,
    `${queryCase.id}_${sourceId}_bridge_direct_alignment`,
  )
}

function requireExpectedPageIds(failures, observedPageIds, queryCase, prefix) {
  for (const expected of queryCase.expectedPageIds) {
    requireCase(
      failures,
      observedPageIds.includes(expected),
      `${queryCase.id}_${prefix ? 'prefixed_' : ''}expected_page_${safeToken(expected)}_missing`,
    )
  }
}

function requireGraphCoverage(failures, graph, prefix) {
  const nodes = readArray(graph?.nodes)
  const edges = readArray(graph?.edges)
  const nodeIds = nodes.map((node) => node.id)
  const edgeKeys = edges.map((edge) => `${edge.source}->${edge.target}:${edge.relation}`)
  const requiredNodes = [
    `${prefix}page:hot`,
    `${prefix}page:index`,
    `${prefix}page:artwork-review`,
    `${prefix}page:requester-return`,
  ]
  const requiredEdges = [
    `${prefix}page:index->${prefix}page:artwork-review:links_to`,
    `${prefix}page:artwork-review->${prefix}page:requester-return:links_to`,
  ]

  requireCase(failures, nodes.length > 0, 'graph_nodes_empty')
  requireCase(failures, edges.length > 0, 'graph_edges_empty')
  for (const nodeId of requiredNodes) {
    requireCase(failures, nodeIds.includes(nodeId), `graph_node_${safeToken(nodeId)}_missing`)
  }
  for (const edgeKey of requiredEdges) {
    requireCase(failures, edgeKeys.includes(edgeKey), `graph_edge_${safeToken(edgeKey)}_missing`)
  }
  requireCase(failures, !nodeIds.includes(`${prefix}page:draft-note`), 'graph_draft_node_leak')
}

function requireLatestA2aShape(failures, body, queryId) {
  const task = body?.task
  const artifact = readArray(task?.artifacts).find((item) => (
    item?.artifactId === 'llmwiki_agent_result' || item?.name === 'llmwiki_agent_result'
  ))
  requireCase(failures, Boolean(task), `${queryId}_a2a_task_missing`)
  requireCase(failures, task?.status?.state === 'TASK_STATE_COMPLETED', `${queryId}_a2a_task_not_completed`)
  requireCase(failures, Boolean(artifact), `${queryId}_a2a_agent_result_artifact_missing`)
  requireCase(
    failures,
    readArray(artifact?.parts).some((part) => part?.mediaType === 'application/json' && isRecord(part.data)),
    `${queryId}_a2a_agent_result_part_missing`,
  )
}

function requireAlignedPageIds(failures, expectedIds, observedIds, code) {
  requireCase(
    failures,
    sameSet(expectedIds, observedIds),
    code,
  )
}

function requireExpectedSubset(failures, expectedIds, observedIds, code) {
  requireCase(
    failures,
    expectedIds.every((id) => observedIds.includes(id)),
    code,
  )
}

function directContextSummary(contextPayload) {
  return {
    evidencePageIds: pageIds(contextPayload?.evidence),
    orientationPageIds: pageIds(contextPayload?.orientation),
    graphNodeCount: countArray(contextPayload?.graph?.nodes),
    graphEdgeCount: countArray(contextPayload?.graph?.edges),
  }
}

function bridgeArtifactSummary(artifact, sourceId) {
  return {
    citationPageIds: strippedPrefixedIds(readArray(artifact?.citations).map((citation) => citation.id), sourceId),
    citationCount: countArray(artifact?.citations),
    sourceBundleCount: countArray(artifact?.sourceBundles),
    graphNodeCount: countArray(artifact?.graph?.nodes),
    graphEdgeCount: countArray(artifact?.graph?.edges),
    stepIds: readArray(artifact?.steps).map((step) => step.id).filter(Boolean),
    diagnosticPhases: readArray(artifact?.diagnostics).map((diagnostic) => diagnostic.phase).filter(Boolean),
  }
}

function bridgeContextToolSummary(contextPayload, sourceId) {
  return {
    citationPageIds: strippedPrefixedIds(readArray(contextPayload?.citations).map((citation) => citation.id), sourceId),
    orientationPageIds: readArray(contextPayload?.orientation).map((item) => item.id).filter(Boolean),
    graphNodeCount: countArray(contextPayload?.graph?.nodes),
    graphEdgeCount: countArray(contextPayload?.graph?.edges),
  }
}

function aggregateBridgeCounts(perQuery) {
  const summaries = Object.values(perQuery)
  return {
    queryCount: summaries.length,
    citationCount: sum(summaries.map((item) => item.citationCount)),
    sourceBundleCount: sum(summaries.map((item) => item.sourceBundleCount)),
    graphNodeCount: sum(summaries.map((item) => item.graphNodeCount)),
    graphEdgeCount: sum(summaries.map((item) => item.graphEdgeCount)),
  }
}

function collectGraphContextGaps(qualityGaps, caseId, artifact) {
  const graphContextDiagnostics = readArray(artifact?.diagnostics).filter((diagnostic) => (
    diagnostic?.phase === 'graph-context'
  ))
  for (const diagnostic of graphContextDiagnostics) {
    qualityGaps.push(removeUndefinedProperties({
      code: 'graph_context_expansion_unavailable',
      caseId,
      severity: diagnostic.severity || 'warning',
      protocol: diagnostic.protocol || '',
      subject: diagnostic.subject || '',
    }))
  }
}

function graphContextRequest() {
  return {
    enabled: true,
    seedFrom: ['citations', 'graph'],
    depth: 1,
    direction: 'both',
    relations: ['links_to'],
    limit: 30,
    fallback: 'omit',
  }
}

async function directMcpToolList(context) {
  const envelope = await postMcpJson(`${context.serveUrl}/mcp/stream`, {
    jsonrpc: '2.0',
    id: 'direct-list',
    method: 'tools/list',
    params: { _meta: mcpRequestMeta() },
  }, context.args.timeoutMs, { mcpMethod: 'tools/list' })
  context.publicArtifacts.push(envelope)
  if (envelope.error) throw new Error('direct_mcp_tools_list_error')
  const tools = readArray(envelope.result?.tools)
  return {
    names: tools.map((tool) => tool.name).filter(Boolean),
  }
}

async function directMcpToolCall(context, name, args) {
  const envelope = await postMcpJson(`${context.serveUrl}/mcp/stream`, {
    jsonrpc: '2.0',
    id: `direct-${name}-${Date.now()}`,
    method: 'tools/call',
    params: {
      _meta: mcpRequestMeta(),
      name,
      arguments: args,
    },
  }, context.args.timeoutMs, { mcpMethod: 'tools/call', mcpName: name })
  if (envelope.error) throw new Error(`direct_mcp_${name}_jsonrpc_error`)
  if (envelope.result?.isError === true) throw new Error(`direct_mcp_${name}_tool_error`)
  return structuredMcpValue(envelope, name)
}

async function bridgeMcpToolCall(context, name, args) {
  const response = await postJson(new URL('/mcp', context.bridgeUrl), {
    jsonrpc: '2.0',
    id: `bridge-${name}-${Date.now()}`,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  }, context.args.timeoutMs)
  if (response.status !== 200) throw new Error(`bridge_mcp_${name}_http_${response.status}`)
  return response.json
}

function structuredMcpValue(envelope, name) {
  const structuredContent = envelope.result?.structuredContent || envelope.result?.structured_content
  return structuredContent?.[name]
    || structuredContent
    || envelope.result?.data
    || recordFromMcpContent(envelope.result?.content)
    || envelope.result
}

function recordFromMcpContent(content) {
  for (const item of readArray(content)) {
    if (isRecord(item?.data)) return item.data
    if (typeof item?.text === 'string') {
      try {
        const parsed = JSON.parse(item.text)
        if (isRecord(parsed)) return parsed
      } catch {
        continue
      }
    }
  }
  return null
}

async function getJson(url, timeoutMs, headers = {}) {
  return requestJson(url, { method: 'GET', headers }, timeoutMs)
}

async function postJson(url, body, timeoutMs, headers = {}) {
  return requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  }, timeoutMs)
}

async function putJson(url, body, timeoutMs, headers = {}) {
  return requestJson(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  }, timeoutMs)
}

async function postMcpJson(url, body, timeoutMs, { mcpMethod, mcpName = '' } = {}) {
  return (await postJson(url, body, timeoutMs, removeUndefinedProperties({
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': MODERN_MCP_PROTOCOL_VERSION,
    'Mcp-Method': mcpMethod,
    'Mcp-Name': mcpName || undefined,
  }))).json
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
    })
    const text = await response.text()
    const parsed = parseJson(text)
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      json: parsed,
    }
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function extractBridgeAgentResult(body) {
  const taskArtifacts = readArray(body?.task?.artifacts)
  for (const artifact of taskArtifacts) {
    if (artifact?.artifactId !== 'llmwiki_agent_result' && artifact?.name !== 'llmwiki_agent_result') continue
    for (const part of readArray(artifact.parts)) {
      if (isRecord(part.data)) return part.data
    }
  }

  const legacyArtifacts = readArray(body?.artifacts)
  for (const artifact of legacyArtifacts) {
    if (artifact?.name !== 'llmwiki_agent_result') continue
    for (const part of readArray(artifact.parts)) {
      if (isRecord(part.data)) return part.data
    }
  }
  return null
}

function mcpRequestMeta() {
  return {
    'io.modelcontextprotocol/protocolVersion': MODERN_MCP_PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientInfo': {
      name: 'answer-retrieval-quality-smoke',
      version: '1',
    },
    'io.modelcontextprotocol/clientCapabilities': {},
  }
}

function resolveServeRepo(input) {
  const candidates = [
    input,
    join(packageRoot, '..', '..', 'llmwiki-serve'),
    join(packageRoot, '..', 'llmwiki-serve'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const resolved = resolve(candidate)
    if (
      existsSync(join(resolved, 'pyproject.toml'))
      && existsSync(join(resolved, 'examples', 'sample-wiki'))
    ) {
      return resolved
    }
  }

  throw new Error('llmwiki-serve checkout not found. Pass --serve-repo or set LLMWIKI_SERVE_REPO.')
}

function startServeProcess({ serveRepo, port, graphStorePath }) {
  const command = 'uv'
  const child = spawn(command, [
    'run',
    'llmwiki-serve',
    'serve',
    'examples/sample-wiki',
    '--host',
    SOURCE_HOST,
    '--port',
    String(port),
    '--graph-store',
    'sqlite',
    '--graph-store-path',
    graphStorePath,
    '--cache-namespace',
    'answer-quality-smoke',
    '--graph-store-failure-policy',
    'fail-fast',
  ], {
    cwd: serveRepo,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

async function waitForServeHealth(serveUrl, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('llmwiki_serve_exited_before_health')
    try {
      const response = await getJson(new URL('/health', serveUrl), 1_000)
      if (response.status === 200 && response.json?.status === 'ok') return
    } catch {
      // Keep polling until timeout.
    }
    await delay(250)
  }
  throw new Error('llmwiki_serve_health_timeout')
}

async function openLoopbackPort() {
  const server = createNetServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, SOURCE_HOST, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })
  if (!port) throw new Error('open_port_failed')
  return port
}

async function closeBridge(bridge) {
  if (!bridge?.server?.listening) return
  await new Promise((resolveClose, rejectClose) => {
    bridge.server.close((error) => error ? rejectClose(error) : resolveClose())
  })
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolveExit) => {
    child.once('exit', () => resolveExit())
  })
  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolveKill) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('exit', () => resolveKill())
      killer.once('error', () => resolveKill())
    })
    await Promise.race([
      exited.then(() => true),
      delay(3_000).then(() => false),
    ])
    return
  }
  child.kill('SIGTERM')
  const graceful = await Promise.race([
    exited.then(() => true),
    delay(3_000).then(() => false),
  ])
  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, delay(1_000)])
  }
}

function scanForSensitiveLeak(values, context) {
  const text = JSON.stringify(values || [])
  const configuredPaths = [
    context.serveRepo,
    context.sampleRoot,
    packageRoot,
    context.tempDir,
    context.graphStorePath,
    context.bridgeConfigPath,
  ].filter(Boolean)

  const categories = {
    configuredLocalPath: configuredPaths.reduce((total, item) => total + countPathForms(text, item), 0),
    windowsAbsolutePath: countRegExp(text, /[A-Za-z]:\\\\[A-Za-z0-9_. \-\\]+/g),
    uncPath: countRegExp(text, /\\\\\\\\[A-Za-z0-9_. -]+\\\\[A-Za-z0-9_. \-\\]+/g),
    unixPrivatePath: countRegExp(text, /\/(?:Users|home|tmp|var|private|mnt|workspace)\/[A-Za-z0-9_. \-/]+/g),
    keyLikeToken: countRegExp(text, /\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|hf|sk)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi),
    bearerToken: countRegExp(text, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi),
  }
  return {
    totalMatches: sum(Object.values(categories)),
    categories,
  }
}

function countPathForms(text, value) {
  const normalized = String(value || '')
  if (!normalized) return 0
  return [
    normalized,
    normalized.replace(/\\/g, '\\\\'),
    normalized.replace(/\\/g, '/'),
  ].reduce((total, item) => total + countExact(text, item), 0)
}

function hasSourceBundleMetadata(bundle) {
  return Boolean(
    bundle
      && typeof bundle.source_id === 'string'
      && typeof bundle.bundle_id === 'string'
      && Array.isArray(bundle.capabilities),
  )
}

function hasBridgeSourceBundleMetadata(bundle) {
  return Boolean(
    bundle
      && typeof bundle.sourceId === 'string'
      && typeof bundle.bundleId === 'string'
      && Array.isArray(bundle.capabilities),
  )
}

function pageIds(items) {
  return readArray(items)
    .map((item) => item?.page_id || item?.pageId || item?.id || '')
    .filter(Boolean)
}

function strippedPrefixedIds(ids, sourceId) {
  const prefix = `${sourceId}:`
  return ids.map((id) => String(id || '').startsWith(prefix) ? String(id).slice(prefix.length) : String(id || ''))
    .filter(Boolean)
}

function sameSet(left, right) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === rightSet.size && [...leftSet].every((item) => rightSet.has(item))
}

function dedupeQualityGaps(gaps) {
  const seen = new Set()
  const unique = []
  for (const gap of gaps) {
    const key = JSON.stringify(gap)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(gap)
  }
  return unique
}

function requireCase(failures, condition, code) {
  if (!condition && !failures.includes(code)) failures.push(code)
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0)
}

function countExact(text, value) {
  if (!value) return 0
  return countRegExp(text, new RegExp(escapeRegExp(value), 'g'))
}

function countRegExp(text, pattern) {
  return (String(text || '').match(pattern) || []).length
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeToken(value) {
  return String(value || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'value'
}

function failureCode(error) {
  const message = error instanceof Error ? error.message : String(error)
  return safeToken(message).slice(0, 80) || 'unexpected_error'
}

function safeErrorSummary(error) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    message: message
      .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local-path]')
      .replace(/\\\\[^\s"']+/g, '[local-path]')
      .replace(/\/(?:Users|home|tmp|var|private|mnt|workspace)\/[^\s"']+/g, '[local-path]')
      .slice(0, 160),
  }
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
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer.`)
  return parsed
}

function removeUndefinedProperties(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function silentLogger() {
  return {
    error() {},
    log() {},
    warn() {},
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function isCliEntrypoint() {
  return Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isCliEntrypoint()) {
  await main().catch((error) => {
    const report = {
      schema: REPORT_SCHEMA,
      status: 'failed',
      fatal: safeErrorSummary(error),
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = 1
  })
}
