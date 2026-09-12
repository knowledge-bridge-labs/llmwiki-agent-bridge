#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  BRIDGE_A2A_CONTENT_TYPE,
  BRIDGE_A2A_PROTOCOL_VERSION,
  BRIDGE_A2A_VERSION_HEADER,
  startAgentBridge,
} from '../src/index.mjs'

const REPORT_SCHEMA = 'llmwiki-agent-bridge.deepagents-acp-vllm-live-safe-smoke.v1'
const SOURCE_HOST = '127.0.0.1'
const SOURCE_ID = 'sample-http'
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_INSTALL_TIMEOUT_MS = 180_000
const MAX_CAPTURE_BYTES = 64 * 1024
const DUMMY_API_KEY = 'llmwiki-vllm-live-safe-smoke'
const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const WRAPPER_DEPENDENCIES = Object.freeze({
  '@langchain/core': '1.2.9',
  '@langchain/langgraph': '1.4.10',
  '@langchain/langgraph-checkpoint': '1.1.5',
  '@langchain/openai': '1.5.1',
  deepagents: '1.13.4',
  'deepagents-acp': '0.1.30',
  langchain: '1.5.10',
  langsmith: '0.9.0',
})

const liveQuery = [
  'Using only the supplied LLMWiki evidence, explain the release-readiness chain',
  'for required label copy and say when the requester packet should be returned.',
  'Keep the answer concise and include citation anchors.',
].join(' ')

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    process.stdout.write(helpText())
    return
  }

  const cases = []
  let context = null
  let runtime = null

  try {
    runtime = resolveRuntimeConfig(process.env)
    cases.push({
      id: 'runtime-config',
      status: 'passed',
      observed: runtimeSummary(runtime),
    })
  } catch (error) {
    cases.push(failedCase('runtime-config', error, null, null))
    await printReport(buildReport({ args, runtime, context, cases }), { args, runtime, context })
    process.exitCode = 1
    return
  }

  try {
    context = await createSmokeContext(args, runtime)
    cases.push({
      id: 'source-wrapper-bridge-setup',
      status: 'passed',
      observed: {
        sourceMode: context.sourceMode,
        dependencyInstall: context.dependencyInstall,
        wrapper: {
          launchedByBridge: true,
          packageVersions: safeDependencyVersions(),
        },
      },
    })

    cases.push(await runCase('source-health', context, runSourceHealthCase))
    cases.push(await runCase('bridge-source-registration', context, runBridgeSourceRegistrationCase))
    cases.push(await runCase('a2a-delegated-runtime', context, runA2aDelegatedRuntimeCase))
    cases.push(await runCase('sensitive-artifact-scan', context, runSensitiveArtifactScanCase))
  } catch (error) {
    cases.push(failedCase(context ? 'live-smoke' : 'source-wrapper-bridge-setup', error, context, runtime))
  } finally {
    if (context) await context.close()
  }

  const report = buildReport({ args, runtime, context, cases })
  const failed = cases.some((item) => item.status === 'failed')
  await printReport(report, { args, runtime, context })
  if (failed) process.exitCode = 1
}

function parseArgs(argv) {
  const args = {
    serveRepo: '',
    sourceUrl: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    installTimeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
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
    } else if (arg === '--source-url') {
      args.sourceUrl = normalizeHttpBaseUrl(requiredValue(argv, index, '--source-url'), '--source-url')
      index += 1
    } else if (arg.startsWith('--source-url=')) {
      args.sourceUrl = normalizeHttpBaseUrl(arg.slice('--source-url='.length), '--source-url')
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = positiveInteger(requiredValue(argv, index, '--timeout-ms'), '--timeout-ms')
      index += 1
    } else if (arg.startsWith('--timeout-ms=')) {
      args.timeoutMs = positiveInteger(arg.slice('--timeout-ms='.length), '--timeout-ms')
    } else if (arg === '--install-timeout-ms') {
      args.installTimeoutMs = positiveInteger(requiredValue(argv, index, '--install-timeout-ms'), '--install-timeout-ms')
      index += 1
    } else if (arg.startsWith('--install-timeout-ms=')) {
      args.installTimeoutMs = positiveInteger(arg.slice('--install-timeout-ms='.length), '--install-timeout-ms')
    } else {
      throw new Error(`Unsupported option: ${arg}`)
    }
  }

  if (args.serveRepo && args.sourceUrl) {
    throw new Error('Use either --serve-repo or --source-url, not both.')
  }

  return args
}

