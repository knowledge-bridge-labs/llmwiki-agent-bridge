import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { DefaultAgentCardResolver } from '@a2a-js/sdk/client'

import {
  classifyLiveRunFailureBuckets,
  classifyLiveRunFailureCodes,
  buildLiveRendererRecommendation,
  evaluateAnswerOracle,
  evaluateExpectedCitationMappings,
  summarizeAnswerOracleRunMetrics,
  summarizeExpectedCitationMappingRunMetrics,
} from '../scripts/benchmark-runtime-prompt.mjs'
import { agentBridgeOpenApi, startAgentBridge, startHermesA2aBridge } from '../src/index.mjs'

const execFileAsync = promisify(execFile)
const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const silentLogger = {
  error() {},
  log() {},
  warn() {},
}

describe('llmwiki-agent-bridge', () => {
  it('serves a Hermes-compatible A2A agent card and health response by default', async (t) => {
    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const cardResponse = await fetch(`${bridge.url}/.well-known/agent-card.json`)
    const card = await cardResponse.json()

    assert.equal(cardResponse.status, 200)
    assert.equal(card.id, 'llmwiki-agent-bridge-hermes')
    assert.equal(card.name, 'LLMWiki Agent Bridge for Hermes')
    assert.equal(card.url, '/message:send')
    assert.equal(card.runtime, 'hermes')
    assert.equal(card.agentRuntime, 'hermes')
    assert.equal(card.provider.organization, 'LLMWiki')
    assert.equal(card.capabilities.structuredArtifacts, true)
    assert.deepEqual(card.capabilities.knowledgeSourceProtocols, ['llmwiki-http', 'mcp', 'a2a'])
    assert.equal(card.metadata.runtimeProfile, 'hermes')
    assert.equal(card.metadata.modelConfigured, true)
    assert.equal(card.metadata.hermesModelConfigured, true)
    assert.equal(card.metadata.sourcePolicy, 'private-http')
    assert.equal(card.metadata.settingsUrl, '/settings')
    assert.deepEqual(card.metadata.sourceRegistry, {
      registeredSourceCount: 0,
      selectedSourceCount: 0,
      selectedReadySourceCount: 0,
      unavailableSourceCount: 0,
    })

    const healthResponse = await fetch(`${bridge.url}/health`)
    const health = await healthResponse.json()

    assert.equal(healthResponse.status, 200)
    assert.equal(health.status, 'ok')
    assert.equal(health.runtime, 'llmwiki-agent-bridge')
    assert.equal(health.runtimeProfile, 'hermes')
    assert.equal(health.runtimeId, 'llmwiki-agent-bridge-hermes')
    assert.equal(health.agentRuntime, 'hermes')
    assert.equal(health.modelConfigured, true)
    assert.equal(health.hermesModelConfigured, true)
    assert.equal(health.sourcePolicy, 'private-http')
    assert.deepEqual(health.sourceRegistry, {
      registeredSourceCount: 0,
      selectedSourceCount: 0,
      selectedReadySourceCount: 0,
      unavailableSourceCount: 0,
    })
  })

  it('can be discovered by the official A2A SDK agent-card resolver', async (t) => {
    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const resolver = new DefaultAgentCardResolver()
    const card = await resolver.resolve(bridge.url)

    assert.equal(card.id, 'llmwiki-agent-bridge-hermes')
    assert.equal(card.url, '/message:send')
    assert.equal(card.metadata.settingsUrl, '/settings')
    assert.equal(card.metadata.protocolSurface.a2a, 'compatible')
    assert.equal(card.metadata.sourceRegistry.registeredSourceCount, 0)
  })

  it('serves a static settings screen and redacted authenticated settings JSON', async (t) => {
    const bridge = await startAgentBridge({
      port: 0,
      baseUrl: 'http://user:runtime-secret@runtime.example.test/v1?api_key=runtime-secret#fragment',
      apiKey: 'runtime-api-secret',
      bridgeBearerToken: 'bridge-secret',
      allowedOrigins: ['http://localhost:5173'],
      allowedSourceOrigins: ['http://source-secret.example.test:8765'],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const screenResponse = await fetch(`${bridge.url}/settings`)
    const screen = await screenResponse.text()

    assert.equal(screenResponse.status, 200)
    assert.match(screenResponse.headers.get('content-type') || '', /^text\/html/)
    assert.match(screen, /LLMWiki Agent Bridge Settings/)
    assert.match(screen, /Guided Setup Path/)
    assert.match(screen, /connect a runtime, register Knowledge Sources, then verify the bridge/)
    assert.match(screen, /Step 1: Connect Runtime/)
    assert.match(screen, /Step 2: Register Knowledge Sources/)
    assert.match(screen, /Step 3: Verify Bridge/)
    assert.match(screen, /Bridge Overview Diagnostics/)
    assert.match(screen, /Start here to confirm what is ready, what needs attention, and which setup action to take next/)
    assert.match(screen, /Runtime readiness/)
    assert.match(screen, /Bridge access/)
    assert.match(screen, /Detailed diagnostics/)
    assert.match(screen, /Run setup check/)
    assert.match(screen, /Advanced connection, network, and security details/)
    assert.match(screen, /Runtime settings are loaded from this bridge/)
    assert.match(screen, /Add another source/)
    assert.match(screen, /Save sources/)
    assert.match(screen, /setupCheckPayload/)
    assert.match(screen, /runSetupCheck/)
    assert.match(screen, /function overviewHero/)
    assert.match(screen, /function bridgeStatus/)
    assert.match(screen, /Bridge is ready for local verification/)
    assert.match(screen, /Settings overview is locked/)
    assert.match(screen, /fetch\('\/message:send'/)
    assert.match(screen, /Graph: /)
    assert.match(screen, /registered sources/)
    assert.match(screen, /function applyRegisteredSourceCount/)
    assert.match(screen, /renderSummary\(currentConfig\)/)
    assert.match(screen, /applyRegisteredSourceCount\(result, sources\.length\)/)
    assert.doesNotMatch(screen, /Current Bridge Status/)
    assert.doesNotMatch(screen, /Bridge Status &amp; Diagnostics/)
    assert.doesNotMatch(screen, /Bridge Setup Draft/)
    assert.doesNotMatch(screen, /Knowledge Source Builder/)
    assert.doesNotMatch(screen, /Runtime &amp; Access/)
    assert.doesNotMatch(screen, /Save registered sources/)
    assert(screen.indexOf('id="bridge-overview-title"') < screen.indexOf('id="setup-path-title"'))
    assert(screen.indexOf('id="setup-path-title"') < screen.indexOf('id="runtime-access-title"'))
    assert(screen.indexOf('id="runtime-access-title"') < screen.indexOf('id="knowledge-sources-title"'))
    assert(screen.indexOf('id="knowledge-sources-title"') < screen.indexOf('id="verify-bridge-title"'))
    assert.match(screen, /LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE/)
    assert.match(screen, /LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS/)
    assert.match(screen, /Start or Restart Command/)
    assert.match(screen, /JSON Payload for \/message:send/)
    assert.match(screen, /llmwiki-http/)
    assert.match(screen, /mcp/)
    assert.match(screen, /a2a/)
    assert.match(screen, /localStorage/)
    assert.match(screen, /setupSecretKey/)
    assert.match(screen, /persistSetupDraft/)
    assert.doesNotMatch(screen, /writeJsonStorage\(setupKey, setup\)/)
    assert.doesNotMatch(screen, /bridge-secret/)
    assert.doesNotMatch(screen, /runtime-api-secret/)
    assert.doesNotMatch(screen, /runtime-secret/)

    const unauthorized = await fetch(`${bridge.url}/settings.json`)
    assert.equal(unauthorized.status, 401)

    const settingsResponse = await fetch(`${bridge.url}/settings.json`, {
      headers: { Authorization: 'Bearer bridge-secret' },
    })
    const settings = await settingsResponse.json()
    const serialized = JSON.stringify(settings)

    assert.equal(settingsResponse.status, 200)
    assert.equal(settings.endpoints.settings, '/settings')
    assert.equal(settings.endpoints.settingsJson, '/settings.json')
    assert.equal(settings.endpoints.mcp, '/mcp')
    assert.equal(settings.runtime.profile, 'hermes')
    assert.equal(settings.runtimeConnection.baseUrl, 'http://runtime.example.test/v1')
    assert.equal(settings.runtimeConnection.apiKeyConfigured, true)
    assert.equal(settings.bridgeAuth.bearerTokenConfigured, true)
    assert.equal(settings.network.port, bridge.config.port)
    assert.equal(settings.network.configuredAllowedOrigins, 1)
    assert.equal(settings.sourcePolicy.configuredAllowedSourceOrigins, 1)
    assert.doesNotMatch(serialized, /bridge-secret/)
    assert.doesNotMatch(serialized, /runtime-api-secret/)
    assert.doesNotMatch(serialized, /runtime-secret/)
  })

  it('persists bridge settings, applies safe fields live, and reports restart-only host and port', async (t) => {
    const configPath = await tempConfigPath(t)
    const bridge = await startAgentBridge({
      port: 0,
      configPath,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const saveResponse = await fetch(`${bridge.url}/settings/config.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runtimeProfile: 'generic',
        baseUrl: 'http://runtime-live.example.test/v1?api_key=runtime-api-secret',
        apiKey: 'runtime-api-secret',
        model: 'live-model',
        requestTimeoutMs: 34567,
        allowedOrigins: ['http://app.example.test'],
        allowedSourceOrigins: ['http://source.example.test'],
        sourcePolicy: 'allowlist',
        bridgeBearerToken: 'bridge-live-token',
        host: '0.0.0.0',
        port: 9876,
        allowPublicBind: true,
      }),
    })
    const saved = await saveResponse.json()
    const serialized = JSON.stringify(saved)

    assert.equal(saveResponse.status, 200)
    assert.equal(saved.status, 'saved')
    assert(saved.applied.includes('runtimeProfile'))
    assert(saved.applied.includes('baseUrl'))
    assert(saved.applied.includes('bridgeBearerToken'))
    assert(saved.restartRequired.includes('host'))
    assert(saved.restartRequired.includes('port'))
    assert.equal(saved.settings.runtime.profile, 'generic')
    assert.equal(saved.settings.runtime.id, 'llmwiki-agent-bridge-generic-openai-compatible')
    assert.equal(saved.settings.runtimeConnection.baseUrl, 'http://runtime-live.example.test/v1')
    assert.equal(saved.settings.runtimeConnection.apiKeyConfigured, true)
    assert.equal(saved.settings.runtimeConnection.requestTimeoutMs, 34567)
    assert.equal(saved.settings.bridgeAuth.bearerTokenConfigured, true)
    assert.equal(saved.settings.sourcePolicy.policy, 'allowlist')
    assert.equal(saved.settings.network.host, '127.0.0.1')
    assert.notEqual(saved.settings.network.port, 9876)
    assert.doesNotMatch(serialized, /runtime-api-secret/)
    assert.doesNotMatch(serialized, /bridge-live-token/)
    assert.doesNotMatch(serialized, /api_key=/)

    const unauthorized = await fetch(`${bridge.url}/settings.json`)
    assert.equal(unauthorized.status, 401)

    const settingsResponse = await fetch(`${bridge.url}/settings.json`, {
      headers: { Authorization: 'Bearer bridge-live-token' },
    })
    const settings = await settingsResponse.json()

    assert.equal(settingsResponse.status, 200)
    assert.equal(settings.runtime.profile, 'generic')
    assert.equal(settings.runtimeConnection.baseUrl, 'http://runtime-live.example.test/v1')
    assert.equal(settings.sourcePolicy.configuredAllowedSourceOrigins, 1)
    assert.equal(settings.network.configuredAllowedOrigins, 1)
    assert.equal(settings.persistence.enabled, true)

    const persisted = JSON.parse(await readFile(configPath, 'utf8'))
    assert.equal(persisted.config.runtimeProfile, 'generic')
    assert.equal(persisted.config.apiKey, 'runtime-api-secret')
    assert.equal(persisted.config.bridgeBearerToken, 'bridge-live-token')
    assert.equal(persisted.config.host, '0.0.0.0')
    assert.equal(persisted.config.port, 9876)

    const clearResponse = await fetch(`${bridge.url}/settings/config.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer bridge-live-token',
      },
      body: JSON.stringify({
        apiKey: '',
        bridgeBearerToken: '',
      }),
    })
    const cleared = await clearResponse.json()

    assert.equal(clearResponse.status, 200)
    assert.equal(cleared.settings.runtimeConnection.apiKeyConfigured, false)
    assert.equal(cleared.settings.bridgeAuth.bearerTokenConfigured, false)

    const unauthenticatedSettingsResponse = await fetch(`${bridge.url}/settings.json`)
    const unauthenticatedSettings = await unauthenticatedSettingsResponse.json()

    assert.equal(unauthenticatedSettingsResponse.status, 200)
    assert.equal(unauthenticatedSettings.runtimeConnection.apiKeyConfigured, false)
    assert.equal(unauthenticatedSettings.bridgeAuth.bearerTokenConfigured, false)

    const clearedPersisted = JSON.parse(await readFile(configPath, 'utf8'))
    assert.equal(clearedPersisted.config.apiKey, '')
    assert.equal(clearedPersisted.config.bridgeBearerToken, '')
  })

  it('persists registered sources and uses them when a message omits knowledgeSources', async (t) => {
    const configPath = await tempConfigPath(t)
    const source = await startFixtureServer(async ({ url, response }) => {
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Registered Wiki',
        evidence: [
          {
            page_id: 'registered-page',
            title: 'Registered Source Evidence',
            path: 'registered.md',
            snippet: 'Evidence from a registered source.',
          },
        ],
        graph: { nodes: [], edges: [] },
      })
    })
    const hermes = await startFixtureServer(async ({ url, response }) => {
      assert.equal(url.pathname, '/v1/chat/completions')
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Answer from registered source.' } }],
      })
    })
    const bridge = await startAgentBridge({
      port: 0,
      configPath,
      baseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(async () => {
      await closeServer(bridge.server)
      await closeServer(source.server)
      await closeServer(hermes.server)
    })

    const saveResponse = await fetch(`${bridge.url}/settings/sources.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          knowledgeSource('registered-source', 'Registered Source', 'llmwiki-http', `${source.url}////`),
          { ...knowledgeSource('secondary-source', 'Secondary Source', 'llmwiki-http', source.url), selected: false },
        ],
      }),
    })
    const saved = await saveResponse.json()

    assert.equal(saveResponse.status, 200)
    assert.equal(saved.status, 'saved')
    assert.equal(saved.sources.length, 2)
    assert.equal(saved.sources[1].selected, false)
    assert.equal(saved.persistence.registeredSources, 2)

    const sourcesResponse = await fetch(`${bridge.url}/settings/sources.json`)
    const registered = await sourcesResponse.json()

    assert.equal(sourcesResponse.status, 200)
    assert.deepEqual(registered.sources.map((item) => item.id), ['registered-source', 'secondary-source'])
    assert.equal(registered.sources[1].selected, false)
    assert.equal(registered.persistence.registeredSources, 2)

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Use the registered source.',
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data

    assert.equal(response.status, 200)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/search').length, 1)
    assert.equal(hermes.requests.length, 1)
    assert.equal(artifact.answer, expectedFallbackAnswer('Answer from registered source.', 1))
    assert.deepEqual(artifact.citations.map((citation) => citation.id), ['registered-source:registered-page'])

    const emptySourcesResponse = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Do not use registered sources.',
          knowledgeSources: [],
        },
      }),
    })

    assert.equal(emptySourcesResponse.status, 200)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/search').length, 1)

    const persisted = JSON.parse(await readFile(configPath, 'utf8'))
    assert.equal(persisted.sources.length, 2)
    assert.equal(persisted.sources[0].id, 'registered-source')
    assert.equal(persisted.sources[1].id, 'secondary-source')
    assert.equal(persisted.sources[1].selected, false)
  })

  it('appends bounded fallback citation anchors when runtime answer omits anchors', async (t) => {
    const source = await startFixtureServer(async ({ url, response }) => {
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Fallback Citation Wiki',
        evidence: citationEvidence(7),
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(source.server))

    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Runtime answer without anchors.' } }],
      })
    })
    t.after(() => closeServer(runtime.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${runtime.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Answer using fallback citations.',
          knowledgeSources: [
            knowledgeSource('fallback-wiki', 'Fallback Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const runtimeStep = artifact.steps.find((step) => step.id === 'runtime-chat-completions')
    const expectedAnswer = expectedFallbackAnswer('Runtime answer without anchors.', 7)

    assert.equal(response.status, 200)
    assert.equal(artifact.answer, expectedAnswer)
    assert.equal(a2a.message.parts[0].text, expectedAnswer)
    assert.equal(a2a.status.message.parts[0].text, expectedAnswer)
    assert.deepEqual(artifact.citations.map((citation) => citation.id), [
      'fallback-wiki:page-1',
      'fallback-wiki:page-2',
      'fallback-wiki:page-3',
      'fallback-wiki:page-4',
      'fallback-wiki:page-5',
      'fallback-wiki:page-6',
      'fallback-wiki:page-7',
    ])
    assert.match(runtimeStep.detail, /fallback citation anchors/)
    assert.doesNotMatch(artifact.answer.split('Evidence used: ')[1], /Fallback Evidence|page-\d+\.md/)
  })

  it('leaves runtime answers unchanged when they already contain a valid citation anchor', async (t) => {
    const source = await startFixtureServer(async ({ url, response }) => {
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Anchored Citation Wiki',
        evidence: citationEvidence(1),
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(source.server))

    const runtimeAnswer = 'Runtime answer with an existing anchor. [1](#citation-1)'
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: runtimeAnswer } }],
      })
    })
    t.after(() => closeServer(runtime.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${runtime.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Answer using an existing citation.',
          knowledgeSources: [
            knowledgeSource('anchored-wiki', 'Anchored Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const runtimeStep = artifact.steps.find((step) => step.id === 'runtime-chat-completions')

    assert.equal(response.status, 200)
    assert.equal(artifact.answer, runtimeAnswer)
    assert.doesNotMatch(artifact.answer, /Evidence used:/)
    assert.doesNotMatch(runtimeStep.detail, /fallback citation anchors/)
  })

  it('shows orientation and evidence previews in source trace details', async (t) => {
    const source = await startFixtureServer(async ({ url, response }) => {
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Orientation Wiki',
        orientation: [
          {
            page_id: 'hot',
            title: 'Hot Cache',
            path: 'hot.md',
            role: 'hot',
            snippet: 'Recent context.',
          },
          {
            page_id: 'index',
            title: 'Wiki Index',
            path: 'index.md',
            role: 'index',
            snippet: 'Navigation.',
          },
        ],
        evidence: [
          {
            page_id: 'topic',
            title: 'Topic Evidence',
            path: 'topic.md',
            snippet: 'Search evidence.',
          },
        ],
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(source.server))

    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Anchored answer. [1](#citation-1)' } }],
      })
    })
    t.after(() => closeServer(runtime.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${runtime.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Show orientation.',
          knowledgeSources: [
            knowledgeSource('orientation-wiki', 'Orientation Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const sourceStep = artifact.steps.find((step) => step.id === 'tool-orientation_wiki')

    assert.equal(response.status, 200)
    assert.match(sourceStep.detail, /Orientation: hot\.md \(Hot Cache\); index\.md \(Wiki Index\)\./)
    assert.match(sourceStep.detail, /Evidence: topic\.md \(Topic Evidence\)\./)
    assert.doesNotMatch(sourceStep.detail, /Recent context|Navigation|Search evidence/)
  })

  it('serves a DeepAgents runtime profile card identity', async (t) => {
    const bridge = await startAgentBridge({
      env: {
        LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE: 'deepagents',
      },
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const cardResponse = await fetch(`${bridge.url}/.well-known/agent-card.json`)
    const card = await cardResponse.json()

    assert.equal(cardResponse.status, 200)
    assert.equal(bridge.config.runtimeProfile, 'deepagents')
    assert.match(card.id, /deepagents/)
    assert.match(card.name.toLowerCase(), /deepagents|deep agents/)
    assert.match(card.runtime, /deepagents/)
    assert.match(card.agentRuntime, /deepagents/)
    assert.match(card.provider.organization.toLowerCase(), /deepagents|deep agents/)
    assert.equal(card.metadata.runtimeProfile, 'deepagents')
  })

  it('serves a generic OpenAI-compatible runtime profile card identity', async (t) => {
    const bridge = await startAgentBridge({
      runtimeProfile: 'generic',
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const cardResponse = await fetch(`${bridge.url}/.well-known/agent-card.json`)
    const card = await cardResponse.json()

    assert.equal(cardResponse.status, 200)
    assert.equal(bridge.config.runtimeProfile, 'generic')
    assert.equal(card.id, 'llmwiki-agent-bridge-generic-openai-compatible')
    assert.equal(card.name, 'LLMWiki Generic OpenAI-Compatible Agent Bridge')
    assert.equal(card.runtime, 'generic-openai-compatible')
    assert.equal(card.agentRuntime, 'openai-compatible')
    assert.equal(card.provider.organization, 'Generic OpenAI-Compatible')
    assert.equal(card.metadata.runtimeProfile, 'generic')
  })

  it('publishes an OpenAPI contract for the bridge HTTP surface', () => {
    const schema = agentBridgeOpenApi({ version: '0.1.0-test' })

    assert.equal(schema.openapi, '3.1.0')
    assert.equal(schema.info.version, '0.1.0-test')
    assert.deepEqual(Object.keys(schema.paths).sort(), [
      '/.well-known/agent-card.json',
      '/health',
      '/mcp',
      '/message:send',
      '/settings',
      '/settings.json',
      '/settings/config.json',
      '/settings/sources.json',
    ])
    assert.equal(
      schema.paths['/message:send'].post.responses[200].content['application/json'].schema.$ref,
      '#/components/schemas/MessageSendResponse',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'AgentCardResponse'),
      'AgentCardResponse schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'MessageSendData'),
      'MessageSendData schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'AgentResult'),
      'AgentResult schema missing',
    )
    assert.deepEqual(
      schema.components.schemas.OrchestrationMode.enum,
      ['evidence-only', 'delegated-runtime', 'hybrid'],
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'SourceBundle'),
      'SourceBundle schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'TraceCitationRef'),
      'TraceCitationRef schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'Diagnostic'),
      'Diagnostic schema missing',
    )
    assert.equal(
      schema.components.schemas.MessageSendResponse.properties.requestId.type,
      'string',
    )
    assert.equal(
      schema.components.schemas.MessageSendResponse.properties.traceId.type,
      'string',
    )
    assert.equal(
      schema.components.schemas.TraceStep.properties.citationRefs.items.$ref,
      '#/components/schemas/TraceCitationRef',
    )
    assert.equal(
      schema.components.schemas.TraceStep.properties.diagnostic.$ref,
      '#/components/schemas/Diagnostic',
    )
    assert.equal(
      schema.components.schemas.ErrorResponse.properties.diagnostics.items.$ref,
      '#/components/schemas/Diagnostic',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'SettingsResponse'),
      'SettingsResponse schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'SettingsConfigResponse'),
      'SettingsConfigResponse schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'SettingsSourcesResponse'),
      'SettingsSourcesResponse schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'McpJsonRpcResponse'),
      'McpJsonRpcResponse schema missing',
    )
    assert(
      Object.hasOwn(schema.components.schemas, 'McpSourcesResult'),
      'McpSourcesResult schema missing',
    )
    assert.equal(
      schema.components.schemas.McpToolCallResult.properties.structuredContent.properties.llmwiki_sources.$ref,
      '#/components/schemas/McpSourcesResult',
    )
    assert.deepEqual(
      schema.components.schemas.McpSourcesResult.required,
      ['sources', 'totalSourceCount', 'selectedSourceCount', 'readySourceCount', 'unavailableSourceCount'],
    )
    assert.equal(
      schema.components.schemas.McpSourcesResult.properties.sources.items.$ref,
      '#/components/schemas/McpSourceSummary',
    )
    assert.deepEqual(
      schema.components.schemas.McpSourceSummary.required,
      ['id', 'name', 'description', 'protocol', 'status', 'selected', 'url', 'readiness', 'capabilities', 'adapter', 'implementation'],
    )
    assert.equal(
      schema.components.schemas.McpSourceSummary.properties.readiness.$ref,
      '#/components/schemas/McpSourceReadiness',
    )
  })

  it('lets explicit runtime identity settings override profile defaults', async (t) => {
    const bridge = await startAgentBridge({
      env: {
        LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE: 'generic',
        LLMWIKI_AGENT_BRIDGE_RUNTIME_ID: 'env-runtime-id',
        LLMWIKI_AGENT_BRIDGE_RUNTIME_NAME: 'Env Runtime Name',
        LLMWIKI_AGENT_BRIDGE_RUNTIME: 'env-runtime',
        LLMWIKI_AGENT_BRIDGE_AGENT_RUNTIME: 'env-agent-runtime',
        LLMWIKI_AGENT_BRIDGE_PROVIDER_ORGANIZATION: 'Env Provider',
      },
      runtimeId: 'option-runtime-id',
      providerOrganization: 'Option Provider',
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const cardResponse = await fetch(`${bridge.url}/.well-known/agent-card.json`)
    const card = await cardResponse.json()

    assert.equal(cardResponse.status, 200)
    assert.equal(card.metadata.runtimeProfile, 'generic')
    assert.equal(card.id, 'option-runtime-id')
    assert.equal(card.name, 'Env Runtime Name')
    assert.equal(card.runtime, 'env-runtime')
    assert.equal(card.agentRuntime, 'env-agent-runtime')
    assert.equal(card.provider.organization, 'Option Provider')
  })

  it('prefers namespaced bridge host and port env over generic HOST and PORT', async (t) => {
    const bridge = await startAgentBridge({
      env: {
        HOST: '0.0.0.0',
        PORT: '65536',
        LLMWIKI_AGENT_BRIDGE_HOST: '127.0.0.1',
        LLMWIKI_AGENT_BRIDGE_PORT: '0',
      },
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    assert.equal(bridge.config.host, '127.0.0.1')
    assert.notEqual(bridge.config.port, 65536)
    assert.match(bridge.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('defaults the outbound request timeout to two minutes', async (t) => {
    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    assert.equal(bridge.config.requestTimeoutMs, 120_000)
  })

  it('supports deprecated Hermes env aliases during migration', async (t) => {
    const bridge = await startHermesA2aBridge({
      env: {
        HERMES_A2A_BRIDGE_HOST: '127.0.0.1',
        HERMES_A2A_BRIDGE_PORT: '0',
        HERMES_A2A_BRIDGE_ALLOWED_ORIGINS: 'http://legacy-chat.example.test:5176',
        HERMES_A2A_BRIDGE_ALLOWED_SOURCE_ORIGINS: 'http://legacy-source.example.test:8765',
        HERMES_A2A_BRIDGE_SOURCE_POLICY: 'allowlist',
        HERMES_BASE_URL: 'http://127.0.0.1:1/v1',
        HERMES_MODEL: 'legacy-hermes-model',
      },
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    assert.equal(bridge.config.host, '127.0.0.1')
    assert.equal(bridge.config.baseUrl, 'http://127.0.0.1:1/v1')
    assert.equal(bridge.config.hermesBaseUrl, 'http://127.0.0.1:1/v1')
    assert.equal(bridge.config.model, 'legacy-hermes-model')
    assert.equal(bridge.config.hermesModel, 'legacy-hermes-model')
    assert.deepEqual(bridge.config.allowedOrigins, ['http://legacy-chat.example.test:5176'])
    assert.deepEqual(bridge.config.allowedSourceOrigins, ['http://legacy-source.example.test:8765'])
    assert.equal(bridge.config.sourcePolicy, 'allowlist')
  })

  it('refuses a generic HOST public bind without explicit bridge opt-in', async () => {
    await assert.rejects(
      () => startAgentBridge({
        env: {
          HOST: '0.0.0.0',
          PORT: '0',
        },
        hermesBaseUrl: 'http://127.0.0.1:1/v1',
        logger: silentLogger,
      }),
      /LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND=1/,
    )
  })

  it('requires bridge authentication for public binds unless insecure dev mode is explicit', async (t) => {
    await assert.rejects(
      () => startAgentBridge({
        env: {
          LLMWIKI_AGENT_BRIDGE_HOST: '0.0.0.0',
          LLMWIKI_AGENT_BRIDGE_PORT: '0',
          LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND: '1',
        },
        hermesBaseUrl: 'http://127.0.0.1:1/v1',
        logger: silentLogger,
      }),
      /LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN/,
    )

    const bridge = await startAgentBridge({
      env: {
        LLMWIKI_AGENT_BRIDGE_HOST: '0.0.0.0',
        LLMWIKI_AGENT_BRIDGE_PORT: '0',
        LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND: '1',
        LLMWIKI_AGENT_BRIDGE_ALLOW_INSECURE_PUBLIC_BIND: '1',
      },
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`http://127.0.0.1:${bridge.config.port}/health`)
    assert.equal(response.status, 200)
  })

  it('requires the configured bridge bearer token before serving public-bound requests', async (t) => {
    const bridge = await startAgentBridge({
      env: {
        LLMWIKI_AGENT_BRIDGE_HOST: '0.0.0.0',
        LLMWIKI_AGENT_BRIDGE_PORT: '0',
        LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND: '1',
        LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN: 'bridge-secret',
      },
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const url = `http://127.0.0.1:${bridge.config.port}/health`
    const noOriginNoAuth = await fetch(url)
    assert.equal(noOriginNoAuth.status, 401)

    const wrongToken = await fetch(url, {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
    assert.equal(wrongToken.status, 401)

    const emptyToken = await fetch(url, {
      headers: { Authorization: 'Bearer     ' },
    })
    assert.equal(emptyToken.status, 401)

    const authorized = await fetch(url, {
      headers: { Authorization: 'bEaReR     bridge-secret' },
    })
    const health = await authorized.json()

    assert.equal(authorized.status, 200)
    assert.equal(health.status, 'ok')
  })

  it('restricts browser CORS to loopback origins plus explicitly allowed origins', async (t) => {
    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      allowedOrigins: ['http://tailnet-chat.example.test:5176'],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const blocked = await fetch(`${bridge.url}/health`, {
      headers: { Origin: 'https://evil.example' },
    })
    assert.equal(blocked.status, 403)
    assert.equal(blocked.headers.get('access-control-allow-origin'), null)

    const loopback = await fetch(`${bridge.url}/health`, {
      headers: { Origin: 'http://localhost:5174' },
    })
    assert.equal(loopback.status, 200)
    assert.equal(loopback.headers.get('access-control-allow-origin'), 'http://localhost:5174')

    const explicitOrigin = await fetch(`${bridge.url}/health`, {
      headers: { Origin: 'http://tailnet-chat.example.test:5176' },
    })
    assert.equal(explicitOrigin.status, 200)
    assert.equal(
      explicitOrigin.headers.get('access-control-allow-origin'),
      'http://tailnet-chat.example.test:5176',
    )
  })

  it('allows same-origin settings writes from the bridge host and blocks unrelated origins', async (t) => {
    const configPath = await tempConfigPath(t)
    const bridge = await startAgentBridge({
      port: 0,
      configPath,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      allowedOrigins: ['http://tailnet-chat.example.test:5176'],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const bridgeHost = `bridge.example.test:${bridge.config.port}`
    const bridgeOrigin = `http://${bridgeHost}`

    const blocked = await bridgeJsonRequest({
      port: bridge.config.port,
      hostHeader: bridgeHost,
      method: 'PUT',
      path: '/settings/config.json',
      headers: { Origin: 'https://evil.example' },
      body: { requestTimeoutMs: 11111 },
    })

    assert.equal(blocked.status, 403)
    assert.equal(blocked.headers['access-control-allow-origin'], undefined)
    assert.equal(blocked.json.error.code, 'origin_not_allowed')

    const saved = await bridgeJsonRequest({
      port: bridge.config.port,
      hostHeader: bridgeHost,
      method: 'PUT',
      path: '/settings/config.json',
      headers: { Origin: bridgeOrigin },
      body: { requestTimeoutMs: 45678 },
    })

    assert.equal(saved.status, 200)
    assert.equal(saved.headers['access-control-allow-origin'], bridgeOrigin)
    assert.equal(saved.json.settings.runtimeConnection.requestTimeoutMs, 45678)

    const persisted = JSON.parse(await readFile(configPath, 'utf8'))
    assert.equal(persisted.config.requestTimeoutMs, 45678)
  })

  it('allows private HTTP Knowledge Source origins by default', async (t) => {
    const originalFetch = globalThis.fetch
    const sourceOrigin = 'http://10.19.0.42:8765'
    const completionsOrigin = 'http://agent.example.test'
    const sourceRequests = []
    let bridge

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (bridge && url.href.startsWith(`${bridge.url}/`)) return originalFetch(input, init)

      if (url.origin === sourceOrigin) {
        sourceRequests.push({ url, body: parseJsonFetchBody(init.body) })
        if (url.pathname === '/search') {
          return jsonFetchResponse(200, { results: [] })
        }
        assert.equal(url.pathname, '/query')
        return jsonFetchResponse(200, {
          wiki_title: 'Private Lab Wiki',
          evidence: [
            {
              page_id: 'private-http',
              title: 'Private HTTP Evidence',
              path: 'private-http.md',
              snippet: 'Evidence from a private HTTP source.',
            },
          ],
          graph: { nodes: [], edges: [] },
        })
      }

      if (url.origin === completionsOrigin) {
        return jsonFetchResponse(200, {
          choices: [{ message: { role: 'assistant', content: 'Answer from private HTTP source.' } }],
        })
      }

      throw new Error(`Unexpected fetch origin: ${url.origin}`)
    }

    t.after(async () => {
      globalThis.fetch = originalFetch
      if (bridge) await closeServer(bridge.server)
    })

    bridge = await startAgentBridge({
      port: 0,
      baseUrl: `${completionsOrigin}/v1`,
      logger: silentLogger,
    })

    assert.equal(bridge.config.sourcePolicy, 'private-http')

    const response = await originalFetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Can the default policy read private HTTP sources?',
          knowledgeSources: [
            knowledgeSource('private-http', 'Private HTTP Source', 'llmwiki-http', sourceOrigin),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data

    assert.equal(response.status, 200)
    assert.equal(sourceRequests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(sourceRequests.filter((item) => item.url.pathname === '/search').length, 1)
    assert.equal(artifact.answer, expectedFallbackAnswer('Answer from private HTTP source.', 1))
    assert.deepEqual(artifact.citations.map((citation) => citation.id), ['private-http:private-http'])
  })

  it('uses a separate exact allowlist for non-loopback HTTP Knowledge Source origins', async (t) => {
    const originalFetch = globalThis.fetch
    const sourceOrigin = 'http://tailnet-source.example.test:8765'
    const hermesOrigin = 'http://hermes.example.test'
    const sourceRequests = []
    const hermesRequests = []
    let bridge

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (bridge && url.href.startsWith(`${bridge.url}/`)) return originalFetch(input, init)

      if (url.origin === sourceOrigin) {
        sourceRequests.push({ url, body: parseJsonFetchBody(init.body) })
        if (url.pathname === '/search') {
          return jsonFetchResponse(200, { results: [] })
        }
        assert.equal(url.pathname, '/query')
        return jsonFetchResponse(200, {
          wiki_title: 'Allowed Source Wiki',
          evidence: [
            {
              page_id: 'allowed',
              title: 'Allowed Source Evidence',
              path: 'allowed.md',
              snippet: 'Evidence from an explicitly allowed source origin.',
            },
          ],
          graph: { nodes: [], edges: [] },
        })
      }

      if (url.origin === hermesOrigin) {
        hermesRequests.push({ url, body: parseJsonFetchBody(init.body) })
        assert.equal(url.pathname, '/v1/chat/completions')
        return jsonFetchResponse(200, {
          choices: [{ message: { role: 'assistant', content: 'Answer from allowed source origin.' } }],
        })
      }

      throw new Error(`Unexpected fetch origin: ${url.origin}`)
    }

    t.after(async () => {
      globalThis.fetch = originalFetch
      if (bridge) await closeServer(bridge.server)
    })

    bridge = await startAgentBridge({
      env: {
        LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY: 'allowlist',
        LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS: sourceOrigin,
      },
      port: 0,
      hermesBaseUrl: `${hermesOrigin}/v1`,
      logger: silentLogger,
    })

    const response = await originalFetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Can a source-origin allowlist enable a lab source?',
          knowledgeSources: [
            knowledgeSource('allowed-http', 'Allowed HTTP Source', 'llmwiki-http', sourceOrigin),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data

    assert.equal(response.status, 200)
    assert.equal(sourceRequests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(sourceRequests.filter((item) => item.url.pathname === '/search').length, 1)
    assert.equal(hermesRequests.length, 1)
    assert.equal(artifact.answer, expectedFallbackAnswer('Answer from allowed source origin.', 1))
    assert.deepEqual(artifact.citations.map((citation) => citation.id), ['allowed-http:allowed'])
  })

  it('rejects unlisted private HTTP source URLs in public-https policy', async (t) => {
    const originalFetch = globalThis.fetch
    const sourceOrigin = 'http://192.168.50.10:8765'
    const completionsOrigin = 'http://agent-public-policy.example.test'
    const sourceRequests = []
    let bridge

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (bridge && url.href.startsWith(`${bridge.url}/`)) return originalFetch(input, init)

      if (url.origin === sourceOrigin) {
        sourceRequests.push({ url, body: parseJsonFetchBody(init.body) })
        return jsonFetchResponse(200, { wiki_title: 'Unexpected Source', evidence: [] })
      }

      if (url.origin === completionsOrigin) {
        return jsonFetchResponse(200, {
          choices: [{ message: { role: 'assistant', content: 'Answer with public-https source skipped.' } }],
        })
      }

      throw new Error(`Unexpected fetch origin: ${url.origin}`)
    }

    t.after(async () => {
      globalThis.fetch = originalFetch
      if (bridge) await closeServer(bridge.server)
    })

    bridge = await startAgentBridge({
      port: 0,
      baseUrl: `${completionsOrigin}/v1`,
      sourcePolicy: 'public-https',
      logger: silentLogger,
    })

    const response = await originalFetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Should public-https reject private HTTP sources?',
          knowledgeSources: [
            knowledgeSource('private-http', 'Private HTTP Source', 'llmwiki-http', sourceOrigin),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const failedStep = artifact.steps.find((step) => step.connectionId === 'private-http')

    assert.equal(response.status, 200)
    assert.equal(sourceRequests.length, 0)
    assert.equal(failedStep.status, 'error')
    assert.equal(artifact.answer, 'Answer with public-https source skipped.')
  })

  it('rejects invalid, userinfo, and non-http source URLs under every source policy', async (t) => {
    const originalFetch = globalThis.fetch
    const completionsOrigin = 'http://agent-source-url-policy.example.test'
    const bridges = []
    const completionsRequests = []
    const sourceRequests = []

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (bridges.some((bridge) => url.href.startsWith(`${bridge.url}/`))) return originalFetch(input, init)

      if (url.origin === completionsOrigin) {
        completionsRequests.push({ url, body: parseJsonFetchBody(init.body) })
        return jsonFetchResponse(200, {
          choices: [{ message: { role: 'assistant', content: 'Answer with invalid sources skipped.' } }],
        })
      }

      sourceRequests.push({ url, body: parseJsonFetchBody(init.body) })
      return jsonFetchResponse(200, { wiki_title: 'Unexpected Source', evidence: [] })
    }

    t.after(async () => {
      globalThis.fetch = originalFetch
      await Promise.all(bridges.map((bridge) => closeServer(bridge.server)))
    })

    for (const sourcePolicy of ['private-http', 'allowlist', 'public-https']) {
      const bridge = await startAgentBridge({
        port: 0,
        baseUrl: `${completionsOrigin}/v1`,
        sourcePolicy,
        logger: silentLogger,
      })
      bridges.push(bridge)

      const response = await originalFetch(`${bridge.url}/message:send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            query: `Should ${sourcePolicy} reject invalid source URLs?`,
            knowledgeSources: [
              knowledgeSource('invalid-url', 'Invalid URL Source', 'llmwiki-http', 'not a url'),
              knowledgeSource('userinfo-url', 'Userinfo URL Source', 'llmwiki-http', 'http://user:pass@127.0.0.1:65535'),
              knowledgeSource('ftp-url', 'FTP URL Source', 'llmwiki-http', 'ftp://example.test/wiki'),
            ],
          },
        }),
      })
      const a2a = await response.json()
      const artifact = a2a.artifacts[0].parts[0].data
      const failedSteps = artifact.steps.filter((step) => step.status === 'error')

      assert.equal(response.status, 200)
      assert.equal(failedSteps.length, 3)
      assert.equal(artifact.answer, 'Answer with invalid sources skipped.')
    }

    assert.equal(sourceRequests.length, 0)
    assert.equal(completionsRequests.length, 3)
  })

  it('does not send a default chat completions authorization header when no API key is configured', async (t) => {
    const hermes = await startFixtureServer(async ({ headers, response }) => {
      assert.equal(headers.authorization, undefined)
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'No key required.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      env: {},
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { query: 'Can the bridge run without an upstream API key?' } }),
    })
    const a2a = await response.json()

    assert.equal(response.status, 200)
    assert.equal(hermes.requests.length, 1)
    assert.equal(a2a.artifacts[0].parts[0].data.answer, 'No key required.')
  })

  it('exposes an MCP llmwiki_agent_run tool backed by the A2A run path', async (t) => {
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'MCP Bridge Source',
        evidence: [
          {
            page_id: 'mcp-run',
            title: 'MCP Run Contract',
            path: 'mcp-run.md',
            snippet: `MCP bridge evidence for ${body.query}.`,
            source_refs: ['MCP-RUN-1'],
          },
        ],
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'MCP bridge answer.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const listResponse = await fetch(`${bridge.url}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    const list = await listResponse.json()

    assert.equal(listResponse.status, 200)
    assert.equal(list.result.serverInfo.settingsUrl, '/settings')
    assert.equal(list.result.tools[0].name, 'llmwiki_agent_run')
    assert.deepEqual(list.result.tools[0].inputSchema.required, ['query'])

    const callResponse = await fetch(`${bridge.url}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'run-1',
        method: 'tools/call',
        params: {
          name: 'llmwiki_agent_run',
          arguments: {
            query: 'Can MCP clients run the bridge?',
            knowledgeSources: [
              knowledgeSource('mcp-bridge-source', 'MCP Bridge Source', 'llmwiki-http', source.url),
            ],
          },
        },
      }),
    })
    const call = await callResponse.json()
    const result = call.result.structuredContent.llmwiki_agent_result

    assert.equal(callResponse.status, 200)
    assert.equal(call.jsonrpc, '2.0')
    assert.equal(call.id, 'run-1')
    assert.equal(call.result.isError, false)
    assert.equal(call.result.content[0].type, 'text')
    assert.equal(call.result.content[0].text, expectedFallbackAnswer('MCP bridge answer.', 1))
    assert.equal(result.answer, expectedFallbackAnswer('MCP bridge answer.', 1))
    assert.deepEqual(result.citations.map((citation) => citation.id), ['mcp-bridge-source:mcp-run'])
    const sourceStep = result.steps.find((step) => step.connectionId === 'mcp-bridge-source')
    assert.deepEqual(sourceStep.citationIds, ['mcp-bridge-source:mcp-run'])
    assert.deepEqual(sourceStep.citationRefs, [
      {
        id: 'mcp-bridge-source:mcp-run',
        title: 'MCP Run Contract',
        path: 'mcp-run.md',
        sourceRefs: ['MCP-RUN-1'],
      },
    ])
    assert.match(sourceStep.detail, /mcp-run\.md \(MCP Run Contract\)/)
    assert.equal(result.steps.find((step) => step.id === 'runtime-chat-completions').status, 'done')
    assert.equal(source.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(hermes.requests.length, 1)
  })

  it('exposes read-only MCP source tools for progressive source exploration without calling runtime', async (t) => {
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      if (url.pathname === '/query') {
        assert.equal(request.method, 'POST')
        assert.equal(body.query, 'release readiness')
        assert.equal(body.limit, 3)
        writeJson(response, 200, {
          wiki_title: 'Progressive Source',
          orientation: [
            {
              page_id: 'hot',
              title: 'Hot',
              path: 'hot.md',
              snippet: 'Start with current release context.',
              role: 'hot',
            },
          ],
          evidence: [
            {
              page_id: 'release-readiness',
              title: 'Release Readiness',
              path: 'release-readiness.md',
              snippet: 'Release readiness evidence.',
              source_refs: ['REL-1'],
            },
          ],
          graph: {
            nodes: [{ id: 'release-readiness', label: 'Release Readiness' }],
            edges: [],
          },
        })
        return
      }

      if (url.pathname === '/search') {
        assert.equal(request.method, 'POST')
        assert.equal(body.query, 'owner risk')
        writeJson(response, 200, {
          results: [
            {
              page_id: 'owner-risk',
              title: 'Owner Risk',
              path: 'owner-risk.md',
              snippet: 'Owner risk search result.',
              score: 0.9,
            },
          ],
        })
        return
      }

      if (url.pathname === '/read/release-readiness') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, {
          id: 'release-readiness',
          title: 'Release Readiness',
          path: 'release-readiness.md',
          markdown: '# Release Readiness\n\nRelease readiness evidence.',
        })
        return
      }

      if (url.pathname === '/graph') {
        assert.equal(request.method, 'GET')
        assert.equal(url.searchParams.get('limit'), '4')
        writeJson(response, 200, {
          nodes: [{ id: 'release-readiness', label: 'Release Readiness' }],
          edges: [{ source: 'release-readiness', target: 'owner-risk', relation: 'mentions' }],
        })
        return
      }

      if (url.pathname === '/graph/neighborhood') {
        assert.equal(request.method, 'GET')
        assert.deepEqual(url.searchParams.getAll('seed'), ['release-readiness'])
        assert.equal(url.searchParams.get('depth'), '2')
        assert.equal(url.searchParams.get('direction'), 'out')
        assert.deepEqual(url.searchParams.getAll('relation'), ['mentions'])
        assert.equal(url.searchParams.get('limit'), '5')
        assert.equal(url.searchParams.get('include_drafts'), 'true')
        writeJson(response, 200, {
          nodes: [
            { id: 'release-readiness', label: 'Release Readiness' },
            { id: 'owner-risk', label: 'Owner Risk' },
          ],
          edges: [{ source: 'release-readiness', target: 'owner-risk', relation: 'mentions' }],
          citations: [
            {
              page_id: 'page:owner-risk',
              title: 'Owner Risk',
              path: 'owner-risk.md',
              snippet: 'Owner risk citation from graph traversal.',
            },
          ],
        })
        return
      }

      if (url.pathname === '/source-bundle') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, {
          source_id: 'progressive-source',
          bundle_id: 'progressive-bundle',
          title: 'Progressive Bundle',
          projection: { page_count: 2, graph_node_count: 2 },
        })
        return
      }

      writeJson(response, 404, { error: 'not found' })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      registeredSources: [
        knowledgeSource('progressive-source', 'Progressive Source', 'llmwiki-http', source.url),
        {
          ...knowledgeSource('warming-source', 'Warming Source', 'llmwiki-http', `${source.url}/warming-private-path?token=source-secret`),
          status: 'warming',
        },
      ],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const tools = await callBridgeMcp(bridge, 1, 'tools/list')
    assert.deepEqual(
      tools.result.tools.map((tool) => tool.name),
      [
        'llmwiki_agent_run',
        'llmwiki_list_sources',
        'llmwiki_context',
        'llmwiki_search',
        'llmwiki_read',
        'llmwiki_graph',
        'llmwiki_graph_neighbors',
        'llmwiki_source_bundle',
      ],
    )

    const listed = await callBridgeMcpTool(bridge, 'list', 'llmwiki_list_sources', {})
    const listedSources = listed.result.structuredContent.llmwiki_sources
    const listedSerialized = JSON.stringify(listed)

    assert.equal(listed.result.isError, false)
    assert.equal(listedSources.totalSourceCount, 2)
    assert.equal(listedSources.selectedSourceCount, 2)
    assert.equal(listedSources.readySourceCount, 1)
    assert.equal(listedSources.unavailableSourceCount, 1)
    assert.equal(listedSources.sources[0].id, 'progressive-source')
    assert.equal(listedSources.sources[0].url, source.url)
    assert.deepEqual(listedSources.sources[0].readiness, { ready: true })
    assert.equal(listedSources.sources[1].id, 'warming-source')
    assert.equal(listedSources.sources[1].url, `${source.url}/warming-private-path?token=source-secret`)
    assert.deepEqual(listedSources.sources[1].readiness, { ready: false, reason: 'status_not_ready' })
    assert.match(listed.result.content[0].text, /progressive-source: Progressive Source \(llmwiki-http, ready, ready\)/)
    assert.doesNotMatch(listed.result.content[0].text, /127\.0\.0\.1/)
    assert.doesNotMatch(listed.result.content[0].text, /warming-private-path/)
    assert.doesNotMatch(listed.result.content[0].text, /source-secret/)
    assert.match(listedSerialized, /warming-private-path/)

    const context = await callBridgeMcpTool(bridge, 'context', 'llmwiki_context', {
      query: 'release readiness',
      limit: 3,
    })
    assert.equal(context.result.isError, false)
    assert.deepEqual(context.result.structuredContent.llmwiki_context.citations.map((item) => item.id), [
      'progressive-source:release-readiness',
    ])
    assert.equal(context.result.structuredContent.llmwiki_context.orientation[0].id, 'hot')

    const search = await callBridgeMcpTool(bridge, 'search', 'llmwiki_search', {
      query: 'owner risk',
    })
    assert.equal(search.result.isError, false)
    assert.deepEqual(search.result.structuredContent.llmwiki_search.results.map((item) => item.id), [
      'progressive-source:owner-risk',
    ])

    const read = await callBridgeMcpTool(bridge, 'read', 'llmwiki_read', {
      pageId: 'release-readiness',
    })
    assert.equal(read.result.isError, false)
    assert.equal(read.result.structuredContent.llmwiki_read.page.title, 'Release Readiness')

    const graph = await callBridgeMcpTool(bridge, 'graph', 'llmwiki_graph', {
      limit: 4,
    })
    assert.equal(graph.result.isError, false)
    assert.deepEqual(graph.result.structuredContent.llmwiki_graph.graph.nodes.map((node) => node.id), [
      'progressive-source:release-readiness',
    ])

    const neighbors = await callBridgeMcpTool(bridge, 'neighbors', 'llmwiki_graph_neighbors', {
      nodeId: 'progressive-source:release-readiness',
      depth: 2,
      direction: 'out',
      relation: 'mentions',
      limit: 5,
      includeDrafts: true,
    })
    const neighborResult = neighbors.result.structuredContent.llmwiki_graph_neighbors
    assert.equal(neighbors.result.isError, false)
    assert.deepEqual(neighborResult.sources.map((item) => item.id), ['progressive-source'])
    assert.deepEqual(neighborResult.nodeIds, ['progressive-source:release-readiness'])
    assert.equal(neighborResult.direction, 'out')
    assert.deepEqual(neighborResult.relations, ['mentions'])
    assert.deepEqual(neighborResult.neighborhoods[0].nodeIds, ['progressive-source:release-readiness'])
    assert.equal(neighborResult.neighborhoods[0].direction, 'out')
    assert.deepEqual(neighborResult.neighborhoods[0].relations, ['mentions'])
    assert.deepEqual(neighborResult.graph.nodes.map((node) => node.id), [
      'progressive-source:release-readiness',
      'progressive-source:owner-risk',
    ])
    assert.deepEqual(neighborResult.graph.edges.map((edge) => [edge.source, edge.target, edge.relation]), [
      ['progressive-source:release-readiness', 'progressive-source:owner-risk', 'mentions'],
    ])
    assert.deepEqual(neighborResult.citations.map((citation) => citation.id), [
      'progressive-source:page:owner-risk',
    ])

    const sourceBundle = await callBridgeMcpTool(bridge, 'bundle', 'llmwiki_source_bundle', {})
    assert.equal(sourceBundle.result.isError, false)
    assert.equal(sourceBundle.result.structuredContent.llmwiki_source_bundle.sourceBundle.bundleId, 'progressive-bundle')

    assert.equal(source.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/search').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/graph/neighborhood').length, 1)
  })

  it('resolves source-prefixed llmwiki_read ids before upstream reads', async (t) => {
    const source = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'GET')

      if (url.pathname === '/alpha/read/topic') {
        writeJson(response, 200, {
          id: 'topic',
          title: 'Alpha Topic',
          markdown: '# Alpha Topic',
        })
        return
      }

      if (url.pathname === '/beta/read/topic') {
        writeJson(response, 200, {
          id: 'topic',
          title: 'Beta Topic',
          markdown: '# Beta Topic',
        })
        return
      }

      writeJson(response, 404, { error: 'unexpected read path' })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      registeredSources: [
        knowledgeSource('alpha', 'Alpha Source', 'llmwiki-http', `${source.url}/alpha`),
        knowledgeSource('beta', 'Beta Source', 'llmwiki-http', `${source.url}/beta`),
      ],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const inferred = await callBridgeMcpTool(bridge, 'read-alpha-prefixed', 'llmwiki_read', {
      pageId: 'alpha:topic',
    })

    assert.equal(inferred.result.isError, false)
    assert.equal(inferred.result.structuredContent.llmwiki_read.source.id, 'alpha')
    assert.equal(inferred.result.structuredContent.llmwiki_read.pageId, 'alpha:topic')
    assert.equal(inferred.result.structuredContent.llmwiki_read.page.title, 'Alpha Topic')
    assert.deepEqual(source.requests.map((item) => item.url.pathname), [
      '/alpha/read/topic',
    ])

    const explicit = await callBridgeMcpTool(bridge, 'read-alpha-explicit-prefixed', 'llmwiki_read', {
      sourceId: 'alpha',
      pageId: 'alpha:topic',
    })

    assert.equal(explicit.result.isError, false)
    assert.equal(explicit.result.structuredContent.llmwiki_read.source.id, 'alpha')
    assert.equal(explicit.result.structuredContent.llmwiki_read.page.title, 'Alpha Topic')
    assert.deepEqual(source.requests.map((item) => item.url.pathname), [
      '/alpha/read/topic',
      '/alpha/read/topic',
    ])

    const mismatch = await callBridgeMcpTool(bridge, 'read-alpha-beta-prefixed', 'llmwiki_read', {
      sourceId: 'alpha',
      pageId: 'beta:topic',
    })

    assert.equal(mismatch.result, undefined)
    assert.equal(mismatch.error.code, -32602)
    assert.match(mismatch.error.message, /pageId source prefix beta does not match sourceId: alpha/)
    assert.deepEqual(source.requests.map((item) => item.url.pathname), [
      '/alpha/read/topic',
      '/alpha/read/topic',
    ])
  })

  it('proxies read-only MCP source tools to MCP Knowledge Source tools', async (t) => {
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      assert.equal(url.pathname, '/mcp')
      assert.equal(body.method, 'tools/call')
      const name = body.params.name
      const args = body.params.arguments

      if (name === 'llmwiki_context') {
        assert.equal(args.query, 'architecture')
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            wiki_title: 'MCP Source',
            evidence: [
              {
                page_id: 'architecture',
                title: 'Architecture',
                path: 'architecture.md',
                snippet: 'Architecture context.',
              },
            ],
            graph: { nodes: [], edges: [] },
          },
        })
        return
      }

      if (name === 'llmwiki_search') {
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            results: [
              {
                page_id: 'operations',
                title: 'Operations',
                path: 'operations.md',
                snippet: 'Operations search result.',
              },
            ],
          },
        })
        return
      }

      if (name === 'llmwiki_read') {
        assert.equal(args.page_id, 'operations')
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            id: 'operations',
            title: 'Operations',
            markdown: '# Operations',
          },
        })
        return
      }

      if (name === 'llmwiki_graph') {
        assert.equal(args.limit, 2)
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            nodes: [{ id: 'operations', label: 'Operations' }],
            edges: [],
          },
        })
        return
      }

      if (name === 'llmwiki_graph_neighbors') {
        assert.equal(args.seed, 'operations')
        assert.deepEqual(args.seeds, ['operations'])
        assert.equal(args.depth, 2)
        assert.equal(args.direction, 'both')
        assert.deepEqual(args.relations, ['links_to'])
        assert.equal(args.limit, 3)
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            structuredContent: {
              llmwiki_graph_neighbors: {
                nodes: [
                  { id: 'operations', label: 'Operations' },
                  { id: 'runbook', label: 'Runbook' },
                ],
                edges: [{ source: 'operations', target: 'runbook', relation: 'links_to' }],
                citations: [
                  {
                    page_id: 'runbook',
                    title: 'Runbook',
                    path: 'runbook.md',
                    snippet: 'Runbook neighbor.',
                  },
                ],
              },
            },
          },
        })
        return
      }

      writeJson(response, 500, { error: 'unexpected tool' })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      registeredSources: [
        knowledgeSource('mcp-source', 'MCP Source', 'mcp', source.url),
      ],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const context = await callBridgeMcpTool(bridge, 'mcp-context', 'llmwiki_context', {
      query: 'architecture',
    })
    assert.deepEqual(context.result.structuredContent.llmwiki_context.citations.map((item) => item.id), [
      'mcp-source:architecture',
    ])

    const search = await callBridgeMcpTool(bridge, 'mcp-search', 'llmwiki_search', {
      query: 'operations',
    })
    assert.deepEqual(search.result.structuredContent.llmwiki_search.results.map((item) => item.id), [
      'mcp-source:operations',
    ])

    const read = await callBridgeMcpTool(bridge, 'mcp-read', 'llmwiki_read', {
      pageId: 'mcp-source:operations',
    })
    assert.equal(read.result.structuredContent.llmwiki_read.page.title, 'Operations')

    const graph = await callBridgeMcpTool(bridge, 'mcp-graph', 'llmwiki_graph', {
      limit: 2,
    })
    assert.deepEqual(graph.result.structuredContent.llmwiki_graph.graph.nodes.map((node) => node.id), [
      'mcp-source:operations',
    ])

    const neighbors = await callBridgeMcpTool(bridge, 'mcp-neighbors', 'llmwiki_graph_neighbors', {
      nodeId: 'mcp-source:operations',
      depth: 2,
      relations: ['links_to'],
      limit: 3,
    })
    const neighborResult = neighbors.result.structuredContent.llmwiki_graph_neighbors
    assert.deepEqual(neighborResult.graph.nodes.map((node) => node.id), [
      'mcp-source:operations',
      'mcp-source:runbook',
    ])
    assert.deepEqual(neighborResult.graph.edges.map((edge) => [edge.source, edge.target, edge.relation]), [
      ['mcp-source:operations', 'mcp-source:runbook', 'links_to'],
    ])
    assert.deepEqual(neighborResult.citations.map((citation) => citation.id), [
      'mcp-source:runbook',
    ])

    assert.deepEqual(source.requests.map((item) => item.body.params.name), [
      'llmwiki_context',
      'llmwiki_search',
      'llmwiki_read',
      'llmwiki_graph',
      'llmwiki_graph_neighbors',
    ])
  })

  it('fans out graph neighborhoods across selected sources in deterministic order', async (t) => {
    const source = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'GET')
      const sourceId = url.pathname.split('/')[1]
      assert(['alpha', 'beta'].includes(sourceId))
      assert.equal(url.pathname, `/${sourceId}/graph/neighborhood`)
      assert.deepEqual(url.searchParams.getAll('seed'), ['topic'])
      assert.equal(url.searchParams.get('limit'), '2')
      writeJson(response, 200, {
        nodes: [
          { id: 'topic', label: 'Topic' },
          { id: `related-${sourceId}`, label: `Related ${sourceId}` },
        ],
        edges: [{ source: 'topic', target: `related-${sourceId}`, relation: 'related' }],
      })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      registeredSources: [
        knowledgeSource('alpha', 'Alpha Source', 'llmwiki-http', `${source.url}/alpha`),
        knowledgeSource('beta', 'Beta Source', 'llmwiki-http', `${source.url}/beta`),
        { ...knowledgeSource('skipped', 'Skipped Source', 'llmwiki-http', `${source.url}/skipped`), selected: false },
      ],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const neighbors = await callBridgeMcpTool(bridge, 'multi-neighbors', 'llmwiki_graph_neighbors', {
      nodeId: 'topic',
      limit: 2,
    })
    const neighborResult = neighbors.result.structuredContent.llmwiki_graph_neighbors

    assert.equal(neighbors.result.isError, false)
    assert.deepEqual(source.requests.map((item) => item.url.pathname), [
      '/alpha/graph/neighborhood',
      '/beta/graph/neighborhood',
    ])
    assert.deepEqual(neighborResult.sources.map((item) => item.id), ['alpha', 'beta'])
    assert.deepEqual(neighborResult.neighborhoods.map((item) => item.source.id), ['alpha', 'beta'])
    assert.deepEqual(neighborResult.graph.nodes.map((node) => node.id), [
      'alpha:topic',
      'alpha:related-alpha',
      'beta:topic',
      'beta:related-beta',
    ])

    const narrowed = await callBridgeMcpTool(bridge, 'beta-neighbors', 'llmwiki_graph_neighbors', {
      sourceId: 'beta',
      nodeId: 'topic',
      limit: 2,
    })
    const narrowedResult = narrowed.result.structuredContent.llmwiki_graph_neighbors

    assert.equal(narrowed.result.isError, false)
    assert.deepEqual(source.requests.map((item) => item.url.pathname), [
      '/alpha/graph/neighborhood',
      '/beta/graph/neighborhood',
      '/beta/graph/neighborhood',
    ])
    assert.deepEqual(narrowedResult.sources.map((item) => item.id), ['beta'])
    assert.deepEqual(narrowedResult.neighborhoods.map((item) => item.source.id), ['beta'])
    assert.deepEqual(narrowedResult.graph.nodes.map((node) => node.id), [
      'beta:topic',
      'beta:related-beta',
    ])
  })

  it('GOV/OBS returns redacted source-tool errors when graph neighbors selected source fails', async (t) => {
    const source = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'GET')

      if (url.pathname === '/alpha/graph/neighborhood') {
        assert.deepEqual(url.searchParams.getAll('seed'), ['topic'])
        writeJson(response, 200, {
          nodes: [
            { id: 'topic', label: 'Topic' },
            { id: 'related-alpha', label: 'Related Alpha' },
          ],
          edges: [{ source: 'topic', target: 'related-alpha', relation: 'related' }],
        })
        return
      }

      if (url.pathname === '/bad-private-path/graph/neighborhood') {
        writeJson(response, 503, {
          error: 'raw upstream body with token sk-secret-source',
          sourceUrl: 'http://user:pass@private-source.example.test/raw?token=source-secret',
          stack: 'Error: upstream stack\n    at sourceHandler (private-source.js:12:34)',
        })
        return
      }

      writeJson(response, 404, { error: 'unexpected graph neighbor path' })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      registeredSources: [
        knowledgeSource('alpha', 'Alpha Source', 'llmwiki-http', `${source.url}/alpha`),
        knowledgeSource('bad', 'Bad Source', 'llmwiki-http', `${source.url}/bad-private-path`),
      ],
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const failure = await callBridgeMcpTool(bridge, 'failing-neighbors', 'llmwiki_graph_neighbors', {
      nodeId: 'topic',
      limit: 2,
    })
    const sourceError = failure.result.structuredContent.llmwiki_source_error
    const serialized = JSON.stringify(failure)

    assert.equal(failure.error, undefined)
    assert.equal(failure.result.isError, true)
    assert.equal(sourceError.tool, 'llmwiki_graph_neighbors')
    assert.equal(sourceError.message, 'llmwiki-http graph neighborhood returned HTTP 503')
    assert.equal(failure.result.content[0].text, sourceError.message)
    assert.equal(failure.result.structuredContent.llmwiki_graph_neighbors, undefined)
    assert.deepEqual(source.requests.map((item) => item.url.pathname), [
      '/alpha/graph/neighborhood',
      '/bad-private-path/graph/neighborhood',
    ])
    assert.doesNotMatch(serialized, /bad-private-path/)
    assert.doesNotMatch(serialized, /127\.0\.0\.1/)
    assert.doesNotMatch(serialized, /raw upstream body/)
    assert.doesNotMatch(serialized, /sk-secret-source/)
    assert.doesNotMatch(serialized, /private-source\.example\.test/)
    assert.doesNotMatch(serialized, /user:pass/)
    assert.doesNotMatch(serialized, /sourceHandler/)
    assert.doesNotMatch(serialized, /\bat .*:\d+:\d+/)
  })

  it('GOV/OBS returns redacted source-tool errors when graph neighbors source policy blocks a selected source', async (t) => {
    const originalFetch = globalThis.fetch
    const unsafeSourceUrl = 'http://192.168.80.10:8765/private-source?token=source-secret'
    const sourceRequests = []
    let bridge

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (bridge && url.href.startsWith(`${bridge.url}/`)) return originalFetch(input, init)

      sourceRequests.push({ url, body: parseJsonFetchBody(init.body) })
      return jsonFetchResponse(200, { nodes: [] })
    }

    t.after(async () => {
      globalThis.fetch = originalFetch
      if (bridge) await closeServer(bridge.server)
    })

    bridge = await startAgentBridge({
      port: 0,
      sourcePolicy: 'allowlist',
      registeredSources: [
        knowledgeSource('blocked', 'Blocked Source', 'llmwiki-http', unsafeSourceUrl),
      ],
      logger: silentLogger,
    })

    const blocked = await callBridgeMcpTool(bridge, 'blocked-neighbors', 'llmwiki_graph_neighbors', {
      sourceId: 'blocked',
      nodeId: 'blocked:topic',
    })
    const sourceError = blocked.result.structuredContent.llmwiki_source_error
    const serialized = JSON.stringify(blocked)

    assert.equal(blocked.error, undefined)
    assert.equal(blocked.result.isError, true)
    assert.equal(sourceError.tool, 'llmwiki_graph_neighbors')
    assert.equal(sourceError.message, 'Knowledge Source URL is not allowed by this bridge source policy.')
    assert.equal(blocked.result.content[0].text, sourceError.message)
    assert.equal(blocked.result.structuredContent.llmwiki_graph_neighbors, undefined)
    assert.equal(sourceRequests.length, 0)
    assert.doesNotMatch(serialized, /192\.168\.80\.10/)
    assert.doesNotMatch(serialized, /source-secret/)
    assert.doesNotMatch(serialized, /private-source/)
    assert.doesNotMatch(serialized, /\bat .*:\d+:\d+/)
  })

  it('returns evidence-only artifacts without calling runtime and includes safe source bundle metadata', async (t) => {
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      if (url.pathname === '/source-bundle') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, {
          source_id: 'bundle-source',
          bundle_id: 'release-bundle',
          title: 'Release Bundle Source',
          capabilities: ['llmwiki_context', 'graph'],
          adapter: 'llmwiki-http-fixture',
          implementation: 'fixture-server',
          projection: {
            signature: 'sha256:release',
            page_count: 4,
            approved_page_count: 3,
            graph_node_count: 12,
            graph_edge_count: 7,
            localRoot: 'Z:\\fixture-private\\bundle',
            visible: 'strip-me',
            apiKey: 'sk-secret',
          },
          raw_origins: {
            enabled: false,
            metadata_only: true,
            public_root_labels: ['raw'],
            path: 'Z:\\fixture-private\\raw',
            root: '/private/source/root',
            locator: { path: '/private/source/locator' },
            bearerToken: 'raw-origin-secret',
          },
          source_refs: [
            {
              id: 'src-hot',
              label: 'SRC-HOT',
              kind: 'source_ref',
              uri: 'llmwiki://user:pass@bundle-source/source-refs/src-hot?token=source-secret-query#source-secret-fragment',
              linked_pages: ['private-linked.md'],
              linked_page_ids: ['manifest-page'],
              locator: { path: 'Z:\\fixture-private\\src-hot.md' },
            },
            {
              id: 'src-cold',
              label: 'SRC-COLD',
              kind: 'source_ref',
              uri: 'urn:llmwiki:source-ref:src-cold',
            },
            {
              id: 'src-unsafe-urn',
              label: 'SRC-UNSAFE-URN',
              kind: 'source_ref',
              uri: 'urn://urn-user:urn-pass@bundle-source/source-refs/src-bad?token=urn-secret-query#urn-secret-fragment',
            },
            {
              id: 'src-path-urn',
              label: 'SRC-PATH-URN',
              kind: 'source_ref',
              uri: 'urn:llmwiki:C:/fixture-private/raw.pdf',
            },
          ],
          bearerToken: 'bearer-token-secret',
        })
        return
      }

      if (url.pathname === '/manifest') {
        response.statusCode = 500
        response.end('manifest should not be called when source-bundle succeeds')
        return
      }

      if (url.pathname === '/missing/source-bundle') {
        assert.equal(request.method, 'GET')
        writeJson(response, 404, { error: 'not found' })
        return
      }

      if (url.pathname === '/missing/manifest') {
        assert.equal(request.method, 'GET')
        writeJson(response, 404, { error: 'not found' })
        return
      }

      assert.equal(request.method, 'POST')
      if (url.pathname === '/search' || url.pathname === '/missing/search') {
        writeJson(response, 200, { results: [] })
        return
      }

      assert(url.pathname === '/query' || url.pathname === '/missing/query')
      const missing = url.pathname.startsWith('/missing')
      writeJson(response, 200, {
        wiki_title: missing ? 'Missing Manifest Wiki' : 'Manifest Wiki',
        evidence: [
          {
            page_id: 'shared-page',
            title: 'Shared Evidence',
            path: 'shared.md',
            snippet: `Evidence-only citation for ${body.query}.`,
            source_refs: [missing ? 'SRC-MISSING' : 'SRC-MANIFEST'],
          },
        ],
        graph: {
          nodes: [{ id: 'page:shared', label: 'Shared Evidence' }],
          edges: [],
        },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ response }) => {
      writeJson(response, 500, { error: 'runtime should not be called' })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Collect evidence without runtime delegation.',
          mode: 'evidence-only',
          knowledgeSources: [
            knowledgeSource('manifest-wiki', 'Manifest Wiki', 'llmwiki-http', source.url),
            knowledgeSource('missing-manifest', 'Missing Manifest Wiki', 'llmwiki-http', `${source.url}/missing`),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const serialized = JSON.stringify(artifact)

    assert.equal(response.status, 200)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/source-bundle').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/manifest').length, 0)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/missing/source-bundle').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/missing/manifest').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/missing/query').length, 1)
    assert.equal(hermes.requests.length, 0)
    assert.match(artifact.answer, /^Evidence-only result:/)
    assert.equal(artifact.orchestrationMode, 'evidence-only')
    assert.deepEqual(artifact.citations.map((citation) => citation.id), [
      'manifest-wiki:shared-page',
      'missing-manifest:shared-page',
    ])
    assert.equal(artifact.citations.some((citation) => citation.id === 'shared-page'), false)
    assert.deepEqual(artifact.graph.nodes.map((node) => node.id), [
      'manifest-wiki:page:shared',
      'missing-manifest:page:shared',
    ])
    assert.equal(artifact.graph.nodes.some((node) => node.id === 'page:shared'), false)
    assert.equal(artifact.steps.find((step) => step.id === 'runtime-chat-completions'), undefined)
    assert.deepEqual(
      artifact.steps
        .filter((step) => step.id.startsWith('tool-') && step.connectionId)
        .map((step) => step.connectionId),
      ['manifest-wiki', 'missing-manifest'],
    )
    for (const expected of [
      {
        stepId: 'tool-manifest_wiki',
        connectionId: 'manifest-wiki',
        toolName: 'llmwiki_context__manifest_wiki',
        citationId: 'manifest-wiki:shared-page',
        sourceRef: 'SRC-MANIFEST',
      },
      {
        stepId: 'tool-missing_manifest',
        connectionId: 'missing-manifest',
        toolName: 'llmwiki_context__missing_manifest',
        citationId: 'missing-manifest:shared-page',
        sourceRef: 'SRC-MISSING',
      },
    ]) {
      const sourceStep = artifact.steps.find(
        (step) => step.id === expected.stepId && step.connectionId === expected.connectionId,
      )
      assert.ok(sourceStep)
      assert.equal(sourceStep.status, 'done')
      assert.equal(sourceStep.parentId, 'bridge-plan')
      assert.equal(sourceStep.toolName, expected.toolName)
      assert.deepEqual(sourceStep.citationIds, [expected.citationId])
      assert.deepEqual(sourceStep.citationRefs, [
        {
          id: expected.citationId,
          title: 'Shared Evidence',
          path: 'shared.md',
          sourceRefs: [expected.sourceRef],
        },
      ])
      assert.match(sourceStep.detail, /shared\.md \(Shared Evidence\)/)
    }
    assert.equal(artifact.steps.find((step) => step.id === 'source-manifest-manifest_wiki').status, 'done')
    assert.equal(artifact.steps.find((step) => step.id === 'source-manifest-missing_manifest').status, 'error')
    assert.equal(artifact.steps.find((step) => step.id === 'source-manifest-missing_manifest').error, 'Source bundle unavailable.')
    assert.equal(artifact.sourceBundles.length, 1)
    assert.deepEqual(artifact.sourceBundles[0], {
      connectionId: 'manifest-wiki',
      sourceId: 'bundle-source',
      bundleId: 'release-bundle',
      title: 'Release Bundle Source',
      capabilities: ['llmwiki_context', 'graph'],
      adapter: 'llmwiki-http-fixture',
      implementation: 'fixture-server',
      projection: {
        signature: 'sha256:release',
        pageCount: 4,
        approvedPageCount: 3,
        graphNodeCount: 12,
        graphEdgeCount: 7,
      },
      rawOrigins: {
        enabled: false,
        metadataOnly: true,
        publicRootLabelCount: 1,
      },
      sourceRefs: [
        {
          id: 'src-hot',
          label: 'SRC-HOT',
          type: 'source_ref',
          uri: 'llmwiki://bundle-source/source-refs/src-hot',
        },
        {
          id: 'src-cold',
          label: 'SRC-COLD',
          type: 'source_ref',
          uri: 'urn:llmwiki:source-ref:src-cold',
        },
        {
          id: 'src-unsafe-urn',
          label: 'SRC-UNSAFE-URN',
          type: 'source_ref',
        },
        {
          id: 'src-path-urn',
          label: 'SRC-PATH-URN',
          type: 'source_ref',
        },
      ],
      sourceRefCount: 4,
    })
    assert.doesNotMatch(serialized, /localRoot/)
    assert.doesNotMatch(serialized, /strip-me/)
    assert.doesNotMatch(serialized, /private-linked\.md/)
    assert.doesNotMatch(serialized, /fixture-private\\src-hot\.md/)
    assert.doesNotMatch(serialized, /\/private\/source/)
    assert.doesNotMatch(serialized, /manifest-secret/)
    assert.doesNotMatch(serialized, /bearer-token-secret/)
    assert.doesNotMatch(serialized, /sk-secret/)
    assert.doesNotMatch(serialized, /user:pass/)
    assert.doesNotMatch(serialized, /source-secret-query/)
    assert.doesNotMatch(serialized, /source-secret-fragment/)
    assert.doesNotMatch(serialized, /urn-user/)
    assert.doesNotMatch(serialized, /urn-pass/)
    assert.doesNotMatch(serialized, /urn-secret-query/)
    assert.doesNotMatch(serialized, /urn-secret-fragment/)
    assert.doesNotMatch(serialized, /raw\.pdf/)
    assert.doesNotMatch(serialized, /\/private/)
  })

  it('bounds evidence-only multi-source fan-out without changing source order or failure semantics', async (t) => {
    const delayMs = 180
    const sourceIds = ['alpha-wiki', 'beta-wiki', 'gamma-wiki', 'delta-wiki', 'epsilon-wiki', 'zeta-wiki']
    const failingSourceId = 'beta-wiki'
    let activeQueries = 0
    let maxActiveQueries = 0

    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      const [sourceId, action] = url.pathname.split('/').filter(Boolean)
      assert(sourceIds.includes(sourceId))

      if (action === 'source-bundle') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, {
          source_id: `${sourceId}-bundle-source`,
          bundle_id: `${sourceId}-bundle`,
          title: `${sourceId} Bundle`,
          capabilities: ['llmwiki_context'],
        })
        return
      }

      if (action === 'search') {
        assert.equal(request.method, 'POST')
        writeJson(response, 200, { results: [] })
        return
      }

      assert.equal(action, 'query')
      assert.equal(request.method, 'POST')
      activeQueries += 1
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries)
      try {
        await delay(delayMs)
      } finally {
        activeQueries -= 1
      }

      if (sourceId === failingSourceId) {
        writeJson(response, 500, { error: 'delayed source secret sk-secret-fanout' })
        return
      }

      writeJson(response, 200, {
        wiki_title: `${sourceId} Wiki`,
        evidence: [
          {
            page_id: `${sourceId}-page`,
            title: `${sourceId} Evidence`,
            path: `${sourceId}.md`,
            snippet: `Evidence from ${sourceId} for ${body.query}.`,
          },
        ],
        graph: {
          nodes: [{ id: `page:${sourceId}`, label: sourceId }],
          edges: [],
        },
      })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const started = performance.now()
    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'fanout latency failure semantics',
          orchestrationMode: 'evidence-only',
          knowledgeSources: sourceIds.map((sourceId) => knowledgeSource(
            sourceId,
            sourceId.replace(/-/g, ' '),
            'llmwiki-http',
            `${source.url}/${sourceId}`,
          )),
        },
      }),
    })
    const elapsedMs = performance.now() - started
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const successfulSourceIds = sourceIds.filter((sourceId) => sourceId !== failingSourceId)
    const serialized = JSON.stringify(artifact)

    assert.equal(response.status, 200)
    assert(maxActiveQueries > 1)
    assert(maxActiveQueries <= 4)
    assert(
      elapsedMs < delayMs * sourceIds.length * 0.75,
      `expected parallel fan-out below serial latency; elapsed ${Math.round(elapsedMs)}ms`,
    )
    assert.equal(source.requests.filter((item) => item.url.pathname.endsWith('/source-bundle')).length, sourceIds.length)
    assert.equal(source.requests.filter((item) => item.url.pathname.endsWith('/query')).length, sourceIds.length)
    assert.match(artifact.answer, /Evidence-only result: the bridge gathered 5 citation\(s\) from 5 Knowledge Source\(s\)/)
    assert.match(artifact.answer, /Source failures: 1 selected source\(s\) could not be queried/)
    assert.equal(artifact.steps.some((step) => step.id === 'runtime-chat-completions'), false)
    assert.deepEqual(artifact.citations.map((citation) => citation.id), successfulSourceIds.map((sourceId) => (
      `${sourceId}:${sourceId}-page`
    )))
    assert.deepEqual(artifact.graph.nodes.map((node) => node.id), successfulSourceIds.map((sourceId) => (
      `${sourceId}:page:${sourceId}`
    )))
    assert.deepEqual(artifact.sourceBundles.map((bundle) => bundle.connectionId), sourceIds)
    assert.deepEqual(artifact.steps.map((item) => item.id), [
      'bridge-plan',
      ...sourceIds.flatMap((sourceId) => [
        `tool-${testSafeId(sourceId)}`,
        `source-manifest-${testSafeId(sourceId)}`,
      ]),
      'bridge-evidence',
      'bridge-evidence-only-answer',
      'bridge-final-answer',
    ])

    const failedStep = artifact.steps.find((step) => step.id === `tool-${testSafeId(failingSourceId)}`)
    assert.equal(failedStep.status, 'error')
    assert.equal(failedStep.error, 'Source query failed.')
    assert.equal(failedStep.diagnostic.schemaVersion, 'llmwiki.agent-bridge.diagnostic.v1')
    assert.equal(failedStep.diagnostic.scope, 'source')
    assert.equal(failedStep.diagnostic.phase, 'query')
    assert.equal(failedStep.diagnostic.protocol, 'llmwiki-http')
    assert.equal(failedStep.diagnostic.subject, failingSourceId)
    assert.equal(failedStep.diagnostic.redacted, true)
    assert.equal(observationValue(failedStep.diagnostic, 'httpStatus'), '500')
    assert.deepEqual(artifact.diagnostics, [failedStep.diagnostic])
    assert.doesNotMatch(serialized, /sk-secret-fanout/)
    assert.doesNotMatch(serialized, /delayed source secret/)
  })

  it('falls back to legacy manifest when source-bundle response lacks bundle metadata', async (t) => {
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      if (url.pathname === '/source-bundle') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, { status: 'ok' })
        return
      }

      if (url.pathname === '/manifest') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, {
          source_id: 'legacy-manifest-source',
          bundle_id: 'legacy-bundle',
          capabilities: ['llmwiki_context'],
          projection: {
            signature: 'sha256:legacy',
          },
        })
        return
      }

      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }

      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Legacy Manifest Wiki',
        evidence: [
          {
            page_id: 'legacy-page',
            title: 'Legacy Manifest Evidence',
            path: 'legacy.md',
            snippet: `Legacy manifest evidence for ${body.query}.`,
          },
        ],
      })
    })
    t.after(() => closeServer(source.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Use legacy source discovery.',
          orchestrationMode: 'evidence-only',
          knowledgeSources: [
            knowledgeSource('legacy-wiki', 'Legacy Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data

    assert.equal(response.status, 200)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/source-bundle').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/manifest').length, 1)
    assert.equal(artifact.sourceBundles.length, 1)
    assert.equal(artifact.sourceBundles[0].sourceId, 'legacy-manifest-source')
    assert.equal(artifact.sourceBundles[0].bundleId, 'legacy-bundle')
  })

  it('queries HTTP, MCP, and A2A sources and includes safe MCP source bundles before sending source evidence to chat completions', async (t) => {
    const httpSource = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'HTTP Wiki',
        orientation: [{ title: 'HTTP Index', role: 'index', snippet: 'HTTP orientation.' }],
        evidence: [
          {
            page_id: 'release',
            title: 'Release Runbook',
            path: 'release.md',
            snippet: `HTTP evidence for ${body.query}.`,
            source_refs: ['HTTP-1'],
          },
        ],
        limitations: ['HTTP limitation.'],
        graph: {
          nodes: [{ id: 'page:release', label: 'Release', kind: 'topic', path: 'release.md' }],
          edges: [],
        },
      })
    })
    t.after(() => closeServer(httpSource.server))

    const mcpSource = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      assert.equal(url.pathname, '/mcp')
      assert.equal(body.method, 'tools/call')
      if (body.params.name === 'llmwiki_source_bundle') {
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            structuredContent: {
              source_id: 'mcp-bundle-source',
              bundle_id: 'mcp-bundle',
              title: 'MCP Bundle Source',
              capabilities: ['llmwiki_source_bundle', 'llmwiki_context'],
              adapter: 'mcp-fixture',
              projection: {
                signature: 'sha256:mcp',
                page_count: 9,
                approved_page_count: 8,
                graph_node_count: 22,
                graph_edge_count: 17,
                workspace: 'Z:\\fixture-private\\mcp-workspace',
              },
              raw_origins: {
                enabled: false,
                metadata_only: true,
                public_root_labels: ['sources', 'raw'],
                root: 'Z:\\fixture-private\\mcp-root',
                locator: { path: '/private/mcp/locator' },
              },
              source_refs: [
                {
                  id: 'mcp-src',
                  label: 'MCP-SRC',
                  kind: 'source_ref',
                  uri: 'llmwiki://mcp-user:mcp-pass@mcp-bundle-source/source-refs/mcp-src?token=mcp-secret-query#mcp-secret-fragment',
                  linked_pages: ['mcp-private.md'],
                  locator: { path: 'Z:\\fixture-private\\mcp-src.md' },
                },
              ],
            },
          },
        })
        return
      }
      assert.equal(body.params.name, 'llmwiki_context')
      writeJson(response, 200, {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            wiki_title: 'MCP Wiki',
            evidence: [
              {
                page_id: 'handoff',
                title: 'Handoff Checklist',
                path: 'handoff.md',
                snippet: `MCP evidence for ${body.params.arguments.query}.`,
                source_refs: ['MCP-1'],
              },
            ],
            graph: {
              nodes: [{ id: 'page:handoff', label: 'Handoff', kind: 'topic', path: 'handoff.md' }],
              edges: [],
            },
          },
        },
      })
    })
    t.after(() => closeServer(mcpSource.server))

    const a2aSource = await startFixtureServer(async ({ request, url, body, response }) => {
      if (request.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        writeJson(response, 200, { name: 'A2A Source', url: '/message:send' })
        return
      }
      assert.equal(request.method, 'POST')
      assert.equal(url.pathname, '/message:send')
      writeJson(response, 200, {
        status: { state: 'completed' },
        artifacts: [
          {
            name: 'llmwiki_context',
            parts: [
              {
                kind: 'data',
                data: {
                  wiki_title: 'A2A Wiki',
                  evidence: [
                    {
                      page_id: 'playbook',
                      title: 'A2A Playbook',
                      path: 'playbook.md',
                      snippet: `A2A evidence for ${body.data.query}.`,
                      source_refs: ['A2A-1'],
                    },
                  ],
                  graph: {
                    nodes: [{ id: 'page:playbook', label: 'Playbook', kind: 'topic', path: 'playbook.md' }],
                    edges: [],
                  },
                },
              },
            ],
          },
        ],
      })
    })
    t.after(() => closeServer(a2aSource.server))

    const hermes = await startFixtureServer(async ({ request, url, body, headers, response }) => {
      assert.equal(request.method, 'POST')
      assert.equal(url.pathname, '/v1/chat/completions')
      assert.equal(headers.authorization, 'Bearer test-secret')
      writeJson(response, 200, {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Grounded **agent** answer.',
            },
          },
        ],
      })
      hermes.lastBody = body
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1////`,
      hermesApiKey: 'test-secret',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'What is ready for release?',
          orchestrationMode: 'delegated-runtime',
          knowledgeSources: [
            knowledgeSource('http-wiki', 'HTTP Wiki', 'llmwiki-http', `${httpSource.url}////`),
            {
              ...knowledgeSource('mcp-wiki', 'MCP Wiki', 'mcp', `${mcpSource.url}////`),
              capabilities: ['llmwiki_context', 'llmwiki_source_bundle'],
            },
            knowledgeSource('a2a-wiki', 'A2A Wiki', 'a2a', `${a2aSource.url}////`),
            { ...knowledgeSource('draft', 'Draft Wiki', 'llmwiki-http', httpSource.url), status: 'unknown' },
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const renderedEvidenceBundle = extractHermesEvidenceBundleForPrompt(hermesUserMessage)
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)
    const mcpArtifactBundle = artifact.sourceBundles.find((bundle) => bundle.connectionId === 'mcp-wiki')
    const mcpRuntimeSource = evidenceBundle.sources.find((source) => source.id === 'mcp-wiki')
    const mcpToolCalls = mcpSource.requests.map((item) => item.body.params?.name)

    assert.equal(response.status, 200)
    assert.equal(httpSource.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(httpSource.requests.filter((item) => item.url.pathname === '/search').length, 1)
    assert.deepEqual(mcpToolCalls, ['llmwiki_source_bundle', 'llmwiki_context'])
    assert.equal(mcpSource.requests.filter((item) => item.body.params?.name === 'llmwiki_source_bundle').length, 1)
    assert.equal(mcpSource.requests.filter((item) => item.body.params?.name === 'llmwiki_context').length, 1)
    assert.equal(a2aSource.requests.filter((item) => item.url.pathname === '/.well-known/agent-card.json').length, 1)
    assert.equal(a2aSource.requests.filter((item) => item.url.pathname === '/message:send').length, 1)
    assert.equal(hermes.requests.length, 1)
    assert.equal(hermes.lastBody.model, 'hermes-agent')
    assert.match(hermesUserMessage, /HTTP evidence/)
    assert.match(hermesUserMessage, /MCP evidence/)
    assert.match(hermesUserMessage, /A2A evidence/)
    assert.match(hermesUserMessage, /Release Runbook/)
    assert.equal(renderedEvidenceBundle, JSON.stringify(evidenceBundle))
    assert.equal(renderedEvidenceBundle.includes('\n'), false)
    assert.doesNotMatch(renderedEvidenceBundle, /\{\n\s+"/)
    assert.deepEqual(mcpArtifactBundle, {
      connectionId: 'mcp-wiki',
      sourceId: 'mcp-bundle-source',
      bundleId: 'mcp-bundle',
      title: 'MCP Bundle Source',
      capabilities: ['llmwiki_source_bundle', 'llmwiki_context'],
      adapter: 'mcp-fixture',
      implementation: 'test-fixture',
      projection: {
        signature: 'sha256:mcp',
        pageCount: 9,
        approvedPageCount: 8,
        graphNodeCount: 22,
        graphEdgeCount: 17,
      },
      rawOrigins: {
        enabled: false,
        metadataOnly: true,
        publicRootLabelCount: 2,
      },
      sourceRefs: [
        {
          id: 'mcp-src',
          label: 'MCP-SRC',
          type: 'source_ref',
          uri: 'llmwiki://mcp-bundle-source/source-refs/mcp-src',
        },
      ],
      sourceRefCount: 1,
    })
    assert.equal(evidenceBundle.sourceBundles, undefined)
    assert.equal(mcpRuntimeSource.sourceBundle, undefined)
    assert.deepEqual(mcpRuntimeSource.citationIndexes, [2])
    assert.doesNotMatch(hermesUserMessage, /mcp-workspace/)
    assert.doesNotMatch(hermesUserMessage, /mcp-root/)
    assert.doesNotMatch(hermesUserMessage, /mcp-private\.md/)
    assert.doesNotMatch(hermesUserMessage, /mcp-src\.md/)
    assert.doesNotMatch(hermesUserMessage, /\/private\/mcp/)
    assert.doesNotMatch(hermesUserMessage, /mcp-user/)
    assert.doesNotMatch(hermesUserMessage, /mcp-pass/)
    assert.doesNotMatch(hermesUserMessage, /mcp-secret-query/)
    assert.doesNotMatch(hermesUserMessage, /mcp-secret-fragment/)
    assert.doesNotMatch(JSON.stringify(artifact.sourceBundles), /mcp-user/)
    assert.doesNotMatch(JSON.stringify(artifact.sourceBundles), /mcp-pass/)
    assert.doesNotMatch(JSON.stringify(artifact.sourceBundles), /mcp-secret-query/)
    assert.doesNotMatch(JSON.stringify(artifact.sourceBundles), /mcp-secret-fragment/)
    assert.equal(artifact.answer, expectedFallbackAnswer('Grounded **agent** answer.', 3))
    assert.equal(artifact.orchestrationMode, 'delegated-runtime')
    assert.deepEqual(artifact.citations.map((citation) => citation.id), [
      'http-wiki:release',
      'mcp-wiki:handoff',
      'a2a-wiki:playbook',
    ])
    assert.deepEqual(artifact.graph.nodes.map((node) => node.id), [
      'http-wiki:page:release',
      'mcp-wiki:page:handoff',
      'a2a-wiki:page:playbook',
    ])
    assert.equal(artifact.steps.find((step) => step.id === 'tool-http_wiki').status, 'done')
    assert.equal(artifact.steps.find((step) => step.id === 'tool-mcp_wiki').status, 'done')
    assert.equal(artifact.steps.find((step) => step.id === 'source-manifest-mcp_wiki').status, 'done')
    assert.equal(artifact.steps.find((step) => step.id === 'tool-a2a_wiki').status, 'done')
    assert.equal(artifact.steps.find((step) => step.id === 'runtime-chat-completions').status, 'done')
  })

  it('continues when MCP source bundle discovery errors and llmwiki_context succeeds', async (t) => {
    const mcpSource = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      assert.equal(url.pathname, '/mcp')
      assert.equal(body.method, 'tools/call')

      if (body.params.name === 'llmwiki_source_bundle') {
        writeJson(response, 200, {
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32000,
            message: 'source bundle unavailable with token mcp-bundle-secret',
          },
        })
        return
      }

      assert.equal(body.params.name, 'llmwiki_context')
      writeJson(response, 200, {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            wiki_title: 'MCP Error Wiki',
            evidence: [
              {
                page_id: 'ok',
                title: 'MCP Context Evidence',
                path: 'context.md',
                snippet: `MCP context evidence for ${body.params.arguments.query}.`,
                source_refs: ['MCP-OK'],
              },
            ],
            graph: {
              nodes: [{ id: 'page:ok', label: 'OK', kind: 'topic' }],
              edges: [],
            },
          },
        },
      })
    })
    t.after(() => closeServer(mcpSource.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: 'http://127.0.0.1:1/v1',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Use MCP context even when bundle discovery fails.',
          mode: 'evidence-only',
          knowledgeSources: [
            {
              ...knowledgeSource('mcp-error-wiki', 'MCP Error Wiki', 'mcp', mcpSource.url),
              capabilities: ['llmwiki_source_bundle', 'llmwiki_context'],
            },
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const mcpToolCalls = mcpSource.requests.map((item) => item.body.params?.name)
    const bundleStep = artifact.steps.find((item) => item.connectionId === 'mcp-error-wiki' && item.id.startsWith('source-manifest-'))

    assert.equal(response.status, 200)
    assert.deepEqual(mcpToolCalls, ['llmwiki_source_bundle', 'llmwiki_context'])
    assert.equal(artifact.sourceBundles.length, 0)
    assert.equal(artifact.citations[0].id, 'mcp-error-wiki:ok')
    assert.equal(artifact.steps.find((step) => step.id === 'tool-mcp_error_wiki').status, 'done')
    assert.equal(bundleStep.status, 'error')
    assert.equal(bundleStep.error, 'Source bundle unavailable.')
    assert.doesNotMatch(JSON.stringify(artifact), /mcp-bundle-secret/)
  })

  it('runs hybrid mode through source retrieval and runtime synthesis', async (t) => {
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, url.pathname === '/source-bundle' ? 'GET' : 'POST')
      if (url.pathname === '/source-bundle') {
        writeJson(response, 200, {
          source_id: 'hybrid-source',
          bundle_id: 'hybrid-bundle',
          capabilities: ['llmwiki_context'],
        })
        return
      }
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Hybrid Wiki',
        evidence: [
          {
            page_id: 'hybrid-release',
            title: 'Hybrid Release Notes',
            path: 'hybrid-release.md',
            snippet: `Hybrid evidence for ${body.query}.`,
            source_refs: ['HYBRID-1'],
          },
        ],
        graph: {
          nodes: [{ id: 'page:hybrid-release', label: 'Hybrid Release', kind: 'topic' }],
          edges: [],
        },
      })
    })
    t.after(() => closeServer(source.server))

    const runtime = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      assert.equal(url.pathname, '/v1/chat/completions')
      writeJson(response, 200, {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hybrid grounded answer.',
            },
          },
        ],
      })
      runtime.lastBody = body
    })
    t.after(() => closeServer(runtime.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${runtime.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Check hybrid release readiness.',
          mode: 'hybrid',
          knowledgeSources: [
            knowledgeSource('hybrid-wiki', 'Hybrid Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const runtimeUserMessage = runtime.lastBody.messages.find((message) => message.role === 'user').content

    assert.equal(response.status, 200)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/query').length, 1)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/search').length, 1)
    assert.equal(runtime.requests.length, 1)
    assert.equal(artifact.answer, expectedFallbackAnswer('Hybrid grounded answer.', 1))
    assert.equal(artifact.orchestrationMode, 'hybrid')
    assert.equal(artifact.citations[0].id, 'hybrid-wiki:hybrid-release')
    assert.equal(artifact.sourceBundles[0].sourceId, 'hybrid-source')
    assert.equal(artifact.steps.find((step) => step.id === 'tool-hybrid_wiki').status, 'done')
    assert.equal(artifact.steps.find((step) => step.id === 'runtime-chat-completions').status, 'done')
    assert.match(runtimeUserMessage, /Hybrid evidence/)
  })

  it('keeps graph payloads and source bundles out of runtime prompts while preserving full artifacts', async (t) => {
    const graphNodes = Array.from({ length: 60 }, (_, index) => ({
      id: `page:${index + 1}`,
      label: `Page ${index + 1}`,
      kind: 'topic',
      path: `pages/${index + 1}.md`,
      metadata: {
        marker: 'FULL_GRAPH_METADATA_SENTINEL',
        detail: 'runtime prompt should not inline graph node metadata',
      },
    }))
    const sourceRefs = Array.from({ length: 40 }, (_, index) => ({
      id: `src-${index + 1}`,
      label: index === 39 ? 'FULL_SOURCE_BUNDLE_REF_SENTINEL' : `SRC-${index + 1}`,
      type: 'source_ref',
      uri: `urn:llmwiki:source-ref:src-${index + 1}`,
    }))
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      if (url.pathname === '/source-bundle') {
        assert.equal(request.method, 'GET')
        writeJson(response, 200, {
          source_id: 'large-bundle-source',
          bundle_id: 'large-runtime-bundle',
          title: 'Large Runtime Bundle',
          source_refs: sourceRefs,
        })
        return
      }

      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Runtime Prompt Wiki',
        evidence: [
          {
            page_id: 'answerable',
            title: 'Answerable Evidence',
            path: 'answerable.md',
            snippet: `Answerable evidence for ${body.query}.`,
          },
        ],
        graph: {
          nodes: graphNodes,
          edges: [{ source: 'page:1', target: 'page:2', relation: 'links', metadata: { marker: 'FULL_GRAPH_METADATA_SENTINEL' } }],
        },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Runtime prompt answer.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'What can be answered without inlining graph payloads?',
          knowledgeSources: [
            knowledgeSource('runtime-wiki', 'Runtime Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)

    assert.equal(response.status, 200)
    assert.equal(artifact.citations.length, 1)
    assert.equal(artifact.graph.nodes.length, 60)
    assert.equal(artifact.graph.nodes[0].metadata.marker, 'FULL_GRAPH_METADATA_SENTINEL')
    assert.equal(artifact.sourceBundles[0].sourceRefs.length, 40)
    assert.equal(artifact.sourceBundles[0].sourceRefs[39].label, 'FULL_SOURCE_BUNDLE_REF_SENTINEL')
    assert.equal(evidenceBundle.schema, 'llmwiki-agent-bridge.answer-evidence.v1')
    assert.deepEqual(evidenceBundle.sources[0].citationIndexes, [1])
    assert.equal(evidenceBundle.sources[0].graph.nodeCount, 60)
    assert.equal(evidenceBundle.sources[0].graph.nodes, undefined)
    assert.equal(evidenceBundle.sourceBundles, undefined)
    assert.doesNotMatch(hermesUserMessage, /FULL_GRAPH_METADATA_SENTINEL/)
    assert.doesNotMatch(hermesUserMessage, /FULL_SOURCE_BUNDLE_REF_SENTINEL/)
  })

  it('keeps corpus page counts distinct from graph node counts in Hermes evidence', async (t) => {
    const graphNodes = Array.from({ length: 120 }, (_, index) => ({
      id: `page:${index + 1}`,
      label: `Page ${index + 1}`,
      kind: 'topic',
      path: `pages/${index + 1}.md`,
    }))
    const source = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Large Corpus Wiki',
        description: 'Large approved corpus with a bounded graph projection.',
        adapter: 'obsidian',
        implementation: 'Obsidian vault',
        page_count: 1600,
        approved_page_count: 1500,
        orientation: [{ title: 'Large Corpus Index', role: 'index', snippet: 'Start with the large corpus index.' }],
        evidence: [
          {
            page_id: 'overview',
            title: 'Large Corpus Overview',
            path: 'overview.md',
            snippet: 'The corpus has many approved pages while the graph projection is capped.',
            source_refs: ['LARGE-1'],
          },
        ],
        graph: {
          nodes: graphNodes,
          edges: [],
        },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Large corpus answer.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'How many approved pages are available in the corpus?',
          knowledgeSources: [
            knowledgeSource('large-wiki', 'Large Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)
    const sourceEvidence = evidenceBundle.sources[0]

    assert.equal(response.status, 200)
    assert.equal(artifact.graph.nodes.length, 120)
    assert.equal(sourceEvidence.pageCount, 1600)
    assert.equal(sourceEvidence.approvedPageCount, 1500)
    assert.equal(sourceEvidence.adapter, 'obsidian')
    assert.equal(sourceEvidence.implementation, 'Obsidian vault')
    assert.equal(sourceEvidence.description, 'Large approved corpus with a bounded graph projection.')
    assert.equal(sourceEvidence.graph.nodeCount, 120)
    assert.equal(sourceEvidence.graph.edgeCount, 0)
    assert.equal(sourceEvidence.graph.nodes, undefined)
    assert.equal(evidenceBundle.mergedGraphSummary.nodeCount, 120)
    assert.equal(evidenceBundle.mergedGraphSummary.corpusPageCount, 1600)
    assert.equal(evidenceBundle.mergedGraphSummary.corpusApprovedPageCount, 1500)
    assert.equal(evidenceBundle.mergedCorpusSummary.pageCount, 1600)
    assert.equal(evidenceBundle.mergedCorpusSummary.approvedPageCount, 1500)
    assert.equal(evidenceBundle.mergedCorpusSummary.sources[0].approvedPageCount, 1500)
    assert.notEqual(evidenceBundle.mergedGraphSummary.nodeCount, evidenceBundle.mergedCorpusSummary.approvedPageCount)
  })

  it('augments llmwiki-http query evidence with compact search variants', async (t) => {
    const query = 'What decision was recorded about the LLMWiki protocol layer architecture? Answer briefly and cite the relevant wiki page.'
    const searchBodies = []
    const source = await startFixtureServer(async ({ request, url, body, response }) => {
      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        searchBodies.push(body)
        assert.equal(body.limit, 4)
        writeJson(response, 200, {
          results: body.query === 'llmwiki protocol layer architecture decision'
            ? [
                {
                  page_id: 'adr-protocol-layer',
                  title: 'ADR: LLMWiki Protocol Layer Architecture',
                  path: 'docs/adr/protocol-layer-architecture.md',
                  snippet: 'Decision: keep the LLMWiki protocol layer as a small stable contract around query, search, read, graph, MCP, and A2A surfaces.',
                  source_refs: ['ADR-PROTOCOL-LAYER'],
                },
              ]
            : [],
        })
        return
      }

      assert.equal(url.pathname, '/query')
      assert.equal(body.query, query)
      assert.equal(body.limit, 8)
      writeJson(response, 200, {
        wiki_title: 'Protocol Wiki',
        orientation: [{ title: 'Protocol Map', role: 'index', snippet: 'Start with the protocol map.' }],
        evidence: [
          {
            page_id: 'protocol-overview',
            title: 'LLMWiki Protocol Overview',
            path: 'docs/protocol-overview.md',
            snippet: 'Overview of bridge routes and client responsibilities, without the architecture decision record.',
          },
        ],
        limitations: ['Primary query did not include all ADRs.'],
        graph: {
          nodes: [{ id: 'page:protocol-overview', label: 'Protocol Overview', kind: 'topic', path: 'docs/protocol-overview.md' }],
          edges: [],
        },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Protocol architecture decision answer.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query,
          knowledgeSources: [
            knowledgeSource('protocol-wiki', 'Protocol Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)

    assert.equal(response.status, 200)
    assert.deepEqual(searchBodies.map((body) => body.query), [
      'llmwiki protocol layer architecture decision',
      'decision llmwiki protocol layer architecture',
    ])
    assert.deepEqual(artifact.citations.map((citation) => citation.id), [
      'protocol-wiki:protocol-overview',
      'protocol-wiki:adr-protocol-layer',
    ])
    assert.deepEqual(evidenceBundle.sources[0].citationIndexes, [1, 2])
    assert.equal(evidenceBundle.sources[0].orientation[0].title, 'Protocol Map')
    assert.deepEqual(evidenceBundle.sources[0].limitations, ['Primary query did not include all ADRs.'])
    assert.equal(evidenceBundle.sources[0].graph.nodeCount, 1)
    assert.equal(evidenceBundle.sources[0].graph.nodes, undefined)
  })

  it('deduplicates llmwiki-http search augmentation citations', async (t) => {
    const source = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, {
          results: [
            {
              page_id: 'adr-protocol-layer',
              title: 'Duplicate ADR by page id',
              path: 'docs/adr/protocol-layer.md',
              snippet: 'Duplicate by page_id.',
            },
            {
              id: 'adr-protocol-layer',
              title: 'Duplicate ADR by id',
              path: 'docs/adr/protocol-layer-copy.md',
              snippet: 'Duplicate by id.',
            },
            {
              page_id: 'supplement',
              title: 'Protocol Supplement',
              path: 'docs/protocol-supplement.md',
              snippet: 'Additional search-only protocol details.',
            },
            {
              page_id: 'supplement-copy',
              title: 'Protocol Supplement Duplicate',
              path: 'docs/protocol-supplement.md',
              snippet: 'Duplicate by path.',
            },
          ],
        })
        return
      }

      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'Duplicate Wiki',
        evidence: [
          {
            page_id: 'adr-protocol-layer',
            title: 'ADR: Protocol Layer',
            path: 'docs/adr/protocol-layer.md',
            snippet: 'Primary ADR evidence.',
          },
        ],
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Deduped answer.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'What decision was recorded about the LLMWiki protocol layer architecture?',
          knowledgeSources: [
            knowledgeSource('dup-wiki', 'Duplicate Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)

    assert.equal(response.status, 200)
    assert.equal(source.requests.filter((item) => item.url.pathname === '/search').length, 2)
    assert.deepEqual(artifact.citations.map((citation) => citation.id), [
      'dup-wiki:adr-protocol-layer',
      'dup-wiki:supplement',
    ])
    assert.deepEqual(evidenceBundle.sources[0].citationIndexes, [1, 2])
  })

  it('ranks query-relevant citations first in the chat completions evidence digest', async (t) => {
    const source = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'POST')
      if (url.pathname === '/search') {
        writeJson(response, 200, { results: [] })
        return
      }
      assert.equal(url.pathname, '/query')
      writeJson(response, 200, {
        wiki_title: 'ADR Wiki',
        evidence: [
          {
            page_id: 'release-notes',
            title: 'Release Notes',
            path: 'notes/release.md',
            snippet: 'General release notes mention packaging, audit status, and routine bridge maintenance.',
          },
          {
            page_id: 'adr-0042',
            title: 'ADR 0042: Hermes Evidence Bundle Citation Digest',
            path: 'docs/adr/0042-hermes-evidence-bundle.md',
            snippet: 'ADR 0042 requires Hermes chat completions prompts to place query relevant citations in a concise citation digest before the complete source JSON.',
            source_refs: ['ADR-0042'],
          },
        ],
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(source.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Answer from ranked digest.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'What does ADR 0042 say about the Hermes evidence bundle?',
          knowledgeSources: [
            knowledgeSource('adr-wiki', 'ADR Wiki', 'llmwiki-http', source.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const hermesSystemMessage = hermes.lastBody.messages.find((message) => message.role === 'system').content
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)

    assert.equal(response.status, 200)
    assert.equal(artifact.answer, expectedFallbackAnswer('Answer from ranked digest.', 2))
    assert.deepEqual(artifact.citations.map((citation) => citation.id), [
      'adr-wiki:release-notes',
      'adr-wiki:adr-0042',
    ])
    assert.deepEqual(evidenceBundle.sources[0].citationIndexes, [1, 2])
    assert.deepEqual(evidenceBundle.citations.map((citation) => citation.id), [
      'adr-wiki:release-notes',
      'adr-wiki:adr-0042',
    ])
    assert.equal(evidenceBundle.citationDigest[0].id, 'adr-wiki:adr-0042')
    assert.equal(evidenceBundle.citationDigest[1].id, 'adr-wiki:release-notes')
    assert.match(hermesSystemMessage, /\[n\]\(#citation-n\)/)
    assert.match(hermesSystemMessage, /1-based index of the matching item in the evidence bundle citations array/)
    assert.match(hermesSystemMessage, /do not use citationDigest order or sourceRefs for numbering/)

    const renderedEvidenceBundle = extractHermesEvidenceBundleForPrompt(hermesUserMessage)
    const digestIndex = renderedEvidenceBundle.indexOf('"citationDigest"')
    const sourcesIndex = renderedEvidenceBundle.indexOf('"sources"')
    const firstRelevantIndex = renderedEvidenceBundle.indexOf('"id":"adr-wiki:adr-0042"')
    const firstSourceOrderIndex = renderedEvidenceBundle.indexOf('"id":"adr-wiki:release-notes"')
    assert(digestIndex >= 0)
    assert(digestIndex < sourcesIndex)
    assert(firstRelevantIndex >= 0)
    assert(firstRelevantIndex < firstSourceOrderIndex)
  })

  it('blocks unlisted private HTTP A2A source message URLs in public-https policy', async (t) => {
    const a2aSource = await startFixtureServer(async ({ request, url, response }) => {
      assert.equal(request.method, 'GET')
      assert.equal(url.pathname, '/.well-known/agent-card.json')
      writeJson(response, 200, { name: 'Unsafe A2A Source', url: 'http://tailnet-source.example.test/message:send' })
    })
    t.after(() => closeServer(a2aSource.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Answer with unsafe source skipped.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      hermesApiKey: 'test-secret',
      sourcePolicy: 'public-https',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Do not call unsafe A2A message URLs.',
          knowledgeSources: [
            knowledgeSource('unsafe-a2a', 'Unsafe A2A Source', 'a2a', a2aSource.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const failedStep = artifact.steps.find((step) => step.connectionId === 'unsafe-a2a')
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content

    assert.equal(response.status, 200)
    assert.equal(a2aSource.requests.length, 1)
    assert.equal(a2aSource.requests[0].url.pathname, '/.well-known/agent-card.json')
    assert.equal(hermes.requests.length, 1)
    assert.equal(failedStep.status, 'error')
    assert.equal(failedStep.error, 'Source query failed.')
    assert.equal(artifact.answer, 'Answer with unsafe source skipped.')
    assert.doesNotMatch(JSON.stringify(artifact.steps), /tailnet-source/)
    assert.match(hermesUserMessage, /"sourceFailures"/)
    assert.doesNotMatch(hermesUserMessage, /tailnet-source/)
  })

  it('does not expose fixture handler error details in JSON responses', async (t) => {
    const source = await startFixtureServer(() => {
      throw new Error('fixture stack detail with token sk-secret-fixture')
    })
    t.after(() => closeServer(source.server))

    const response = await fetch(source.url)
    const body = await response.json()
    const serialized = JSON.stringify(body)

    assert.equal(response.status, 500)
    assert.equal(body.error, 'fixture handler failed')
    assert.equal(source.errors.length, 1)
    assert.doesNotMatch(serialized, /fixture stack detail/)
    assert.doesNotMatch(serialized, /sk-secret-fixture/)
  })

  it('rejects unlisted private HTTP source URLs in allowlist policy without leaking URLs', async (t) => {
    const originalFetch = globalThis.fetch
    const logger = recordingLogger()
    const unsafeSourceUrl = 'http://192.168.70.10:8765'
    const completionsOrigin = 'http://agent-allowlist-policy.example.test'
    const sourceRequests = []
    const completionsRequests = []
    let bridge

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (bridge && url.href.startsWith(`${bridge.url}/`)) return originalFetch(input, init)

      if (url.origin === new URL(unsafeSourceUrl).origin) {
        sourceRequests.push({ url, body: parseJsonFetchBody(init.body) })
        return jsonFetchResponse(200, { wiki_title: 'Unexpected Source', evidence: [] })
      }

      if (url.origin === completionsOrigin) {
        completionsRequests.push({ url, body: parseJsonFetchBody(init.body) })
        return jsonFetchResponse(200, {
          choices: [{ message: { role: 'assistant', content: 'Answer with blocked sources skipped.' } }],
        })
      }

      throw new Error(`Unexpected fetch origin: ${url.origin}`)
    }

    t.after(async () => {
      globalThis.fetch = originalFetch
      if (bridge) await closeServer(bridge.server)
    })

    bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${completionsOrigin}/v1`,
      allowedOrigins: [unsafeSourceUrl],
      sourcePolicy: 'allowlist',
      logger,
    })

    const response = await originalFetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Do not call unsafe Knowledge Source base URLs.',
          knowledgeSources: [
            knowledgeSource('blocked-http', 'Blocked HTTP Source', 'llmwiki-http', unsafeSourceUrl),
            knowledgeSource('blocked-mcp', 'Blocked MCP Source', 'mcp', unsafeSourceUrl),
            knowledgeSource('blocked-a2a', 'Blocked A2A Source', 'a2a', unsafeSourceUrl),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const failedSteps = artifact.steps.filter((step) => step.status === 'error')
    const queryFailedSteps = failedSteps.filter((step) => step.error === 'Source query failed.')
    const completionsUserMessage = completionsRequests[0].body.messages.find((message) => message.role === 'user').content

    assert.equal(response.status, 200)
    assert.equal(sourceRequests.length, 0)
    assert.equal(completionsRequests.length, 1)
    assert.equal(failedSteps.length, 3)
    assert.deepEqual(queryFailedSteps.map((step) => step.error), [
      'Source query failed.',
      'Source query failed.',
      'Source query failed.',
    ])
    assert.equal(artifact.answer, 'Answer with blocked sources skipped.')
    assert.doesNotMatch(JSON.stringify(artifact.steps), /192\.168\.70\.10/)
    assert.match(completionsUserMessage, /"sourceFailures"/)
    assert.doesNotMatch(completionsUserMessage, /192\.168\.70\.10/)
    assert.doesNotMatch(logger.lines.join('\n'), /192\.168\.70\.10/)
  })

  it('returns partial diagnostics and trace steps when the runtime fails', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 500, { error: 'runtime exploded with token sk-secret-runtime' })
    })
    t.after(() => closeServer(runtime.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${runtime.url}/v1`,
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'test-runtime-failure',
      },
      body: JSON.stringify({
        data: {
          query: 'Return the partial runtime failure envelope.',
          knowledgeSources: [],
        },
      }),
    })
    const body = await response.json()
    const runtimeStep = body.steps.find((step) => step.id === 'runtime-chat-completions')

    assert.equal(response.status, 502)
    assert.equal(body.error.code, 'chat_completions_failed')
    assert.equal(body.error.message, 'Chat completions request failed.')
    assert.equal(body.requestId, 'test-runtime-failure')
    assert.equal(typeof body.traceId, 'string')
    assert(body.traceId.length > 0)
    assert.equal(runtimeStep.status, 'error')
    assert.equal(runtimeStep.error, 'Chat completions request failed.')
    assert.equal(runtimeStep.diagnostic.schemaVersion, 'llmwiki.agent-bridge.diagnostic.v1')
    assert.equal(runtimeStep.diagnostic.scope, 'runtime')
    assert.equal(runtimeStep.diagnostic.phase, 'chat-completions')
    assert.equal(runtimeStep.diagnostic.protocol, 'openai-compatible')
    assert.equal(runtimeStep.diagnostic.redacted, true)
    assert.equal(observationValue(runtimeStep.diagnostic, 'httpStatus'), '500')
    assert.equal(observationValue(runtimeStep.diagnostic, 'runtimeProfile'), 'hermes')
    assert.equal(observationValue(runtimeStep.diagnostic, 'timeoutMs'), '120000')
    assert.deepEqual(body.diagnostics, [runtimeStep.diagnostic])
    assert.doesNotMatch(JSON.stringify(body), /sk-secret-runtime/)
    assert.doesNotMatch(JSON.stringify(body), /127\.0\.0\.1/)
  })

  it('continues with redacted source failure steps when one selected source fails', async (t) => {
    const goodSource = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        wiki_title: 'Good Wiki',
        evidence: [
          {
            page_id: 'good',
            title: 'Good Evidence',
            path: 'good.md',
            snippet: 'Useful source evidence.',
            source_refs: ['GOOD-1'],
          },
        ],
        graph: { nodes: [], edges: [] },
      })
    })
    t.after(() => closeServer(goodSource.server))

    const failingSource = await startFixtureServer(async ({ response }) => {
      writeJson(response, 500, { error: 'backend exposed detail that should not reach the browser' })
    })
    t.after(() => closeServer(failingSource.server))

    const hermes = await startFixtureServer(async ({ body, response }) => {
      hermes.lastBody = body
      writeJson(response, 200, {
        choices: [{ message: { role: 'assistant', content: 'Answer from surviving evidence.' } }],
      })
    })
    t.after(() => closeServer(hermes.server))

    const bridge = await startAgentBridge({
      port: 0,
      hermesBaseUrl: `${hermes.url}/v1`,
      hermesApiKey: 'test-secret',
      logger: silentLogger,
    })
    t.after(() => closeServer(bridge.server))

    const response = await fetch(`${bridge.url}/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          query: 'Use what still works.',
          knowledgeSources: [
            knowledgeSource('good', 'Good Wiki', 'llmwiki-http', goodSource.url),
            knowledgeSource('bad', 'Bad Wiki', 'llmwiki-http', failingSource.url),
          ],
        },
      }),
    })
    const a2a = await response.json()
    const artifact = a2a.artifacts[0].parts[0].data
    const failedStep = artifact.steps.find((step) => step.connectionId === 'bad')
    const hermesUserMessage = hermes.lastBody.messages.find((message) => message.role === 'user').content
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)

    assert.equal(response.status, 200)
    assert.equal(typeof a2a.requestId, 'string')
    assert.equal(typeof a2a.traceId, 'string')
    assert.equal(artifact.requestId, a2a.requestId)
    assert.equal(artifact.traceId, a2a.traceId)
    assert.equal(artifact.answer, expectedFallbackAnswer('Answer from surviving evidence.', 1))
    assert.deepEqual(artifact.citations.map((citation) => citation.id), ['good:good'])
    assert.equal(failedStep.status, 'error')
    assert.equal(failedStep.error, 'Source query failed.')
    assert.equal(failedStep.diagnostic.schemaVersion, 'llmwiki.agent-bridge.diagnostic.v1')
    assert.equal(failedStep.diagnostic.severity, 'error')
    assert.equal(failedStep.diagnostic.scope, 'source')
    assert.equal(failedStep.diagnostic.phase, 'query')
    assert.equal(failedStep.diagnostic.protocol, 'llmwiki-http')
    assert.equal(failedStep.diagnostic.subject, 'bad')
    assert.equal(failedStep.diagnostic.redacted, true)
    assert.equal(observationValue(failedStep.diagnostic, 'httpStatus'), '500')
    assert.equal(observationValue(failedStep.diagnostic, 'sourcePolicy'), 'private-http')
    assert.equal(observationValue(failedStep.diagnostic, 'sourceSelected'), 'true')
    assert.deepEqual(
      artifact.diagnostics.filter((diagnostic) => diagnostic.subject === 'bad' && diagnostic.phase === 'query'),
      [failedStep.diagnostic],
    )
    assert.doesNotMatch(JSON.stringify(failedStep), /backend exposed detail/)
    assert.doesNotMatch(JSON.stringify(failedStep), /127\.0\.0\.1/)
    assert.match(hermesUserMessage, /"sourceFailures"/)
    assert.deepEqual(evidenceBundle.sourceFailures.map((failure) => ({
      id: failure.id,
      error: failure.error,
      message: failure.message,
    })), [
      {
        id: 'bad',
        error: 'Source query failed.',
        message: 'Bad Wiki could not be queried by the bridge.',
      },
    ])
    assert.doesNotMatch(hermesUserMessage, /"diagnostic"/)
    assert.doesNotMatch(hermesUserMessage, /"httpStatus"/)
    assert.doesNotMatch(hermesUserMessage, /backend exposed detail/)
    assert.doesNotMatch(hermesUserMessage, /127\.0\.0\.1/)
  })

  it('evaluates runtime prompt rendering offline as size-only with compact JSON, markdown summary, and TOON candidates', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['scripts/benchmark-runtime-prompt.mjs'], {
      cwd: packageRoot,
      maxBuffer: 1024 * 1024,
    })
    const report = JSON.parse(stdout)
    const evidenceComparison = report.totals.comparisons.compactVsPrettyEvidenceJson
    const promptComparison = report.totals.comparisons.compactVsPrettyRuntimeUserPrompt
    const markdownComparison = report.totals.comparisons.markdownSummaryVsCompactRuntimeUserPrompt
    const toonComparison = report.totals.comparisons.toonVsCompactRuntimeUserPrompt
    const fixtureIds = report.fixtures.map((fixture) => fixture.id)
    const strictEvidenceFixture = report.fixtures.find((fixture) => fixture.id === 'graph-strict-evidence-fidelity')
    const forbiddenOfflineRecommendationPaths = []
    const collectForbiddenRecommendationKeys = (value, path = '$') => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        const nextPath = `${path}.${key}`
        if (key === 'recommendation' || key === 'recommendedRendererId') {
          forbiddenOfflineRecommendationPaths.push(nextPath)
        }
        collectForbiddenRecommendationKeys(child, nextPath)
      }
    }
    collectForbiddenRecommendationKeys(report)

    assert.equal(report.schema, 'llmwiki-agent-bridge.runtime-prompt-evaluation.v1')
    assert.equal(report.mode, 'offline')
    assert.equal(report.offlineComparisonBasis, 'size-only')
    assert.equal(report.rendererBaseline, 'pretty-json')
    assert.deepEqual(report.rendererCandidates, ['compact-json', 'markdown-summary', 'toon'])
    assert.deepEqual(report.renderers.map((renderer) => renderer.id), ['pretty-json', 'compact-json', 'markdown-summary', 'toon'])
    assert.match(report.note, /markdown-summary is a lossy prompt projection/)
    assert.equal(report.live.enabled, false)
    assert.deepEqual(forbiddenOfflineRecommendationPaths, [])
    assert.equal(report.validation.ok, true)
    assert.equal(report.fixtures.length, 6)
    assert(fixtureIds.includes('graph-linear-chain'))
    assert(fixtureIds.includes('graph-strict-evidence-fidelity'))
    assert(fixtureIds.includes('graph-dense-crossrefs'))
    assert(fixtureIds.includes('graph-mixed-nested-metadata'))
    assert(strictEvidenceFixture)
    assert.equal(strictEvidenceFixture.citationCount, 5)
    assert.equal(strictEvidenceFixture.graphNodeCount, 7)
    assert.equal(strictEvidenceFixture.graphEdgeCount, 5)
    assert.equal(strictEvidenceFixture.quality.ok, true)
    assert.equal(strictEvidenceFixture.quality.metrics.graphNodeCitationCoveragePct, 100)
    assert.equal(strictEvidenceFixture.quality.metrics.graphEdgeCitationCoveragePct, 100)
    assert.equal(strictEvidenceFixture.quality.metrics.nonPortableSourcePathCount, 0)
    assert.doesNotMatch(
      JSON.stringify(report),
      /(?:[A-Za-z]:[\\/]|\\\\|\/Users\/|\/home\/|\/var\/|127\.0\.0\.1|localhost|https?:\/\/|sk-(?:proj-)?[A-Za-z0-9_-]{8,}|(?:api[_-]?key|bearer|token)=)/i,
    )
    assert(evidenceComparison.utf8BytesSaved > 0)
    assert(promptComparison.utf8BytesSaved > 0)
    assert.equal(markdownComparison.baseline, 'compact-json')
    assert.equal(markdownComparison.candidate, 'markdown-summary')
    assert.equal(toonComparison.baseline, 'compact-json')
    assert.equal(toonComparison.candidate, 'toon')

    const comparisonGroups = [
      ['totals', report.totals.comparisons],
      ...report.fixtures.map((fixture) => [`fixture:${fixture.id}`, fixture.comparisons]),
    ]
    for (const [groupName, comparisons] of comparisonGroups) {
      assert(Object.keys(comparisons).length > 0, `${groupName} should include offline comparisons`)
      for (const [comparisonName, comparison] of Object.entries(comparisons)) {
        assert.equal(comparison.basis, 'size-only', `${groupName}.${comparisonName}`)
      }
    }
  })

  it('adds an eval-only Graphify graph fixture to the runtime prompt benchmark', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'llmwiki-agent-bridge-graphify-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    const graphPath = join(dir, 'graph.json')
    await writeFile(graphPath, JSON.stringify({
      nodes: [
        {
          id: 'graphify-overview',
          label: 'Graphify Optional Fixture',
          file_type: 'doc',
          source_file: 'docs/runtime-prompt-evaluation.md',
          source_location: 'heading:graphify',
        },
        {
          id: 'primary-metric',
          label: 'Omission Distortion Metric',
          source_file: 'docs/runtime-prompt-evaluation.md',
          source_location: 'heading:metrics',
        },
        {
          label: 'Missing Field Defaults',
          source_file: join(dir, 'absolute-source.md'),
          source_location: 'line:99',
        },
      ],
      edges: [
        {
          source: 'graphify-overview',
          target: 'primary-metric',
          relation: 'defines',
          context: 'Primary evaluation checks omission and distortion before token saving.',
          confidence: 0.91,
          weight: 0.83,
          source_file: 'docs/runtime-prompt-evaluation.md',
          source_location: 'line:12',
        },
        {
          source: 'primary-metric',
          target: 'markdown-summary',
          context: 'Markdown summary is lossy and must be evaluated separately.',
          confidence: 'INFERRED',
          confidence_score: 0.65,
          source_file: 'docs/runtime-prompt-renderers.md',
        },
      ],
    }), 'utf8')

    const { stdout } = await execFileAsync(process.execPath, [
      'scripts/benchmark-runtime-prompt.mjs',
      '--graphify-graph',
      graphPath,
      '--graphify-query',
      'Which Graphify graph evidence should the runtime cite?',
    ], {
      cwd: packageRoot,
      maxBuffer: 1024 * 1024,
    })
    const report = JSON.parse(stdout)
    const graphifyFixture = report.fixtures.find((fixture) => fixture.id === 'graphify-graph')

    assert.equal(report.validation.ok, true)
    assert.equal(report.totals.fixtureCount, 7)
    assert(graphifyFixture)
    assert.equal(graphifyFixture.sourceCount, 1)
    assert.equal(graphifyFixture.sourceSummaryCount, 1)
    assert.equal(graphifyFixture.graphNodeCount, 3)
    assert.equal(graphifyFixture.graphEdgeCount, 2)
    assert.equal(graphifyFixture.mergedGraphSummary.nodeCount, 3)
    assert.equal(graphifyFixture.mergedGraphSummary.edgeCount, 2)
    assert.equal(graphifyFixture.citationCount, 5)
    assert.equal(graphifyFixture.quality.ok, true)
    assert.equal(graphifyFixture.quality.metrics.graphNodeCitationCoveragePct, 100)
    assert.equal(graphifyFixture.quality.metrics.graphEdgeCitationCoveragePct, 100)
    assert.equal(graphifyFixture.quality.metrics.nonPortableSourcePathCount, 0)
    assert.deepEqual(Object.keys(graphifyFixture.renderers), ['pretty-json', 'compact-json', 'markdown-summary', 'toon'])
    for (const renderer of Object.values(graphifyFixture.renderers)) {
      assert.equal(renderer.validation.ok, true)
      assert(renderer.evidenceJson.utf8Bytes > 0)
      assert(renderer.runtimeUserPrompt.utf8Bytes > renderer.evidenceJson.utf8Bytes)
    }
    assert.doesNotMatch(JSON.stringify(report), new RegExp(escapeRegExp(dir)))
  })

  it('rejects Graphify query configuration without a Graphify graph fixture', async () => {
    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--graphify-query',
        'This query has no graph input.',
      ], {
        cwd: packageRoot,
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /--graphify-query requires --graphify-graph/)
  })

  it('rejects live runtime prompt benchmark responses without exact citation anchors', async (t) => {
    const runtime = await startFixtureServer(async ({ body, response }) => {
      const userPrompt = body.messages.find((message) => message.role === 'user')?.content || ''
      const isMarkdownSummary = userPrompt.includes('## Citation digest')
      writeJson(response, 200, {
        choices: [
          {
            message: {
              content: isMarkdownSummary
                ? 'Markdown summary output cites both required sources exactly [1](#citation-1) [2](#citation-2).'
                : 'Compact JSON output uses a bare citation [1].',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'single-source',
        '--renderer',
        'compact-json,markdown-summary',
        '--max-tokens',
        '32',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /single-source\/compact-json: live response must complete/)

    const report = JSON.parse(error.stdout)
    const liveFixture = report.live.fixtures[0]

    assert.equal(report.mode, 'offline+live')
    assert.equal(report.live.validation.ok, false)
    assert.equal(report.live.status, 'failed')
    assert.equal(liveFixture.renderers['compact-json'].pass, false)
    assert.deepEqual(liveFixture.renderers['compact-json'].citationAnchorsFound, [])
    assert.equal(liveFixture.renderers['markdown-summary'].pass, true)
    assert.deepEqual(
      liveFixture.renderers['markdown-summary'].citationAnchorsFound.map((anchor) => anchor.anchor),
      ['[1](#citation-1)', '[2](#citation-2)'],
    )
    assert.equal(runtime.requests.length, 2)
  })

  it('rejects live runtime prompt benchmark responses that omit answer oracle relations', async (t) => {
    const runtime = await startFixtureServer(async ({ body, response }) => {
      const userPrompt = body.messages.find((message) => message.role === 'user')?.content || ''
      const isMarkdownSummary = userPrompt.includes('## Graph edges')
      writeJson(response, 200, {
        choices: [
          {
            message: {
              content: isMarkdownSummary
                ? 'Runtime Prompt Decision and Runtime Prompt Validation are mentioned with all citations [1](#citation-1) [2](#citation-2) [3](#citation-3).'
                : 'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2), and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).',
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json,markdown-summary',
        '--max-tokens',
        '64',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /answer oracle failed/)

    const report = JSON.parse(error.stdout)
    const liveFixture = report.live.fixtures[0]

    assert.equal(report.live.validation.ok, false)
    assert.equal(liveFixture.renderers['compact-json'].pass, true)
    assert.equal(liveFixture.renderers['compact-json'].answerOracle.ok, true)
    assert.equal(liveFixture.renderers['compact-json'].expectedCitationMappings.ok, true)
    assert.equal(liveFixture.renderers['compact-json'].expectedCitationMappings.metrics.coveragePct, 100)
    assert.equal(liveFixture.renderers['compact-json'].expectedCitationMappings.metrics.satisfiedMappingCount, 2)
    assert.equal(liveFixture.renderers['compact-json'].averageExpectedCitationMappingCoveragePct, 100)
    assert.equal(liveFixture.renderers['compact-json'].aggregate.expectedCitationMappings.claimOccurrenceCount, 2)
    assert.equal(liveFixture.renderers['compact-json'].aggregate.expectedCitationMappings.satisfiedOccurrenceCount, 2)
    assert.equal(liveFixture.renderers['compact-json'].aggregate.expectedCitationMappings.unsatisfiedOccurrenceCount, 0)
    assert.equal(liveFixture.renderers['compact-json'].aggregate.expectedCitationMappings.averageOccurrenceCoveragePct, 100)
    assert.equal(liveFixture.renderers['compact-json'].averageExpectedCitationOccurrenceCoveragePct, 100)
    assert.equal(report.live.totals.renderers['compact-json'].expectedCitationMappings.claimOccurrenceCount, 2)
    assert.equal(report.live.totals.renderers['compact-json'].expectedCitationMappings.satisfiedOccurrenceCount, 2)
    assert.equal(report.live.totals.renderers['compact-json'].expectedCitationMappings.unsatisfiedOccurrenceCount, 0)
    assert.equal(report.live.totals.renderers['compact-json'].averageExpectedCitationOccurrenceCoveragePct, 100)
    assert.equal(liveFixture.renderers['markdown-summary'].pass, false)
    assert.equal(liveFixture.renderers['markdown-summary'].allRequiredCitationAnchorsCovered, true)
    assert.equal(liveFixture.renderers['markdown-summary'].answerOracle.ok, false)
    assert(liveFixture.renderers['markdown-summary'].answerOracle.metrics.missingRequiredRelationCount > 0)
    assert(liveFixture.renderers['markdown-summary'].aggregate.answerOracle.averageOmissionRate > 0)
    assert(liveFixture.renderers['markdown-summary'].aggregate.answerOracle.averageRequiredItemCoveragePct < 100)
    assert.equal(runtime.requests.length, 2)
  })

  it('aggregates expected citation occurrence coverage across repeated live runs', async (t) => {
    let requestCount = 0
    const runtime = await startFixtureServer(async ({ response }) => {
      requestCount += 1
      const passingRun = requestCount === 1
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: passingRun
                ? 'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2), and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).'
                : [
                    'Runtime Prompt Decision requires Prompt Codec Implementation.',
                    'Prompt Codec Implementation measured by Prompt renderer benchmark before Runtime Prompt Validation.',
                    'Padding separates mapped claims from citation anchors.',
                    'x'.repeat(260),
                    '[1](#citation-1) [2](#citation-2) [3](#citation-3).',
                  ].join(' '),
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: passingRun ? 28 : 34,
          total_tokens: passingRun ? 48 : 54,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--live-runs',
        '2',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.runCount, 2)
    assert.equal(rendererReport.passRatePct, 50)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.enabledRunCount, 2)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.expectedMappingCount, 4)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.satisfiedMappingCount, 2)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.claimOccurrenceCount, 4)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.satisfiedOccurrenceCount, 2)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.unsatisfiedOccurrenceCount, 2)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.occurrenceCoveragePct, 50)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.averageOccurrenceCoveragePct, 50)
    assert.equal(rendererReport.expectedCitationOccurrenceCoveragePct, 50)
    assert.equal(rendererReport.averageExpectedCitationOccurrenceCoveragePct, 50)
    assert.equal(rendererTotals.expectedCitationMappings.claimOccurrenceCount, 4)
    assert.equal(rendererTotals.expectedCitationMappings.satisfiedOccurrenceCount, 2)
    assert.equal(rendererTotals.expectedCitationMappings.unsatisfiedOccurrenceCount, 2)
    assert.equal(rendererTotals.expectedCitationMappings.occurrenceCoveragePct, 50)
    assert.equal(rendererTotals.expectedCitationMappings.averageOccurrenceCoveragePct, 50)
    assert.equal(report.live.totals.expectedCitationMappings.claimOccurrenceCount, 4)
    assert.equal(report.live.totals.expectedCitationOccurrenceCoveragePct, 50)
    assert.equal(report.live.totals.averageExpectedCitationOccurrenceCoveragePct, 50)
    assert.equal(runtime.requests.length, 2)
  })

  it('does not recommend a smaller live renderer that fails strict quality gates', async (t) => {
    const runtime = await startFixtureServer(async ({ body, response }) => {
      const userPrompt = body.messages.find((message) => message.role === 'user')?.content || ''
      const isMarkdownSummary = userPrompt.includes('## Graph edges')
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: isMarkdownSummary
                ? 'Markdown mentions Runtime Prompt Decision and Runtime Prompt Validation with citation anchors [1](#citation-1) [2](#citation-2) [3](#citation-3), but omits the required implementation relation.'
                : 'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2), and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).',
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: isMarkdownSummary ? 18 : 28,
          total_tokens: isMarkdownSummary ? 38 : 48,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json,markdown-summary',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)

    const report = JSON.parse(error.stdout)
    const recommendation = report.live.recommendation
    const compact = recommendation.ranking.find((entry) => entry.id === 'compact-json')
    const markdown = recommendation.ranking.find((entry) => entry.id === 'markdown-summary')

    assert.equal(report.live.validation.ok, false)
    assert.equal(recommendation.basis, 'quality-first-live')
    assert.equal(recommendation.sizeMetric, 'runtimeUserPrompt.estimatedTokens')
    assert.equal(recommendation.status, 'recommended')
    assert.equal(recommendation.recommendedRendererId, 'compact-json')
    assert.equal(markdown.sizeRank < compact.sizeRank, true)
    assert.equal(compact.eligible, true)
    assert.deepEqual(compact.blockingReasons, [])
    assert.equal(compact.strictLive.passRatePct, 100)
    assert.equal(compact.strictLive.strictQualityFailureCount, 0)
    assert.equal(markdown.eligible, false)
    assert.match(markdown.blockingReasons.join('; '), /strict live passRate is 0%, not 100%/)
    assert.match(markdown.blockingReasons.join('; '), /strict failure codes present:/)
    assert.equal(markdown.strictLive.passRatePct, 0)
    assert(markdown.strictLive.strictQualityFailureCount > 0)
    assert.equal(report.live.totals.renderers['markdown-summary'].runtimeUserPrompt.estimatedTokens < report.live.totals.renderers['compact-json'].runtimeUserPrompt.estimatedTokens, true)
    assert.equal(runtime.requests.length, 2)
  })

  it('recommends a size-saving live renderer after strict quality gates pass', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2), and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).',
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 28,
          total_tokens: 48,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    const { stdout } = await execFileAsync(process.execPath, [
      'scripts/benchmark-runtime-prompt.mjs',
      '--live',
      '--fixture',
      'graph-linear-chain',
      '--renderer',
      'compact-json,markdown-summary',
      '--max-tokens',
      '128',
      '--timeout-ms',
      '10000',
    ], {
      cwd: packageRoot,
      env: {
        ...process.env,
        LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
        LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
        LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
      },
      maxBuffer: 1024 * 1024,
    })

    const report = JSON.parse(stdout)
    const recommendation = report.live.recommendation
    const compact = recommendation.ranking.find((entry) => entry.id === 'compact-json')
    const markdown = recommendation.ranking.find((entry) => entry.id === 'markdown-summary')

    assert.equal(report.live.validation.ok, true)
    assert.equal(recommendation.status, 'recommended')
    assert.equal(recommendation.recommendedRendererId, 'markdown-summary')
    assert.equal(markdown.eligible, true)
    assert.deepEqual(markdown.blockingReasons, [])
    assert.equal(markdown.sizeRank, 1)
    assert.equal(markdown.rank, 1)
    assert.equal(markdown.strictLive.passRatePct, 100)
    assert.equal(markdown.strictLive.strictQualityFailureCount, 0)
    assert.equal(compact.eligible, true)
    assert.equal(compact.strictLive.strictQualityFailureCount, 0)
    assert.equal(runtime.requests.length, 2)
  })

  it('passes graph-strict-evidence-fidelity strict evidence-fidelity live mock answers', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer(),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 70,
          total_tokens: 110,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    const { stdout } = await runRuntimePromptBenchmark([
      '--live',
      '--fixture',
      'graph-strict-evidence-fidelity',
      '--renderer',
      'compact-json',
      '--max-tokens',
      '256',
      '--timeout-ms',
      '10000',
    ], {
      env: mockRuntimeEnv(runtime),
    })

    const report = JSON.parse(stdout)
    const liveFixture = report.live.fixtures[0]
    const rendererReport = liveFixture.renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']
    const recommendationEntry = report.live.recommendation.ranking.find((entry) => entry.id === 'compact-json')

    assert.equal(report.live.validation.ok, true)
    assert.equal(liveFixture.id, 'graph-strict-evidence-fidelity')
    assert.equal(rendererReport.pass, true)
    assert.equal(rendererReport.passRatePct, 100)
    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.answerOracle.ok, true)
    assert.equal(rendererReport.answerOracle.metrics.requiredRelationCoveragePct, 100)
    assert.equal(rendererReport.expectedCitationMappings.ok, true)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedMappingCount, 4)
    assert.equal(rendererReport.expectedCitationMappings.metrics.satisfiedMappingCount, 4)
    assert.equal(rendererReport.expectedCitationMappings.metrics.coveragePct, 100)
    assert.equal(rendererReport.expectedCitationMappings.metrics.occurrenceCoveragePct, 100)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.claimOccurrenceCount, 5)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.satisfiedOccurrenceCount, 5)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.unsatisfiedOccurrenceCount, 0)
    assert.equal(rendererReport.aggregate.expectedCitationMappings.averageOccurrenceCoveragePct, 100)
    assert.equal(rendererTotals.expectedCitationMappings.claimOccurrenceCount, 5)
    assert.equal(rendererTotals.expectedCitationMappings.satisfiedOccurrenceCount, 5)
    assert.equal(rendererTotals.expectedCitationMappings.unsatisfiedOccurrenceCount, 0)
    assert.equal(rendererTotals.expectedCitationMappings.averageOccurrenceCoveragePct, 100)
    assert.equal(report.live.recommendation.status, 'recommended')
    assert.equal(report.live.recommendation.recommendedRendererId, 'compact-json')
    assert(recommendationEntry)
    assert.equal(recommendationEntry.eligible, true)
    assert.deepEqual(recommendationEntry.blockingReasons, [])
    assert.equal(recommendationEntry.strictLive.strictQualityFailureCount, 0)
    assert.equal(runtime.requests.length, 1)
  })

  it('sends claim-preserving live prompt contract to the mock runtime', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer(),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 70,
          total_tokens: 110,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    await runRuntimePromptBenchmark([
      '--live',
      '--fixture',
      'graph-strict-evidence-fidelity',
      '--renderer',
      'compact-json',
      '--max-tokens',
      '256',
      '--timeout-ms',
      '10000',
    ], {
      env: mockRuntimeEnv(runtime),
    })

    assert.equal(runtime.requests.length, 1)
    const systemMessage = runtime.requests[0].body.messages.find((message) => message.role === 'system')
    assert(systemMessage)
    assert.match(systemMessage.content, /preserve configured claim phrases/i)
    assert.match(systemMessage.content, /graph relation phrases/i)
    assert.match(systemMessage.content, /instead of paraphrasing/i)
    assert.match(systemMessage.content, /measured_by as "measured by"/i)
    assert.match(systemMessage.content, /\[n\]\(#citation-n\)/)
    assert.match(systemMessage.content, /cite every occurrence/i)
    assert.match(systemMessage.content, /repeated-citation gates/i)
    assert.match(systemMessage.content, /do not use evidence-free claims/i)
  })

  it('emits a safe diagnostic summary for failing live mock runs', async (t) => {
    const syntheticPrivateModelName = 'loop-13-private-model-canary'
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer({ omitMultiHopRelation: true }),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 68,
          total_tokens: 108,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await runRuntimePromptBenchmark([
        '--live',
        '--fixture',
        'graph-strict-evidence-fidelity',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '256',
        '--timeout-ms',
        '10000',
      ], {
        env: {
          ...mockRuntimeEnv(runtime),
          LLMWIKI_AGENT_BRIDGE_MODEL: syntheticPrivateModelName,
        },
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']
    const diagnostic = rendererReport.diagnosticSummary
    const totalsDiagnostic = rendererTotals.diagnosticSummary

    assert(diagnostic)
    assert.equal(diagnostic.fixtureId, 'graph-strict-evidence-fidelity')
    assert.equal(diagnostic.rendererId, 'compact-json')
    assert.deepEqual(diagnostic.failureCodes, ['oracle_omission', 'expected_claim_missing'])
    assert.equal(diagnostic.finishReasonCounts.stop, 1)
    assert.equal(diagnostic.truncation.truncatedCount, 0)
    assert.equal(diagnostic.outputTextLength.average, rendererReport.outputTextLength)
    assert.equal(diagnostic.citationCoverage.averageRequiredCitationAnchorCoveragePct, 100)
    assert(diagnostic.answerOracle.missingRequiredRelationCount > 0)
    assert(
      diagnostic.answerOracle.missingRelations.some((relation) => (
        relation.includes('Citation Fidelity Gate') && relation.includes('Live Prompt Evaluation')
      )),
    )
    assert.equal(diagnostic.expectedCitationMappings.missingClaimCount, 1)
    assert.deepEqual(diagnostic.expectedCitationMappings.missingExpectedClaimPhrases, [
      'Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation',
    ])
    assert.equal(diagnostic.failingRuns.length, 1)
    assert.equal(diagnostic.failingRuns[0].outputTextLength, rendererReport.runs[0].outputTextLength)

    assert(totalsDiagnostic)
    assert.equal(totalsDiagnostic.fixtureId, null)
    assert.equal(totalsDiagnostic.rendererId, 'compact-json')
    assert.deepEqual(totalsDiagnostic.failureCodes, ['oracle_omission', 'expected_claim_missing'])
    assert.equal(totalsDiagnostic.failureCodeCounts.oracle_omission, 1)
    assert.equal(totalsDiagnostic.failureCodeCounts.expected_claim_missing, 1)
    assert.equal(totalsDiagnostic.finishReasonCounts.stop, 1)
    assert.equal(totalsDiagnostic.truncation.truncatedCount, 0)
    assert.equal(totalsDiagnostic.outputTextLength.average, rendererTotals.outputTextLength.average)
    assert.equal(totalsDiagnostic.citationCoverage.averageRequiredCitationAnchorCoveragePct, 100)
    assert.equal(totalsDiagnostic.answerOracle.missingRequiredRelationCount, 1)
    assert.deepEqual(totalsDiagnostic.expectedCitationMappings.missingExpectedClaimPhrases, [
      'Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation',
    ])
    assert.equal(totalsDiagnostic.failingRuns.length, 1)
    assert.equal(totalsDiagnostic.failingRuns[0].outputTextLength, rendererReport.runs[0].outputTextLength)

    assert.equal(runtime.requests[0].body.model, syntheticPrivateModelName)
    assert.equal(report.live.runtime.modelConfigured, true)

    const serialized = JSON.stringify(report)
    assert.doesNotMatch(serialized, /"outputText"\s*:/)
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(runtime.url)))
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(syntheticPrivateModelName)))
    assert.doesNotMatch(serialized, /mock-runtime-key/)
    assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{8,}/)
    assert.doesNotMatch(serialized, /[A-Za-z]:\\\\/)
    assert.doesNotMatch(serialized, /\/(?:Users|home)\//)
  })

  it('flags strict evidence-fidelity omissions for graph-strict-evidence-fidelity multi-hop relations', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer({ omitMultiHopRelation: true }),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 68,
          total_tokens: 108,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await runRuntimePromptBenchmark([
        '--live',
        '--fixture',
        'graph-strict-evidence-fidelity',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '256',
        '--timeout-ms',
        '10000',
      ], {
        env: mockRuntimeEnv(runtime),
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /oracle_omission/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']

    assert.equal(rendererReport.pass, false)
    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.answerOracle.ok, false)
    assert(rendererReport.answerOracle.metrics.missingRequiredRelationCount > 0)
    assert(rendererReport.failureCodes.includes('oracle_omission'))
    assert.equal(runtime.requests.length, 1)
  })

  it('flags strict evidence-fidelity wrong nearby expected citations for graph-strict-evidence-fidelity', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer({ wrongExactAnchor: true }),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 76,
          total_tokens: 116,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await runRuntimePromptBenchmark([
        '--live',
        '--fixture',
        'graph-strict-evidence-fidelity',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '256',
        '--timeout-ms',
        '10000',
      ], {
        env: mockRuntimeEnv(runtime),
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /expected_citation_mismatch/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.answerOracle.ok, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, false)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedMappingCount, 4)
    assert.equal(rendererReport.expectedCitationMappings.metrics.satisfiedMappingCount, 3)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedCitationMismatchCount, 1)
    assert.equal(rendererReport.expectedCitationMappings.metrics.proximityFailureCount, 0)
    assert.deepEqual(rendererReport.failureCodes, ['expected_citation_mismatch'])
    assert.equal(runtime.requests.length, 1)
  })

  it('flags strict evidence-fidelity repeated citations not cited every occurrence', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer({ citeFirstRepeatedOccurrence: false }),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 74,
          total_tokens: 114,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await runRuntimePromptBenchmark([
        '--live',
        '--fixture',
        'graph-strict-evidence-fidelity',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '256',
        '--timeout-ms',
        '10000',
      ], {
        env: mockRuntimeEnv(runtime),
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /expected_citation_every_occurrence_failed/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.answerOracle.ok, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, false)
    assert.equal(rendererReport.expectedCitationMappings.metrics.everyOccurrenceFailureCount, 1)
    assert.equal(rendererReport.expectedCitationMappings.metrics.strictEveryOccurrenceFailureCount, 1)
    assert.equal(rendererReport.expectedCitationMappings.metrics.claimOccurrenceCount, 5)
    assert.equal(rendererReport.expectedCitationMappings.metrics.satisfiedOccurrenceCount, 4)
    assert.equal(rendererReport.expectedCitationMappings.metrics.unsatisfiedOccurrenceCount, 1)
    assert.equal(rendererReport.expectedCitationMappings.metrics.occurrenceCoveragePct, 80)
    assert.deepEqual(rendererReport.failureCodes, ['expected_citation_every_occurrence_failed'])
    assert.equal(runtime.requests.length, 1)
  })

  it('classifies strict evidence-fidelity unsupported and contradictory claims for graph-strict-evidence-fidelity', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: strictEvidenceFidelityAnswer({ includeUnsupportedAndContradictory: true }),
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 88,
          total_tokens: 128,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await runRuntimePromptBenchmark([
        '--live',
        '--fixture',
        'graph-strict-evidence-fidelity',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '256',
        '--timeout-ms',
        '10000',
      ], {
        env: mockRuntimeEnv(runtime),
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /oracle_unsupported_claim/)
    assert.match(error.stderr, /oracle_contradiction/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, true)
    assert.equal(rendererReport.answerOracle.ok, false)
    assert.equal(rendererReport.answerOracle.metrics.unsupportedClaimHitCount, 2)
    assert.equal(rendererReport.answerOracle.metrics.contradictoryClaimHitCount, 2)
    assert.equal(rendererReport.answerOracle.metrics.distortionCount, 4)
    assert.deepEqual(rendererReport.failureCodes, [
      'oracle_distortion',
      'oracle_unsupported_claim',
      'oracle_contradiction',
    ])
    assert.equal(rendererReport.aggregate.answerOracle.strictUnsupportedClaimHitCount, 2)
    assert.equal(rendererReport.aggregate.answerOracle.strictContradictoryClaimHitCount, 2)
    assert.equal(rendererReport.aggregate.answerOracle.strictDistortionCount, 4)
    assert.equal(runtime.requests.length, 1)
  })

  it('blocks live recommendation when every renderer fails strict quality gates', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'This answer omits exact citation anchors and the required graph relations.',
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json,markdown-summary',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)

    const report = JSON.parse(error.stdout)
    const recommendation = report.live.recommendation

    assert.equal(recommendation.status, 'blocked')
    assert.equal(recommendation.recommendedRendererId, null)
    assert.equal(recommendation.blockedReasons.length > 0, true)
    assert.deepEqual(recommendation.ranking.map((entry) => entry.eligible), [false, false])
    for (const entry of recommendation.ranking) {
      assert.match(entry.blockingReasons.join('; '), /strict live passRate is 0%, not 100%/)
      assert(entry.strictLive.failureCodeCount > 0)
      assert(entry.strictLive.strictQualityFailureCount > 0)
    }
    assert.equal(runtime.requests.length, 2)
  })

  it('classifies unsupported answer-oracle claims distinctly', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: [
                'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2),',
                'and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).',
                'Prompt Codec Implementation is the production default [2](#citation-2).',
              ].join(' '),
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 28,
          total_tokens: 48,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /unsupported claims present/)
    assert.match(error.stderr, /oracle_unsupported_claim/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, true)
    assert.equal(rendererReport.answerOracle.ok, false)
    assert.equal(rendererReport.answerOracle.metrics.unsupportedClaimCount, 1)
    assert.equal(rendererReport.answerOracle.metrics.unsupportedClaimHitCount, 1)
    assert.equal(rendererReport.answerOracle.metrics.contradictoryClaimHitCount, 0)
    assert.equal(rendererReport.answerOracle.metrics.distortionCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.unsupportedClaimHitCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.contradictoryClaimHitCount, 0)
    assert.equal(rendererReport.aggregate.answerOracle.distortionCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.strictUnsupportedClaimHitCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.strictContradictoryClaimHitCount, 0)
    assert.equal(rendererReport.aggregate.answerOracle.strictDistortionCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.averageOmissionRate, 0)
    assert.equal(rendererReport.aggregate.answerOracle.averageRequiredItemCoveragePct, 100)
    assert.deepEqual(rendererReport.failureBuckets, ['answer-oracle-distortion', 'answer-oracle-unsupported'])
    assert.deepEqual(rendererReport.failureCodes, ['oracle_distortion', 'oracle_unsupported_claim'])
    assert.equal(rendererReport.aggregate.failureBucketCounts['answer-oracle-distortion'], 1)
    assert.equal(rendererReport.aggregate.failureBucketCounts['answer-oracle-unsupported'], 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.oracle_distortion, 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.oracle_unsupported_claim, 1)
    assert.equal(rendererTotals.answerOracle.unsupportedClaimHitCount, 1)
    assert.equal(rendererTotals.answerOracle.contradictoryClaimHitCount, 0)
    assert.equal(rendererTotals.answerOracle.distortionCount, 1)
    assert.equal(rendererTotals.answerOracle.strictUnsupportedClaimHitCount, 1)
    assert.equal(rendererTotals.answerOracle.strictContradictoryClaimHitCount, 0)
    assert.equal(rendererTotals.answerOracle.strictDistortionCount, 1)
    assert.equal(rendererTotals.averageAnswerOracleOmissionRate, 0)
    assert.equal(rendererTotals.averageAnswerOracleRequiredItemCoveragePct, 100)
    assert.equal(report.live.totals.answerOracle.strictUnsupportedClaimHitCount, 1)
    assert.equal(report.live.totals.answerOracle.strictDistortionCount, 1)
    assert.equal(rendererTotals.failureBucketCounts['answer-oracle-distortion'], 1)
    assert.equal(rendererTotals.failureBucketCounts['answer-oracle-unsupported'], 1)
    assert.equal(rendererTotals.failureCodeCounts.oracle_distortion, 1)
    assert.equal(rendererTotals.failureCodeCounts.oracle_unsupported_claim, 1)
  })

  it('classifies contradictory answer-oracle claims distinctly', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: [
                'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2),',
                'and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).',
                'Runtime Prompt Decision does not require Prompt Codec Implementation [2](#citation-2).',
              ].join(' '),
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 28,
          total_tokens: 48,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /contradictory claims present/)
    assert.match(error.stderr, /oracle_contradiction/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, true)
    assert.equal(rendererReport.answerOracle.ok, false)
    assert.equal(rendererReport.answerOracle.metrics.unsupportedClaimHitCount, 0)
    assert.equal(rendererReport.answerOracle.metrics.contradictoryClaimCount, 1)
    assert.equal(rendererReport.answerOracle.metrics.contradictoryClaimHitCount, 1)
    assert.equal(rendererReport.answerOracle.metrics.distortionCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.unsupportedClaimHitCount, 0)
    assert.equal(rendererReport.aggregate.answerOracle.contradictoryClaimHitCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.distortionCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.strictUnsupportedClaimHitCount, 0)
    assert.equal(rendererReport.aggregate.answerOracle.strictContradictoryClaimHitCount, 1)
    assert.equal(rendererReport.aggregate.answerOracle.strictDistortionCount, 1)
    assert.deepEqual(rendererReport.failureBuckets, ['answer-oracle-distortion', 'answer-oracle-contradiction'])
    assert.deepEqual(rendererReport.failureCodes, ['oracle_distortion', 'oracle_contradiction'])
    assert.equal(rendererReport.aggregate.failureBucketCounts['answer-oracle-distortion'], 1)
    assert.equal(rendererReport.aggregate.failureBucketCounts['answer-oracle-contradiction'], 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.oracle_distortion, 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.oracle_contradiction, 1)
    assert.equal(rendererTotals.failureBucketCounts['answer-oracle-distortion'], 1)
    assert.equal(rendererTotals.failureBucketCounts['answer-oracle-contradiction'], 1)
    assert.equal(rendererTotals.failureCodeCounts.oracle_distortion, 1)
    assert.equal(rendererTotals.failureCodeCounts.oracle_contradiction, 1)
    assert.equal(rendererTotals.answerOracle.contradictoryClaimHitCount, 1)
    assert.equal(rendererTotals.answerOracle.strictContradictoryClaimHitCount, 1)
    assert.equal(rendererTotals.answerOracle.strictDistortionCount, 1)
  })

  it('keeps report-only unsupported and contradictory answer-oracle claims out of strict failure classification', () => {
    const oracleReport = evaluateAnswerOracle(
      'A report-only answer says Alpha claim is unsupported and Beta claim contradicts the fixture.',
      {
        gate: 'report-only',
        unsupportedClaims: [{ allOf: ['Alpha claim', 'unsupported'] }],
        contradictoryClaims: [{ allOf: ['Beta claim', 'contradicts'] }],
      },
    )

    assert.equal(oracleReport.enabled, true)
    assert.equal(oracleReport.gate, 'report-only')
    assert.equal(oracleReport.ok, false)
    assert.equal(oracleReport.metrics.unsupportedClaimHitCount, 1)
    assert.equal(oracleReport.metrics.contradictoryClaimHitCount, 1)
    assert.equal(oracleReport.metrics.distortionCount, 2)
    assert.match(oracleReport.failures.join('; '), /unsupported claims present/)
    assert.match(oracleReport.failures.join('; '), /contradictory claims present/)
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      answerOracle: oracleReport,
    }), [])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      answerOracle: oracleReport,
    }), [])
  })

  it('keeps report-only aggregate diagnostics visible without blocking recommendation eligibility', () => {
    const answerOracle = summarizeAnswerOracleRunMetrics([
      {
        answerOracle: evaluateAnswerOracle(
          'A report-only answer says Alpha claim is unsupported and Beta claim contradicts the fixture.',
          {
            gate: 'report-only',
            unsupportedClaims: [{ allOf: ['Alpha claim', 'unsupported'] }],
            contradictoryClaims: [{ allOf: ['Beta claim', 'contradicts'] }],
          },
        ),
      },
    ])
    const expectedCitationMappings = summarizeExpectedCitationMappingRunMetrics([
      {
        expectedCitationMappings: evaluateExpectedCitationMappings(
          'Report-only mapped claim appears without a nearby citation anchor.',
          [
            {
              claim: 'Report-only mapped claim',
              expectedCitationIds: ['fixture:alpha'],
              gate: 'report-only',
              windowChars: 30,
            },
          ],
          expectedCitationMappingEvidenceBundle(),
        ),
      },
    ])
    const recommendation = buildLiveRendererRecommendation({
      renderers: [
        {
          id: 'compact-json',
          label: 'Compact JSON',
          mediaType: 'application/json',
        },
      ],
      totals: {
        renderers: {
          'compact-json': {
            runCount: 1,
            passCount: 1,
            failCount: 0,
            passRatePct: 100,
            failureCodeCounts: {},
            truncatedCount: 0,
            inferredTruncatedCount: 0,
            runtimeUserPrompt: {
              utf8Bytes: 120,
              chars: 120,
              estimatedTokens: 30,
            },
            answerOracle,
            expectedCitationMappings,
          },
        },
      },
    })
    const [entry] = recommendation.ranking

    assert.equal(answerOracle.distortionCount, 2)
    assert.equal(answerOracle.strictDistortionCount, 0)
    assert.equal(answerOracle.reportOnlyDistortionCount, 2)
    assert.equal(expectedCitationMappings.reportOnlyFailureCount, 1)
    assert.equal(expectedCitationMappings.strictProximityFailureCount, 0)
    assert.equal(recommendation.status, 'recommended')
    assert.equal(recommendation.recommendedRendererId, 'compact-json')
    assert.equal(entry.eligible, true)
    assert.deepEqual(entry.blockingReasons, [])
    assert.equal(entry.strictLive.strictOracleHitCount, 0)
    assert.equal(entry.strictLive.strictCitationMappingFailureCount, 0)
    assert.equal(entry.quality.answerOracle.reportOnlyDistortionCount, 2)
    assert.equal(entry.quality.expectedCitationMappings.reportOnlyFailureCount, 1)
  })

  it('preserves oracle distortion classification for forbidden configured patterns', () => {
    const oracleReport = evaluateAnswerOracle(
      'The answer says citations are optional and the production default is approved despite the fixture gate.',
      {
        forbiddenTerms: ['citations are optional'],
        forbiddenClaims: [{ allOf: ['production default', 'approved'] }],
      },
    )

    assert.equal(oracleReport.enabled, true)
    assert.equal(oracleReport.gate, 'strict')
    assert.equal(oracleReport.ok, false)
    assert.equal(oracleReport.metrics.forbiddenTermHitCount, 1)
    assert.equal(oracleReport.metrics.forbiddenClaimHitCount, 1)
    assert.equal(oracleReport.metrics.distortionCount, 2)
    assert.equal(oracleReport.metrics.unsupportedClaimHitCount, 0)
    assert.equal(oracleReport.metrics.contradictoryClaimHitCount, 0)
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      answerOracle: oracleReport,
    }), ['answer-oracle-distortion'])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      answerOracle: oracleReport,
    }), ['oracle_distortion'])
  })

  it('reports repeated live runtime pass variance and fails on any strict failed run', async (t) => {
    let callCount = 0
    const runtime = await startFixtureServer(async ({ response }) => {
      callCount += 1
      const passingRun = callCount % 2 === 1
      writeJson(response, 200, {
        choices: [
          {
            message: {
              content: passingRun
                ? 'Runtime Prompt Decision requires Prompt Codec Implementation [2](#citation-2), and Prompt Codec Implementation measured by Prompt renderer benchmark [3](#citation-3) before Runtime Prompt Validation [1](#citation-1).'
                : 'Runtime Prompt Decision is mentioned without the required relation or exact citation anchors.',
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: passingRun ? 10 : 6,
          total_tokens: passingRun ? 30 : 26,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--live-runs',
        '2',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '64',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /graph-linear-chain\/compact-json run 2\/2: live response must complete/)

    const report = JSON.parse(error.stdout)
    const liveRenderer = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(report.live.status, 'failed')
    assert.equal(report.live.validation.ok, false)
    assert.equal(report.live.runCount, 2)
    assert.equal(report.live.runtime.liveRuns, 2)
    assert.equal(report.live.totals.requestCount, 2)
    assert.equal(liveRenderer.runCount, 2)
    assert.equal(liveRenderer.passCount, 1)
    assert.equal(liveRenderer.passRatePct, 50)
    assert.equal(liveRenderer.pass, false)
    assert.equal(liveRenderer.representativeRunIndex, 2)
    assert.deepEqual(liveRenderer.runs.map((run) => run.pass), [true, false])
    assert.equal(liveRenderer.runs[1].requiredCitationAnchors.coveragePct, 0)
    assert.equal(liveRenderer.allRequiredCitationAnchorsCovered, false)
    assert.equal(liveRenderer.aggregate.runCount, 2)
    assert.equal(liveRenderer.aggregate.passCount, 1)
    assert.equal(liveRenderer.aggregate.passRatePct, 50)
    assert.equal(liveRenderer.aggregate.averageRequiredCitationAnchorCoveragePct, 50)
    assert.equal(Number.isFinite(liveRenderer.aggregate.averageAnswerOracleRequiredTermCoveragePct), true)
    assert.equal(liveRenderer.aggregate.averageAnswerOracleRequiredRelationCoveragePct, 50)
    assert.equal(liveRenderer.aggregate.variance.mixedPassStatus, true)
    assert.equal(liveRenderer.aggregate.variance.requiredCitationAnchorCoverageRangePct, 100)
    assert(liveRenderer.aggregate.latencyMs.min <= liveRenderer.aggregate.latencyMs.max)
    assert.equal(rendererTotals.runCount, 2)
    assert.equal(rendererTotals.passRatePct, 50)
    assert.equal(rendererTotals.variance.mixedPassStatus, true)
    assert.equal(runtime.requests.length, 2)
  })

  it('reports repeated live runtime prompt benchmark variance and fails any strict run', async (t) => {
    let requestCount = 0
    const runtime = await startFixtureServer(async ({ response }) => {
      requestCount += 1
      const isFailingRun = requestCount === 2
      writeJson(response, 200, {
        choices: [
          {
            message: {
              content: isFailingRun
                ? 'Repeated live run dropped one required citation [1](#citation-1).'
                : 'Repeated live run covered both required citations [1](#citation-1) [2](#citation-2).',
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: isFailingRun ? 5 : 7,
          total_tokens: isFailingRun ? 17 : 19,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--live-runs',
        '3',
        '--fixture',
        'single-source',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '32',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /single-source\/compact-json run 2\/3/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(report.live.runtime.liveRuns, 3)
    assert.equal(report.live.runCount, 3)
    assert.equal(report.live.totals.requestCount, 3)
    assert.equal(rendererReport.runCount, 3)
    assert.equal(rendererReport.passCount, 2)
    assert.equal(rendererReport.passRatePct, 66.67)
    assert.equal(rendererReport.pass, false)
    assert.equal(rendererReport.representativeRunIndex, 2)
    assert.equal(rendererReport.runs.length, 3)
    assert.equal(rendererReport.aggregate.variance.mixedPassStatus, true)
    assert.equal(rendererReport.aggregate.variance.requiredCitationAnchorCoverageRangePct, 50)
    assert.equal(rendererReport.averageRequiredCitationAnchorCoveragePct, 83.33)
    assert.deepEqual(rendererReport.averageUsage, {
      promptTokens: 12,
      completionTokens: 6.33,
      totalTokens: 18.33,
    })
    assert.equal(rendererTotals.requestCount, 3)
    assert.equal(rendererTotals.passRatePct, 66.67)
    assert.equal(rendererTotals.variance.mixedPassStatus, true)
    assert.equal(runtime.requests.length, 3)
  })

  it('classifies live runtime truncation from finish reason', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'length',
            message: {
              content: 'Truncated output still lists both citations [1](#citation-1) [2](#citation-2).',
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 32,
          total_tokens: 44,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'single-source',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '32',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /finish_reason indicates truncation: length/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.pass, false)
    assert.equal(rendererReport.finishReason, 'length')
    assert.equal(rendererReport.truncated, true)
    assert.deepEqual(rendererReport.truncation, {
      detected: true,
      inferred: false,
      reason: 'finish_reason_length',
      finishReason: 'length',
      completionTokens: 32,
      maxTokens: 32,
    })
    assert.deepEqual(rendererReport.failureBuckets, ['truncated'])
    assert.deepEqual(rendererReport.failureCodes, ['runtime_output_incomplete'])
    assert.equal(rendererReport.aggregate.truncatedCount, 1)
    assert.equal(rendererReport.aggregate.finishReasonCounts.length, 1)
    assert.equal(rendererReport.aggregate.failureBucketCounts.truncated, 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.runtime_output_incomplete, 1)
    assert.equal(rendererTotals.truncatedCount, 1)
    assert.equal(rendererTotals.finishReasonCounts.length, 1)
    assert.equal(rendererTotals.failureBucketCounts.truncated, 1)
    assert.equal(rendererTotals.failureCodeCounts.runtime_output_incomplete, 1)
  })

  it('infers live runtime truncation when finish reason is missing and max tokens are exhausted', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            message: {
              content: 'Output has the required citations but no finish reason [1](#citation-1) [2](#citation-2).',
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 32,
          total_tokens: 44,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'single-source',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '32',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /inferred truncation: completion_tokens 32 reached max_tokens 32/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.pass, false)
    assert.equal(rendererReport.finishReason, null)
    assert.equal(rendererReport.truncated, true)
    assert.deepEqual(rendererReport.truncation, {
      detected: true,
      inferred: true,
      reason: 'completion_tokens_reached_max_tokens',
      finishReason: null,
      completionTokens: 32,
      maxTokens: 32,
    })
    assert.deepEqual(rendererReport.failureCodes, ['runtime_output_incomplete'])
    assert.equal(rendererReport.aggregate.finishReasonCounts.none, 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.runtime_output_incomplete, 1)
    assert.equal(rendererTotals.truncatedCount, 1)
    assert.equal(rendererTotals.failureCodeCounts.runtime_output_incomplete, 1)
  })

  it('rejects citation stuffing away from expected claim mappings', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: [
                'Runtime Prompt Decision requires Prompt Codec Implementation.',
                'Prompt Codec Implementation measured by Prompt renderer benchmark before Runtime Prompt Validation.',
                'Padding separates claims from citation anchors.',
                'x'.repeat(260),
                '[1](#citation-1) [2](#citation-2) [3](#citation-3).',
              ].join(' '),
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 20,
          total_tokens: 40,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /expected citation mappings failed/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.answerOracle.ok, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, false)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedMappingCount, 2)
    assert.equal(rendererReport.expectedCitationMappings.metrics.satisfiedMappingCount, 0)
    assert.equal(rendererReport.expectedCitationMappings.metrics.coveragePct, 0)
    assert.equal(rendererReport.expectedCitationMappings.metrics.proximityFailureCount, 2)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedCitationMismatchCount, 0)
    assert.deepEqual(rendererReport.failureBuckets, ['citation-proximity'])
    assert.deepEqual(rendererReport.failureCodes, ['claim_citation_proximity_failed'])
    assert.equal(rendererReport.aggregate.failureBucketCounts['citation-proximity'], 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.claim_citation_proximity_failed, 1)
    assert.equal(rendererReport.averageExpectedCitationMappingCoveragePct, 0)
    assert.equal(rendererTotals.averageExpectedCitationMappingCoveragePct, 0)
    assert.equal(rendererTotals.failureBucketCounts['citation-proximity'], 1)
    assert.equal(rendererTotals.failureCodeCounts.claim_citation_proximity_failed, 1)
  })

  it('rejects nearby wrong citation anchors for expected claim mappings', async (t) => {
    const runtime = await startFixtureServer(async ({ response }) => {
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: [
                'Runtime Prompt Decision requires Prompt Codec Implementation [1](#citation-1).',
                'Padding separates the first expected claim from other anchors.',
                'x'.repeat(260),
                'Prompt Codec Implementation measured by Prompt renderer benchmark [2](#citation-2) before Runtime Prompt Validation.',
                'Padding separates the second expected claim from the complete anchor list.',
                'y'.repeat(260),
                'All required anchors exist away from the mapped claims: [1](#citation-1) [2](#citation-2) [3](#citation-3).',
              ].join(' '),
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 28,
          total_tokens: 48,
        },
      })
    })
    t.after(() => closeServer(runtime.server))

    let error
    try {
      await execFileAsync(process.execPath, [
        'scripts/benchmark-runtime-prompt.mjs',
        '--live',
        '--fixture',
        'graph-linear-chain',
        '--renderer',
        'compact-json',
        '--max-tokens',
        '128',
        '--timeout-ms',
        '10000',
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
          LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
          LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
        },
        maxBuffer: 1024 * 1024,
      })
    } catch (caught) {
      error = caught
    }

    assert(error)
    assert.equal(error.code, 1)
    assert.match(error.stderr, /expected-citation-mismatch/)
    assert.match(error.stderr, /expected_citation_mismatch/)

    const report = JSON.parse(error.stdout)
    const rendererReport = report.live.fixtures[0].renderers['compact-json']
    const rendererTotals = report.live.totals.renderers['compact-json']

    assert.equal(rendererReport.allRequiredCitationAnchorsCovered, true)
    assert.equal(rendererReport.answerOracle.ok, true)
    assert.equal(rendererReport.expectedCitationMappings.ok, false)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedMappingCount, 2)
    assert.equal(rendererReport.expectedCitationMappings.metrics.satisfiedMappingCount, 0)
    assert.equal(rendererReport.expectedCitationMappings.metrics.coveragePct, 0)
    assert.equal(rendererReport.expectedCitationMappings.metrics.expectedCitationMismatchCount, 2)
    assert.equal(rendererReport.expectedCitationMappings.metrics.proximityFailureCount, 0)
    assert.deepEqual(rendererReport.failureBuckets, ['expected-citation-mismatch'])
    assert.deepEqual(rendererReport.failureCodes, ['expected_citation_mismatch'])
    assert.equal(rendererReport.aggregate.failureBucketCounts['expected-citation-mismatch'], 1)
    assert.equal(rendererReport.aggregate.failureCodeCounts.expected_citation_mismatch, 1)
    assert.equal(rendererTotals.failureBucketCounts['expected-citation-mismatch'], 1)
    assert.equal(rendererTotals.failureCodeCounts.expected_citation_mismatch, 1)
  })

  it('reports missing expected claims for expected citation mappings', () => {
    const report = evaluateExpectedCitationMappings(
      'An unrelated answer still cites a valid source [1](#citation-1).',
      [
        {
          claim: 'Mapped claim that is absent',
          expectedCitationIds: ['fixture:alpha'],
          windowChars: 40,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(report.ok, false)
    assert.equal(report.metrics.expectedMappingCount, 1)
    assert.equal(report.metrics.missingClaimCount, 1)
    assert.equal(report.metrics.strictMissingClaimCount, 1)
    assert.match(report.failures[0], /expected claim missing/)
    assert.equal(report.mappingResults[0].occurrenceCount, 0)
  })

  it('exposes unknown expectedCitationId and invalid citation index details', () => {
    const report = evaluateExpectedCitationMappings(
      'Known mapped claim [1](#citation-1).',
      [
        {
          claim: 'Known mapped claim',
          expectedCitationIds: ['fixture:missing'],
          citationIndexes: [99],
          windowChars: 40,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(report.ok, false)
    assert.equal(report.metrics.expectedCitationMismatchCount, 0)
    assert.equal(report.metrics.targetResolutionFailureCount, 1)
    assert.equal(report.metrics.strictTargetResolutionFailureCount, 1)
    assert.equal(report.metrics.unresolvedExpectedCitationIdCount, 1)
    assert.equal(report.metrics.invalidExpectedCitationIndexCount, 1)
    assert.deepEqual(report.targetResolutionFailures[0].unresolvedCitationIds, ['fixture:missing'])
    assert.deepEqual(report.targetResolutionFailures[0].invalidCitationIndexes, ['99'])
    assert.equal(report.mappingResults[0].failureCode, 'expected_citation_target_unresolved')
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      expectedCitationMappings: report,
    }), ['expected-citation-target-unresolved'])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      expectedCitationMappings: report,
    }), ['expected_citation_target_unresolved'])
    assert.match(report.failures[0], /unknown citation id fixture:missing/)
    assert.match(report.failures[0], /invalid citation index 99/)
  })

  it('keeps report-only expected citation mappings from failing strict pass', () => {
    const report = evaluateExpectedCitationMappings(
      'Report-only mapped claim appears without a nearby citation anchor.',
      [
        {
          claim: 'Report-only mapped claim',
          expectedCitationIds: ['fixture:alpha'],
          gate: 'report-only',
          windowChars: 30,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
      'strict',
    )

    assert.equal(report.gate, 'strict')
    assert.equal(report.ok, true)
    assert.deepEqual(report.failures, [])
    assert.equal(report.metrics.strictFailureCount, 0)
    assert.equal(report.metrics.reportOnlyFailureCount, 1)
    assert.equal(report.metrics.proximityFailureCount, 1)
    assert.equal(report.metrics.strictProximityFailureCount, 0)
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      expectedCitationMappings: report,
    }), [])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      expectedCitationMappings: report,
    }), [])
    assert.match(report.reportOnlyFailures[0], /not within 30 chars/)
    assert.equal(report.mappingResults[0].gate, 'report-only')
  })

  it('keeps fixture-level report-only expected citation mappings report-only despite strict mapping overrides', () => {
    const report = evaluateExpectedCitationMappings(
      [
        'Fixture report-only mapped claim appears without a nearby citation anchor.',
        'Second fixture report-only mapped claim also appears without nearby support.',
      ].join(' '),
      [
        {
          claim: 'Fixture report-only mapped claim',
          expectedCitationIds: ['fixture:alpha'],
          gate: 'strict',
          windowChars: 30,
        },
        {
          claim: 'Second fixture report-only mapped claim',
          citationIndex: 2,
          reportOnly: false,
          windowChars: 30,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
      'report-only',
    )

    assert.equal(report.gate, 'report-only')
    assert.equal(report.ok, true)
    assert.deepEqual(report.failures, [])
    assert.equal(report.metrics.strictMappingCount, 0)
    assert.equal(report.metrics.reportOnlyMappingCount, 2)
    assert.equal(report.metrics.strictFailureCount, 0)
    assert.equal(report.metrics.reportOnlyFailureCount, 2)
    assert.equal(report.metrics.proximityFailureCount, 2)
    assert.equal(report.metrics.strictProximityFailureCount, 0)
    assert.deepEqual(report.mappingResults.map((mapping) => mapping.gate), ['report-only', 'report-only'])
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      expectedCitationMappings: report,
    }), [])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      expectedCitationMappings: report,
    }), [])
  })

  it('supports any and all require semantics for expected citation mappings', () => {
    const partialReport = evaluateExpectedCitationMappings(
      'Combined mapped claim [1](#citation-1).',
      [
        {
          claim: 'Combined mapped claim',
          expectedCitationIds: ['fixture:alpha', 'fixture:beta'],
          require: 'any',
          windowChars: 30,
        },
        {
          claim: 'Combined mapped claim',
          expectedCitationIds: ['fixture:alpha', 'fixture:beta'],
          require: 'all',
          windowChars: 30,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(partialReport.ok, false)
    assert.equal(partialReport.metrics.satisfiedMappingCount, 1)
    assert.equal(partialReport.metrics.expectedCitationMismatchCount, 1)
    assert.equal(partialReport.mappingResults[0].require, 'any')
    assert.equal(partialReport.mappingResults[0].satisfied, true)
    assert.deepEqual(partialReport.mappingResults[0].satisfiedOccurrence.matchedCitationIndexes, [1])
    assert.equal(partialReport.mappingResults[1].require, 'all')
    assert.equal(partialReport.mappingResults[1].satisfied, false)
    assert.deepEqual(partialReport.mappingResults[1].occurrences[0].missingCitationIndexes, [2])
    assert.match(partialReport.failures[0], /require=all/)

    const allReport = evaluateExpectedCitationMappings(
      'Combined mapped claim [1](#citation-1) [2](#citation-2).',
      [
        {
          claim: 'Combined mapped claim',
          expectedCitationIds: ['fixture:alpha', 'fixture:beta'],
          require: 'all',
          windowChars: 30,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(allReport.ok, true)
    assert.equal(allReport.metrics.satisfiedMappingCount, 1)
    assert.deepEqual(allReport.mappingResults[0].satisfiedOccurrence.matchedCitationIndexes, [1, 2])
  })

  it('passes expected citation mappings when a later repeated claim occurrence is cited', () => {
    const report = evaluateExpectedCitationMappings(
      [
        'Repeated mapped claim is initially uncited.',
        'x'.repeat(140),
        'Repeated mapped claim is supported here [2](#citation-2).',
      ].join(' '),
      [
        {
          claim: 'Repeated mapped claim',
          expectedCitationIds: ['fixture:beta'],
          windowChars: 35,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(report.ok, true)
    assert.equal(report.metrics.satisfiedMappingCount, 1)
    assert.equal(report.metrics.anyOccurrenceMappingCount, 1)
    assert.equal(report.metrics.everyOccurrenceMappingCount, 0)
    assert.equal(report.metrics.claimOccurrenceCount, 2)
    assert.equal(report.metrics.satisfiedOccurrenceCount, 1)
    assert.equal(report.metrics.unsatisfiedOccurrenceCount, 1)
    assert.equal(report.metrics.occurrenceCoveragePct, 50)
    assert.equal(report.mappingResults[0].occurrenceMode, 'any')
    assert.equal(report.mappingResults[0].occurrenceCount, 2)
    assert.equal(report.mappingResults[0].occurrences[0].satisfied, false)
    assert.equal(report.mappingResults[0].occurrences[1].satisfied, true)
    assert.deepEqual(report.mappingResults[0].satisfiedOccurrence.matchedCitationIndexes, [2])
  })

  it('requires every repeated claim occurrence when occurrenceMode is every', () => {
    const report = evaluateExpectedCitationMappings(
      [
        'Repeated mapped claim is supported first [2](#citation-2).',
        'x'.repeat(140),
        'Repeated mapped claim is supported again [2](#citation-2).',
      ].join(' '),
      [
        {
          claim: 'Repeated mapped claim',
          expectedCitationIds: ['fixture:beta'],
          occurrenceMode: 'every',
          windowChars: 35,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(report.ok, true)
    assert.equal(report.metrics.everyOccurrenceMappingCount, 1)
    assert.equal(report.metrics.anyOccurrenceMappingCount, 0)
    assert.equal(report.metrics.satisfiedMappingCount, 1)
    assert.equal(report.metrics.everyOccurrenceFailureCount, 0)
    assert.equal(report.metrics.claimOccurrenceCount, 2)
    assert.equal(report.metrics.satisfiedOccurrenceCount, 2)
    assert.equal(report.metrics.unsatisfiedOccurrenceCount, 0)
    assert.equal(report.metrics.occurrenceCoveragePct, 100)
    assert.equal(report.mappingResults[0].occurrenceMode, 'every')
    assert.equal(report.mappingResults[0].occurrenceCount, 2)
    assert.equal(report.mappingResults[0].everyOccurrenceSatisfied, true)
    assert.deepEqual(report.mappingResults[0].occurrences.map((occurrence) => occurrence.satisfied), [true, true])
  })

  it('fails every-occurrence expected citation mappings when one repeated claim is uncited', () => {
    const report = evaluateExpectedCitationMappings(
      [
        'Repeated mapped claim is initially uncited.',
        'x'.repeat(140),
        'Repeated mapped claim is supported here [2](#citation-2).',
      ].join(' '),
      [
        {
          claim: 'Repeated mapped claim',
          expectedCitationIds: ['fixture:beta'],
          occurrenceMode: 'every',
          windowChars: 35,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(report.ok, false)
    assert.equal(report.metrics.everyOccurrenceMappingCount, 1)
    assert.equal(report.metrics.satisfiedMappingCount, 0)
    assert.equal(report.metrics.everyOccurrenceFailureCount, 1)
    assert.equal(report.metrics.strictEveryOccurrenceFailureCount, 1)
    assert.equal(report.metrics.proximityFailureCount, 0)
    assert.equal(report.metrics.claimOccurrenceCount, 2)
    assert.equal(report.metrics.satisfiedOccurrenceCount, 1)
    assert.equal(report.metrics.unsatisfiedOccurrenceCount, 1)
    assert.equal(report.metrics.occurrenceCoveragePct, 50)
    assert.equal(report.mappingResults[0].occurrenceMode, 'every')
    assert.equal(report.mappingResults[0].satisfied, false)
    assert.equal(report.mappingResults[0].anyOccurrenceSatisfied, true)
    assert.equal(report.mappingResults[0].everyOccurrenceSatisfied, false)
    assert.equal(report.mappingResults[0].unsatisfiedOccurrenceCount, 1)
    assert.equal(report.mappingResults[0].failureCode, 'expected_citation_every_occurrence_failed')
    assert.match(report.failures[0], /occurrenceMode=every/)
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      expectedCitationMappings: report,
    }), ['expected-citation-every-occurrence'])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      expectedCitationMappings: report,
    }), ['expected_citation_every_occurrence_failed'])
  })

  it('keeps report-only every-occurrence mapping failures out of strict classification', () => {
    const report = evaluateExpectedCitationMappings(
      [
        'Report-only repeated mapped claim is initially uncited.',
        'x'.repeat(140),
        'Report-only repeated mapped claim is supported here [1](#citation-1).',
      ].join(' '),
      [
        {
          claim: 'Report-only repeated mapped claim',
          expectedCitationIds: ['fixture:alpha'],
          occurrenceMode: 'every',
          gate: 'report-only',
          windowChars: 35,
        },
      ],
      expectedCitationMappingEvidenceBundle(),
    )

    assert.equal(report.ok, true)
    assert.deepEqual(report.failures, [])
    assert.equal(report.metrics.everyOccurrenceFailureCount, 1)
    assert.equal(report.metrics.strictEveryOccurrenceFailureCount, 0)
    assert.equal(report.metrics.reportOnlyFailureCount, 1)
    assert.equal(report.metrics.claimOccurrenceCount, 2)
    assert.equal(report.metrics.satisfiedOccurrenceCount, 1)
    assert.equal(report.metrics.unsatisfiedOccurrenceCount, 1)
    assert.equal(report.metrics.occurrenceCoveragePct, 50)
    assert.equal(report.mappingResults[0].failureCode, 'expected_citation_every_occurrence_failed')
    assert.match(report.reportOnlyFailures[0], /occurrenceMode=every/)
    assert.deepEqual(classifyLiveRunFailureBuckets({
      status: 'ok',
      expectedCitationMappings: report,
    }), [])
    assert.deepEqual(classifyLiveRunFailureCodes({
      status: 'ok',
      expectedCitationMappings: report,
    }), [])
  })

  it('dry packs the npm tarball with expected files', async () => {
    const npm = npmPackCommand()
    const { stdout } = await execFileAsync(npm.file, npm.args, {
      cwd: packageRoot,
      maxBuffer: 1024 * 1024,
    })
    const [pack] = JSON.parse(stdout)
    const files = new Set(pack.files.map((file) => file.path))

    assert.equal(pack.name, 'llmwiki-agent-bridge')
    assert(files.has('package.json'))
    assert(files.has('src/index.mjs'))
    assert(files.has('bin/llmwiki-agent-bridge.mjs'))
    assert(files.has('docs/openapi.json'))
    assert(files.has('scripts/export-openapi.mjs'))
    assert(files.has('scripts/benchmark-runtime-prompt.mjs'))
    assert(files.has('README.md'))
    assert(files.has('LICENSE'))
    assert(files.has('integrations/README.md'))
    assert(files.has('integrations/codex/skills/llmwiki-serve/SKILL.md'))
    assert(files.has('integrations/claude-code/commands/llmwiki-query.md'))
    assert(files.has('integrations/copilot/copilot-instructions.md'))
  })
})

async function runRuntimePromptBenchmark(args, { env = {}, maxBuffer = 1024 * 1024 } = {}) {
  return await execFileAsync(process.execPath, ['scripts/benchmark-runtime-prompt.mjs', ...args], {
    cwd: packageRoot,
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer,
  })
}

function mockRuntimeEnv(runtime) {
  return {
    LLMWIKI_AGENT_BRIDGE_BASE_URL: `${runtime.url}/v1`,
    LLMWIKI_AGENT_BRIDGE_MODEL: 'mock-runtime-model',
    LLMWIKI_AGENT_BRIDGE_API_KEY: 'mock-runtime-key',
  }
}

function strictEvidenceFidelityAnswer({
  omitMultiHopRelation = false,
  wrongExactAnchor = false,
  citeFirstRepeatedOccurrence = true,
  includeUnsupportedAndContradictory = false,
} = {}) {
  const multiHopClaim = omitMultiHopRelation
    ? [
        'Promotion Decision requires Citation Fidelity Gate [1](#citation-1).',
        'Live Prompt Evaluation is part of the review evidence [2](#citation-2).',
      ].join(' ')
    : 'Promotion Decision requires Citation Fidelity Gate measured by Live Prompt Evaluation [1](#citation-1) [2](#citation-2).'
  const exactAnchorClaim = wrongExactAnchor
    ? [
        'Live Prompt Evaluation checks Exact Citation Anchor [2](#citation-2).',
        'Padding keeps the correct exact-anchor evidence away from the claim.',
        'x'.repeat(220),
        'The exact-anchor citation is only listed later [3](#citation-3).',
      ].join(' ')
    : 'Live Prompt Evaluation checks Exact Citation Anchor [3](#citation-3).'
  const repeatedClaim = [
    `Citation Fidelity Gate enforces Repeated Citation Gate${citeFirstRepeatedOccurrence ? ' [4](#citation-4)' : ''}.`,
    'Padding keeps repeated-claim occurrences independently testable.',
    'y'.repeat(220),
    'Citation Fidelity Gate enforces Repeated Citation Gate [4](#citation-4).',
  ].join(' ')
  const privacyClaim = 'Privacy Redaction Gate blocks Source Path Leak [5](#citation-5).'
  const distortionClaims = includeUnsupportedAndContradictory
    ? [
        'Token savings alone promote renderer [2](#citation-2).',
        'Raw source paths should be cited [5](#citation-5).',
        'Promotion Decision does not require Citation Fidelity Gate [1](#citation-1).',
        'Privacy Redaction Gate allows Source Path Leak [5](#citation-5).',
      ].join(' ')
    : ''

  return [
    multiHopClaim,
    exactAnchorClaim,
    repeatedClaim,
    privacyClaim,
    distortionClaims,
  ].filter(Boolean).join(' ')
}

async function tempConfigPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'llmwiki-agent-bridge-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, 'settings.json')
}

function npmPackCommand() {
  const args = ['pack', '--dry-run', '--json', '--ignore-scripts']
  return process.platform === 'win32'
    ? { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] }
    : { file: 'npm', args }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function knowledgeSource(id, name, protocol, url) {
  return {
    id,
    name,
    title: name,
    description: `${name} description`,
    protocol,
    status: 'ready',
    url,
    capabilities: ['llmwiki_context'],
    adapter: 'llmwiki-test',
    implementation: 'test-fixture',
  }
}

function observationValue(diagnostic, name) {
  return diagnostic.observations.find((observation) => observation.name === name)?.value
}

function citationEvidence(count) {
  return Array.from({ length: count }, (_, index) => ({
    page_id: `page-${index + 1}`,
    title: `Fallback Evidence ${index + 1}`,
    path: `page-${index + 1}.md`,
    snippet: `Fallback citation evidence ${index + 1}.`,
  }))
}

function expectedCitationMappingEvidenceBundle() {
  return {
    citationCount: 3,
    citations: [
      { id: 'fixture:alpha', title: 'Alpha Evidence' },
      { id: 'fixture:beta', title: 'Beta Evidence' },
      { id: 'fixture:gamma', title: 'Gamma Evidence' },
    ],
  }
}

function expectedFallbackAnswer(answer, citationCount) {
  const anchorCount = Math.min(citationCount, 5)
  const anchors = Array.from({ length: anchorCount }, (_, index) => {
    const citationIndex = index + 1
    return `[${citationIndex}](#citation-${citationIndex})`
  })
  const omittedCount = citationCount - anchorCount
  const omittedText = omittedCount > 0 ? ` +${omittedCount} more` : ''
  return `${answer.trimEnd()}\n\nEvidence used: ${anchors.join(' ')}${omittedText}`
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function testSafeId(value) {
  return String(value || 'source').replace(/[^a-zA-Z0-9]+/g, '_') || 'source'
}

function recordingLogger() {
  const lines = []
  return {
    lines,
    error(...args) {
      lines.push(args.map(String).join(' '))
    },
    log() {},
    warn() {},
  }
}

function jsonFetchResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function parseJsonFetchBody(value) {
  return value ? JSON.parse(String(value)) : {}
}

function extractHermesEvidenceBundleForPrompt(content) {
  const marker = '# LLMWiki evidence bundle\n'
  const markerIndex = content.indexOf(marker)
  assert(markerIndex >= 0)
  return content.slice(markerIndex + marker.length)
}

function parseHermesEvidenceBundle(content) {
  return JSON.parse(extractHermesEvidenceBundleForPrompt(content))
}

async function callBridgeMcp(bridge, id, method, params = undefined) {
  const response = await fetch(`${bridge.url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }),
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  return body
}

async function callBridgeMcpTool(bridge, id, name, args) {
  return callBridgeMcp(bridge, id, 'tools/call', {
    name,
    arguments: args,
  })
}

async function startFixtureServer(handler) {
  const requests = []
  const errors = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    const body = request.method === 'GET' ? {} : await readJsonBody(request)
    const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : value || '',
    ]))
    requests.push({ method: request.method, url, body, headers })
    try {
      await handler({ request, url, body, headers, response })
    } catch (error) {
      errors.push(error)
      writeJson(response, 500, {
        error: 'fixture handler failed',
      })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  assert.equal(typeof address, 'object')
  assert(address)
  return {
    server,
    requests,
    errors,
    url: `http://127.0.0.1:${address.port}`,
  }
}

async function closeServer(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function bridgeJsonRequest({ port, hostHeader, method = 'GET', path = '/', headers = {}, body }) {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const requestHeaders = {
    ...headers,
    ...(hostHeader ? { Host: hostHeader } : {}),
    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
  }

  return await new Promise((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: requestHeaders,
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: text,
            json: text ? JSON.parse(text) : null,
          })
        } catch (error) {
          reject(error)
        }
      })
    })

    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text ? JSON.parse(text) : {}
}

function writeJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}
