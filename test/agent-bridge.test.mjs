import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { DefaultAgentCardResolver } from '@a2a-js/sdk/client'

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
            page_id: missing ? 'missing-page' : 'manifest-page',
            title: missing ? 'Missing Manifest Evidence' : 'Manifest Evidence',
            path: missing ? 'missing.md' : 'manifest.md',
            snippet: `Evidence-only citation for ${body.query}.`,
          },
        ],
        graph: {
          nodes: [{ id: missing ? 'page:missing' : 'page:manifest', label: missing ? 'Missing' : 'Manifest' }],
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
      'manifest-wiki:manifest-page',
      'missing-manifest:missing-page',
    ])
    assert.deepEqual(artifact.graph.nodes.map((node) => node.id), [
      'manifest-wiki:page:manifest',
      'missing-manifest:page:missing',
    ])
    assert.equal(artifact.steps.some((step) => step.id === 'runtime-chat-completions'), false)
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
    const evidenceBundle = parseHermesEvidenceBundle(hermesUserMessage)
    const mcpArtifactBundle = artifact.sourceBundles.find((bundle) => bundle.connectionId === 'mcp-wiki')
    const mcpRuntimeBundle = evidenceBundle.sourceBundles.find((bundle) => bundle.connectionId === 'mcp-wiki')
    const mcpSourceRuntimeBundle = evidenceBundle.sources.find((source) => source.id === 'mcp-wiki').sourceBundle
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
    assert.deepEqual(mcpRuntimeBundle, mcpArtifactBundle)
    assert.deepEqual(mcpSourceRuntimeBundle, mcpArtifactBundle)
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
    assert.equal(sourceEvidence.graph.nodes.length, 40)
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
    assert.deepEqual(evidenceBundle.sources[0].citations.map((citation) => citation.id), [
      'protocol-wiki:protocol-overview',
      'protocol-wiki:adr-protocol-layer',
    ])
    assert.equal(evidenceBundle.sources[0].orientation[0].title, 'Protocol Map')
    assert.deepEqual(evidenceBundle.sources[0].limitations, ['Primary query did not include all ADRs.'])
    assert.deepEqual(evidenceBundle.sources[0].graph.nodes.map((node) => node.id), [
      'protocol-wiki:page:protocol-overview',
    ])
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
    assert.deepEqual(evidenceBundle.sources[0].citations.map((citation) => citation.id), [
      'dup-wiki:adr-protocol-layer',
      'dup-wiki:supplement',
    ])
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
    assert.deepEqual(evidenceBundle.sources[0].citations.map((citation) => citation.id), [
      'adr-wiki:release-notes',
      'adr-wiki:adr-0042',
    ])
    assert.deepEqual(evidenceBundle.citations.map((citation) => citation.id), [
      'adr-wiki:release-notes',
      'adr-wiki:adr-0042',
    ])
    assert.equal(evidenceBundle.citationDigest[0].id, 'adr-wiki:adr-0042')
    assert.equal(evidenceBundle.citationDigest[1].id, 'adr-wiki:release-notes')
    assert.match(hermesSystemMessage, /\[n\]\(#citation-n\)/)
    assert.match(hermesSystemMessage, /1-based index of the matching item in the evidence bundle citations array/)
    assert.match(hermesSystemMessage, /do not use citationDigest order or sourceRefs for numbering/)

    const digestIndex = hermesUserMessage.indexOf('"citationDigest"')
    const sourcesIndex = hermesUserMessage.indexOf('"sources"')
    const firstRelevantIndex = hermesUserMessage.indexOf('"id": "adr-wiki:adr-0042"')
    const firstSourceOrderIndex = hermesUserMessage.indexOf('"id": "adr-wiki:release-notes"')
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
    assert.match(hermesUserMessage, /"error": "Source query failed\."/)
    assert.match(hermesUserMessage, /"diagnostic"/)
    assert.match(hermesUserMessage, /"httpStatus"/)
    assert.doesNotMatch(hermesUserMessage, /backend exposed detail/)
    assert.doesNotMatch(hermesUserMessage, /127\.0\.0\.1/)
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
    assert(files.has('README.md'))
    assert(files.has('LICENSE'))
    assert(files.has('integrations/README.md'))
    assert(files.has('integrations/codex/skills/llmwiki-serve/SKILL.md'))
    assert(files.has('integrations/claude-code/commands/llmwiki-query.md'))
    assert(files.has('integrations/copilot/copilot-instructions.md'))
  })
})

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

function parseHermesEvidenceBundle(content) {
  const marker = '# LLMWiki evidence bundle\n'
  const markerIndex = content.indexOf(marker)
  assert(markerIndex >= 0)
  return JSON.parse(content.slice(markerIndex + marker.length))
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