function helpText() {
  return [
    'Usage: node scripts/deepagents-acp-vllm-live-safe-smoke.mjs [options]',
    '',
    'Runs an opt-in live-safe DeepAgents ACP subprocess smoke against an',
    'OpenAI-compatible vLLM endpoint. Requires LLMWIKI_AGENT_BRIDGE_BASE_URL',
    'and LLMWIKI_AGENT_BRIDGE_MODEL, or legacy equivalent environment variables.',
    'The script prints only sanitized aggregate JSON.',
    '',
    'Options:',
    '  --serve-repo <path>        Local llmwiki-serve checkout to start with examples/sample-wiki.',
    '                             Env: LLMWIKI_SERVE_REPO.',
    '  --source-url <url>         Already running llmwiki-serve source URL.',
    '  --timeout-ms <ms>          Startup and request timeout. Default: 120000.',
    '  --install-timeout-ms <ms>  Temp wrapper npm install timeout. Default: 180000.',
    '  --pretty                   Pretty-print the sanitized JSON report.',
    '  --keep-temp                Keep temporary files for local debugging.',
    '  --help, -h                 Show this help.',
    '',
  ].join('\n')
}

function resolveRuntimeConfig(env) {
  const baseUrl = firstEnvValue(env, [
    'LLMWIKI_AGENT_BRIDGE_BASE_URL',
    'HERMES_BASE_URL',
    'HERMES_A2A_BRIDGE_BASE_URL',
  ])
  const model = firstEnvValue(env, [
    'LLMWIKI_AGENT_BRIDGE_MODEL',
    'HERMES_MODEL',
    'HERMES_A2A_BRIDGE_MODEL',
  ])
  const apiKey = firstEnvValue(env, [
    'LLMWIKI_AGENT_BRIDGE_API_KEY',
    'HERMES_API_KEY',
    'OPENAI_API_KEY',
  ])

  if (!baseUrl) {
    throw new Error('LLMWIKI_AGENT_BRIDGE_BASE_URL is required for this live smoke.')
  }
  if (!model) {
    throw new Error('LLMWIKI_AGENT_BRIDGE_MODEL is required for this live smoke.')
  }

  normalizeHttpBaseUrl(baseUrl, 'LLMWIKI_AGENT_BRIDGE_BASE_URL')

  return {
    baseUrl,
    model,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
  }
}

async function createSmokeContext(args, runtime) {
  const tempDir = await mkdtemp(join(tmpdir(), 'llmwiki-deepagents-acp-vllm-smoke-'))
  const wrapperDir = join(tempDir, 'wrapper')
  const wrapperWorkspace = join(tempDir, 'workspace')
  const isolatedHome = join(tempDir, 'home')
  const xdgConfigHome = join(tempDir, 'xdg-config')
  const xdgCacheHome = join(tempDir, 'xdg-cache')
  const graphStorePath = join(tempDir, 'graph-store.sqlite')
  const bridgeConfigPath = join(tempDir, 'bridge-settings.json')
  const internalArtifacts = []
  const publicArtifacts = []
  let serveProcess = null
  let serveUrl = args.sourceUrl
  let bridge = null
  let envRestore = null
  let closed = false

  try {
    await Promise.all([
      mkdir(wrapperWorkspace, { recursive: true }),
      mkdir(isolatedHome, { recursive: true }),
      mkdir(xdgConfigHome, { recursive: true }),
      mkdir(xdgCacheHome, { recursive: true }),
    ])

    let serveRepo = ''
    let sourceMode = 'provided-running-source'
    if (!serveUrl) {
      serveRepo = resolveServeRepo(args.serveRepo || process.env.LLMWIKI_SERVE_REPO || '')
      const sourcePort = await openLoopbackPort()
      serveUrl = `http://${SOURCE_HOST}:${sourcePort}`
      serveProcess = startServeProcess({ serveRepo, port: sourcePort, graphStorePath })
      sourceMode = 'started-local-sample'
      await waitForServeHealth(serveUrl, serveProcess, args.timeoutMs)
    } else {
      await waitForExistingSourceHealth(serveUrl, args.timeoutMs)
    }

    const wrapper = await createWrapperProject({
      wrapperDir,
      wrapperWorkspace,
      runtime,
      args,
    })
    internalArtifacts.push(wrapper.install.stdout, wrapper.install.stderr)

    envRestore = applyTemporaryEnv({
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_CACHE_HOME: xdgCacheHome,
      LANGCHAIN_TRACING_V2: 'false',
      LANGSMITH_TRACING: 'false',
      LLMWIKI_DEEPAGENTS_VLLM_BASE_URL: runtime.baseUrl,
      LLMWIKI_DEEPAGENTS_VLLM_MODEL: runtime.model,
      LLMWIKI_DEEPAGENTS_VLLM_API_KEY: runtime.apiKey || '',
      LLMWIKI_DEEPAGENTS_WRAPPER_WORKSPACE: wrapperWorkspace,
      OPENAI_API_KEY: runtime.apiKey || DUMMY_API_KEY,
    })

    bridge = await startAgentBridge({
      host: SOURCE_HOST,
      port: 0,
      configPath: bridgeConfigPath,
      sourcePolicy: 'private-http',
      baseUrl: 'http://127.0.0.1:1/v1',
      model: 'deepagents-acp-vllm-live-safe-smoke',
      runtimeProfile: 'deepagents',
      runtimeAdapter: 'deepagents-acp',
      deepagentsAcpCommand: process.execPath,
      deepagentsAcpArgs: [wrapper.scriptPath],
      deepagentsAcpCwd: wrapperDir,
      requestTimeoutMs: args.timeoutMs,
      ioLog: false,
      auditLog: false,
      env: {},
      logger: silentLogger(),
    })

    return {
      args,
      runtime,
      tempDir,
      wrapperDir,
      wrapperWorkspace,
      isolatedHome,
      xdgConfigHome,
      xdgCacheHome,
      graphStorePath,
      bridgeConfigPath,
      serveRepo,
      serveUrl,
      sourceMode,
      sourceUrlProvided: Boolean(args.sourceUrl),
      dependencyInstall: wrapper.install.status,
      bridge,
      bridgeUrl: bridge.url,
      serveProcess,
      publicArtifacts,
      internalArtifacts,
      async close() {
        if (closed) return
        closed = true
        await closeBridge(bridge)
        await stopProcess(serveProcess)
        if (envRestore) envRestore()
        if (!args.keepTemp) {
          await rm(tempDir, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
    await closeBridge(bridge)
    await stopProcess(serveProcess)
    if (envRestore) envRestore()
    if (!args.keepTemp) {
      await rm(tempDir, { recursive: true, force: true })
    }
    throw error
  }
}

async function createWrapperProject({ wrapperDir, wrapperWorkspace, runtime, args }) {
  await mkdir(wrapperDir, { recursive: true })
  await writeFile(join(wrapperDir, 'package.json'), `${JSON.stringify({
    private: true,
    type: 'module',
    dependencies: WRAPPER_DEPENDENCIES,
  }, null, 2)}\n`, 'utf8')

  const scriptPath = join(wrapperDir, 'llmwiki-deepagents-vllm-acp.mjs')
  await writeFile(scriptPath, wrapperSource(), 'utf8')

  const npmInstall = npmInstallCommand()
  const install = await runChild(npmInstall.command, [
    ...npmInstall.argsPrefix,
    'install',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--silent',
  ], {
    cwd: wrapperDir,
    env: npmInstallEnv(wrapperWorkspace),
    timeoutMs: args.installTimeoutMs,
  })

  if (!install.ok) {
    throw new Error(install.timedOut ? 'wrapper_dependency_install_timeout' : 'wrapper_dependency_install_failed')
  }

  return {
    scriptPath,
    install: {
      status: 'completed',
      stdout: install.stdout,
      stderr: install.stderr,
    },
  }
}

function wrapperSource() {
  return `#!/usr/bin/env node
import { DeepAgentsServer } from 'deepagents-acp'
import { FilesystemBackend } from 'deepagents'
import { ChatOpenAICompletions } from '@langchain/openai'

const baseURL = mustEnv('LLMWIKI_DEEPAGENTS_VLLM_BASE_URL')
const modelName = mustEnv('LLMWIKI_DEEPAGENTS_VLLM_MODEL')
const apiKey = process.env.LLMWIKI_DEEPAGENTS_VLLM_API_KEY || process.env.OPENAI_API_KEY || '${DUMMY_API_KEY}'
const workspaceRoot = process.env.LLMWIKI_DEEPAGENTS_WRAPPER_WORKSPACE || process.cwd()

const model = new ChatOpenAICompletions({
  model: modelName,
  apiKey,
  temperature: 0.2,
  maxTokens: 768,
  maxRetries: 0,
  timeout: 60_000,
  streamUsage: false,
  configuration: {
    apiKey,
    baseURL,
  },
})

const server = new DeepAgentsServer({
  serverName: 'llmwiki-deepagents-vllm-live-safe-smoke',
  serverVersion: '1',
  debug: false,
  workspaceRoot,
  authMethods: [
    {
      id: 'preconfigured-openai-compatible-runtime',
      name: 'Preconfigured OpenAI-compatible runtime',
      type: 'agent',
    },
  ],
  agents: {
    name: 'llmwiki-deepagents-vllm',
    description: 'LLMWiki live-safe ACP wrapper for an OpenAI-compatible vLLM endpoint.',
    model,
    backend: new FilesystemBackend({ rootDir: workspaceRoot }),
    interruptOn: {
      execute: true,
      write_file: true,
      edit_file: true,
    },
    systemPrompt: [
      'Answer the user using only the LLMWiki evidence included in the prompt.',
      'Do not inspect or modify local files.',
      'Do not reveal runtime configuration, environment variables, endpoints, API keys, or filesystem paths.',
      'Keep answers concise and include citation anchors when the prompt provides citation instructions.',
    ].join(' '),
  },
})

await server.start()

function mustEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(\`\${name} is required.\`)
  }
  return value.trim()
}
`
}

async function runCase(id, context, body) {
  const failures = []
  try {
    const summary = await body(context, failures)
    return removeUndefinedProperties({
      id,
      status: failures.length ? 'failed' : 'passed',
      failureCodes: failures,
      ...summary,
    })
  } catch (error) {
    return failedCase(id, error, context, context.runtime)
  }
}

async function runSourceHealthCase(context, failures) {
  const health = await getJson(new URL('/health', context.serveUrl), context.args.timeoutMs)
  const bundle = await getJson(new URL('/source-bundle', context.serveUrl), context.args.timeoutMs)
  const graph = await getJson(new URL('/graph?limit=500', context.serveUrl), context.args.timeoutMs)
  context.publicArtifacts.push(health.json, bundle.json, graph.json)

  requireCase(failures, health.status === 200 && health.json?.status === 'ok', 'source_health_not_ok')
  requireCase(failures, bundle.status === 200 && hasSourceBundleMetadata(bundle.json), 'source_bundle_metadata_missing')
  requireCase(failures, graph.status === 200, 'source_graph_status')
  requireCase(failures, countArray(graph.json?.nodes) > 0, 'source_graph_nodes_empty')
  requireCase(failures, countArray(graph.json?.edges) > 0, 'source_graph_edges_empty')

  const graphStoreObserved = context.sourceUrlProvided
    ? null
    : Boolean(await stat(context.graphStorePath).catch(() => null))

  return {
    counts: {
      sourceBundleCount: hasSourceBundleMetadata(bundle.json) ? 1 : 0,
      graphNodeCount: countArray(graph.json?.nodes),
      graphEdgeCount: countArray(graph.json?.edges),
    },
    observed: {
      sourceMode: context.sourceMode,
      graphStoreObserved,
    },
  }
}

async function runBridgeSourceRegistrationCase(context, failures) {
  const registration = await putJson(new URL('/settings/sources.json', context.bridgeUrl), {
    sources: [bridgeSourceDescriptor(context)],
  }, context.args.timeoutMs)
  const probe = await getJson(new URL('/sources?probe=1', context.bridgeUrl), context.args.timeoutMs)
  context.publicArtifacts.push(registration.json, probe.json)

  const sources = readArray(probe.json?.sources)
  const source = sources.find((item) => item?.id === SOURCE_ID)
  requireCase(failures, registration.status === 200, 'bridge_source_registration_status')
  requireCase(failures, probe.status === 200, 'bridge_sources_probe_status')
  requireCase(failures, probe.json?.registeredCount === 1, 'bridge_registered_source_count')
  requireCase(failures, probe.json?.selectedReadySourceCount === 1, 'bridge_selected_ready_source_count')
  requireCase(failures, Boolean(source?.health?.ok), 'bridge_source_probe_unready')

  return {
    counts: {
      registeredSources: Number(probe.json?.registeredCount || 0),
      selectedReadySources: Number(probe.json?.selectedReadySourceCount || 0),
    },
    observed: {
      sourceIds: sources.map((item) => item?.id).filter(Boolean).sort(),
      selectedSourceReady: Boolean(source?.health?.ok),
    },
  }
}

async function runA2aDelegatedRuntimeCase(context, failures) {
  const response = await postJson(new URL('/message:send', context.bridgeUrl), {
    data: {
      query: liveQuery,
      mode: 'delegated-runtime',
      graphContext: graphContextRequest(),
    },
  }, context.args.timeoutMs, {
    Accept: BRIDGE_A2A_CONTENT_TYPE,
    [BRIDGE_A2A_VERSION_HEADER]: BRIDGE_A2A_PROTOCOL_VERSION,
  })
  context.publicArtifacts.push(response.json)

  const artifact = extractBridgeAgentResult(response.json)
  const task = response.json?.task
  const answer = String(artifact?.answer || '')
  const citationPageIds = strippedPrefixedIds(
    readArray(artifact?.citations).map((citation) => citation?.id || citation?.pageId || citation?.page_id),
    SOURCE_ID,
  )
  const stepIds = readArray(artifact?.steps).map((step) => step?.id).filter(Boolean)
  const anchorCount = citationAnchorCount(answer)
  const checks = {
    httpOk: response.status === 200,
    contentTypeA2a: String(response.headers['content-type'] || '').includes(BRIDGE_A2A_CONTENT_TYPE),
    a2aVersion: response.headers[BRIDGE_A2A_VERSION_HEADER.toLowerCase()] === BRIDGE_A2A_PROTOCOL_VERSION,
    taskCompleted: task?.status?.state === 'TASK_STATE_COMPLETED',
    delegatedRuntime: artifact?.orchestrationMode === 'delegated-runtime',
    runtimeCalled: stepIds.includes('runtime-deepagents-acp'),
    chatCompletionsNotCalled: !stepIds.includes('runtime-chat-completions'),
    answerNonEmpty: answer.trim().length > 0,
    notEvidenceOnlyFallback: !/^Evidence-only result:/i.test(answer),
    citationsPresent: countArray(artifact?.citations) > 0,
    sourceBundlePresent: countArray(artifact?.sourceBundles) > 0,
    graphPresent: countArray(artifact?.graph?.nodes) > 0 && countArray(artifact?.graph?.edges) > 0,
    citationAnchorsPresent: anchorCount > 0,
    expectedPagesPresent: expectedPageIds().every((pageId) => citationPageIds.includes(pageId)),
  }

  for (const [name, passed] of Object.entries(checks)) {
    requireCase(failures, passed, `a2a_${name}`)
  }

  return {
    counts: {
      answerChars: answer.length,
      citationCount: countArray(artifact?.citations),
      sourceBundleCount: countArray(artifact?.sourceBundles),
      graphNodeCount: countArray(artifact?.graph?.nodes),
      graphEdgeCount: countArray(artifact?.graph?.edges),
      citationAnchorCount: anchorCount,
    },
    observed: {
      checks,
      taskState: String(task?.status?.state || ''),
      citationPageIds,
      stepIds,
    },
  }
}

async function runSensitiveArtifactScanCase(context, failures) {
  const scan = scanForSensitiveLeak([
    ...context.publicArtifacts,
    ...context.internalArtifacts,
  ], { context, runtime: context.runtime })
  requireCase(failures, scan.totalMatches === 0, 'sensitive_artifact_leak')

  return {
    counts: {
      scannedArtifactCount: context.publicArtifacts.length,
      scannedInternalArtifactCount: context.internalArtifacts.length,
      totalMatches: scan.totalMatches,
    },
    observed: {
      categories: scan.categories,
    },
  }
}

function bridgeSourceDescriptor(context) {
  return {
    id: SOURCE_ID,
    name: 'Sample Wiki HTTP',
    title: 'Sample Wiki HTTP',
    description: 'Local deterministic sample wiki used by the DeepAgents ACP vLLM live-safe smoke.',
    protocol: 'llmwiki-http',
    status: 'ready',
    selected: true,
    url: context.serveUrl,
    capabilities: [
      'llmwiki_source_bundle',
      'llmwiki_context',
      'llmwiki_search',
      'llmwiki_read',
      'llmwiki_graph',
      'llmwiki_graph_neighbors',
    ],
    capabilityBasis: 'descriptor',
    adapter: 'llmwiki-markdown',
    implementation: 'llmwiki-markdown',
    rootLabel: 'sample-wiki',
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

function buildReport({ args, runtime, context, cases }) {
  const failed = cases.some((item) => item.status === 'failed')
  return {
    schema: REPORT_SCHEMA,
    status: failed ? 'failed' : 'passed',
    targets: {
      source: context?.sourceMode || 'not-started',
      bridge: 'local-llmwiki-agent-bridge',
      runtime: {
        profile: 'deepagents',
        adapter: 'deepagents-acp',
        provider: 'openai-compatible-vllm',
      },
    },
    options: {
      timeoutMs: args.timeoutMs,
      installTimeoutMs: args.installTimeoutMs,
      keepTemp: Boolean(args.keepTemp),
      sourceMode: context?.sourceMode || (args.sourceUrl ? 'provided-running-source' : 'local-sample'),
    },
    runtime: runtime ? runtimeSummary(runtime) : {
      baseUrlConfigured: false,
      modelConfigured: false,
      apiKeyConfigured: false,
      endpointRedacted: true,
    },
    totals: {
      caseCount: cases.length,
      passed: cases.filter((item) => item.status === 'passed').length,
      failed: cases.filter((item) => item.status === 'failed').length,
    },
    cases,
  }
}

async function printReport(report, { args, runtime, context }) {
  const outputScan = scanForSensitiveLeak([report], { context, runtime })
  const printable = outputScan.totalMatches === 0
    ? {
        ...report,
        sensitiveScan: {
          sanitizedOutput: summarizeScan(outputScan),
          ok: true,
        },
      }
    : {
        schema: REPORT_SCHEMA,
        status: 'failed',
        fatal: {
          code: 'sanitized_output_leak_detected',
          message: 'Sanitized report withheld because the output scan detected sensitive content.',
        },
        sensitiveScan: {
          sanitizedOutput: summarizeScan(outputScan),
          ok: false,
        },
      }

  process.stdout.write(`${JSON.stringify(printable, null, args.pretty ? 2 : 0)}\n`)
  if (outputScan.totalMatches !== 0) process.exitCode = 1
}

function runtimeSummary(runtime) {
  return {
    baseUrlConfigured: Boolean(runtime?.baseUrl),
    modelConfigured: Boolean(runtime?.model),
    apiKeyConfigured: Boolean(runtime?.apiKeyConfigured),
    endpointRedacted: true,
  }
}

function safeDependencyVersions() {
  return Object.fromEntries(
    Object.entries(WRAPPER_DEPENDENCIES).map(([name, version]) => [safePackageName(name), version]),
  )
}

function expectedPageIds() {
  return ['index', 'artwork-review', 'requester-return', 'hot']
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
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      json: parseJson(text),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function runChild(command, childArgs, { cwd, env, timeoutMs }) {
  const child = spawn(command, childArgs, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    stdout = appendCapped(stdout, chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr = appendCapped(stderr, chunk)
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    terminateChild(child)
  }, timeoutMs)
  timeout.unref()

  const { exitCode, signal } = await new Promise((resolveExit) => {
    child.once('error', () => resolveExit({ exitCode: null, signal: null }))
    child.once('close', (code, childSignal) => resolveExit({ exitCode: code, signal: childSignal }))
  })
  clearTimeout(timeout)

  return {
    ok: !timedOut && exitCode === 0,
    status: timedOut ? 'timeout' : (exitCode === 0 ? 'completed' : 'failed'),
    exitCode,
    signal,
    timedOut,
    stdout,
    stderr,
  }
}

function appendCapped(current, chunk) {
  const next = `${current}${String(chunk || '')}`
  if (next.length <= MAX_CAPTURE_BYTES) return next
  return next.slice(next.length - MAX_CAPTURE_BYTES)
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

function resolveServeRepo(input) {
  const candidates = [
    input,
    join(packageRoot, '..', 'llmwiki-serve-protocol-modernization-20260912'),
    join(packageRoot, '..', 'llmwiki-serve'),
    join(packageRoot, '..', '..', 'llmwiki-serve'),
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

  throw new Error('llmwiki-serve checkout not found. Pass --serve-repo or --source-url.')
}

function startServeProcess({ serveRepo, port, graphStorePath }) {
  const child = spawn('uv', [
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
    'deepagents-acp-vllm-smoke',
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
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
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
      // Poll until timeout.
    }
    await delay(250)
  }
  throw new Error('llmwiki_serve_health_timeout')
}

async function waitForExistingSourceHealth(serveUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await getJson(new URL('/health', serveUrl), 1_000)
      if (response.status === 200 && response.json?.status === 'ok') return
    } catch {
      // Poll until timeout.
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
    await Promise.race([exited, delay(3_000)])
    return
  }

  terminateChild(child)
  const graceful = await Promise.race([
    exited.then(() => true),
    delay(3_000).then(() => false),
  ])
  if (!graceful && child.exitCode === null) {
    terminateChild(child, 'SIGKILL')
    await Promise.race([exited, delay(1_000)])
  }
}

function terminateChild(child, signal = 'SIGTERM') {
  try {
    child.kill(signal)
  } catch {
    // Best-effort cleanup.
  }
}

function applyTemporaryEnv(values) {
  const previous = new Map()
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, Object.hasOwn(process.env, name) ? process.env[name] : undefined)
    if (value === undefined || value === null || value === '') {
      delete process.env[name]
    } else {
      process.env[name] = String(value)
    }
  }
  return () => {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  }
}

function scanForSensitiveLeak(values, { context, runtime }) {
  const text = JSON.stringify(values || [])
  const configuredValues = sensitiveValues({ context, runtime })
  const categories = {
    configuredValue: configuredValues.reduce((total, value) => total + countPathForms(text, value), 0),
    windowsAbsolutePath: countRegExp(text, /[A-Za-z]:\\\\[A-Za-z0-9_. \-\\]+/g),
    uncPath: countRegExp(text, /\\\\\\\\[A-Za-z0-9_. -]+\\\\[A-Za-z0-9_. \-\\]+/g),
    unixPrivatePath: countRegExp(text, /\/(?:Users|home|tmp|var|private|mnt|workspace)\/[A-Za-z0-9_. \-/]+/g),
    keyLikeToken: countRegExp(text, /\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|hf|sk)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi),
    bearerToken: countRegExp(text, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi),
    apiKeyQueryValue: countRegExp(text, /[?&]api[_-]?key=[^&\s"'<>]+/gi),
  }
  return {
    totalMatches: sum(Object.values(categories)),
    categories,
  }
}

function sensitiveValues({ context, runtime }) {
  const values = [
    runtime?.baseUrl,
    runtime?.model,
    runtime?.apiKey,
    configuredChatCompletionsUrl(runtime?.baseUrl),
    context?.tempDir,
    context?.wrapperDir,
    context?.wrapperWorkspace,
    context?.isolatedHome,
    context?.xdgConfigHome,
    context?.xdgCacheHome,
    context?.graphStorePath,
    context?.bridgeConfigPath,
    context?.serveRepo,
  ].filter((value) => typeof value === 'string' && value.trim())
  return [...new Set(values.map((value) => value.trim()))]
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

function summarizeScan(scan) {
  return {
    totalMatches: scan.totalMatches,
    categories: { ...scan.categories },
  }
}

function failedCase(id, error, context, runtime) {
  return {
    id,
    status: 'failed',
    failureCodes: [failureCode(error, context, runtime)],
    error: safeErrorSummary(error, context, runtime),
  }
}

function failureCode(error, context, runtime) {
  const message = error instanceof Error ? error.message : String(error)
  return safeToken(redactSensitiveText(message, context, runtime)).slice(0, 80) || 'unexpected_error'
}

function safeErrorSummary(error, context, runtime) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    message: redactSensitiveText(message, context, runtime).slice(0, 160),
  }
}

function redactSensitiveText(value, context, runtime) {
  let text = String(value || '')
  for (const sensitive of sensitiveValues({ context, runtime })) {
    text = text.replaceAll(sensitive, '[redacted]')
    text = text.replaceAll(sensitive.replace(/\\/g, '/'), '[redacted]')
    text = text.replaceAll(sensitive.replace(/\\/g, '\\\\'), '[redacted]')
  }
  return text
    .replace(/https?:\/\/[^\s"']+/g, '[url]')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local-path]')
    .replace(/\\\\[^\s"']+/g, '[local-path]')
    .replace(/\/(?:Users|home|tmp|var|private|mnt|workspace)\/[^\s"']+/g, '[local-path]')
    .replace(/\b(?:sk-proj|sk-ant|github_pat|xoxb|xoxp|xoxa|xoxr|hf|sk)[_-][A-Za-z0-9._~+/=-]{10,}\b/gi, '[redacted-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted-key]')
}

function normalizeHttpBaseUrl(input, option) {
  const value = nonEmptyValue(input, option)
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${option} must be a valid URL.`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${option} must use http or https.`)
  }
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function firstEnvValue(env, names) {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function npmInstallCommand() {
  const npmCli = npmCliPath()
  if (npmCli) {
    return {
      command: process.execPath,
      argsPrefix: [npmCli],
    }
  }
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      argsPrefix: ['/d', '/s', '/c', 'npm'],
    }
  }
  return {
    command: 'npm',
    argsPrefix: [],
  }
}

function npmInstallEnv(wrapperWorkspace) {
  const env = {
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_cache: join(wrapperWorkspace, '.npm-cache'),
    npm_config_ignore_scripts: 'true',
    npm_config_update_notifier: 'false',
    npm_config_loglevel: 'error',
    HOME: join(wrapperWorkspace, '.npm-home'),
    USERPROFILE: join(wrapperWorkspace, '.npm-home'),
  }
  for (const name of [
    'PATH',
    'Path',
    'PATHEXT',
    'COMSPEC',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'npm_config_registry',
  ]) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return env
}

function npmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js') : '',
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

function hasSourceBundleMetadata(bundle) {
  return Boolean(
    bundle
      && typeof bundle.source_id === 'string'
      && typeof bundle.bundle_id === 'string'
      && Array.isArray(bundle.capabilities),
  )
}

function citationAnchorCount(answer) {
  return (String(answer || '').match(/\[\d+\]\(#citation-\d+\)/g) || []).length
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

function strippedPrefixedIds(ids, sourceId) {
  const prefix = `${sourceId}:`
  return ids
    .map((id) => String(id || '').startsWith(prefix) ? String(id).slice(prefix.length) : String(id || ''))
    .filter(Boolean)
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

function safePackageName(value) {
  return String(value || '').replace(/^@/, '').replace(/[^A-Za-z0-9]+/g, '_')
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
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer.`)
  return parsed
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
  await main().catch(async (error) => {
    const report = {
      schema: REPORT_SCHEMA,
      status: 'failed',
      fatal: safeErrorSummary(error, null, null),
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = 1
  })
}
