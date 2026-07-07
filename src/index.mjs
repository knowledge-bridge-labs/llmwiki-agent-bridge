import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { AGENT_CARD_PATH } from '@a2a-js/sdk'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8788
const DEFAULT_AGENT_BASE_URL = 'http://127.0.0.1:8642/v1'
const DEFAULT_AGENT_MODEL = 'hermes-agent'
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
const DEFAULT_SOURCE_POLICY = 'private-http'
const DEFAULT_ORCHESTRATION_MODE = 'delegated-runtime'
const DEFAULT_RUNTIME_PROFILE = 'hermes'
const DEFAULT_RUNTIME_ID = 'llmwiki-agent-bridge-hermes'
const DEFAULT_RUNTIME_NAME = 'LLMWiki Agent Bridge for Hermes'
const DEFAULT_RUNTIME_KIND = 'hermes'
const DEFAULT_AGENT_RUNTIME = 'hermes'
const DEFAULT_PROVIDER_ORGANIZATION = 'LLMWiki'
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_EVIDENCE_ITEMS_PER_SOURCE = 8
const MAX_SEARCH_AUGMENT_QUERIES = 2
const MAX_SEARCH_AUGMENT_RESULTS_PER_QUERY = 4
const MAX_SEARCH_AUGMENT_TERMS = 6
const MAX_CITATION_DIGEST_ITEMS = 8
const MAX_CITATION_DIGEST_SNIPPET_CHARS = 320
const MAX_FALLBACK_CITATION_ANCHORS = 5
const MAX_SOURCE_BUNDLE_REFS = 40
const MAX_TRACE_CITATION_REFS = 5
const MAX_TRACE_SOURCE_REFS = 5
const MAX_TRACE_TEXT_CHARS = 160
const MAX_TRACE_DETAIL_CHARS = 360
const DIAGNOSTIC_SCHEMA_VERSION = 'llmwiki.agent-bridge.diagnostic.v1'
const AGENT_CARD_ROUTE = `/${AGENT_CARD_PATH}`
const MESSAGE_SEND_ROUTE = '/message:send'
const MCP_ROUTE = '/mcp'
const SETTINGS_ROUTE = '/settings'
const SETTINGS_JSON_ROUTE = '/settings.json'
const SETTINGS_CONFIG_JSON_ROUTE = '/settings/config.json'
const SETTINGS_SOURCES_JSON_ROUTE = '/settings/sources.json'
const CONFIG_PATH_ENV = 'LLMWIKI_AGENT_BRIDGE_CONFIG_PATH'
const DEPRECATED_CONFIG_PATH_ENV = 'HERMES_A2A_BRIDGE_CONFIG_PATH'
const PUBLIC_BIND_OPT_IN_ENV = 'LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND'
const INSECURE_PUBLIC_BIND_OPT_IN_ENV = 'LLMWIKI_AGENT_BRIDGE_ALLOW_INSECURE_PUBLIC_BIND'
const DEPRECATED_PUBLIC_BIND_OPT_IN_ENV = 'HERMES_A2A_BRIDGE_ALLOW_PUBLIC_BIND'
const DEPRECATED_INSECURE_PUBLIC_BIND_OPT_IN_ENV = 'HERMES_A2A_BRIDGE_ALLOW_INSECURE_PUBLIC_BIND'
const relevanceStopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'did',
  'do',
  'does',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'to',
  'use',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
])
const searchAugmentStopWords = new Set([
  ...relevanceStopWords,
  'about',
  'answer',
  'answered',
  'brief',
  'briefly',
  'citation',
  'citations',
  'cite',
  'cited',
  'page',
  'pages',
  'record',
  'recorded',
  'records',
  'relevant',
  'result',
  'results',
  'say',
  'says',
  'show',
  'tell',
  'was',
  'were',
  'wiki',
])
const searchAugmentTrailingTerms = new Set(['decision', 'decisions'])
const sourcePolicyAliases = new Map([
  ['default', DEFAULT_SOURCE_POLICY],
  ['open', DEFAULT_SOURCE_POLICY],
  ['private-http', DEFAULT_SOURCE_POLICY],
  ['allowlist', 'allowlist'],
  ['public-https', 'public-https'],
])
const runtimeProfiles = {
  hermes: {
    runtimeId: DEFAULT_RUNTIME_ID,
    runtimeName: DEFAULT_RUNTIME_NAME,
    runtime: DEFAULT_RUNTIME_KIND,
    agentRuntime: DEFAULT_AGENT_RUNTIME,
    providerOrganization: DEFAULT_PROVIDER_ORGANIZATION,
  },
  deepagents: {
    runtimeId: 'llmwiki-agent-bridge-deepagents',
    runtimeName: 'LLMWiki DeepAgents Agent Bridge',
    runtime: 'deepagents',
    agentRuntime: 'deepagents',
    providerOrganization: 'DeepAgents',
  },
  generic: {
    runtimeId: 'llmwiki-agent-bridge-generic-openai-compatible',
    runtimeName: 'LLMWiki Generic OpenAI-Compatible Agent Bridge',
    runtime: 'generic-openai-compatible',
    agentRuntime: 'openai-compatible',
    providerOrganization: 'Generic OpenAI-Compatible',
  },
}
const runtimeProfileAliases = new Map([
  ['hermes', 'hermes'],
  ['deepagents', 'deepagents'],
  ['generic', 'generic'],
  ['openaicompatible', 'generic'],
])
const orchestrationModes = new Set(['evidence-only', 'delegated-runtime', 'hybrid'])

const unavailableIpv4CidrBlocks = [
  { base: [0, 0, 0, 0], prefixLength: 8 },
  { base: [10, 0, 0, 0], prefixLength: 8 },
  { base: [100, 64, 0, 0], prefixLength: 10 },
  { base: [127, 0, 0, 0], prefixLength: 8 },
  { base: [169, 254, 0, 0], prefixLength: 16 },
  { base: [172, 16, 0, 0], prefixLength: 12 },
  { base: [192, 0, 0, 0], prefixLength: 24 },
  { base: [192, 0, 2, 0], prefixLength: 24 },
  { base: [192, 168, 0, 0], prefixLength: 16 },
  { base: [198, 18, 0, 0], prefixLength: 15 },
  { base: [198, 51, 100, 0], prefixLength: 24 },
  { base: [203, 0, 113, 0], prefixLength: 24 },
  { base: [224, 0, 0, 0], prefixLength: 4 },
  { base: [240, 0, 0, 0], prefixLength: 4 },
]

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  Vary: 'Origin',
}

let mcpRequestId = 0

export function createAgentBridge(options = {}) {
  const config = bridgeConfig(options.env || process.env, options)
  return createAgentBridgeServer(config)
}

function createAgentBridgeServer(config) {
  return createServer((request, response) => {
    void handleBridgeRequest(request, response, config)
  })
}

export async function startAgentBridge(options = {}) {
  const config = bridgeConfig(options.env || process.env, options)
  const server = createAgentBridgeServer(config)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  const selectedPort = typeof address === 'object' && address ? address.port : config.port
  config.port = selectedPort
  return {
    server,
    config,
    url: `http://${hostForUrl(config.host)}:${selectedPort}`,
  }
}

export const createHermesA2aBridge = createAgentBridge
export const startHermesA2aBridge = startAgentBridge

export function agentBridgeOpenApi({ version = '0.1.0' } = {}) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LLMWiki Agent Bridge',
      version,
      description: 'Local runtime bridge for selected LLMWiki Knowledge Sources and OpenAI-compatible chat completions runtimes.',
    },
    servers: [
      {
        url: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
        description: 'Default local development bridge',
      },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Bridge health and runtime profile metadata',
          responses: {
            200: jsonResponse('Bridge health', '#/components/schemas/HealthResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [AGENT_CARD_ROUTE]: {
        get: {
          summary: 'A2A-style agent card for bridge discovery',
          responses: {
            200: jsonResponse('Agent card', '#/components/schemas/AgentCardResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [SETTINGS_ROUTE]: {
        get: {
          summary: 'Static bridge settings screen',
          responses: {
            200: htmlResponse('Settings screen'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [SETTINGS_JSON_ROUTE]: {
        get: {
          summary: 'Redacted bridge runtime configuration',
          responses: {
            200: jsonResponse('Redacted settings', '#/components/schemas/SettingsResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [SETTINGS_CONFIG_JSON_ROUTE]: {
        put: {
          summary: 'Persist bridge runtime, network, and source policy settings',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SettingsConfigRequest' },
              },
            },
          },
          responses: {
            200: jsonResponse('Saved settings result', '#/components/schemas/SettingsConfigResponse'),
            400: jsonResponse('Bad settings request', '#/components/schemas/ErrorResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
            409: jsonResponse('Settings persistence disabled', '#/components/schemas/ErrorResponse'),
            413: jsonResponse('Request body too large', '#/components/schemas/ErrorResponse'),
            500: jsonResponse('Settings persistence failure', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [SETTINGS_SOURCES_JSON_ROUTE]: {
        get: {
          summary: 'Registered Knowledge Sources',
          responses: {
            200: jsonResponse('Registered sources', '#/components/schemas/SettingsSourcesResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
          },
        },
        put: {
          summary: 'Persist registered Knowledge Sources',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SettingsSourcesRequest' },
              },
            },
          },
          responses: {
            200: jsonResponse('Saved registered sources', '#/components/schemas/SettingsSourcesResponse'),
            400: jsonResponse('Bad sources request', '#/components/schemas/ErrorResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
            409: jsonResponse('Settings persistence disabled', '#/components/schemas/ErrorResponse'),
            413: jsonResponse('Request body too large', '#/components/schemas/ErrorResponse'),
            500: jsonResponse('Settings persistence failure', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [MESSAGE_SEND_ROUTE]: {
        post: {
          summary: 'Run a grounded answer request through selected Knowledge Sources',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/MessageSendEnvelope' },
                    { $ref: '#/components/schemas/MessageSendData' },
                  ],
                },
              },
            },
          },
          responses: {
            200: jsonResponse('Completed bridge task', '#/components/schemas/MessageSendResponse'),
            400: jsonResponse('Bad request', '#/components/schemas/ErrorResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
            413: jsonResponse('Request body too large', '#/components/schemas/ErrorResponse'),
            500: jsonResponse('Unexpected bridge failure', '#/components/schemas/ErrorResponse'),
            502: jsonResponse('Runtime chat completions failure', '#/components/schemas/ErrorResponse'),
          },
        },
      },
      [MCP_ROUTE]: {
        post: {
          summary: 'MCP-style JSON-RPC bridge tool endpoint',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/McpJsonRpcRequest' },
              },
            },
          },
          responses: {
            200: jsonResponse('MCP JSON-RPC response', '#/components/schemas/McpJsonRpcResponse'),
            400: jsonResponse('Bad request', '#/components/schemas/ErrorResponse'),
            401: jsonResponse('Unauthorized', '#/components/schemas/ErrorResponse'),
            403: jsonResponse('Origin not allowed', '#/components/schemas/ErrorResponse'),
            413: jsonResponse('Request body too large', '#/components/schemas/ErrorResponse'),
            500: jsonResponse('Unexpected bridge failure', '#/components/schemas/ErrorResponse'),
            502: jsonResponse('Runtime chat completions failure', '#/components/schemas/ErrorResponse'),
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: objectSchema({
          status: { const: 'ok' },
          runtime: { const: 'llmwiki-agent-bridge' },
          runtimeProfile: { enum: ['hermes', 'deepagents', 'generic'] },
          runtimeId: { type: 'string' },
          agentRuntime: { type: 'string' },
          modelConfigured: { type: 'boolean' },
          hermesModelConfigured: { type: 'boolean' },
          configuredAllowedOrigins: { type: 'integer', minimum: 0 },
          sourcePolicy: { enum: ['private-http', 'allowlist', 'public-https'] },
        }, ['status', 'runtime', 'runtimeProfile', 'runtimeId', 'agentRuntime', 'modelConfigured', 'hermesModelConfigured', 'configuredAllowedOrigins', 'sourcePolicy']),
        AgentCardResponse: objectSchema({
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          protocol: { const: 'a2a' },
          runtime: { type: 'string' },
          agentRuntime: { type: 'string' },
          provider: objectSchema({
            organization: { type: 'string' },
          }, ['organization']),
          url: { const: MESSAGE_SEND_ROUTE },
          capabilities: objectSchema({
            streaming: { type: 'boolean' },
            structuredArtifacts: { type: 'boolean' },
            localBridge: { type: 'boolean' },
            knowledgeSourceProtocols: {
              type: 'array',
              items: { enum: ['llmwiki-http', 'mcp', 'a2a'] },
            },
          }, ['streaming', 'structuredArtifacts', 'localBridge', 'knowledgeSourceProtocols']),
          metadata: objectSchema({
            bridge: { const: 'llmwiki-agent-bridge' },
            runtimeProfile: { enum: ['hermes', 'deepagents', 'generic'] },
            modelConfigured: { type: 'boolean' },
            hermesModelConfigured: { type: 'boolean' },
            sourcePolicy: { enum: ['private-http', 'allowlist', 'public-https'] },
            settingsUrl: { const: SETTINGS_ROUTE },
            protocolSurface: objectSchema({
              a2a: { const: 'compatible' },
              mcp: { const: 'compatible' },
            }, ['a2a', 'mcp']),
          }, ['bridge', 'runtimeProfile', 'modelConfigured', 'hermesModelConfigured', 'sourcePolicy', 'settingsUrl', 'protocolSurface']),
        }, ['id', 'name', 'description', 'protocol', 'runtime', 'agentRuntime', 'provider', 'url', 'capabilities', 'metadata']),
        MessageSendEnvelope: objectSchema({
          data: { $ref: '#/components/schemas/MessageSendData' },
        }, ['data']),
        MessageSendData: objectSchema({
          query: { type: 'string', minLength: 1 },
          orchestrationMode: {
            $ref: '#/components/schemas/OrchestrationMode',
            default: DEFAULT_ORCHESTRATION_MODE,
          },
          mode: {
            $ref: '#/components/schemas/OrchestrationMode',
            default: DEFAULT_ORCHESTRATION_MODE,
          },
          knowledgeSources: {
            type: 'array',
            items: { $ref: '#/components/schemas/KnowledgeSourceDescriptor' },
            default: [],
          },
          knowledge_sources: {
            type: 'array',
            items: { $ref: '#/components/schemas/KnowledgeSourceDescriptor' },
            default: [],
          },
        }, ['query']),
        KnowledgeSourceDescriptor: objectSchema({
          id: { type: 'string' },
          name: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          protocol: { enum: ['llmwiki-http', 'mcp', 'a2a'] },
          status: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          selected: { type: 'boolean' },
          capabilities: {
            type: 'array',
            items: { type: 'string' },
          },
          adapter: { type: 'string' },
          implementation: { type: 'string' },
        }, ['protocol', 'status', 'url']),
        MessageSendResponse: objectSchema({
          id: { type: 'string' },
          requestId: { type: 'string' },
          traceId: { type: 'string' },
          status: objectSchema({
            state: { const: 'completed' },
            message: { $ref: '#/components/schemas/TaskStatusMessage' },
          }, ['state', 'message']),
          message: { $ref: '#/components/schemas/AgentMessage' },
          artifacts: {
            type: 'array',
            items: { $ref: '#/components/schemas/Artifact' },
          },
        }, ['id', 'requestId', 'traceId', 'status', 'message', 'artifacts']),
        TaskStatusMessage: objectSchema({
          parts: {
            type: 'array',
            items: { $ref: '#/components/schemas/TextPart' },
          },
        }, ['parts']),
        AgentMessage: objectSchema({
          role: { const: 'agent' },
          parts: {
            type: 'array',
            items: { $ref: '#/components/schemas/TextPart' },
          },
        }, ['role', 'parts']),
        Artifact: objectSchema({
          name: { const: 'llmwiki_agent_result' },
          parts: {
            type: 'array',
            items: { $ref: '#/components/schemas/DataPart' },
          },
        }, ['name', 'parts']),
        TextPart: objectSchema({
          kind: { const: 'text' },
          text: { type: 'string' },
        }, ['kind', 'text']),
        DataPart: objectSchema({
          kind: { const: 'data' },
          data: { $ref: '#/components/schemas/AgentResult' },
        }, ['kind', 'data']),
        AgentResult: objectSchema({
          requestId: { type: 'string' },
          traceId: { type: 'string' },
          answer: { type: 'string' },
          orchestrationMode: { $ref: '#/components/schemas/OrchestrationMode' },
          citations: {
            type: 'array',
            items: { $ref: '#/components/schemas/Citation' },
          },
          graph: { $ref: '#/components/schemas/Graph' },
          steps: {
            type: 'array',
            items: { $ref: '#/components/schemas/TraceStep' },
          },
          sourceBundles: {
            type: 'array',
            items: { $ref: '#/components/schemas/SourceBundle' },
          },
          diagnostics: {
            type: 'array',
            items: { $ref: '#/components/schemas/Diagnostic' },
          },
        }, ['requestId', 'traceId', 'answer', 'orchestrationMode', 'citations', 'graph', 'steps', 'sourceBundles', 'diagnostics']),
        OrchestrationMode: {
          enum: ['evidence-only', 'delegated-runtime', 'hybrid'],
        },
        SettingsResponse: objectSchema({
          bridge: { const: 'llmwiki-agent-bridge' },
          endpoints: objectSchema({
            health: { const: '/health' },
            agentCard: { const: AGENT_CARD_ROUTE },
            messageSend: { const: MESSAGE_SEND_ROUTE },
            mcp: { const: MCP_ROUTE },
            settings: { const: SETTINGS_ROUTE },
            settingsJson: { const: SETTINGS_JSON_ROUTE },
            settingsConfigJson: { const: SETTINGS_CONFIG_JSON_ROUTE },
            settingsSourcesJson: { const: SETTINGS_SOURCES_JSON_ROUTE },
          }, ['health', 'agentCard', 'messageSend', 'mcp', 'settings', 'settingsJson', 'settingsConfigJson', 'settingsSourcesJson']),
          runtime: objectSchema({
            profile: { enum: ['hermes', 'deepagents', 'generic'] },
            id: { type: 'string' },
            name: { type: 'string' },
            runtime: { type: 'string' },
            agentRuntime: { type: 'string' },
            providerOrganization: { type: 'string' },
          }, ['profile', 'id', 'name', 'runtime', 'agentRuntime', 'providerOrganization']),
          runtimeConnection: objectSchema({
            baseUrl: { type: 'string' },
            modelConfigured: { type: 'boolean' },
            apiKeyConfigured: { type: 'boolean' },
            requestTimeoutMs: { type: 'integer', minimum: 0 },
          }, ['baseUrl', 'modelConfigured', 'apiKeyConfigured', 'requestTimeoutMs']),
          bridgeAuth: objectSchema({
            bearerTokenConfigured: { type: 'boolean' },
          }, ['bearerTokenConfigured']),
          network: objectSchema({
            host: { type: 'string' },
            port: { type: 'integer', minimum: 0 },
            publicBind: { type: 'boolean' },
            allowPublicBind: { type: 'boolean' },
            allowInsecurePublicBind: { type: 'boolean' },
            configuredAllowedOrigins: { type: 'integer', minimum: 0 },
            allowedOrigins: {
              type: 'array',
              items: { type: 'string' },
            },
          }, ['host', 'port', 'publicBind', 'allowPublicBind', 'allowInsecurePublicBind', 'configuredAllowedOrigins', 'allowedOrigins']),
          sourcePolicy: objectSchema({
            policy: { enum: ['private-http', 'allowlist', 'public-https'] },
            configuredAllowedSourceOrigins: { type: 'integer', minimum: 0 },
            allowedSourceOrigins: {
              type: 'array',
              items: { type: 'string' },
            },
          }, ['policy', 'configuredAllowedSourceOrigins', 'allowedSourceOrigins']),
          persistence: { $ref: '#/components/schemas/SettingsPersistence' },
        }, ['bridge', 'endpoints', 'runtime', 'runtimeConnection', 'bridgeAuth', 'network', 'sourcePolicy', 'persistence']),
        SettingsConfigRequest: objectSchema({
          runtimeProfile: { enum: ['hermes', 'deepagents', 'generic'] },
          runtimeId: { type: 'string' },
          runtimeName: { type: 'string' },
          runtime: { type: 'string' },
          agentRuntime: { type: 'string' },
          providerOrganization: { type: 'string' },
          host: { type: 'string' },
          port: { oneOf: [{ type: 'integer', minimum: 0, maximum: 65535 }, { type: 'string' }] },
          baseUrl: { type: 'string' },
          hermesBaseUrl: { type: 'string' },
          apiKey: { type: 'string' },
          hermesApiKey: { type: 'string' },
          model: { type: 'string' },
          hermesModel: { type: 'string' },
          requestTimeoutMs: { oneOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }] },
          timeoutMs: { oneOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }] },
          allowedOrigins: { $ref: '#/components/schemas/StringListSetting' },
          allowedSourceOrigins: { $ref: '#/components/schemas/StringListSetting' },
          sourcePolicy: { enum: ['private-http', 'allowlist', 'public-https'] },
          bridgeBearerToken: { type: 'string' },
          bearerToken: { type: 'string' },
          allowPublicBind: { type: 'boolean' },
          allowInsecurePublicBind: { type: 'boolean' },
        }),
        SettingsConfigResponse: objectSchema({
          status: { const: 'saved' },
          applied: { type: 'array', items: { type: 'string' } },
          restartRequired: { type: 'array', items: { type: 'string' } },
          settings: { $ref: '#/components/schemas/SettingsResponse' },
          persistence: { $ref: '#/components/schemas/SettingsPersistence' },
        }, ['status', 'applied', 'restartRequired', 'settings', 'persistence']),
        SettingsSourcesRequest: objectSchema({
          sources: {
            type: 'array',
            items: { $ref: '#/components/schemas/KnowledgeSourceDescriptor' },
          },
        }, ['sources']),
        SettingsSourcesResponse: objectSchema({
          status: { type: 'string' },
          sources: {
            type: 'array',
            items: { $ref: '#/components/schemas/KnowledgeSourceDescriptor' },
          },
          persistence: { $ref: '#/components/schemas/SettingsPersistence' },
        }, ['sources', 'persistence']),
        SettingsPersistence: objectSchema({
          enabled: { type: 'boolean' },
          configPathConfigured: { type: 'boolean' },
          registeredSources: { type: 'integer', minimum: 0 },
        }, ['enabled', 'configPathConfigured', 'registeredSources']),
        StringListSetting: {
          oneOf: [
            {
              type: 'array',
              items: { type: 'string' },
            },
            { type: 'string' },
          ],
        },
        McpJsonRpcRequest: objectSchema({
          jsonrpc: { const: '2.0' },
          id: { $ref: '#/components/schemas/JsonRpcId' },
          method: { enum: ['tools/list', 'tools/call'] },
          params: { type: 'object', additionalProperties: true },
        }, ['jsonrpc', 'method']),
        McpJsonRpcResponse: {
          oneOf: [
            { $ref: '#/components/schemas/McpJsonRpcSuccessResponse' },
            { $ref: '#/components/schemas/McpJsonRpcErrorResponse' },
          ],
        },
        McpJsonRpcSuccessResponse: objectSchema({
          jsonrpc: { const: '2.0' },
          id: { $ref: '#/components/schemas/JsonRpcId' },
          result: {
            oneOf: [
              { $ref: '#/components/schemas/McpToolListResult' },
              { $ref: '#/components/schemas/McpToolCallResult' },
            ],
          },
        }, ['jsonrpc', 'id', 'result']),
        McpJsonRpcErrorResponse: objectSchema({
          jsonrpc: { const: '2.0' },
          id: { $ref: '#/components/schemas/JsonRpcId' },
          error: objectSchema({
            code: { type: 'integer' },
            message: { type: 'string' },
          }, ['code', 'message']),
        }, ['jsonrpc', 'id', 'error']),
        JsonRpcId: {
          oneOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'null' },
          ],
        },
        McpToolListResult: objectSchema({
          tools: {
            type: 'array',
            items: { $ref: '#/components/schemas/McpToolDescriptor' },
          },
        }, ['tools']),
        McpToolDescriptor: objectSchema({
          name: { const: 'llmwiki_agent_run' },
          description: { type: 'string' },
          inputSchema: { type: 'object', additionalProperties: true },
        }, ['name', 'description', 'inputSchema']),
        McpToolCallResult: objectSchema({
          content: {
            type: 'array',
            items: { $ref: '#/components/schemas/McpContentPart' },
          },
          structuredContent: objectSchema({
            llmwiki_agent_result: { $ref: '#/components/schemas/AgentResult' },
          }, ['llmwiki_agent_result']),
          isError: { type: 'boolean' },
        }, ['content', 'structuredContent', 'isError']),
        McpContentPart: objectSchema({
          type: { const: 'text' },
          text: { type: 'string' },
        }, ['type', 'text']),
        Citation: objectSchema({
          id: { type: 'string' },
          title: { type: 'string' },
          path: { type: 'string' },
          snippet: { type: 'string' },
          connectionId: { type: 'string' },
          sourceRefs: {
            type: 'array',
            items: { type: 'string' },
          },
        }, ['id', 'title', 'connectionId']),
        SourceBundle: objectSchema({
          connectionId: { type: 'string' },
          sourceId: { type: 'string' },
          bundleId: { type: 'string' },
          title: { type: 'string' },
          capabilities: {
            type: 'array',
            items: { type: 'string' },
          },
          adapter: { type: 'string' },
          implementation: { type: 'string' },
          projection: { $ref: '#/components/schemas/SourceBundleProjection' },
          rawOrigins: { $ref: '#/components/schemas/SourceBundleRawOrigins' },
          sourceRefs: {
            type: 'array',
            items: { $ref: '#/components/schemas/SourceBundleSourceRef' },
          },
          sourceRefCount: { type: 'number' },
        }, ['connectionId', 'sourceId']),
        SourceBundleProjection: objectSchema({
          signature: { type: 'string' },
          pageCount: { type: 'number' },
          approvedPageCount: { type: 'number' },
          graphNodeCount: { type: 'number' },
          graphEdgeCount: { type: 'number' },
          sourceRefCount: { type: 'number' },
        }),
        SourceBundleRawOrigins: objectSchema({
          enabled: { type: 'boolean' },
          metadataOnly: { type: 'boolean' },
          originCount: { type: 'number' },
          publicRootLabelCount: { type: 'number' },
        }),
        SourceBundleSourceRef: objectSchema({
          id: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string' },
          uri: { type: 'string' },
        }),
        Graph: objectSchema({
          nodes: {
            type: 'array',
            items: { $ref: '#/components/schemas/GraphNode' },
          },
          edges: {
            type: 'array',
            items: { $ref: '#/components/schemas/GraphEdge' },
          },
        }, ['nodes', 'edges']),
        GraphNode: objectSchema({
          id: { type: 'string' },
          label: { type: 'string' },
          kind: { type: 'string' },
          path: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
        }, ['id']),
        GraphEdge: objectSchema({
          source: { type: 'string' },
          target: { type: 'string' },
          relation: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
        }, ['source', 'target']),
        TraceCitationRef: objectSchema({
          id: { type: 'string' },
          title: { type: 'string' },
          path: { type: 'string' },
          sourceRefs: { type: 'array', items: { type: 'string' } },
        }),
        DiagnosticObservation: objectSchema({
          name: { type: 'string' },
          value: { type: 'string' },
        }, ['name', 'value']),
        Diagnostic: objectSchema({
          schemaVersion: { const: DIAGNOSTIC_SCHEMA_VERSION },
          severity: { enum: ['warning', 'error'] },
          scope: { enum: ['source', 'runtime', 'bridge'] },
          phase: { type: 'string' },
          protocol: { type: 'string' },
          subject: { type: 'string' },
          retryable: { type: 'boolean' },
          redacted: { type: 'boolean' },
          observations: {
            type: 'array',
            items: { $ref: '#/components/schemas/DiagnosticObservation' },
          },
          remediation: { type: 'string' },
          message: { type: 'string' },
        }, ['schemaVersion', 'severity', 'scope', 'phase', 'retryable', 'redacted', 'observations', 'message']),
        TraceStep: objectSchema({
          id: { type: 'string' },
          label: { type: 'string' },
          status: { enum: ['running', 'done', 'error'] },
          detail: { type: 'string' },
          connectionId: { type: 'string' },
          toolName: { type: 'string' },
          citationIds: { type: 'array', items: { type: 'string' } },
          citationRefs: {
            type: 'array',
            items: { $ref: '#/components/schemas/TraceCitationRef' },
          },
          parentId: { type: 'string' },
          latencyMs: { type: 'integer', minimum: 0 },
          timestamp: { type: 'string', format: 'date-time' },
          error: { type: 'string' },
          diagnostic: { $ref: '#/components/schemas/Diagnostic' },
        }, ['id', 'label', 'status', 'timestamp']),
        ErrorResponse: objectSchema({
          error: objectSchema({
            code: { type: 'string' },
            message: { type: 'string' },
          }, ['code', 'message']),
          requestId: { type: 'string' },
          traceId: { type: 'string' },
          steps: {
            type: 'array',
            items: { $ref: '#/components/schemas/TraceStep' },
          },
          diagnostics: {
            type: 'array',
            items: { $ref: '#/components/schemas/Diagnostic' },
          },
        }, ['error']),
      },
    },
  }
}

function jsonResponse(description, ref) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: ref },
      },
    },
  }
}

function htmlResponse(description) {
  return {
    description,
    content: {
      'text/html': {
        schema: { type: 'string' },
      },
    },
  }
}

function objectSchema(properties, required = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  }
}

function requestRunContext(request) {
  return normalizedRunContext({
    requestId: headerValue(request.headers, 'x-request-id'),
    traceId: headerValue(request.headers, 'x-trace-id'),
  })
}

function normalizedRunContext(input = {}) {
  return {
    requestId: safeRunIdentifier(input.requestId) || randomUUID(),
    traceId: safeRunIdentifier(input.traceId) || randomUUID(),
  }
}

function headerValue(headers, name) {
  const value = headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

function safeRunIdentifier(value) {
  const text = readStringValue(value).trim()
  return /^[A-Za-z0-9._:-]{1,128}$/.test(text) ? text : ''
}

function errorResponseBody(httpError, fallbackContext = null) {
  return removeUndefinedProperties({
    error: {
      code: httpError.code,
      message: httpError.message,
    },
    requestId: httpError.requestId || fallbackContext?.requestId,
    traceId: httpError.traceId || fallbackContext?.traceId,
    steps: Array.isArray(httpError.steps) && httpError.steps.length ? httpError.steps : undefined,
    diagnostics: Array.isArray(httpError.diagnostics) && httpError.diagnostics.length
      ? httpError.diagnostics
      : undefined,
  })
}

async function handleBridgeRequest(request, response, config) {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${config.host}:${config.port}`}`)
  let messageRunContext = null

  try {
    if (!isAllowedBridgeOrigin(request.headers.origin, config, request)) {
      writeJson(response, 403, {
        error: {
          code: 'origin_not_allowed',
          message: 'Origin is not allowed by this local LLMWiki Agent Bridge.',
        },
      }, config, request)
      return
    }

    if (request.method === 'OPTIONS') {
      writeJson(response, 204, null, config, request)
      return
    }

    if (request.method === 'GET' && url.pathname === SETTINGS_ROUTE) {
      writeHtml(response, 200, settingsHtml(), config, request)
      return
    }

    if (!isAuthorizedBridgeRequest(request, config)) {
      writeJson(response, 401, {
        error: {
          code: 'bridge_unauthorized',
          message: 'Bridge bearer token is required.',
        },
      }, config, request)
      return
    }

    if (request.method === 'GET' && url.pathname === AGENT_CARD_ROUTE) {
      writeJson(response, 200, agentCard(config), config, request)
      return
    }

    if (request.method === 'GET' && url.pathname === SETTINGS_JSON_ROUTE) {
      writeJson(response, 200, redactedBridgeSettings(config, request), config, request)
      return
    }

    if (request.method === 'PUT' && url.pathname === SETTINGS_CONFIG_JSON_ROUTE) {
      const body = await readJsonBody(request)
      const result = saveBridgeConfigSettings(body, config, request)
      writeJson(response, 200, result, config, request)
      return
    }

    if (request.method === 'GET' && url.pathname === SETTINGS_SOURCES_JSON_ROUTE) {
      writeJson(response, 200, registeredSourcesResponse(config), config, request)
      return
    }

    if (request.method === 'PUT' && url.pathname === SETTINGS_SOURCES_JSON_ROUTE) {
      const body = await readJsonBody(request)
      const result = saveRegisteredSources(body, config)
      writeJson(response, 200, result, config, request)
      return
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      writeJson(response, 200, {
        status: 'ok',
        runtime: 'llmwiki-agent-bridge',
        runtimeProfile: config.runtimeProfile,
        runtimeId: config.runtimeId,
        agentRuntime: config.agentRuntime,
        modelConfigured: Boolean(config.model),
        hermesModelConfigured: Boolean(config.hermesModel),
        configuredAllowedOrigins: config.allowedOrigins.length,
        sourcePolicy: config.sourcePolicy,
      }, config, request)
      return
    }

    if (request.method === 'POST' && url.pathname === MESSAGE_SEND_ROUTE) {
      messageRunContext = requestRunContext(request)
      const body = await readJsonBody(request)
      const result = await runA2aMessage(body, config, messageRunContext)
      writeJson(response, 200, result, config, request)
      return
    }

    if (request.method === 'POST' && url.pathname === MCP_ROUTE) {
      const body = await readJsonBody(request)
      const result = await handleMcpJsonRpc(body, config)
      writeJson(response, 200, result, config, request)
      return
    }

    writeJson(response, 404, { error: { code: 'not_found', message: 'Not found.' } }, config, request)
  } catch (error) {
    const httpError = error instanceof HttpError ? error : new HttpError(500, 'Bridge request failed.', 'bridge_error')
    config.logger.error(redactedLogLine('bridge request failed', error))
    writeJson(response, httpError.status, errorResponseBody(httpError, messageRunContext), config, request)
  }
}

async function runA2aMessage(body, config, runContextInput = {}) {
  const runContext = normalizedRunContext(runContextInput)
  const diagnostics = []
  const { query, sources, orchestrationMode } = parseA2aRunRequest(body, config)
  const readySources = sources.filter(isSelectedReadySource)
  const steps = [
    step({
      id: 'bridge-plan',
      label: 'Plan source calls',
      status: 'done',
      detail: `Prepared ${readySources.length} selected ready Knowledge Source(s) for ${orchestrationMode} answering.`,
    }),
  ]
  const sourceResults = []
  const sourceFailures = []
  const sourceBundles = []

  for (const source of readySources) {
    const toolStep = step({
      id: `tool-${safeId(source.id)}`,
      label: `Call ${source.name}`,
      status: 'running',
      connectionId: source.id,
      toolName: toolNameFor(source),
      detail: `Calling selected ${source.protocol} Knowledge Source.`,
      parentId: 'bridge-plan',
    })
    steps.push(toolStep)
    const started = performance.now()

    try {
      const sourceBundle = await readSourceBundle(source, config, steps, toolStep.id, diagnostics)
      if (sourceBundle) sourceBundles.push(sourceBundle)
      const payload = await queryKnowledgeSource(source, query, config)
      const normalized = normalizeKnowledgeResult(source, payload)
      sourceResults.push({ source, result: normalized, sourceBundle })
      const citationRefs = traceCitationRefs(normalized.citations)
      replaceStep(steps, {
        ...toolStep,
        status: 'done',
        detail: sourceStepDetail(normalized, citationRefs),
        citationIds: normalized.citations.map((citation) => citation.id),
        citationRefs,
        latencyMs: Math.round(performance.now() - started),
      })
    } catch (error) {
      config.logger.error(redactedLogLine(`source ${source.id} failed`, error))
      const diagnostic = sourceQueryDiagnostic(source, error, config)
      diagnostics.push(diagnostic)
      sourceFailures.push({
        source,
        error: 'Source query failed.',
        diagnostic,
      })
      replaceStep(steps, {
        ...toolStep,
        status: 'error',
        detail: `${source.name} could not be queried by the bridge.`,
        error: 'Source query failed.',
        diagnostic,
        latencyMs: Math.round(performance.now() - started),
      })
    }
  }

  const citations = dedupeCitations(sourceResults.flatMap((item) => item.result.citations))
  const graph = mergeGraphs(sourceResults.map((item) => item.result.graph).filter(Boolean))
  steps.push(step({
    id: 'bridge-evidence',
    label: 'Prepare evidence',
    status: 'done',
    detail: `Prepared ${citations.length} citation(s), ${graph.nodes.length} graph node(s), ${sourceBundles.length} source bundle metadata record(s), and ${sourceFailures.length} source failure note(s).`,
  }))

  let answer = ''

  if (orchestrationMode === 'evidence-only') {
    answer = evidenceOnlyAnswer({
      query,
      sourceResults,
      sourceFailures,
      citations,
      graph,
      sourceBundles,
    })
    steps.push(step({
      id: 'bridge-evidence-only-answer',
      label: 'Build evidence-only answer',
      status: 'done',
      detail: 'Built an evidence-only result without calling the configured runtime.',
    }))
  } else {
    const completionsStep = step({
      id: 'runtime-chat-completions',
      label: 'Call chat completions',
      status: 'running',
      detail: 'Sending grounded evidence to the configured OpenAI-compatible chat completions endpoint.',
    })
    steps.push(completionsStep)
    const completionsStarted = performance.now()

    try {
      answer = await callHermesChatCompletions({
        query,
        sourceResults,
        sourceFailures,
        citations,
        graph,
        config,
      })
      const citationFallback = answerWithFallbackCitationAnchors(answer, citations)
      answer = citationFallback.answer
      replaceStep(steps, {
        ...completionsStep,
        status: 'done',
        detail: citationFallback.applied
          ? 'The chat completions endpoint returned a grounded markdown answer. The bridge appended bounded fallback citation anchors because the runtime returned none.'
          : 'The chat completions endpoint returned a grounded markdown answer.',
        latencyMs: Math.round(performance.now() - completionsStarted),
      })
    } catch (error) {
      config.logger.error(redactedLogLine('chat completions failed', error))
      const diagnostic = runtimeChatCompletionsDiagnostic(error, config)
      diagnostics.push(diagnostic)
      replaceStep(steps, {
        ...completionsStep,
        status: 'error',
        detail: 'Chat completions request failed.',
        error: 'Chat completions request failed.',
        diagnostic,
        latencyMs: Math.round(performance.now() - completionsStarted),
      })
      throw new HttpError(502, 'Chat completions request failed.', 'chat_completions_failed', {
        requestId: runContext.requestId,
        traceId: runContext.traceId,
        steps,
        diagnostics,
      })
    }
  }

  steps.push(step({
    id: 'bridge-final-answer',
    label: 'Return A2A artifact',
    status: 'done',
    detail: 'Returned a structured llmwiki_agent_result artifact.',
  }))

  const artifactData = {
    requestId: runContext.requestId,
    traceId: runContext.traceId,
    answer,
    orchestrationMode,
    citations,
    graph,
    steps,
    sourceBundles,
    diagnostics,
  }

  return {
    id: randomUUID(),
    requestId: runContext.requestId,
    traceId: runContext.traceId,
    status: {
      state: 'completed',
      message: {
        parts: [{ kind: 'text', text: answer }],
      },
    },
    message: {
      role: 'agent',
      parts: [{ kind: 'text', text: answer }],
    },
    artifacts: [
      {
        name: 'llmwiki_agent_result',
        parts: [
          {
            kind: 'data',
            data: artifactData,
          },
        ],
      },
    ],
  }
}

async function handleMcpJsonRpc(body, config) {
  const request = asRecord(body)
  const id = jsonRpcId(request?.id)
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return mcpJsonRpcError(id, -32600, 'Invalid JSON-RPC request.')
  }

  if (request.method === 'tools/list') {
    return mcpJsonRpcSuccess(id, {
      serverInfo: {
        name: 'llmwiki-agent-bridge',
        settingsUrl: SETTINGS_ROUTE,
      },
      tools: [llmwikiAgentRunToolDescriptor()],
    })
  }

  if (request.method === 'tools/call') {
    return handleMcpToolsCall(request, id, config)
  }

  return mcpJsonRpcError(id, -32601, `Method not found: ${request.method}`)
}

async function handleMcpToolsCall(request, id, config) {
  const params = asRecord(request.params)
  const name = readString(params || {}, 'name')
  if (!params || name !== 'llmwiki_agent_run') {
    return mcpJsonRpcError(id, -32602, 'MCP tools/call params.name must be llmwiki_agent_run.')
  }

  const args = asRecord(params.arguments) || {}
  const a2aBody = asRecord(args.data) ? args : { data: args }
  try {
    const a2a = await runA2aMessage(a2aBody, config)
    const agentResult = extractLlmwikiAgentResult(a2a)
    return mcpJsonRpcSuccess(id, {
      content: [
        {
          type: 'text',
          text: agentResult.answer || '',
        },
      ],
      structuredContent: {
        llmwiki_agent_result: agentResult,
      },
      isError: false,
    })
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) {
      return mcpJsonRpcError(id, -32602, error.message)
    }
    throw error
  }
}

function llmwikiAgentRunToolDescriptor() {
  return {
    name: 'llmwiki_agent_run',
    description: 'Run an LLMWiki grounded answer request through the configured bridge runtime.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          description: 'Question to answer using selected Knowledge Sources.',
        },
        orchestrationMode: {
          enum: ['evidence-only', 'delegated-runtime', 'hybrid'],
          default: DEFAULT_ORCHESTRATION_MODE,
          description: 'Run mode. evidence-only skips the configured runtime; delegated-runtime preserves the default runtime call.',
        },
        mode: {
          enum: ['evidence-only', 'delegated-runtime', 'hybrid'],
          default: DEFAULT_ORCHESTRATION_MODE,
          description: 'Alias for orchestrationMode.',
        },
        knowledgeSources: {
          type: 'array',
          items: knowledgeSourceInputSchema(),
          default: [],
        },
        knowledge_sources: {
          type: 'array',
          items: knowledgeSourceInputSchema(),
          default: [],
        },
      },
    },
  }
}

function knowledgeSourceInputSchema() {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['protocol', 'status', 'url'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      protocol: { enum: ['llmwiki-http', 'mcp', 'a2a'] },
      status: { type: 'string' },
      url: { type: 'string' },
      selected: { type: 'boolean' },
      capabilities: { type: 'array', items: { type: 'string' } },
      adapter: { type: 'string' },
      implementation: { type: 'string' },
    },
  }
}

function extractLlmwikiAgentResult(a2a) {
  for (const artifact of readRecordArray(a2a?.artifacts)) {
    if (readString(artifact, 'name') !== 'llmwiki_agent_result') continue
    const data = extractRecordFromParts(artifact.parts) || asRecord(artifact.data)
    if (data) return data
  }
  throw new Error('A2A run did not return a llmwiki_agent_result artifact.')
}

function mcpJsonRpcSuccess(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

function mcpJsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  }
}

function jsonRpcId(value) {
  return typeof value === 'string' || typeof value === 'number' || value === null ? value : null
}

async function readSourceBundle(source, config, steps, parentId, diagnostics = []) {
  if (source.protocol === 'llmwiki-http') {
    return readLlmwikiHttpSourceBundle(source, config, steps, parentId, diagnostics)
  }

  if (source.protocol === 'mcp') {
    return readMcpSourceBundle(source, config, steps, parentId, diagnostics)
  }

  return null
}

async function readLlmwikiHttpSourceBundle(source, config, steps, parentId, diagnostics = []) {
  if (source.protocol !== 'llmwiki-http') return null

  const discoveryUrls = [
    { url: joinUrl(source.url, '/source-bundle'), label: 'source bundle' },
    { url: joinUrl(source.url, '/manifest'), label: 'manifest' },
  ].filter((item) => isAllowedKnowledgeSourceFetchUrl(item.url, config))
  if (!discoveryUrls.length) return null

  const manifestStep = step({
    id: `source-manifest-${safeId(source.id)}`,
    label: `Read ${source.name} source bundle`,
    status: 'running',
    connectionId: source.id,
    detail: 'Reading llmwiki-http source bundle discovery metadata.',
    parentId,
  })
  steps.push(manifestStep)
  const started = performance.now()
  let lastError = null

  for (const candidate of discoveryUrls) {
    try {
      const manifest = await fetchKnowledgeSourceJson(candidate.url, { method: 'GET' }, `llmwiki-http ${candidate.label}`, config)
      const sourceBundle = normalizeSourceBundleManifest(source, manifest)
      if (!sourceBundle) {
        lastError = new Error(`${candidate.label} did not include source bundle metadata.`)
        continue
      }
      replaceStep(steps, {
        ...manifestStep,
        status: 'done',
        detail: `Read safe ${candidate.label} metadata.`,
        latencyMs: Math.round(performance.now() - started),
      })
      return sourceBundle
    } catch (error) {
      lastError = error
      config.logger.warn(redactedLogLine(`source ${source.id} ${candidate.label} unavailable`, error))
    }
  }

  const diagnostic = sourceBundleDiagnostic(source, lastError, config)
  diagnostics.push(diagnostic)
  replaceStep(steps, {
    ...manifestStep,
    status: 'error',
    detail: `${source.name} source bundle metadata could not be read; continuing without it.`,
    error: 'Source bundle unavailable.',
    diagnostic,
    latencyMs: Math.round(performance.now() - started),
  })
  if (lastError) config.logger.warn(redactedLogLine(`source ${source.id} source bundle discovery unavailable`, lastError))
  return null
}

async function readMcpSourceBundle(source, config, steps, parentId, diagnostics = []) {
  if (
    Array.isArray(source.capabilities)
    && source.capabilities.length > 0
    && !source.capabilities.includes('llmwiki_source_bundle')
  ) {
    return null
  }

  const manifestStep = step({
    id: `source-manifest-${safeId(source.id)}`,
    label: `Read ${source.name} source bundle`,
    status: 'running',
    connectionId: source.id,
    detail: 'Reading MCP source bundle discovery metadata.',
    parentId,
  })
  steps.push(manifestStep)
  const started = performance.now()

  try {
    const manifest = await callMcpTool(source, 'llmwiki_source_bundle', {}, config)
    const sourceBundle = normalizeSourceBundleManifest(source, manifest)
    if (!sourceBundle) throw new Error('MCP source bundle response did not include source bundle metadata.')
    replaceStep(steps, {
      ...manifestStep,
      status: 'done',
      detail: 'Read safe MCP source bundle metadata.',
      latencyMs: Math.round(performance.now() - started),
    })
    return sourceBundle
  } catch (error) {
    config.logger.warn(redactedLogLine(`source ${source.id} MCP source bundle unavailable`, error))
    const diagnostic = sourceBundleDiagnostic(source, error, config)
    diagnostics.push(diagnostic)
    replaceStep(steps, {
      ...manifestStep,
      status: 'error',
      detail: `${source.name} MCP source bundle metadata could not be read; continuing without it.`,
      error: 'Source bundle unavailable.',
      diagnostic,
      latencyMs: Math.round(performance.now() - started),
    })
    return null
  }
}

async function queryKnowledgeSource(source, query, config) {
  assertAllowedKnowledgeSourceFetchUrl(source.url, config)

  if (source.protocol === 'llmwiki-http') {
    return queryLlmwikiHttpSource(source, query, config)
  }

  if (source.protocol === 'mcp') {
    return callMcpTool(source, 'llmwiki_context', { query, limit: MAX_EVIDENCE_ITEMS_PER_SOURCE }, config)
  }

  if (source.protocol === 'a2a') {
    return queryA2aSource(source, query, config)
  }

  throw new Error(`Unsupported Knowledge Source protocol: ${source.protocol}`)
}

async function queryLlmwikiHttpSource(source, query, config) {
  const primaryPayload = await postKnowledgeSourceJson(joinUrl(source.url, '/query'), {
    query,
    limit: MAX_EVIDENCE_ITEMS_PER_SOURCE,
  }, 'llmwiki-http query', config)
  const searchResults = []

  for (const variant of compactSearchQueryVariants(query)) {
    try {
      const searchPayload = await postKnowledgeSourceJson(joinUrl(source.url, '/search'), {
        query: variant,
        limit: MAX_SEARCH_AUGMENT_RESULTS_PER_QUERY,
      }, 'llmwiki-http search', config)
      searchResults.push(...searchResultsFromPayload(searchPayload))
    } catch (error) {
      config.logger.warn(redactedLogLine(`source ${source.id} search augmentation failed`, error))
    }
  }

  return mergeSearchResultsIntoKnowledgePayload(primaryPayload, searchResults)
}

async function callMcpTool(source, name, args, config) {
  const envelope = await postKnowledgeSourceJson(mcpEndpointUrl(source.url), {
    jsonrpc: '2.0',
    id: ++mcpRequestId,
    method: 'tools/call',
    params: { name, arguments: args },
  }, `mcp ${name}`, config)
  const error = asRecord(envelope.error)
  if (error) throw new Error('MCP tool returned a JSON-RPC error.')
  const result = asRecord(envelope.result)
  if (!result) throw new Error('MCP tool returned no result object.')
  if (result.isError === true) throw new Error('MCP tool returned an error result.')

  return asRecord(result.structuredContent)
    || asRecord(result.structured_content)
    || asRecord(result.data)
    || extractRecordFromParts(result.content)
    || result
}

async function queryA2aSource(source, query, config) {
  const cardUrl = a2aAgentCardUrl(source.url)
  const card = await fetchKnowledgeSourceJson(cardUrl, {}, 'a2a agent card', config)
  const messageUrl = resolveA2aMessageUrl(card, cardUrl)
  if (!isAllowedA2aKnowledgeSourceMessageUrl(messageUrl, config)) {
    throw new Error('A2A source agent card message URL is not allowed.')
  }
  const message = await postKnowledgeSourceJson(messageUrl, { data: { query } }, 'a2a message', config)
  assertNoA2aError(message)
  return extractA2aContextPayload(message) || fallbackA2aContextPayload(source, message)
}

function evidenceOnlyAnswer({ sourceResults, sourceFailures, citations, graph, sourceBundles }) {
  const lines = [
    `Evidence-only result: the bridge gathered ${citations.length} citation(s) from ${sourceResults.length} Knowledge Source(s) and did not call the configured runtime.`,
    `Graph: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s).`,
  ]

  if (sourceBundles.length) {
    lines.push(`Source bundles: ${sourceBundles.map((bundle) => bundle.bundleId || bundle.sourceId).join(', ')}.`)
  }

  if (citations.length) {
    lines.push('', 'Citations:')
    for (const citation of citations.slice(0, MAX_CITATION_DIGEST_ITEMS)) {
      lines.push(`- ${citation.id}: ${citation.title}`)
    }
    if (citations.length > MAX_CITATION_DIGEST_ITEMS) {
      lines.push(`- ${citations.length - MAX_CITATION_DIGEST_ITEMS} additional citation(s) omitted from this summary.`)
    }
  } else {
    lines.push('', 'Citations: none returned by selected Knowledge Sources.')
  }

  if (sourceFailures.length) {
    lines.push('', `Source failures: ${sourceFailures.length} selected source(s) could not be queried. See trace steps for redacted details.`)
  }

  return lines.join('\n')
}

function answerWithFallbackCitationAnchors(answer, citations) {
  if (!citations.length || hasValidCitationAnchor(answer, citations)) {
    return { answer, applied: false }
  }

  const anchorCount = Math.min(citations.length, MAX_FALLBACK_CITATION_ANCHORS)
  const anchors = Array.from({ length: anchorCount }, (_, index) => {
    const citationIndex = index + 1
    return `[${citationIndex}](#citation-${citationIndex})`
  })
  const omittedCount = citations.length - anchorCount
  const omittedText = omittedCount > 0 ? ` +${omittedCount} more` : ''
  const evidenceLine = `Evidence used: ${anchors.join(' ')}${omittedText}`
  const baseAnswer = answer.trimEnd()
  return {
    answer: baseAnswer ? `${baseAnswer}\n\n${evidenceLine}` : evidenceLine,
    applied: true,
  }
}

function hasValidCitationAnchor(answer, citations) {
  const anchorPattern = /\[(\d+)\]\(#citation-(\d+)\)/g
  let match
  while ((match = anchorPattern.exec(answer)) !== null) {
    if (match.index > 0 && answer[match.index - 1] === '!') continue
    const [labelIndexText, targetIndexText] = match.slice(1)
    const citationIndex = Number(labelIndexText)
    if (
      labelIndexText === targetIndexText
      && String(citationIndex) === labelIndexText
      && citationIndex >= 1
      && citationIndex <= citations.length
    ) {
      return true
    }
  }
  return false
}

async function callHermesChatCompletions({ query, sourceResults, sourceFailures, citations, graph, config }) {
  const body = {
    ...(config.hermesModel ? { model: config.hermesModel } : {}),
    messages: hermesMessages({ query, sourceResults, sourceFailures, citations, graph }),
    temperature: 0.2,
    stream: false,
  }
  const headers = { 'Content-Type': 'application/json' }
  if (config.hermesApiKey) headers.Authorization = `Bearer ${config.hermesApiKey}`

  const payload = await fetchJson(chatCompletionsUrl(config.hermesBaseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, 'chat completions', config)
  return extractHermesAnswer(payload) || 'The chat completions endpoint returned no answer text.'
}

function hermesMessages({ query, sourceResults, sourceFailures, citations, graph }) {
  const sourceCorpusSummaries = sourceResults.map(({ source, result }) => sourceCorpusSummary(source, result))
  const mergedCorpusSummary = mergeCorpusSummaries(sourceCorpusSummaries)
  const sourceBundles = sourceResults.map(({ sourceBundle }) => sourceBundle).filter(Boolean)
  const evidenceBundle = {
    question: query,
    citationDigest: rankedCitationDigest(query, citations),
    citations,
    sources: sourceResults.map(({ result, sourceBundle }, index) => ({
      ...sourceCorpusSummaries[index],
      ...(sourceBundle ? { sourceBundle } : {}),
      orientation: result.orientation,
      citations: result.citations,
      limitations: result.limitations,
      graph: {
        nodes: result.graph?.nodes?.slice(0, 40) || [],
        edges: result.graph?.edges?.slice(0, 80) || [],
      },
    })),
    sourceFailures: sourceFailures.map(({ source, error, diagnostic }) => ({
      id: source.id,
      name: source.name,
      protocol: source.protocol,
      error,
      ...(diagnostic ? { diagnostic } : {}),
    })),
    mergedGraphSummary: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      ...(mergedCorpusSummary.pageCount !== undefined ? { corpusPageCount: mergedCorpusSummary.pageCount } : {}),
      ...(mergedCorpusSummary.approvedPageCount !== undefined ? { corpusApprovedPageCount: mergedCorpusSummary.approvedPageCount } : {}),
      sampleNodes: graph.nodes.slice(0, 20),
      sampleEdges: graph.edges.slice(0, 40),
    },
    mergedCorpusSummary,
    sourceBundles,
    citationCount: citations.length,
  }

  return [
    {
      role: 'system',
      content: [
        'You are answering through a local LLMWiki Agent Bridge.',
        'Answer in grounded markdown using only the provided LLMWiki evidence.',
        'Every factual claim that relies on evidence must include markdown citation anchors near the claim, formatted exactly as [n](#citation-n).',
        'Use n as the 1-based index of the matching item in the evidence bundle citations array; do not use citationDigest order or sourceRefs for numbering.',
        'When one claim needs several sources, include several anchors after that claim.',
        'If evidence is incomplete or a source failed, state the limitation plainly.',
        'Do not expose API keys, request headers, or bridge internals.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        '# User question',
        query,
        '',
        '# LLMWiki evidence bundle',
        JSON.stringify(evidenceBundle, null, 2),
      ].join('\n'),
    },
  ]
}

function sourceCorpusSummary(source, result) {
  return {
    id: source.id,
    name: source.name,
    protocol: source.protocol,
    ...(result.description ? { description: result.description } : {}),
    wikiTitle: result.wikiTitle,
    ...(result.adapter ? { adapter: result.adapter } : {}),
    ...(result.implementation ? { implementation: result.implementation } : {}),
    ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
    ...(result.approvedPageCount !== undefined ? { approvedPageCount: result.approvedPageCount } : {}),
  }
}

function mergeCorpusSummaries(sourceCorpusSummaries) {
  const pageCounts = sourceCorpusSummaries.map((summary) => summary.pageCount).filter(isFiniteNumber)
  const approvedPageCounts = sourceCorpusSummaries.map((summary) => summary.approvedPageCount).filter(isFiniteNumber)
  return {
    sourceCount: sourceCorpusSummaries.length,
    ...(pageCounts.length ? { pageCount: sumNumbers(pageCounts) } : {}),
    ...(approvedPageCounts.length ? { approvedPageCount: sumNumbers(approvedPageCounts) } : {}),
    sources: sourceCorpusSummaries,
  }
}

function rankedCitationDigest(query, citations) {
  return citations
    .map((citation, index) => ({
      citation,
      index,
      score: citationRelevanceScore(query, citation),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_CITATION_DIGEST_ITEMS)
    .map(({ citation }) => ({
      id: citation.id,
      title: citation.title,
      ...(citation.path ? { path: citation.path } : {}),
      ...(citation.snippet ? { snippet: truncateCitationSnippet(citation.snippet) } : {}),
      ...(citation.sourceRefs?.length ? { sourceRefs: citation.sourceRefs } : {}),
    }))
}

function citationRelevanceScore(query, citation) {
  const queryTokens = relevanceTokens(query)
  if (!queryTokens.length) return 0

  return [
    { text: citation.title, tokenWeight: 8, phraseWeight: 18 },
    { text: citation.path, tokenWeight: 5, phraseWeight: 12 },
    { text: citation.snippet, tokenWeight: 1, phraseWeight: 4 },
  ].reduce((score, field) => {
    const fieldTokens = new Set(relevanceTokens(field.text))
    const tokenScore = matchingTokenCount(queryTokens, fieldTokens) * field.tokenWeight
    const phraseScore = longestQueryPhraseMatchLength(queryTokens, field.text) * field.phraseWeight
    return score + tokenScore + phraseScore
  }, exactTitleMatchBoost(query, citation.title))
}

function matchingTokenCount(tokens, fieldTokens) {
  let count = 0
  for (const token of new Set(tokens)) {
    if (fieldTokens.has(token)) count += 1
  }
  return count
}

function exactTitleMatchBoost(query, title) {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedTitle = normalizeSearchText(title)
  if (!normalizedQuery || !normalizedTitle) return 0
  if (normalizedQuery.includes(normalizedTitle) || normalizedTitle.includes(normalizedQuery)) return 40
  return 0
}

function longestQueryPhraseMatchLength(queryTokens, fieldText) {
  const normalizedField = normalizeSearchText(fieldText)
  if (queryTokens.length < 2 || !normalizedField) return 0

  for (let length = Math.min(6, queryTokens.length); length >= 2; length -= 1) {
    for (let index = 0; index <= queryTokens.length - length; index += 1) {
      if (normalizedField.includes(queryTokens.slice(index, index + length).join(' '))) return length
    }
  }
  return 0
}

function relevanceTokens(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token && !relevanceStopWords.has(token))
}

function normalizeSearchText(value) {
  return readableMarkdown(String(value || ''))
    .toLowerCase()
    .replace(/['`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compactSearchQueryVariants(query) {
  const tokens = uniqueSearchTokens(
    relevanceTokens(query).filter((token) => !searchAugmentStopWords.has(token)),
  )
  if (!tokens.length) return []

  const subjectFirst = [
    ...tokens.filter((token) => !searchAugmentTrailingTerms.has(token)),
    ...tokens.filter((token) => searchAugmentTrailingTerms.has(token)),
  ].slice(0, MAX_SEARCH_AUGMENT_TERMS).join(' ')
  const originalOrder = tokens.slice(0, MAX_SEARCH_AUGMENT_TERMS).join(' ')

  return [...new Set([subjectFirst, originalOrder].filter(Boolean))]
    .slice(0, MAX_SEARCH_AUGMENT_QUERIES)
}

function uniqueSearchTokens(tokens) {
  const seen = new Set()
  const unique = []
  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)
    unique.push(token)
  }
  return unique
}

function truncateCitationSnippet(value) {
  const snippet = readableMarkdown(value)
  if (snippet.length <= MAX_CITATION_DIGEST_SNIPPET_CHARS) return snippet
  return `${snippet.slice(0, MAX_CITATION_DIGEST_SNIPPET_CHARS - 3).trimEnd()}...`
}

function mergeSearchResultsIntoKnowledgePayload(primaryPayload, searchResults) {
  const payload = asRecord(primaryPayload)
  if (!payload || !searchResults.length) return primaryPayload

  const additions = uniqueNewCitationRecords(searchResults, [
    ...readRecordArray(payload.evidence),
    ...readRecordArray(payload.citations),
  ])
  if (!additions.length) return primaryPayload

  if (Array.isArray(payload.evidence) || !Array.isArray(payload.citations)) {
    return {
      ...payload,
      evidence: [
        ...(Array.isArray(payload.evidence) ? payload.evidence : []),
        ...additions,
      ],
    }
  }

  return {
    ...payload,
    citations: [
      ...payload.citations,
      ...additions,
    ],
  }
}

function searchResultsFromPayload(payload) {
  return readRecordArray(asRecord(payload)?.results)
}

function uniqueNewCitationRecords(records, existingRecords) {
  const seen = new Set()
  for (const record of existingRecords) {
    for (const key of citationRecordKeys(record)) seen.add(key)
  }

  const unique = []
  for (const record of records) {
    const keys = citationRecordKeys(record)
    if (keys.some((key) => seen.has(key))) continue
    for (const key of keys) seen.add(key)
    unique.push(record)
  }
  return unique
}

function citationRecordKeys(record) {
  return [
    readString(record, 'page_id'),
    readString(record, 'pageId'),
    readString(record, 'path'),
    readString(record, 'id'),
  ].map(normalizeCitationRecordKey).filter(Boolean)
}

function normalizeCitationRecordKey(value) {
  return value.trim().toLowerCase()
}

function normalizeKnowledgeResult(source, payload) {
  const graph = namespaceGraph(graphFromKnowledgePayload(payload) || emptyGraph(), source)
  const corpusMetadata = corpusMetadataFromKnowledgePayload(source, payload)
  return {
    wikiTitle: readString(payload, 'wiki_title') || readString(payload, 'wikiTitle') || readString(payload, 'title') || source.name,
    ...corpusMetadata,
    orientation: readRecordArray(payload.orientation).map((item) => ({
      id: readString(item, 'id') || readString(item, 'page_id') || readString(item, 'pageId'),
      title: readString(item, 'title') || 'Untitled',
      path: readString(item, 'path'),
      snippet: readableMarkdown(readString(item, 'snippet')),
      role: readString(item, 'role'),
      sourceRefs: readStringArray(item.sourceRefs ?? item.source_refs),
    })),
    citations: normalizeCitations(source, payload),
    limitations: readStringArray(payload.limitations),
    graph,
  }
}

function sourceStepDetail(result, citationRefs) {
  const title = safeTraceTitle(result.wikiTitle) || 'source'
  const base = `Read ${result.citations.length} citation(s) from ${title}.`
  const orientationItems = traceOrientationRefs(result.orientation)
    .slice(0, 3)
    .map(traceCitationPreview)
    .filter(Boolean)
  const evidenceItems = citationRefs
    .slice(0, 3)
    .map(traceCitationPreview)
    .filter(Boolean)

  const details = []
  if (orientationItems.length) details.push(`Orientation: ${orientationItems.join('; ')}.`)
  if (evidenceItems.length) {
    const omitted = Math.max(0, result.citations.length - evidenceItems.length)
    details.push(`Evidence: ${evidenceItems.join('; ')}${omitted ? `; +${omitted} more` : ''}.`)
  }

  return details.length ? truncateTraceText(`${base} ${details.join(' ')}`, MAX_TRACE_DETAIL_CHARS) : base
}

function traceOrientationRefs(orientation) {
  return readRecordArray(orientation)
    .map((item) => traceCitationRef(item))
    .filter(Boolean)
}

function traceCitationPreview(ref) {
  if (ref.path && ref.title) return `${ref.path} (${ref.title})`
  return ref.path || ref.title || ref.id || ''
}

function traceCitationRefs(citations) {
  return citations
    .slice(0, MAX_TRACE_CITATION_REFS)
    .map(traceCitationRef)
    .filter(Boolean)
}

function traceCitationRef(citation) {
  const sourceRefs = traceSourceRefs(citation.sourceRefs)
  const ref = removeUndefinedProperties({
    id: safeTraceIdentifier(citation.id),
    title: safeTraceTitle(citation.title),
    path: safeTracePath(citation.path),
    ...(sourceRefs.length ? { sourceRefs } : {}),
  })
  return Object.keys(ref).length ? ref : null
}

function traceSourceRefs(sourceRefs) {
  return readStringArray(sourceRefs)
    .map(safeTraceSourceRef)
    .filter(Boolean)
    .slice(0, MAX_TRACE_SOURCE_REFS)
}

function safeTraceSourceRef(value) {
  const ref = safeTraceIdentifier(value)
  if (!ref) return undefined
  if (ref.includes('://') || ref.includes('@') || ref.includes('?') || ref.includes('#')) return undefined
  if (/^[A-Za-z]:/.test(ref)) return undefined
  if (/[\[\]{}<>]/.test(ref)) return undefined
  return ref
}

function safeTraceIdentifier(value) {
  const text = safeTraceText(value)
  if (!text) return undefined
  if (looksLikeAbsoluteLocalPath(text) || text.includes('\\')) return undefined
  if (text.includes('://') || text.includes('@') || text.includes('?') || text.includes('#')) return undefined
  return text
}

function safeTraceTitle(value) {
  const text = safeTraceText(value)
  if (!text) return undefined
  if (looksLikeAbsoluteLocalPath(text) || text.includes('\\') || text.includes('://')) return undefined
  return text
}

function safeTracePath(value) {
  const path = safeTraceText(value)
  if (!path) return undefined
  if (looksLikeAbsoluteLocalPath(path) || path.includes('\\')) return undefined
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return undefined
  if (path.includes('?') || path.includes('#')) return undefined

  const normalized = path.replace(/^\.\//, '')
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..')) return undefined
  return normalized || undefined
}

function looksLikeAbsoluteLocalPath(value) {
  return value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(value)
}

function safeTraceText(value) {
  const text = readableMarkdown(readStringValue(value)).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  return truncateTraceText(text, MAX_TRACE_TEXT_CHARS)
}

function truncateTraceText(value, maxLength) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3).trimEnd()}...`
}

function normalizeSourceBundleManifest(source, payload) {
  const manifest = asRecord(payload)
  if (!manifest) return null
  if (!hasSourceBundleManifestMetadata(manifest)) return null

  const projectionRecord = asRecord(manifest.projection)
  const projection = normalizeManifestProjectionMetadata(projectionRecord ? { ...manifest, ...projectionRecord } : manifest)
  const rawOrigins = normalizeManifestRawOriginsMetadata(
    manifest.raw_origins
      ?? manifest.rawOrigins
      ?? projectionRecord?.raw_origins
      ?? projectionRecord?.rawOrigins,
  )
  const rawSourceRefs = readRecordArray(manifest.source_refs ?? manifest.sourceRefs)
  const sourceRefs = rawSourceRefs
    .slice(0, MAX_SOURCE_BUNDLE_REFS)
    .map(normalizeSourceBundleRef)
    .filter(Boolean)
  const sourceRefCount = rawSourceRefs.length
  const capabilities = readStringArray(manifest.capabilities).map((item) => item.trim()).filter(Boolean)
  const sourceId = readString(manifest, 'source_id') || readString(manifest, 'sourceId') || source.id
  const bundleId = readString(manifest, 'bundle_id') || readString(manifest, 'bundleId')
  const title = readString(manifest, 'title')
  const adapter = readString(manifest, 'adapter') || source.adapter
  const implementation = readString(manifest, 'implementation') || source.implementation

  return removeUndefinedProperties({
    connectionId: source.id,
    sourceId,
    ...(bundleId ? { bundleId } : {}),
    ...(title ? { title } : {}),
    ...(capabilities.length ? { capabilities } : {}),
    ...(adapter ? { adapter } : {}),
    ...(implementation ? { implementation } : {}),
    ...(projection !== undefined ? { projection } : {}),
    ...(rawOrigins !== undefined ? { rawOrigins } : {}),
    ...(sourceRefs.length ? { sourceRefs } : {}),
    ...(sourceRefCount ? { sourceRefCount } : {}),
  })
}

function hasSourceBundleManifestMetadata(manifest) {
  return [
    'source_id',
    'sourceId',
    'bundle_id',
    'bundleId',
    'public_uri',
    'publicUri',
    'projection',
    'raw_origins',
    'rawOrigins',
    'source_refs',
    'sourceRefs',
    'capabilities',
    'adapter',
    'implementation',
    'page_count',
    'pageCount',
    'approved_page_count',
    'approvedPageCount',
    'title',
  ].some((key) => manifest[key] !== undefined)
}

function normalizeManifestProjectionMetadata(value) {
  const record = asRecord(value)
  if (!record) return undefined

  const projection = removeUndefinedProperties({
    signature: readString(record, 'signature') || readString(record, 'projection_signature') || readString(record, 'projectionSignature') || undefined,
    pageCount: readNumber(record, 'page_count') ?? readNumber(record, 'pageCount'),
    approvedPageCount: readNumber(record, 'approved_page_count') ?? readNumber(record, 'approvedPageCount'),
    graphNodeCount: readNumber(record, 'graph_node_count') ?? readNumber(record, 'graphNodeCount'),
    graphEdgeCount: readNumber(record, 'graph_edge_count') ?? readNumber(record, 'graphEdgeCount'),
    sourceRefCount: readNumber(record, 'source_ref_count') ?? readNumber(record, 'sourceRefCount'),
  })
  return Object.keys(projection).length ? projection : undefined
}

function normalizeManifestRawOriginsMetadata(value) {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value) || typeof value === 'string') {
    const originCount = normalizeManifestOriginCount(value)
    return originCount === undefined ? undefined : { originCount }
  }
  const record = asRecord(value)
  if (!record) return undefined
  const rawOrigins = removeUndefinedProperties({
    enabled: readBoolean(record, 'enabled'),
    metadataOnly: readBoolean(record, 'metadata_only') ?? readBoolean(record, 'metadataOnly'),
    originCount: readNumber(record, 'origin_count') ?? readNumber(record, 'originCount') ?? readNumber(record, 'count'),
    publicRootLabelCount: Array.isArray(record.public_root_labels)
      ? record.public_root_labels.length
      : Array.isArray(record.publicRootLabels)
        ? record.publicRootLabels.length
        : undefined,
  })
  return Object.keys(rawOrigins).length ? rawOrigins : undefined
}

function normalizeSourceBundleRef(value) {
  const record = asRecord(value)
  if (!record) return null

  const sourceRef = removeUndefinedProperties({
    id: readString(record, 'id') || readString(record, 'source_ref_id') || readString(record, 'sourceRefId') || undefined,
    label: readString(record, 'label') || readString(record, 'name') || undefined,
    type: readString(record, 'type') || readString(record, 'kind') || undefined,
    uri: safeSourceBundleUri(readString(record, 'uri') || readString(record, 'public_uri') || readString(record, 'publicUri')),
  })
  return Object.keys(sourceRef).length ? sourceRef : null
}

function normalizeManifestOriginCount(value) {
  const values = Array.isArray(value) ? value : value.split(',')
  const count = values.map((item) => String(item).trim()).filter(Boolean).length
  return count ? count : undefined
}

function safeSourceBundleUri(value) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.toLowerCase().startsWith('urn:')) return safeOpaqueSourceBundleUrn(trimmed)

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'llmwiki:') return undefined
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return undefined
  }
}

function safeOpaqueSourceBundleUrn(value) {
  const match = /^urn:llmwiki:source-ref:([A-Za-z0-9][A-Za-z0-9._~-]{0,127})$/i.exec(value)
  if (!match) return undefined
  return value
}

function corpusMetadataFromKnowledgePayload(source, payload) {
  const metadata = asRecord(payload.metadata) || {}
  return {
    description: readString(payload, 'description') || readString(metadata, 'description') || source.description,
    adapter: readString(payload, 'adapter') || readString(metadata, 'adapter') || source.adapter,
    implementation: readString(payload, 'implementation') || readString(metadata, 'implementation') || source.implementation,
    pageCount: readNumber(payload, 'page_count') ?? readNumber(payload, 'pageCount') ?? readNumber(metadata, 'page_count') ?? readNumber(metadata, 'pageCount'),
    approvedPageCount: readNumber(payload, 'approved_page_count')
      ?? readNumber(payload, 'approvedPageCount')
      ?? readNumber(metadata, 'approved_page_count')
      ?? readNumber(metadata, 'approvedPageCount'),
  }
}

function normalizeCitations(source, payload) {
  const rawCitations = [
    ...readRecordArray(payload.evidence),
    ...readRecordArray(payload.citations),
  ]

  return rawCitations.map((item, index) => {
    const rawId = readString(item, 'id') || readString(item, 'page_id') || readString(item, 'path') || String(index + 1)
    const id = rawId.includes(':') ? rawId : `${source.id}:${rawId}`
    return {
      id,
      title: readString(item, 'title') || 'Untitled',
      path: readString(item, 'path'),
      snippet: readableMarkdown(readString(item, 'snippet')),
      connectionId: readString(item, 'connectionId') || readString(item, 'connection_id') || source.id,
      sourceRefs: readStringArray(item.sourceRefs ?? item.source_refs),
    }
  }).filter((citation) => citation.title || citation.snippet)
}

function graphFromKnowledgePayload(payload) {
  const graphPayload = asRecord(payload.graph)
  if (graphPayload) return normalizeGraphPayload(graphPayload)
  if (Array.isArray(payload.nodes) || Array.isArray(payload.edges)) return normalizeGraphPayload(payload)
  return null
}

function normalizeGraphPayload(payload) {
  return {
    nodes: readRecordArray(payload.nodes).map((item, index) => ({
      id: readString(item, 'id') || `node:${index + 1}`,
      label: readString(item, 'label') || readString(item, 'title') || readString(item, 'id') || `Node ${index + 1}`,
      kind: readString(item, 'kind') || readString(item, 'role') || 'node',
      path: readString(item, 'path'),
      ...(asRecord(item.metadata) ? { metadata: asRecord(item.metadata) } : {}),
    })).filter((node) => node.id),
    edges: readRecordArray(payload.edges).map((item) => ({
      source: readString(item, 'source'),
      target: readString(item, 'target'),
      relation: readString(item, 'relation') || readString(item, 'kind') || 'related',
      ...(asRecord(item.metadata) ? { metadata: asRecord(item.metadata) } : {}),
    })).filter((edge) => edge.source && edge.target),
  }
}

function namespaceGraph(graph, source) {
  const prefix = `${source.id}:`
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const namespacedId = (id) => id.startsWith(prefix) ? id : `${prefix}${id}`

  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      id: namespacedId(node.id),
      metadata: {
        ...(node.metadata || {}),
        connectionId: source.id,
      },
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      source: nodeIds.has(edge.source) ? namespacedId(edge.source) : edge.source,
      target: nodeIds.has(edge.target) ? namespacedId(edge.target) : edge.target,
      metadata: {
        ...(edge.metadata || {}),
        connectionId: source.id,
      },
    })),
  }
}

function mergeGraphs(graphs) {
  const nodes = []
  const edges = []
  const nodeKeys = new Set()
  const edgeKeys = new Set()

  for (const graph of graphs) {
    for (const node of graph.nodes || []) {
      if (nodeKeys.has(node.id)) continue
      nodeKeys.add(node.id)
      nodes.push(node)
    }
    for (const edge of graph.edges || []) {
      const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push(edge)
    }
  }

  return { nodes, edges }
}

function sourceQueryDiagnostic(source, error, config) {
  return diagnostic({
    severity: 'error',
    scope: 'source',
    phase: 'query',
    protocol: source.protocol,
    subject: source.id,
    retryable: retryableFailure(error),
    redacted: true,
    observations: [
      ['httpStatus', httpStatusFromError(error)],
      ['timeout', isTimeoutError(error) ? 'true' : undefined],
      ['invalidJson', isInvalidJsonError(error) ? 'true' : undefined],
      ['jsonRpcError', isJsonRpcError(error) ? 'true' : undefined],
      ['policy', isSourcePolicyError(error) ? 'source-url' : undefined],
      ['sourcePolicy', config.sourcePolicy],
      ['sourceSelected', source.selected === false ? 'false' : 'true'],
      ['sourceStatus', source.status],
      ['timeoutMs', config.requestTimeoutMs],
      ['redaction', 'source URL, credentials, headers, and upstream body omitted'],
    ],
    remediation: sourceQueryRemediation(error),
    message: `${source.name} could not be queried by the bridge.`,
  })
}

function sourceBundleDiagnostic(source, error, config) {
  return diagnostic({
    severity: 'warning',
    scope: 'source',
    phase: 'source-bundle',
    protocol: source.protocol,
    subject: source.id,
    retryable: retryableFailure(error),
    redacted: true,
    observations: [
      ['httpStatus', httpStatusFromError(error)],
      ['timeout', isTimeoutError(error) ? 'true' : undefined],
      ['invalidJson', isInvalidJsonError(error) ? 'true' : undefined],
      ['jsonRpcError', isJsonRpcError(error) ? 'true' : undefined],
      ['policy', isSourcePolicyError(error) ? 'source-url' : undefined],
      ['sourcePolicy', config.sourcePolicy],
      ['timeoutMs', config.requestTimeoutMs],
      ['redaction', 'source URL, credentials, headers, and upstream body omitted'],
    ],
    remediation: 'The bridge will continue without source bundle metadata. Check the source-bundle or manifest endpoint if bundle metadata is expected.',
    message: `${source.name} source bundle metadata could not be read.`,
  })
}

function runtimeChatCompletionsDiagnostic(error, config) {
  return diagnostic({
    severity: 'error',
    scope: 'runtime',
    phase: 'chat-completions',
    protocol: 'openai-compatible',
    subject: config.runtimeId,
    retryable: retryableFailure(error),
    redacted: true,
    observations: [
      ['httpStatus', httpStatusFromError(error)],
      ['timeout', isTimeoutError(error) ? 'true' : undefined],
      ['invalidJson', isInvalidJsonError(error) ? 'true' : undefined],
      ['runtimeProfile', config.runtimeProfile],
      ['runtimeModelConfigured', Boolean(config.hermesModel)],
      ['timeoutMs', config.requestTimeoutMs],
      ['redaction', 'runtime URL, API key, headers, and upstream body omitted'],
    ],
    remediation: 'Check the configured runtime base URL, model, API key, and chat completions compatibility, then retry the request.',
    message: 'Chat completions request failed.',
  })
}

function diagnostic(input) {
  return removeUndefinedProperties({
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    severity: input.severity,
    scope: input.scope,
    phase: input.phase,
    protocol: input.protocol,
    subject: diagnosticSubject(input.subject),
    retryable: Boolean(input.retryable),
    redacted: input.redacted !== false,
    observations: diagnosticObservations(input.observations),
    remediation: safeTraceText(input.remediation),
    message: safeTraceText(input.message),
  })
}

function diagnosticObservations(observations) {
  return (observations || [])
    .map(([name, value]) => diagnosticObservation(name, value))
    .filter(Boolean)
}

function diagnosticObservation(name, value) {
  if (value === undefined || value === null || value === '') return null
  const safeName = String(name || '').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80)
  const safeValue = safeTraceText(value)
  return safeName && safeValue ? { name: safeName, value: safeValue } : null
}

function diagnosticSubject(value) {
  return safeTraceIdentifier(value) || safeId(value)
}

function errorMessageForDiagnostic(error) {
  return redactErrorMessage(error)
}

function isSourcePolicyError(error) {
  return /not allowed by this bridge source policy|message URL is not allowed/i.test(errorMessageForDiagnostic(error))
}

function isInvalidJsonError(error) {
  return /invalid JSON/i.test(errorMessageForDiagnostic(error))
}

function isTimeoutError(error) {
  return /timed out/i.test(errorMessageForDiagnostic(error))
}

function isJsonRpcError(error) {
  return /JSON-RPC error/i.test(errorMessageForDiagnostic(error))
}

function isUpstreamError(error) {
  return /failed task state|returned an error/i.test(errorMessageForDiagnostic(error))
}

function httpStatusFromError(error) {
  const match = /\bHTTP\s+(\d{3})\b/i.exec(errorMessageForDiagnostic(error))
  return match ? match[1] : undefined
}

function retryableFailure(error) {
  if (isSourcePolicyError(error) || isInvalidJsonError(error) || isJsonRpcError(error) || isUpstreamError(error)) return false
  const status = Number(httpStatusFromError(error))
  if (!status) return true
  if (status === 408 || status === 409 || status === 425 || status === 429) return true
  return status >= 500
}

function sourceQueryRemediation(error) {
  if (isSourcePolicyError(error)) {
    return 'Update the bridge source policy or allowed source origins, or remove the blocked Knowledge Source from the request.'
  }
  if (isInvalidJsonError(error)) {
    return 'Check that the Knowledge Source returns valid JSON for the requested protocol.'
  }
  return 'Check that the Knowledge Source is reachable, healthy, and compatible with the selected protocol, then retry the request.'
}

function parseA2aRunRequest(body, config) {
  const envelope = asRecord(body)
  const data = asRecord(envelope?.data) || envelope
  if (!data) throw new HttpError(400, 'A2A request body must be a JSON object.', 'bad_request')

  const query = readString(data, 'query').trim()
  if (!query) throw new HttpError(400, 'A2A request data.query is required.', 'bad_request')
  const orchestrationMode = requestOrchestrationMode(data, envelope)

  const sourceValue = data.knowledgeSources ?? data.knowledge_sources
  const requestSuppliesSources = sourceValue !== undefined
  const rawSources = requestSuppliesSources ? sourceValue : config.registeredSources
  const sources = readRecordArray(rawSources).map((source, index) => ({
    id: readString(source, 'id') || `source-${index + 1}`,
    name: readString(source, 'name') || readString(source, 'title') || `Source ${index + 1}`,
    description: readString(source, 'description'),
    protocol: readString(source, 'protocol'),
    status: readString(source, 'status') || 'unknown',
    url: readString(source, 'url'),
    selected: source.selected,
    capabilities: readStringArray(source.capabilities),
    adapter: readString(source, 'adapter'),
    implementation: readString(source, 'implementation'),
  }))

  return { query, sources, orchestrationMode }
}

function requestOrchestrationMode(data, envelope) {
  const rawMode = readString(data, 'orchestrationMode')
    || readString(data, 'mode')
    || readString(envelope || {}, 'orchestrationMode')
    || readString(envelope || {}, 'mode')
    || DEFAULT_ORCHESTRATION_MODE
  const mode = rawMode.trim()
  if (orchestrationModes.has(mode)) return mode
  throw new HttpError(
    400,
    `orchestrationMode must be one of: ${[...orchestrationModes].join(', ')}.`,
    'bad_request',
  )
}

function isSelectedReadySource(source) {
  return source.url
    && source.status === 'ready'
    && source.selected !== false
    && ['llmwiki-http', 'mcp', 'a2a'].includes(source.protocol)
}

function agentCard(config) {
  return {
    id: config.runtimeId,
    name: config.runtimeName,
    description: 'Local A2A-compatible bridge for OpenAI-compatible chat-completions gateways and LLMWiki Knowledge Source tools.',
    protocol: 'a2a',
    runtime: config.runtime,
    agentRuntime: config.agentRuntime,
    provider: {
      organization: config.providerOrganization,
    },
    url: '/message:send',
    capabilities: {
      streaming: false,
      structuredArtifacts: true,
      localBridge: true,
      knowledgeSourceProtocols: ['llmwiki-http', 'mcp', 'a2a'],
    },
    metadata: {
      bridge: 'llmwiki-agent-bridge',
      runtimeProfile: config.runtimeProfile,
      modelConfigured: Boolean(config.model),
      hermesModelConfigured: Boolean(config.hermesModel),
      sourcePolicy: config.sourcePolicy,
      settingsUrl: SETTINGS_ROUTE,
      protocolSurface: {
        a2a: 'compatible',
        mcp: 'compatible',
      },
    },
  }
}

function redactedBridgeSettings(config, request) {
  const requestPort = portFromHostHeader(request?.headers?.host)
  return {
    bridge: 'llmwiki-agent-bridge',
    endpoints: {
      health: '/health',
      agentCard: AGENT_CARD_ROUTE,
      messageSend: MESSAGE_SEND_ROUTE,
      mcp: MCP_ROUTE,
      settings: SETTINGS_ROUTE,
      settingsJson: SETTINGS_JSON_ROUTE,
      settingsConfigJson: SETTINGS_CONFIG_JSON_ROUTE,
      settingsSourcesJson: SETTINGS_SOURCES_JSON_ROUTE,
    },
    runtime: {
      profile: config.runtimeProfile,
      id: config.runtimeId,
      name: config.runtimeName,
      runtime: config.runtime,
      agentRuntime: config.agentRuntime,
      providerOrganization: config.providerOrganization,
    },
    runtimeConnection: {
      baseUrl: redactedUrlSummary(config.baseUrl),
      modelConfigured: Boolean(config.model),
      apiKeyConfigured: Boolean(config.apiKey),
      requestTimeoutMs: config.requestTimeoutMs,
    },
    bridgeAuth: {
      bearerTokenConfigured: Boolean(config.bridgeBearerToken),
    },
    network: {
      host: config.host,
      port: requestPort ?? config.port,
      publicBind: config.publicBind,
      allowPublicBind: config.allowPublicBind,
      allowInsecurePublicBind: config.allowInsecurePublicBind,
      configuredAllowedOrigins: config.allowedOrigins.length,
      allowedOrigins: config.allowedOrigins.map(redactedUrlSummary),
    },
    sourcePolicy: {
      policy: config.sourcePolicy,
      configuredAllowedSourceOrigins: config.allowedSourceOrigins.length,
      allowedSourceOrigins: config.allowedSourceOrigins.map(redactedUrlSummary),
    },
    persistence: {
      enabled: Boolean(config.configPath),
      configPathConfigured: Boolean(config.configPath),
      registeredSources: config.registeredSources.length,
    },
  }
}

function saveBridgeConfigSettings(body, config, request) {
  assertSettingsPersistenceEnabled(config)
  const input = asRecord(asRecord(body)?.config) || asRecord(body)
  if (!input) throw new HttpError(400, 'Settings config body must be a JSON object.', 'bad_request')

  const update = normalizeBridgeConfigSettingsInput(input, config)
  assertLiveBridgePolicy(config, update.live)
  persistBridgeSettings(config, { config: update.persisted })
  applyLiveBridgeConfig(config, update.live)

  return {
    status: 'saved',
    applied: update.applied,
    restartRequired: update.restartRequired,
    settings: redactedBridgeSettings(config, request),
    persistence: persistenceStatus(config),
  }
}

function saveRegisteredSources(body, config) {
  assertSettingsPersistenceEnabled(config)
  const sources = normalizeSourceRegistryInput(body)
  persistBridgeSettings(config, { sources })
  config.registeredSources = sources

  return {
    status: 'saved',
    sources,
    persistence: persistenceStatus(config),
  }
}

function registeredSourcesResponse(config) {
  return {
    sources: config.registeredSources,
    persistence: persistenceStatus(config),
  }
}

function assertSettingsPersistenceEnabled(config) {
  if (config.configPath) return
  throw new HttpError(
    409,
    'Settings persistence is not enabled. Start the bridge with LLMWIKI_AGENT_BRIDGE_CONFIG_PATH or the configPath option.',
    'settings_persistence_disabled',
  )
}

function persistenceStatus(config) {
  return {
    enabled: Boolean(config.configPath),
    configPathConfigured: Boolean(config.configPath),
    registeredSources: config.registeredSources.length,
  }
}

function normalizeBridgeConfigSettingsInput(input, currentConfig) {
  const persisted = {}
  const live = {}
  const applied = new Set()
  const restartRequired = new Set()

  const runtimeProfileUpdate = settingValue(input, 'runtimeProfile')
  let runtimeProfileChanged = false
  if (runtimeProfileUpdate.present) {
    const runtimeProfile = settingRuntimeProfile(runtimeProfileUpdate.value)
    const defaults = runtimeProfiles[runtimeProfile]
    Object.assign(persisted, {
      runtimeProfile,
      runtimeId: defaults.runtimeId,
      runtimeName: defaults.runtimeName,
      runtime: defaults.runtime,
      agentRuntime: defaults.agentRuntime,
      providerOrganization: defaults.providerOrganization,
    })
    Object.assign(live, {
      runtimeProfile,
      runtimeId: defaults.runtimeId,
      runtimeName: defaults.runtimeName,
      runtime: defaults.runtime,
      agentRuntime: defaults.agentRuntime,
      providerOrganization: defaults.providerOrganization,
    })
    markApplied(applied, 'runtimeProfile', 'runtimeId', 'runtimeName', 'runtime', 'agentRuntime', 'providerOrganization')
    runtimeProfileChanged = runtimeProfile !== currentConfig.runtimeProfile
  }

  for (const field of ['runtimeId', 'runtimeName', 'runtime', 'agentRuntime', 'providerOrganization']) {
    const update = settingValue(input, field)
    if (!update.present) continue
    const value = requiredStringSetting(update.value, field)
    persisted[field] = value
    live[field] = value
    markApplied(applied, field)
  }

  const baseUrlUpdate = firstSettingValue(input, ['baseUrl', 'agentBaseUrl', 'hermesBaseUrl'])
  if (baseUrlUpdate.present) {
    const baseUrl = requiredStringSetting(baseUrlUpdate.value, baseUrlUpdate.key)
    persisted.baseUrl = baseUrl
    live.baseUrl = baseUrl
    live.hermesBaseUrl = baseUrl
    markApplied(applied, 'baseUrl', 'hermesBaseUrl')
  }

  const apiKeyUpdate = firstSettingValue(input, ['apiKey', 'agentApiKey', 'hermesApiKey'])
  if (apiKeyUpdate.present) {
    const apiKey = stringSetting(apiKeyUpdate.value)
    persisted.apiKey = apiKey
    live.apiKey = apiKey
    live.hermesApiKey = apiKey
    markApplied(applied, 'apiKey')
  }

  const modelUpdate = firstSettingValue(input, ['model', 'agentModel', 'hermesModel'])
  if (modelUpdate.present) {
    const model = requiredStringSetting(modelUpdate.value, modelUpdate.key)
    persisted.model = model
    live.model = model
    live.hermesModel = model
    markApplied(applied, 'model', 'hermesModel')
  } else if (runtimeProfileChanged && !currentConfig.model) {
    const model = DEFAULT_AGENT_MODEL
    persisted.model = model
    live.model = model
    live.hermesModel = model
    markApplied(applied, 'model', 'hermesModel')
  }

  const timeoutUpdate = firstSettingValue(input, ['requestTimeoutMs', 'timeoutMs'])
  if (timeoutUpdate.present) {
    const requestTimeoutMs = positiveIntegerSetting(timeoutUpdate.value, timeoutUpdate.key)
    persisted.requestTimeoutMs = requestTimeoutMs
    live.requestTimeoutMs = requestTimeoutMs
    markApplied(applied, 'requestTimeoutMs')
  }

  const allowedOriginsUpdate = settingValue(input, 'allowedOrigins')
  if (allowedOriginsUpdate.present) {
    const allowedOrigins = originListSetting(allowedOriginsUpdate.value, normalizeOriginText, 'allowedOrigins')
    persisted.allowedOrigins = allowedOrigins
    live.allowedOrigins = allowedOrigins
    markApplied(applied, 'allowedOrigins')
  }

  const allowedSourceOriginsUpdate = settingValue(input, 'allowedSourceOrigins')
  if (allowedSourceOriginsUpdate.present) {
    const allowedSourceOrigins = originListSetting(allowedSourceOriginsUpdate.value, normalizeSourceOriginText, 'allowedSourceOrigins')
    persisted.allowedSourceOrigins = allowedSourceOrigins
    live.allowedSourceOrigins = allowedSourceOrigins
    markApplied(applied, 'allowedSourceOrigins')
  }

  const sourcePolicyUpdate = settingValue(input, 'sourcePolicy')
  if (sourcePolicyUpdate.present) {
    const sourcePolicy = settingSourcePolicy(sourcePolicyUpdate.value)
    persisted.sourcePolicy = sourcePolicy
    live.sourcePolicy = sourcePolicy
    markApplied(applied, 'sourcePolicy')
  }

  const bridgeBearerTokenUpdate = firstSettingValue(input, ['bridgeBearerToken', 'bearerToken'])
  if (bridgeBearerTokenUpdate.present) {
    const bridgeBearerToken = stringSetting(bridgeBearerTokenUpdate.value)
    persisted.bridgeBearerToken = bridgeBearerToken
    live.bridgeBearerToken = bridgeBearerToken
    markApplied(applied, 'bridgeBearerToken')
  }

  for (const field of ['allowPublicBind', 'allowInsecurePublicBind']) {
    const update = settingValue(input, field)
    if (!update.present) continue
    const value = booleanSetting(update.value, field)
    persisted[field] = value
    live[field] = value
    markApplied(applied, field)
  }

  const hostUpdate = settingValue(input, 'host')
  if (hostUpdate.present) {
    const host = requiredStringSetting(hostUpdate.value, 'host')
    persisted.host = host
    if (normalizeBindHost(host) !== normalizeBindHost(currentConfig.host)) restartRequired.add('host')
  }

  const portUpdate = settingValue(input, 'port')
  if (portUpdate.present) {
    const port = portSetting(portUpdate.value, 'port')
    persisted.port = port
    if (port !== currentConfig.port) restartRequired.add('port')
  }

  return {
    persisted,
    live,
    applied: [...applied],
    restartRequired: [...restartRequired],
  }
}

function applyLiveBridgeConfig(config, live) {
  for (const [key, value] of Object.entries(live)) {
    config[key] = value
  }
}

function assertLiveBridgePolicy(config, live) {
  try {
    assertBridgeStartupPolicy({
      host: config.host,
      publicBind: config.publicBind,
      allowPublicBind: live.allowPublicBind ?? config.allowPublicBind,
      allowInsecurePublicBind: live.allowInsecurePublicBind ?? config.allowInsecurePublicBind,
      bridgeBearerToken: live.bridgeBearerToken ?? config.bridgeBearerToken,
    })
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error), 'invalid_bridge_settings')
  }
}

function normalizeSourceRegistryInput(body) {
  const record = asRecord(body)
  const rawSources = Array.isArray(body)
    ? body
    : record?.sources ?? record?.knowledgeSources ?? record?.knowledge_sources
  if (!Array.isArray(rawSources)) {
    throw new HttpError(400, 'Sources body must be an array or an object with a sources array.', 'bad_request')
  }
  return rawSources.map((source, index) => normalizeRegisteredSource(source, index))
}

function normalizeRegisteredSource(value, index) {
  const source = asRecord(value)
  if (!source) throw new HttpError(400, `Source ${index + 1} must be a JSON object.`, 'bad_request')

  const protocol = readString(source, 'protocol') || 'llmwiki-http'
  if (!['llmwiki-http', 'mcp', 'a2a'].includes(protocol)) {
    throw new HttpError(400, `Source ${index + 1} has unsupported protocol: ${protocol}.`, 'bad_request')
  }

  const url = readString(source, 'url').trim()
  if (!url) throw new HttpError(400, `Source ${index + 1} url is required.`, 'bad_request')
  assertRegistrySourceUrl(url, index)

  const id = readString(source, 'id') || `source-${index + 1}`
  const name = readString(source, 'name') || readString(source, 'title') || `Source ${index + 1}`
  const title = readString(source, 'title') || name
  const description = readString(source, 'description')
  const capabilities = readStringArray(source.capabilities).map((item) => item.trim()).filter(Boolean)
  const adapter = readString(source, 'adapter')
  const implementation = readString(source, 'implementation')

  return removeUndefinedProperties({
    id,
    name,
    title,
    ...(description ? { description } : {}),
    protocol,
    status: readString(source, 'status') || 'ready',
    url,
    selected: source.selected !== false,
    ...(capabilities.length ? { capabilities } : {}),
    ...(adapter ? { adapter } : {}),
    ...(implementation ? { implementation } : {}),
  })
}

function assertRegistrySourceUrl(value, index) {
  let parsedUrl
  try {
    parsedUrl = new URL(value)
  } catch {
    throw new HttpError(400, `Source ${index + 1} url must be an absolute HTTP(S) URL.`, 'bad_request')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new HttpError(400, `Source ${index + 1} url must use HTTP or HTTPS.`, 'bad_request')
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new HttpError(400, `Source ${index + 1} url must not include credentials.`, 'bad_request')
  }
}

function persistBridgeSettings(config, patch) {
  const current = readPersistentBridgeSettings(config.configPath)
  const next = {
    ...current,
    version: 1,
    config: {
      ...(asRecord(current.config) || {}),
      ...(asRecord(patch.config) || {}),
    },
    sources: Array.isArray(patch.sources)
      ? patch.sources
      : readRecordArray(current.sources),
  }
  writePersistentBridgeSettings(config.configPath, next)
}

function readPersistentBridgeSettings(configPath) {
  if (!configPath) return {}
  let text
  try {
    text = readFileSync(configPath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    throw new Error(`Could not read LLMWiki Agent Bridge config file: ${redactErrorMessage(error)}`)
  }

  if (!text.trim()) return {}
  try {
    return asRecord(JSON.parse(text)) || {}
  } catch (error) {
    throw new Error(`Could not parse LLMWiki Agent Bridge config file: ${redactErrorMessage(error)}`)
  }
}

function writePersistentBridgeSettings(configPath, settings) {
  try {
    mkdirSync(dirname(configPath), { recursive: true })
    const tmpPath = `${configPath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    renameSync(tmpPath, configPath)
  } catch (error) {
    throw new HttpError(500, `Could not write LLMWiki Agent Bridge config file: ${redactErrorMessage(error)}`, 'settings_persist_failed')
  }
}

function settingValue(record, key) {
  return Object.hasOwn(record, key)
    ? { present: true, key, value: record[key] }
    : { present: false, key, value: undefined }
}

function firstSettingValue(record, keys) {
  for (const key of keys) {
    const value = settingValue(record, key)
    if (value.present) return value
  }
  return { present: false, key: keys[0], value: undefined }
}

function markApplied(applied, ...fields) {
  for (const field of fields) applied.add(field)
}

function settingRuntimeProfile(value) {
  try {
    const runtimeProfile = runtimeProfileOption(value)
    if (runtimeProfile) return runtimeProfile
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error), 'invalid_bridge_settings')
  }
  throw new HttpError(400, 'runtimeProfile must be a supported runtime profile.', 'invalid_bridge_settings')
}

function settingSourcePolicy(value) {
  try {
    const sourcePolicy = sourcePolicyOption(value)
    if (sourcePolicy) return sourcePolicy
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error), 'invalid_bridge_settings')
  }
  throw new HttpError(400, 'sourcePolicy must be a supported source policy.', 'invalid_bridge_settings')
}

function stringSetting(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function requiredStringSetting(value, field) {
  const text = stringSetting(value)
  if (text) return text
  throw new HttpError(400, `${field} must be a non-empty string.`, 'invalid_bridge_settings')
}

function positiveIntegerSetting(value, field) {
  const parsed = readNumberValue(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  throw new HttpError(400, `${field} must be a positive integer.`, 'invalid_bridge_settings')
}

function portSetting(value, field) {
  const parsed = readNumberValue(value)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) return parsed
  throw new HttpError(400, `${field} must be an integer port from 0 to 65535.`, 'invalid_bridge_settings')
}

function booleanSetting(value, field) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  throw new HttpError(400, `${field} must be a boolean.`, 'invalid_bridge_settings')
}

function originListSetting(value, normalizer, field) {
  let rawValues
  if (Array.isArray(value)) rawValues = value
  else if (typeof value === 'string') rawValues = value.split(',')
  else {
    throw new HttpError(400, `${field} must be an array or comma-separated string.`, 'invalid_bridge_settings')
  }
  return rawValues.map(String).map(normalizer).filter(Boolean)
}

function removeUndefinedProperties(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function portFromHostHeader(hostHeader) {
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  if (!host) return undefined
  try {
    const parsed = new URL(`http://${host}`)
    if (!parsed.port) return undefined
    const port = Number(parsed.port)
    return Number.isFinite(port) ? port : undefined
  } catch {
    return undefined
  }
}

function settingsHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>LLMWiki Agent Bridge Settings</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f5f7f8;
      --panel: #ffffff;
      --panel-soft: #eef5f3;
      --text: #1b1f24;
      --muted: #5d6673;
      --border: #d7dbe0;
      --accent: #0b6b5c;
      --accent-strong: #074d43;
      --accent-soft: #dff4ee;
      --error: #b42318;
      --ok: #067647;
      --warn: #9a5b00;
      --shadow: 0 14px 36px rgba(19, 32, 45, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111518;
        --panel: #191f24;
        --panel-soft: #172823;
        --text: #f4f7fb;
        --muted: #a7b0bd;
        --border: #303741;
        --accent: #2dd4bf;
        --accent-strong: #7dded2;
        --accent-soft: #123d37;
        --error: #f97066;
        --ok: #32d583;
        --warn: #fdb022;
        --shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1180px, calc(100% - 32px));
      margin: 28px auto 40px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 26px;
      line-height: 1.2;
      margin: 0 0 6px;
      letter-spacing: 0;
    }
    h2 {
      font-size: 15px;
      line-height: 1.3;
      margin: 0 0 12px;
      letter-spacing: 0;
    }
    h3 {
      font-size: 13px;
      line-height: 1.3;
      margin: 0;
      letter-spacing: 0;
    }
    p { margin: 0; color: var(--muted); }
    a.button,
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      min-height: 36px;
      padding: 0 12px;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }
    a.button:hover,
    button:hover {
      border-color: var(--accent);
    }
    a.button:focus-visible,
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--accent) 28%, transparent);
      outline-offset: 2px;
      border-color: var(--accent);
    }
    button.primary,
    a.button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #ffffff;
    }
    button.danger {
      color: var(--error);
    }
    button.copy {
      min-height: 32px;
      padding: 0 10px;
      font-size: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    input {
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      padding: 0 10px;
      font: inherit;
    }
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
    }
    select {
      min-height: 36px;
      padding: 0 10px;
    }
    textarea {
      min-height: 148px;
      padding: 10px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 12px;
    }
    .stack {
      display: grid;
      gap: 16px;
    }
    .setup-path {
      margin-bottom: 16px;
    }
    .setup-path p {
      margin-bottom: 12px;
    }
    .setup-steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .setup-step {
      min-height: 118px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      background: var(--panel-soft);
    }
    .step-kicker {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      margin-bottom: 8px;
      background: var(--accent);
      color: #ffffff;
      font-size: 12px;
      font-weight: 750;
    }
    .step-title {
      display: block;
      font-weight: 750;
      color: var(--text);
      margin-bottom: 6px;
    }
    .step-status {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .overview-section {
      margin-bottom: 16px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .section-header p {
      max-width: 720px;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(110px, 0.7fr) minmax(0, 1.3fr);
      gap: 8px 12px;
      margin: 0;
    }
    dt { color: var(--muted); }
    dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
    }
    .overview-dashboard {
      display: grid;
      grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.55fr);
      gap: 12px;
      margin: 0 0 16px;
    }
    .overview-hero,
    .metric {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      background: var(--panel-soft);
    }
    .overview-hero {
      display: grid;
      align-content: space-between;
      gap: 14px;
      min-height: 168px;
    }
    .overview-hero.ok,
    .metric.ok { border-color: color-mix(in srgb, var(--ok) 48%, var(--border)); }
    .overview-hero.warn,
    .metric.warn { border-color: color-mix(in srgb, var(--warn) 58%, var(--border)); }
    .overview-hero.error,
    .metric.error { border-color: color-mix(in srgb, var(--error) 58%, var(--border)); }
    .status-pill {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0 10px;
      color: var(--text);
      background: var(--panel);
      font-size: 12px;
      font-weight: 750;
    }
    .status-pill::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--muted);
    }
    .overview-hero.ok .status-pill::before { background: var(--ok); }
    .overview-hero.warn .status-pill::before { background: var(--warn); }
    .overview-hero.error .status-pill::before { background: var(--error); }
    .overview-title {
      display: block;
      margin-top: 10px;
      font-size: 18px;
      line-height: 1.22;
      letter-spacing: 0;
    }
    .overview-copy {
      margin-top: 8px;
      color: var(--muted);
    }
    .overview-facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 0;
    }
    .overview-facts div {
      min-width: 0;
    }
    .overview-facts dt {
      margin-bottom: 2px;
      font-size: 11px;
      font-weight: 750;
      text-transform: uppercase;
    }
    .overview-facts dd {
      margin: 0;
      font-size: 13px;
      font-weight: 750;
      overflow-wrap: anywhere;
    }
    .overview-cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      min-height: 104px;
      display: grid;
      align-content: start;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
      margin-bottom: 8px;
    }
    .metric strong {
      display: block;
      font-size: 17px;
      line-height: 1.2;
      margin-bottom: 6px;
      overflow-wrap: anywhere;
    }
    .metric small {
      display: block;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .diagnostics-subhead {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin: 4px 0 12px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .diagnostics-subhead h3 {
      margin-bottom: 4px;
    }
    .diagnostics-details {
      margin-top: 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel) 78%, var(--bg));
    }
    .diagnostics-details summary {
      cursor: pointer;
      padding: 12px;
      color: var(--muted);
      font-weight: 750;
    }
    .diagnostics-details-body {
      display: grid;
      gap: 12px;
      padding: 0 12px 12px;
    }
    .status {
      min-height: 24px;
      margin: 0 0 14px;
    }
    .status.error { color: var(--error); }
    .status.ok { color: var(--ok); }
    .status.warn { color: var(--warn); }
    .auth {
      display: none;
      margin-bottom: 12px;
      border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
      background: color-mix(in srgb, var(--warn) 8%, var(--panel));
      border-radius: 8px;
      padding: 12px;
    }
    .auth.visible {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 10px;
      align-items: end;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 12px;
    }
    .span-2 { grid-column: span 2; }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-6 { grid-column: span 6; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: 1 / -1; }
    .check-row {
      display: flex;
      min-height: 36px;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
    }
    .check-row input {
      width: 16px;
      min-height: 16px;
      padding: 0;
    }
    .advanced-details {
      grid-column: 1 / -1;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel) 78%, var(--bg));
    }
    .advanced-details summary {
      cursor: pointer;
      padding: 12px;
      color: var(--muted);
      font-weight: 750;
    }
    .advanced-body {
      display: grid;
      gap: 12px;
      padding: 0 12px 12px;
    }
    .advanced-body .outputs {
      margin-top: 0;
    }
    .outputs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .output-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .source-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }
    .source-list-tools {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin: 12px 0;
    }
    .source-counts {
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    .source-list {
      display: grid;
      gap: 10px;
      margin: 12px 0;
    }
    .source-row {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      background: color-mix(in srgb, var(--panel) 82%, var(--bg));
    }
    .source-row-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
    }
    .empty {
      border: 1px dashed var(--border);
      border-radius: 8px;
      padding: 16px;
      color: var(--muted);
      text-align: center;
    }
    .helper {
      color: var(--muted);
      font-size: 12px;
      font-weight: 400;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (max-width: 640px) {
      main { width: min(100% - 20px, 1180px); margin: 20px auto; }
      header { display: block; }
      .toolbar { justify-content: flex-start; margin-top: 12px; }
      dl { grid-template-columns: 1fr; gap: 2px 0; }
      dd { margin-bottom: 8px; }
      .auth.visible { grid-template-columns: 1fr; }
      .section-header { display: block; }
      .section-header .toolbar,
      .source-actions { justify-content: flex-start; margin-top: 10px; }
      .setup-steps { grid-template-columns: 1fr; }
      .overview-dashboard,
      .overview-cards,
      .overview-facts { grid-template-columns: 1fr; }
      .overview-hero { min-height: auto; }
      .diagnostics-subhead { display: block; }
      .metric { min-height: auto; }
      .source-list-tools { display: block; }
      .grid { grid-template-columns: 1fr; }
      .form-grid { grid-template-columns: 1fr; }
      .span-2,
      .span-3,
      .span-4,
      .span-6,
      .span-8,
      .span-12 { grid-column: 1 / -1; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>LLMWiki Agent Bridge Settings</h1>
        <p>Use this guided setup to make the bridge usable from a fresh OSS install.</p>
      </div>
      <div class="toolbar">
        <a class="button" href="/health">Health JSON</a>
        <button id="reload" type="button">Reload Overview</button>
      </div>
    </header>
    <div id="status" class="status" role="status" aria-live="polite">Loading bridge overview...</div>
    <form id="auth" class="auth">
      <label for="token">
        Settings access bearer token
        <input id="token" type="password" autocomplete="off" placeholder="Bearer token for /settings.json">
      </label>
      <button class="primary" type="submit">Apply Token</button>
    </form>
    <section class="overview-section" aria-labelledby="bridge-overview-title">
      <div class="section-header">
        <div>
          <h2 id="bridge-overview-title">Bridge Overview Diagnostics</h2>
          <p>Start here to confirm what is ready, what needs attention, and which setup action to take next.</p>
        </div>
      </div>
      <div id="summary" class="overview-dashboard"></div>
      <details class="diagnostics-details">
        <summary>Detailed diagnostics</summary>
        <div class="diagnostics-details-body">
          <div class="diagnostics-subhead">
            <div>
              <h3>Redacted settings snapshot</h3>
              <p>Values loaded from <code>/settings.json</code> for debugging startup, access, and source issues.</p>
            </div>
          </div>
          <div id="settings" class="grid"></div>
        </div>
      </details>
    </section>
    <section class="setup-path" aria-labelledby="setup-path-title">
      <h2 id="setup-path-title">Guided Setup Path</h2>
      <p>Follow this path: connect a runtime, register Knowledge Sources, then verify the bridge.</p>
      <ol class="setup-steps">
        <li class="setup-step">
          <span class="step-kicker" aria-hidden="true">1</span>
          <strong class="step-title">Connect runtime</strong>
          <span id="setup-step-runtime-status" class="step-status">Draft runtime details are ready. Next: save runtime settings.</span>
        </li>
        <li class="setup-step">
          <span class="step-kicker" aria-hidden="true">2</span>
          <strong class="step-title">Register Knowledge Sources</strong>
          <span id="setup-step-sources-status" class="step-status">One draft source is ready. Next: save sources or add another source.</span>
        </li>
        <li class="setup-step">
          <span class="step-kicker" aria-hidden="true">3</span>
          <strong class="step-title">Verify bridge</strong>
          <span id="setup-step-verify-status" class="step-status">Setup check has not run. Next: run the bridge verification.</span>
        </li>
      </ol>
    </section>
    <div class="stack">
      <section aria-labelledby="runtime-access-title">
        <div class="section-header">
          <div>
            <h2 id="runtime-access-title">Step 1: Connect Runtime</h2>
            <p>Set the runtime profile, runtime base URL, model, and API key the bridge should use.</p>
          </div>
          <div class="source-actions">
            <button id="save-settings" class="primary" type="button">Save runtime settings</button>
          </div>
        </div>
        <form id="bridge-form" class="form-grid">
          <label class="span-3" for="runtime-profile">
            Runtime profile
            <select id="runtime-profile" name="runtimeProfile">
              <option value="hermes">Hermes</option>
              <option value="deepagents">DeepAgents</option>
              <option value="generic">Generic OpenAI-compatible</option>
            </select>
          </label>
          <label class="span-6" for="runtime-base-url">
            Runtime base URL
            <input id="runtime-base-url" name="baseUrl" autocomplete="off" placeholder="http://127.0.0.1:8642/v1">
          </label>
          <label class="span-3" for="runtime-model">
            Model
            <input id="runtime-model" name="model" autocomplete="off" placeholder="hermes-agent">
          </label>
          <label class="span-3" for="runtime-api-key">
            Runtime API key
            <input id="runtime-api-key" name="apiKey" type="password" autocomplete="new-password" placeholder="Optional">
          </label>
          <details class="advanced-details">
            <summary>Advanced connection, network, and security details</summary>
            <div class="advanced-body">
              <div class="form-grid">
                <label class="span-3" for="bridge-host">
                  Host
                  <input id="bridge-host" name="host" autocomplete="off" placeholder="127.0.0.1">
                </label>
                <label class="span-2" for="bridge-port">
                  Port
                  <input id="bridge-port" name="port" inputmode="numeric" autocomplete="off" placeholder="8788">
                </label>
                <label class="span-4" for="command-shell">
                  Command shell
                  <select id="command-shell" name="commandShell">
                    <option value="powershell">PowerShell</option>
                    <option value="posix">POSIX sh</option>
                  </select>
                </label>
                <label class="span-3" for="timeout-ms">
                  Timeout ms
                  <input id="timeout-ms" name="timeoutMs" inputmode="numeric" autocomplete="off" placeholder="120000">
                </label>
                <label class="span-6" for="allowed-origins">
                  Allowed browser origins
                  <input id="allowed-origins" name="allowedOrigins" autocomplete="off" placeholder="http://127.0.0.1:5173,https://chat.example.com">
                  <span class="helper">Extra CORS origins that may call the bridge from a browser.</span>
                </label>
                <label class="span-3" for="source-policy">
                  Source policy
                  <select id="source-policy" name="sourcePolicy">
                    <option value="private-http">private-http</option>
                    <option value="allowlist">allowlist</option>
                    <option value="public-https">public-https</option>
                  </select>
                </label>
                <label class="span-3" for="bearer-token">
                  Bridge bearer token
                  <input id="bearer-token" name="bearerToken" type="password" autocomplete="new-password" placeholder="Optional">
                </label>
                <label class="span-3 check-row" for="clear-runtime-api-key">
                  <input id="clear-runtime-api-key" name="clearApiKey" type="checkbox">
                  Clear runtime API key
                </label>
                <label class="span-3 check-row" for="clear-bearer-token">
                  <input id="clear-bearer-token" name="clearBearerToken" type="checkbox">
                  Clear bearer token
                </label>
                <label class="span-6" for="allowed-source-origins">
                  Allowed source origins
                  <input id="allowed-source-origins" name="allowedSourceOrigins" autocomplete="off" placeholder="http://127.0.0.1:8765,https://wiki.example.com">
                  <span class="helper">Origins, not full paths. Used by allowlist and stricter source policies.</span>
                </label>
                <label class="span-3 check-row" for="allow-public-bind">
                  <input id="allow-public-bind" name="allowPublicBind" type="checkbox">
                  Public bind opt-in
                </label>
                <label class="span-3 check-row" for="allow-insecure-public-bind">
                  <input id="allow-insecure-public-bind" name="allowInsecurePublicBind" type="checkbox">
                  Insecure public dev
                </label>
              </div>
              <div class="outputs">
                <div>
                  <div class="output-head">
                    <h3>Environment Variables</h3>
                    <button class="copy" type="button" data-copy-target="env-output">Copy</button>
                  </div>
                  <textarea id="env-output" readonly aria-label="Generated environment variables"></textarea>
                </div>
                <div>
                  <div class="output-head">
                    <h3>Start or Restart Command</h3>
                    <button class="copy" type="button" data-copy-target="command-output">Copy</button>
                  </div>
                  <textarea id="command-output" readonly aria-label="Generated start or restart command"></textarea>
                </div>
              </div>
            </div>
          </details>
        </form>
        <div id="save-status" class="status">Runtime settings are loaded from this bridge. Save Step 1 after edits.</div>
      </section>

      <section aria-labelledby="knowledge-sources-title">
        <div class="section-header">
          <div>
            <h2 id="knowledge-sources-title">Step 2: Register Knowledge Sources</h2>
            <p>Add one or more <code>llmwiki-serve</code>, <code>MCP</code>, or <code>A2A</code> sources. Draft sources can be tested before they are saved.</p>
          </div>
        </div>
        <div class="source-list-tools">
          <div id="source-counts" class="source-counts" aria-live="polite">Registered: loading. Draft source URLs: 1.</div>
          <div class="source-actions">
            <button id="add-source" class="primary" type="button">Add another source</button>
            <button id="save-sources" type="button">Save sources</button>
            <button id="reset-sources" type="button">Reset source draft</button>
          </div>
        </div>
        <div id="source-list" class="source-list"></div>
      </section>

      <section aria-labelledby="verify-bridge-title">
        <div class="section-header">
          <div>
            <h2 id="verify-bridge-title">Step 3: Verify Bridge</h2>
            <p>Run a setup check through <code>/message:send</code>. Draft source URLs are used when present; otherwise the bridge uses saved registered sources.</p>
          </div>
          <div class="source-actions">
            <button id="run-setup-check" class="primary" type="button">Run setup check</button>
          </div>
        </div>
        <label for="payload-query">
          Setup check question
          <input id="payload-query" autocomplete="off" placeholder="What should I know before releasing?">
        </label>
        <div id="verify-status" class="status" role="status" aria-live="polite">Setup check has not run yet.</div>
        <textarea id="verify-output" readonly aria-label="Setup check answer and status"></textarea>
        <div class="output-head">
          <h3>JSON Payload for /message:send</h3>
          <button class="copy" type="button" data-copy-target="payload-output">Copy</button>
        </div>
        <textarea id="payload-output" readonly aria-label="Generated JSON payload for bridge chat calls"></textarea>
      </section>
    </div>
  </main>
  <script>
    const statusEl = document.getElementById('status');
    const authEl = document.getElementById('auth');
    const tokenEl = document.getElementById('token');
    const setupStepRuntimeStatusEl = document.getElementById('setup-step-runtime-status');
    const setupStepSourcesStatusEl = document.getElementById('setup-step-sources-status');
    const setupStepVerifyStatusEl = document.getElementById('setup-step-verify-status');
    const settingsEl = document.getElementById('settings');
    const summaryEl = document.getElementById('summary');
    const reloadEl = document.getElementById('reload');
    const bridgeFormEl = document.getElementById('bridge-form');
    const saveSettingsEl = document.getElementById('save-settings');
    const saveStatusEl = document.getElementById('save-status');
    const envOutputEl = document.getElementById('env-output');
    const commandOutputEl = document.getElementById('command-output');
    const sourceListEl = document.getElementById('source-list');
    const addSourceEl = document.getElementById('add-source');
    const saveSourcesEl = document.getElementById('save-sources');
    const resetSourcesEl = document.getElementById('reset-sources');
    const sourceCountsEl = document.getElementById('source-counts');
    const runSetupCheckEl = document.getElementById('run-setup-check');
    const verifyStatusEl = document.getElementById('verify-status');
    const verifyOutputEl = document.getElementById('verify-output');
    const payloadQueryEl = document.getElementById('payload-query');
    const payloadOutputEl = document.getElementById('payload-output');
    const tokenKey = 'llmwiki-agent-bridge-token';
    const setupKey = 'llmwiki-agent-bridge-setup-draft-v1';
    const setupSecretKey = 'llmwiki-agent-bridge-setup-secret-v1';
    const apiSecretKey = 'llmwiki-agent-bridge-runtime-key-session-v1';
    const sourceKey = 'llmwiki-agent-bridge-draft-sources-v1';
    const queryKey = 'llmwiki-agent-bridge-draft-query-v1';
    const profileModels = {
      hermes: 'hermes-agent',
      deepagents: 'deepagents-local',
      generic: 'local-model',
    };
    const defaultSetup = {
      runtimeProfile: 'hermes',
      host: '127.0.0.1',
      port: '8788',
      commandShell: 'powershell',
      baseUrl: 'http://127.0.0.1:8642/v1',
      apiKey: '',
      model: 'hermes-agent',
      timeoutMs: '120000',
      allowedOrigins: '',
      sourcePolicy: 'private-http',
      allowedSourceOrigins: '',
      bearerToken: '',
      clearApiKey: false,
      clearBearerToken: false,
      allowPublicBind: false,
      allowInsecurePublicBind: false,
    };
    const defaultSources = [
      {
        id: 'local-wiki',
        name: 'Local Wiki',
        protocol: 'llmwiki-http',
        status: 'ready',
        url: 'http://127.0.0.1:8765',
        selected: true,
      },
    ];
    let hasStoredSetup = Boolean(readJsonStorage(setupKey, null));
    let sources = sourceDrafts(readJsonStorage(sourceKey, defaultSources));
    let registeredSourceCount = 0;
    let currentConfig = null;
    let setupCheckState = {
      status: 'not-run',
      text: 'Setup check has not run. Next: run the bridge verification.',
      kind: 'warn',
    };

    tokenEl.value = sessionStorage.getItem(tokenKey) || '';
    payloadQueryEl.value = readStringStorage(queryKey) || 'What should I know before releasing?';
    writeSetupForm({ ...defaultSetup, ...readJsonStorage(setupKey, {}), apiKey: readSessionString(apiSecretKey), bearerToken: readSessionString(setupSecretKey) });
    renderSources();
    updateSetupOutputs();
    updateGuidedSetup();

    reloadEl.addEventListener('click', loadSettings);
    authEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const token = tokenEl.value.trim();
      if (token) sessionStorage.setItem(tokenKey, token);
      else sessionStorage.removeItem(tokenKey);
      loadSettings();
    });
    bridgeFormEl.addEventListener('input', () => {
      const setup = readSetupForm();
      persistSetupDraft(setup);
      hasStoredSetup = true;
      updateSetupOutputs(setup);
      updateGuidedSetup();
    });
    bridgeFormEl.addEventListener('change', (event) => {
      if (event.target && event.target.name === 'runtimeProfile') {
        syncProfileModel();
      }
      const setup = readSetupForm();
      persistSetupDraft(setup);
      hasStoredSetup = true;
      updateSetupOutputs(setup);
      updateGuidedSetup();
    });
    payloadQueryEl.addEventListener('input', () => {
      writeStringStorage(queryKey, payloadQueryEl.value);
      updatePayloadOutput();
    });
    addSourceEl.addEventListener('click', () => {
      sources.push(newSourceDraft());
      persistSources();
      renderSources();
    });
    saveSettingsEl.addEventListener('click', saveBridgeSettings);
    saveSourcesEl.addEventListener('click', saveSources);
    runSetupCheckEl.addEventListener('click', runSetupCheck);
    resetSourcesEl.addEventListener('click', () => {
      sources = sourceDrafts(defaultSources);
      persistSources();
      renderSources();
    });
    document.querySelectorAll('[data-copy-target]').forEach((button) => {
      button.addEventListener('click', () => copyTarget(button));
    });

    function setStatus(text, kind) {
      statusEl.textContent = text;
      statusEl.className = kind ? 'status ' + kind : 'status';
    }

    function plural(count, one, many) {
      return count + ' ' + (count === 1 ? one : many);
    }

    function updateSourceCounts() {
      const draftCount = payloadSources().length;
      sourceCountsEl.textContent = 'Registered: ' + registeredSourceCount + '. Draft source URLs: ' + draftCount + '.';
      return draftCount;
    }

    function updateGuidedSetup(config = currentConfig) {
      const setup = readSetupForm();
      const draftCount = updateSourceCounts();
      const savedRuntimeReady = Boolean(config && valueText(config.runtimeConnection.baseUrl) !== 'none' && config.runtimeConnection.modelConfigured);
      const draftRuntimeReady = Boolean(setup.baseUrl && setup.model);
      if (savedRuntimeReady) {
        setupStepRuntimeStatusEl.textContent = 'Runtime connection is configured. Next: register Knowledge Sources.';
      } else if (draftRuntimeReady) {
        setupStepRuntimeStatusEl.textContent = 'Draft runtime settings are ready. Next: save Step 1.';
      } else {
        setupStepRuntimeStatusEl.textContent = 'Runtime details are incomplete. Next: enter a base URL and model.';
      }

      if (registeredSourceCount && draftCount) {
        setupStepSourcesStatusEl.textContent = plural(registeredSourceCount, 'source is', 'sources are') + ' registered and ' + plural(draftCount, 'draft URL is', 'draft URLs are') + ' ready. Next: save sources or verify with drafts.';
      } else if (draftCount) {
        setupStepSourcesStatusEl.textContent = plural(draftCount, 'draft source URL is', 'draft source URLs are') + ' ready. Next: save sources or verify with drafts.';
      } else if (registeredSourceCount) {
        setupStepSourcesStatusEl.textContent = plural(registeredSourceCount, 'source is', 'sources are') + ' registered. Next: run the setup check.';
      } else {
        setupStepSourcesStatusEl.textContent = 'No Knowledge Sources are ready. Next: add a source URL.';
      }

      setupStepVerifyStatusEl.textContent = setupCheckState.text;
    }

    function setVerifyStatus(text, kind) {
      verifyStatusEl.textContent = text;
      verifyStatusEl.className = kind ? 'status ' + kind : 'status';
      setupCheckState = { status: kind || '', text, kind: kind || '' };
      updateGuidedSetup();
    }

    function valueText(value) {
      if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (value === undefined || value === null || value === '') return 'none';
      return String(value);
    }

    function detailText(parts) {
      return parts.map(valueText).filter((part) => part !== 'none').join(' | ') || 'none';
    }

    function panel(title, rows) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      const list = document.createElement('dl');
      heading.textContent = title;
      rows.forEach(([label, value]) => {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        const code = document.createElement('code');
        dt.textContent = label;
        code.textContent = valueText(value);
        dd.appendChild(code);
        list.append(dt, dd);
      });
      section.append(heading, list);
      return section;
    }

    function metric(label, value, detail, kind) {
      const item = document.createElement('div');
      const labelEl = document.createElement('span');
      const valueEl = document.createElement('strong');
      const detailEl = document.createElement('small');
      item.className = kind ? 'metric ' + kind : 'metric';
      labelEl.textContent = label;
      valueEl.textContent = valueText(value);
      detailEl.textContent = detail || '';
      item.append(labelEl, valueEl, detailEl);
      return item;
    }

    function overviewHero(status, facts) {
      const item = document.createElement('div');
      const statusBlock = document.createElement('div');
      const pill = document.createElement('span');
      const title = document.createElement('strong');
      const copy = document.createElement('p');
      const factList = document.createElement('dl');
      item.className = 'overview-hero ' + status.kind;
      pill.className = 'status-pill';
      pill.textContent = status.label;
      title.className = 'overview-title';
      title.textContent = status.title;
      copy.className = 'overview-copy';
      copy.textContent = status.copy;
      factList.className = 'overview-facts';
      facts.forEach(([label, value]) => {
        const pair = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = valueText(value);
        pair.append(dt, dd);
        factList.append(pair);
      });
      statusBlock.append(pill, title, copy);
      item.append(statusBlock, factList);
      return item;
    }

    function metricGroup(...items) {
      const group = document.createElement('div');
      group.className = 'overview-cards';
      group.append(...items);
      return group;
    }

    function bridgeStatus(config) {
      const missing = [];
      const sourceCount = Number(config.persistence.registeredSources) || 0;
      const runtimeReady = valueText(config.runtimeConnection.baseUrl) !== 'none' && config.runtimeConnection.modelConfigured;
      const publicUnauthenticated = config.network.publicBind && !config.bridgeAuth.bearerTokenConfigured;
      if (!runtimeReady) missing.push('save runtime settings');
      if (!sourceCount) missing.push('save at least one Knowledge Source');
      if (!config.persistence.enabled) missing.push('enable settings persistence');
      if (missing.length) {
        return {
          kind: 'warn',
          label: 'Action needed',
          title: 'Finish the setup path before using this bridge',
          copy: 'Next: ' + missing.join(', ') + '.',
        };
      }
      if (publicUnauthenticated) {
        return {
          kind: 'warn',
          label: 'Review access',
          title: 'Public bind has no bridge bearer token',
          copy: 'Next: add a bridge bearer token or bind the host back to loopback before exposing this bridge.',
        };
      }
      return {
        kind: 'ok',
        label: 'Ready',
        title: 'Bridge is ready for local verification',
        copy: 'Next: run Step 3, then use saved sources as defaults when chat or agent requests omit explicit sources.',
      };
    }

    function renderSummary(config) {
      const authConfigured = config.bridgeAuth.bearerTokenConfigured;
      const publicBind = config.network.publicBind;
      const sourceCount = Number(config.persistence.registeredSources) || 0;
      const publicUnauthenticated = publicBind && !authConfigured;
      const runtimeReady = valueText(config.runtimeConnection.baseUrl) !== 'none' && config.runtimeConnection.modelConfigured;
      const sourcePolicyWarn = publicBind && config.sourcePolicy.policy === 'private-http';
      const status = bridgeStatus(config);
      summaryEl.replaceChildren(
        overviewHero(status, [
          ['Runtime', runtimeReady ? config.runtime.profile : 'needs setup'],
          ['Sources', plural(sourceCount, 'source', 'sources')],
          ['Network', config.network.host + ':' + config.network.port],
          ['Policy', config.sourcePolicy.policy],
        ]),
        metricGroup(
          metric('Runtime readiness', runtimeReady ? 'Ready' : 'Needs runtime settings', detailText([config.runtime.profile, config.runtimeConnection.baseUrl, config.runtimeConnection.modelConfigured ? 'model configured' : 'model not configured']), runtimeReady ? 'ok' : 'warn'),
          metric('Saved sources', plural(sourceCount, 'source', 'sources'), sourceCount ? 'used as defaults for agent calls' : 'add or save a source in Step 2', sourceCount && config.persistence.enabled ? 'ok' : 'warn'),
          metric('Bridge access', authConfigured ? 'Bearer protected' : publicBind ? 'Public without bearer' : 'Local access', detailText([config.network.configuredAllowedOrigins + ' configured origin(s)', publicUnauthenticated ? 'public bind without bearer' : 'same-origin settings allowed']), publicUnauthenticated ? 'warn' : 'ok'),
          metric('Source policy', config.sourcePolicy.policy, detailText([config.sourcePolicy.configuredAllowedSourceOrigins + ' allowed source origin(s)', config.sourcePolicy.allowedSourceOrigins]), sourcePolicyWarn ? 'warn' : 'ok'),
        ),
      );
    }

    function render(config) {
      currentConfig = config;
      renderSummary(config);
      if (typeof config.persistence.registeredSources === 'number') {
        registeredSourceCount = config.persistence.registeredSources;
      }
      updateGuidedSetup(config);
      settingsEl.replaceChildren(
        panel('Runtime', [
          ['profile', config.runtime.profile],
          ['runtime id', config.runtime.id],
          ['runtime name', config.runtime.name],
          ['agent runtime', config.runtime.agentRuntime],
          ['provider', config.runtime.providerOrganization],
        ]),
        panel('Connection', [
          ['base url', config.runtimeConnection.baseUrl],
          ['model configured', config.runtimeConnection.modelConfigured],
          ['api key configured', config.runtimeConnection.apiKeyConfigured],
          ['timeout ms', config.runtimeConnection.requestTimeoutMs],
        ]),
        panel('Bridge Auth', [
          ['bearer token configured', config.bridgeAuth.bearerTokenConfigured],
          ['public bind', config.network.publicBind],
          ['allow public bind', config.network.allowPublicBind],
          ['insecure public bind', config.network.allowInsecurePublicBind],
        ]),
        panel('Network', [
          ['host', config.network.host],
          ['port', config.network.port],
          ['allowed origins', config.network.allowedOrigins],
        ]),
        panel('Source Policy', [
          ['policy', config.sourcePolicy.policy],
          ['allowed source origins', config.sourcePolicy.allowedSourceOrigins],
        ]),
        panel('Endpoints', [
          ['health', config.endpoints.health],
          ['agent card', config.endpoints.agentCard],
          ['message send', config.endpoints.messageSend],
          ['mcp', config.endpoints.mcp],
          ['settings json', config.endpoints.settingsJson],
        ]),
      );
    }

    function applyRegisteredSourceCount(result, fallbackCount) {
      const nextCount = typeof result?.persistence?.registeredSources === 'number'
        ? result.persistence.registeredSources
        : typeof fallbackCount === 'number' ? fallbackCount : registeredSourceCount;
      registeredSourceCount = nextCount;
      if (currentConfig?.persistence) {
        currentConfig = {
          ...currentConfig,
          persistence: {
            ...currentConfig.persistence,
            registeredSources: nextCount,
          },
        };
        renderSummary(currentConfig);
      }
      updateGuidedSetup();
      return nextCount;
    }

    function seedSetupFromConfig(config) {
      if (hasStoredSetup) return;
      const seeded = {
        ...defaultSetup,
        runtimeProfile: valueText(config.runtime.profile) === 'none' ? defaultSetup.runtimeProfile : config.runtime.profile,
        host: valueText(config.network.host) === 'none' ? defaultSetup.host : String(config.network.host),
        port: valueText(config.network.port) === 'none' ? defaultSetup.port : String(config.network.port),
        baseUrl: valueText(config.runtimeConnection.baseUrl) === 'none' ? defaultSetup.baseUrl : String(config.runtimeConnection.baseUrl),
        apiKey: '',
        model: profileModels[config.runtime.profile] || defaultSetup.model,
        timeoutMs: valueText(config.runtimeConnection.requestTimeoutMs) === 'none' ? defaultSetup.timeoutMs : String(config.runtimeConnection.requestTimeoutMs),
        allowedOrigins: Array.isArray(config.network.allowedOrigins) ? config.network.allowedOrigins.join(',') : '',
        sourcePolicy: valueText(config.sourcePolicy.policy) === 'none' ? defaultSetup.sourcePolicy : config.sourcePolicy.policy,
        allowedSourceOrigins: Array.isArray(config.sourcePolicy.allowedSourceOrigins) ? config.sourcePolicy.allowedSourceOrigins.join(',') : '',
        bearerToken: '',
        allowPublicBind: Boolean(config.network.allowPublicBind),
        allowInsecurePublicBind: Boolean(config.network.allowInsecurePublicBind),
      };
      writeSetupForm(seeded);
      updateSetupOutputs(seeded);
    }

    function readSetupForm() {
      return {
        runtimeProfile: document.getElementById('runtime-profile').value,
        host: document.getElementById('bridge-host').value.trim(),
        port: document.getElementById('bridge-port').value.trim(),
        commandShell: document.getElementById('command-shell').value,
        baseUrl: document.getElementById('runtime-base-url').value.trim(),
        apiKey: document.getElementById('runtime-api-key').value.trim(),
        model: document.getElementById('runtime-model').value.trim(),
        timeoutMs: document.getElementById('timeout-ms').value.trim(),
        allowedOrigins: document.getElementById('allowed-origins').value.trim(),
        sourcePolicy: document.getElementById('source-policy').value,
        allowedSourceOrigins: document.getElementById('allowed-source-origins').value.trim(),
        bearerToken: document.getElementById('bearer-token').value.trim(),
        clearApiKey: document.getElementById('clear-runtime-api-key').checked,
        clearBearerToken: document.getElementById('clear-bearer-token').checked,
        allowPublicBind: document.getElementById('allow-public-bind').checked,
        allowInsecurePublicBind: document.getElementById('allow-insecure-public-bind').checked,
      };
    }

    function writeSetupForm(setup) {
      document.getElementById('runtime-profile').value = setup.runtimeProfile || defaultSetup.runtimeProfile;
      document.getElementById('bridge-host').value = setup.host || defaultSetup.host;
      document.getElementById('bridge-port').value = setup.port || defaultSetup.port;
      document.getElementById('command-shell').value = setup.commandShell || defaultSetup.commandShell;
      document.getElementById('runtime-base-url').value = setup.baseUrl || defaultSetup.baseUrl;
      document.getElementById('runtime-api-key').value = setup.apiKey || '';
      document.getElementById('clear-runtime-api-key').checked = Boolean(setup.clearApiKey);
      document.getElementById('runtime-model').value = setup.model || profileModels[setup.runtimeProfile] || defaultSetup.model;
      document.getElementById('timeout-ms').value = setup.timeoutMs || defaultSetup.timeoutMs;
      document.getElementById('allowed-origins').value = setup.allowedOrigins || '';
      document.getElementById('source-policy').value = setup.sourcePolicy || defaultSetup.sourcePolicy;
      document.getElementById('allowed-source-origins').value = setup.allowedSourceOrigins || '';
      document.getElementById('bearer-token').value = setup.bearerToken || '';
      document.getElementById('clear-bearer-token').checked = Boolean(setup.clearBearerToken);
      document.getElementById('allow-public-bind').checked = Boolean(setup.allowPublicBind);
      document.getElementById('allow-insecure-public-bind').checked = Boolean(setup.allowInsecurePublicBind);
    }

    function syncProfileModel() {
      const modelEl = document.getElementById('runtime-model');
      const nextDefault = profileModels[document.getElementById('runtime-profile').value] || defaultSetup.model;
      const knownDefaults = Object.values(profileModels);
      if (!modelEl.value.trim() || knownDefaults.includes(modelEl.value.trim())) {
        modelEl.value = nextDefault;
      }
    }

    function envPairs(setup = readSetupForm()) {
      const pairs = [
        ['LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE', setup.runtimeProfile],
        ['LLMWIKI_AGENT_BRIDGE_HOST', setup.host],
        ['LLMWIKI_AGENT_BRIDGE_PORT', setup.port],
        ['LLMWIKI_AGENT_BRIDGE_BASE_URL', setup.baseUrl],
        ['LLMWIKI_AGENT_BRIDGE_MODEL', setup.model],
        ['LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY', setup.sourcePolicy],
        ['LLMWIKI_AGENT_BRIDGE_TIMEOUT_MS', setup.timeoutMs],
      ];
      if (setup.allowedOrigins) pairs.push(['LLMWIKI_AGENT_BRIDGE_ALLOWED_ORIGINS', setup.allowedOrigins]);
      if (setup.allowedSourceOrigins) pairs.push(['LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS', setup.allowedSourceOrigins]);
      if (setup.apiKey) pairs.push(['LLMWIKI_AGENT_BRIDGE_API_KEY', setup.apiKey]);
      if (setup.bearerToken) pairs.push(['LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN', setup.bearerToken]);
      if (setup.allowPublicBind) pairs.push(['LLMWIKI_AGENT_BRIDGE_ALLOW_PUBLIC_BIND', '1']);
      if (setup.allowInsecurePublicBind) pairs.push(['LLMWIKI_AGENT_BRIDGE_ALLOW_INSECURE_PUBLIC_BIND', '1']);
      return pairs.filter((pair) => pair[1] !== undefined && pair[1] !== null && String(pair[1]).trim() !== '');
    }

    function updateSetupOutputs(setup = readSetupForm()) {
      const pairs = envPairs(setup);
      envOutputEl.value = pairs.map((pair) => pair[0] + '=' + pair[1]).join('\\n');
      commandOutputEl.value = setup.commandShell === 'posix'
        ? posixCommand(pairs)
        : powershellCommand(pairs);
    }

    function powershellCommand(pairs) {
      const lines = pairs.map((pair) => '$env:' + pair[0] + ' = ' + quotePowerShell(pair[1]));
      lines.push('npx llmwiki-agent-bridge');
      return lines.join('\\n');
    }

    function posixCommand(pairs) {
      if (!pairs.length) return 'npx llmwiki-agent-bridge';
      return 'env ' + pairs.map((pair) => pair[0] + '=' + quotePosix(pair[1])).join(' \\\\\\n  ') + ' \\\\\\n  npx llmwiki-agent-bridge';
    }

    function quotePowerShell(value) {
      return "'" + String(value).replace(/'/g, "''") + "'";
    }

    function quotePosix(value) {
      return "'" + String(value).replace(/'/g, "'\\"'\\"'") + "'";
    }

    function newSourceDraft() {
      const index = sources.length + 1;
      return {
        id: 'source-' + index,
        name: 'Knowledge Source ' + index,
        protocol: 'llmwiki-http',
        status: 'ready',
        url: '',
        selected: true,
      };
    }

    function sourceDrafts(value) {
      return Array.isArray(value)
        ? value.map((source) => ({ ...source }))
        : defaultSources.map((source) => ({ ...source }));
    }

    function renderSources() {
      sourceListEl.replaceChildren();
      if (!sources.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No registered source drafts. Add another source to include it in generated payloads.';
        sourceListEl.append(empty);
        updatePayloadOutput();
        updateGuidedSetup();
        return;
      }
      sources.forEach((source, index) => {
        sourceListEl.append(sourceRow(source, index));
      });
      updatePayloadOutput();
      updateGuidedSetup();
    }

    function sourceRow(source, index) {
      const row = document.createElement('div');
      const head = document.createElement('div');
      const title = document.createElement('h3');
      const remove = document.createElement('button');
      const fields = document.createElement('div');
      row.className = 'source-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Knowledge Source ' + (index + 1));
      head.className = 'source-row-head';
      title.textContent = source.name || source.id || 'Knowledge Source ' + (index + 1);
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        sources.splice(index, 1);
        persistSources();
        renderSources();
      });
      fields.className = 'form-grid';
      fields.append(
        field('ID', textInput(source.id, (value) => updateSource(index, 'id', value)), 'span-3'),
        field('Name', textInput(source.name, (value) => updateSource(index, 'name', value)), 'span-3'),
        field('Protocol', protocolSelect(source.protocol, (value) => updateSource(index, 'protocol', value)), 'span-2'),
        field('URL', textInput(source.url, (value) => updateSource(index, 'url', value), 'http://127.0.0.1:8765'), 'span-4'),
        checkboxField('Selected', Boolean(source.selected), (value) => updateSource(index, 'selected', value), 'span-3'),
      );
      head.append(title, remove);
      row.append(head, fields);
      return row;
    }

    function field(labelText, control, className) {
      const label = document.createElement('label');
      label.className = className || '';
      label.append(labelText, control);
      return label;
    }

    function checkboxField(labelText, checked, onChange, className) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      label.className = 'check-row ' + (className || '');
      label.append(input, labelText);
      return label;
    }

    function textInput(value, onInput, placeholder) {
      const input = document.createElement('input');
      input.value = value || '';
      input.placeholder = placeholder || '';
      input.autocomplete = 'off';
      input.addEventListener('input', () => onInput(input.value.trim()));
      return input;
    }

    function protocolSelect(value, onChange) {
      const select = document.createElement('select');
      ['llmwiki-http', 'mcp', 'a2a'].forEach((protocol) => {
        const option = document.createElement('option');
        option.value = protocol;
        option.textContent = protocol;
        select.append(option);
      });
      select.value = value || 'llmwiki-http';
      select.addEventListener('change', () => onChange(select.value));
      return select;
    }

    function updateSource(index, key, value) {
      sources[index] = { ...sources[index], [key]: value };
      persistSources();
      updatePayloadOutput();
      updateGuidedSetup();
    }

    function persistSources() {
      writeJsonStorage(sourceKey, sources);
    }

    function persistSetupDraft(setup) {
      const { apiKey, bearerToken, clearApiKey, clearBearerToken, ...publicSetup } = setup;
      writeJsonStorage(setupKey, publicSetup);
      writeSessionString(apiSecretKey, apiKey);
      writeSessionString(setupSecretKey, bearerToken);
    }

    function payloadSources() {
      return sources
        .map((source) => ({
          id: String(source.id || '').trim(),
          name: String(source.name || '').trim(),
          protocol: source.protocol || 'llmwiki-http',
          status: 'ready',
          url: String(source.url || '').trim(),
          selected: source.selected !== false,
        }))
        .filter((source) => source.url);
    }

    function setupCheckPayload() {
      const draftSources = payloadSources();
      const payload = {
        data: {
          query: payloadQueryEl.value.trim() || 'What should I know?',
        },
      };
      if (draftSources.length) payload.data.knowledgeSources = draftSources;
      return payload;
    }

    function updatePayloadOutput() {
      payloadOutputEl.value = JSON.stringify(setupCheckPayload(), null, 2);
    }

    function authHeaders(extra) {
      const token = sessionStorage.getItem(tokenKey) || '';
      return token ? { ...(extra || {}), Authorization: 'Bearer ' + token } : { ...(extra || {}) };
    }

    function splitList(value) {
      return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    }

    function configSavePayload(setup = readSetupForm()) {
      const payload = {
        runtimeProfile: setup.runtimeProfile,
        host: setup.host,
        port: setup.port,
        baseUrl: setup.baseUrl,
        model: setup.model,
        requestTimeoutMs: setup.timeoutMs,
        allowedOrigins: splitList(setup.allowedOrigins),
        sourcePolicy: setup.sourcePolicy,
        allowedSourceOrigins: splitList(setup.allowedSourceOrigins),
        allowPublicBind: Boolean(setup.allowPublicBind),
        allowInsecurePublicBind: Boolean(setup.allowInsecurePublicBind),
      };
      if (setup.clearApiKey) payload.apiKey = '';
      else if (setup.apiKey) payload.apiKey = setup.apiKey;
      if (setup.clearBearerToken) payload.bridgeBearerToken = '';
      else if (setup.bearerToken) payload.bridgeBearerToken = setup.bearerToken;
      return payload;
    }

    function setSaveStatus(text, kind) {
      saveStatusEl.textContent = text;
      saveStatusEl.className = kind ? 'status ' + kind : 'status';
    }

    async function saveBridgeSettings() {
      const setup = readSetupForm();
      persistSetupDraft(setup);
      setSaveStatus('Saving runtime settings...', '');
      try {
        const response = await fetch('/settings/config.json', {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(configSavePayload(setup)),
        });
        if (response.status === 401) {
          authEl.classList.add('visible');
          throw new Error('Bridge bearer token is required.');
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'HTTP ' + response.status);
        if (setup.clearBearerToken) {
          sessionStorage.removeItem(tokenKey);
          tokenEl.value = '';
        } else if (setup.bearerToken) {
          sessionStorage.setItem(tokenKey, setup.bearerToken);
          tokenEl.value = setup.bearerToken;
        }
        const applied = Array.isArray(result.applied) && result.applied.length ? result.applied.join(', ') : 'none';
        const restartRequired = Array.isArray(result.restartRequired) && result.restartRequired.length ? result.restartRequired.join(', ') : 'none';
        setSaveStatus('Saved runtime settings. Applied: ' + applied + '. Restart required: ' + restartRequired + '.', 'ok');
        if (result.settings) {
          authEl.classList.toggle('visible', result.settings.bridgeAuth.bearerTokenConfigured);
          render(result.settings);
        }
      } catch (error) {
        setSaveStatus('Could not save runtime settings: ' + error.message, 'error');
      }
    }

    async function loadRegisteredSources() {
      try {
        const response = await fetch('/settings/sources.json', { headers: authHeaders() });
        if (response.status === 401) return;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'HTTP ' + response.status);
        applyRegisteredSourceCount(result, Array.isArray(result.sources) ? result.sources.length : registeredSourceCount);
        if (Array.isArray(result.sources) && result.sources.length) {
          sources = sourceDrafts(result.sources);
          persistSources();
          renderSources();
          setStatus('Loaded registered Knowledge Sources.', 'ok');
        }
        updateGuidedSetup();
      } catch (error) {
        setStatus('Could not load registered Knowledge Sources: ' + error.message, 'error');
      }
    }

    async function saveSources() {
      setStatus('Saving registered Knowledge Sources...', '');
      try {
        const response = await fetch('/settings/sources.json', {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ sources: payloadSources() }),
        });
        if (response.status === 401) {
          authEl.classList.add('visible');
          throw new Error('Bridge bearer token is required.');
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'HTTP ' + response.status);
        sources = sourceDrafts(result.sources);
        applyRegisteredSourceCount(result, sources.length);
        persistSources();
        renderSources();
        setStatus('Saved ' + sources.length + ' registered Knowledge ' + (sources.length === 1 ? 'Source.' : 'Sources.'), 'ok');
      } catch (error) {
        setStatus('Could not save registered sources: ' + error.message, 'error');
      }
    }

    async function runSetupCheck() {
      updatePayloadOutput();
      const payload = setupCheckPayload();
      const draftSources = payload.data.knowledgeSources || [];
      const usingDraftSources = draftSources.length > 0;
      setVerifyStatus('Running setup check with ' + (usingDraftSources ? plural(draftSources.length, 'draft source', 'draft sources') : 'registered sources') + '...', '');
      verifyOutputEl.value = '';
      try {
        const response = await fetch('/message:send', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        });
        if (response.status === 401) {
          authEl.classList.add('visible');
          throw new Error('Bridge bearer token is required.');
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'HTTP ' + response.status);
        renderSetupCheckResult(result, usingDraftSources, draftSources.length);
      } catch (error) {
        verifyOutputEl.value = 'Setup check failed.\\n' + error.message;
        setVerifyStatus('Setup check failed: ' + error.message, 'error');
      }
    }

    function renderSetupCheckResult(result, usingDraftSources, draftCount) {
      const data = llmwikiAgentResultData(result);
      const answer = data?.answer || textFromMessage(result?.message) || textFromMessage(result?.status?.message) || 'No answer text returned.';
      const citations = Array.isArray(data?.citations) ? data.citations : [];
      const graph = data?.graph && typeof data.graph === 'object' ? data.graph : {};
      const graphNodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
      const graphEdges = Array.isArray(graph.edges) ? graph.edges.length : 0;
      const steps = Array.isArray(data?.steps) ? data.steps : [];
      const sourceText = usingDraftSources ? plural(draftCount, 'draft source', 'draft sources') : 'registered sources';
      const stepLines = steps
        .map((item) => '- ' + valueText(item.status) + ': ' + valueText(item.label || item.id))
        .join('\\n');
      verifyOutputEl.value = [
        'Answer:',
        answer,
        '',
        'Status: completed using ' + sourceText + '.',
        'Citations: ' + citations.length + '.',
        'Graph: ' + graphNodes + ' nodes, ' + graphEdges + ' edges.',
        stepLines ? '\\nSteps:\\n' + stepLines : '',
      ].filter(Boolean).join('\\n');
      setVerifyStatus('Setup check completed using ' + sourceText + '. Answer returned with ' + plural(citations.length, 'citation', 'citations') + '.', 'ok');
    }

    function llmwikiAgentResultData(result) {
      const artifacts = Array.isArray(result?.artifacts) ? result.artifacts : [];
      for (const artifact of artifacts) {
        if (artifact?.name !== 'llmwiki_agent_result') continue;
        const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
        for (const part of parts) {
          if (part?.data && typeof part.data === 'object') return part.data;
        }
      }
      return null;
    }

    function textFromMessage(message) {
      const parts = Array.isArray(message?.parts) ? message.parts : [];
      const part = parts.find((item) => typeof item?.text === 'string' && item.text.trim());
      return part ? part.text : '';
    }

    async function copyTarget(button) {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const text = target.value || target.textContent || '';
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          target.focus();
          target.select();
          document.execCommand('copy');
        }
        const original = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => { button.textContent = original; }, 1200);
      } catch {
        setStatus('Copy failed. Select the text and copy it manually.', 'error');
      }
    }

    function readJsonStorage(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    function writeJsonStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }

    function readStringStorage(key) {
      try {
        return localStorage.getItem(key) || '';
      } catch {
        return '';
      }
    }

    function writeStringStorage(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    }

    function readSessionString(key) {
      try {
        return sessionStorage.getItem(key) || '';
      } catch {
        return '';
      }
    }

    function writeSessionString(key, value) {
      try {
        if (value) sessionStorage.setItem(key, value);
        else sessionStorage.removeItem(key);
      } catch {}
    }

    async function loadSettings() {
      setStatus('Loading bridge overview...', '');
      try {
        const response = await fetch('/settings.json', { headers: authHeaders() });
        if (response.status === 401) {
          authEl.classList.add('visible');
          summaryEl.replaceChildren(
            overviewHero({
              kind: 'warn',
              label: 'Token required',
              title: 'Settings overview is locked',
              copy: 'Next: apply the bridge bearer token to load redacted runtime, access, and source diagnostics.',
            }, [
              ['Settings JSON', 'locked'],
              ['Auth', 'bearer required'],
              ['Diagnostics', 'hidden'],
              ['Next step', 'apply token'],
            ]),
            metricGroup(
              metric('Settings access', 'Bearer token required', 'Use the form above to load redacted diagnostics.', 'warn'),
            ),
          );
          settingsEl.replaceChildren();
          setStatus('Bridge bearer token is required.', 'error');
          return;
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const config = await response.json();
        authEl.classList.toggle('visible', config.bridgeAuth.bearerTokenConfigured);
        seedSetupFromConfig(config);
        render(config);
        setStatus('Loaded redacted bridge overview.', 'ok');
        await loadRegisteredSources();
      } catch (error) {
        summaryEl.replaceChildren(
          overviewHero({
            kind: 'error',
            label: 'Unavailable',
            title: 'Settings overview could not load',
            copy: 'Next: reload the overview or check whether the bridge process is still running.',
          }, [
            ['Settings JSON', 'unavailable'],
            ['Runtime form', 'still usable'],
            ['Sources form', 'still usable'],
            ['Error', error.message],
          ]),
          metricGroup(
            metric('Settings JSON', 'Unavailable', 'Runtime settings and Knowledge Sources can still be edited offline.', 'warn'),
          ),
        );
        settingsEl.replaceChildren();
        setStatus('Could not load settings: ' + error.message, 'error');
      }
    }

    loadSettings();
  </script>
</body>
</html>
`
}

function bridgeConfig(env, options = {}) {
  const configPath = stringOption(options.configPath)
    ?? stringOption(env[CONFIG_PATH_ENV])
    ?? stringOption(env[DEPRECATED_CONFIG_PATH_ENV])
    ?? ''
  const persistentSettings = readPersistentBridgeSettings(configPath)
  const persistentConfig = asRecord(persistentSettings.config) || {}
  const host = stringOption(options.host)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_HOST)
    || stringOption(env.HERMES_A2A_BRIDGE_HOST)
    || stringOption(env.HOST)
    || stringOption(persistentConfig.host)
    || DEFAULT_HOST
  const port = numberOption(options.port)
    ?? numberFromEnvValue(env.LLMWIKI_AGENT_BRIDGE_PORT)
    ?? numberFromEnvValue(env.HERMES_A2A_BRIDGE_PORT)
    ?? numberFromEnvValue(env.PORT)
    ?? readNumberValue(persistentConfig.port)
    ?? DEFAULT_PORT
  const baseUrl = stringOption(options.baseUrl)
    || stringOption(options.agentBaseUrl)
    || stringOption(options.hermesBaseUrl)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_BASE_URL)
    || stringOption(env.HERMES_BASE_URL)
    || stringOption(persistentConfig.baseUrl)
    || stringOption(persistentConfig.agentBaseUrl)
    || stringOption(persistentConfig.hermesBaseUrl)
    || DEFAULT_AGENT_BASE_URL
  const apiKey = stringOption(options.apiKey)
    ?? stringOption(options.agentApiKey)
    ?? stringOption(options.hermesApiKey)
    ?? stringOption(env.LLMWIKI_AGENT_BRIDGE_API_KEY)
    ?? stringOption(env.HERMES_API_KEY)
    ?? stringOption(persistentConfig.apiKey)
    ?? stringOption(persistentConfig.agentApiKey)
    ?? stringOption(persistentConfig.hermesApiKey)
    ?? ''
  const model = stringOption(options.model)
    || stringOption(options.agentModel)
    || stringOption(options.hermesModel)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_MODEL)
    || stringOption(env.HERMES_MODEL)
    || stringOption(persistentConfig.model)
    || stringOption(persistentConfig.agentModel)
    || stringOption(persistentConfig.hermesModel)
    || DEFAULT_AGENT_MODEL
  const bridgeBearerToken = stringOption(options.bridgeBearerToken)
    ?? stringOption(env.LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN)
    ?? stringOption(env.HERMES_A2A_BRIDGE_BEARER_TOKEN)
    ?? stringOption(persistentConfig.bridgeBearerToken)
    ?? ''
  const allowPublicBind = booleanOption(options.allowPublicBind)
    ?? envFlagOption(env[PUBLIC_BIND_OPT_IN_ENV])
    ?? envFlagOption(env[DEPRECATED_PUBLIC_BIND_OPT_IN_ENV])
    ?? booleanOption(persistentConfig.allowPublicBind)
    ?? false
  const allowInsecurePublicBind = booleanOption(options.allowInsecurePublicBind)
    ?? envFlagOption(env[INSECURE_PUBLIC_BIND_OPT_IN_ENV])
    ?? envFlagOption(env[DEPRECATED_INSECURE_PUBLIC_BIND_OPT_IN_ENV])
    ?? booleanOption(persistentConfig.allowInsecurePublicBind)
    ?? false
  const requestTimeoutMs = numberOption(options.requestTimeoutMs)
    ?? numberFromEnvValue(env.LLMWIKI_AGENT_BRIDGE_TIMEOUT_MS)
    ?? numberFromEnvValue(env.HERMES_A2A_BRIDGE_TIMEOUT_MS)
    ?? readNumberValue(persistentConfig.requestTimeoutMs)
    ?? DEFAULT_REQUEST_TIMEOUT_MS
  const allowedOrigins = arrayOption(options.allowedOrigins)
    ?? parseOriginList(env.LLMWIKI_AGENT_BRIDGE_ALLOWED_ORIGINS)
    ?? parseOriginList(env.HERMES_A2A_BRIDGE_ALLOWED_ORIGINS)
    ?? arrayOption(persistentConfig.allowedOrigins)
    ?? parseOriginList(persistentConfig.allowedOrigins)
    ?? []
  const allowedSourceOrigins = sourceOriginArrayOption(options.allowedSourceOrigins)
    ?? parseSourceOriginList(env.LLMWIKI_AGENT_BRIDGE_ALLOWED_SOURCE_ORIGINS)
    ?? parseSourceOriginList(env.HERMES_A2A_BRIDGE_ALLOWED_SOURCE_ORIGINS)
    ?? sourceOriginArrayOption(persistentConfig.allowedSourceOrigins)
    ?? parseSourceOriginList(persistentConfig.allowedSourceOrigins)
    ?? []
  const sourcePolicy = sourcePolicyOption(options.sourcePolicy)
    ?? sourcePolicyOption(env.LLMWIKI_AGENT_BRIDGE_SOURCE_POLICY)
    ?? sourcePolicyOption(env.HERMES_A2A_BRIDGE_SOURCE_POLICY)
    ?? sourcePolicyOption(persistentConfig.sourcePolicy)
    ?? DEFAULT_SOURCE_POLICY
  const runtimeProfile = runtimeProfileOption(options.runtimeProfile)
    ?? runtimeProfileOption(env.LLMWIKI_AGENT_BRIDGE_RUNTIME_PROFILE)
    ?? runtimeProfileOption(env.HERMES_A2A_BRIDGE_RUNTIME_PROFILE)
    ?? runtimeProfileOption(persistentConfig.runtimeProfile)
    ?? DEFAULT_RUNTIME_PROFILE
  const runtimeProfileDefaults = runtimeProfiles[runtimeProfile]
  const runtimeId = stringOption(options.runtimeId)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_RUNTIME_ID)
    || stringOption(env.HERMES_A2A_BRIDGE_RUNTIME_ID)
    || stringOption(persistentConfig.runtimeId)
    || runtimeProfileDefaults.runtimeId
  const runtimeName = stringOption(options.runtimeName)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_RUNTIME_NAME)
    || stringOption(env.HERMES_A2A_BRIDGE_RUNTIME_NAME)
    || stringOption(persistentConfig.runtimeName)
    || runtimeProfileDefaults.runtimeName
  const runtime = stringOption(options.runtime)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_RUNTIME)
    || stringOption(env.HERMES_A2A_BRIDGE_RUNTIME)
    || stringOption(persistentConfig.runtime)
    || runtimeProfileDefaults.runtime
  const agentRuntime = stringOption(options.agentRuntime)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_AGENT_RUNTIME)
    || stringOption(env.HERMES_A2A_BRIDGE_AGENT_RUNTIME)
    || stringOption(persistentConfig.agentRuntime)
    || runtimeProfileDefaults.agentRuntime
  const providerOrganization = stringOption(options.providerOrganization)
    || stringOption(env.LLMWIKI_AGENT_BRIDGE_PROVIDER_ORGANIZATION)
    || stringOption(env.HERMES_A2A_BRIDGE_PROVIDER_ORGANIZATION)
    || stringOption(persistentConfig.providerOrganization)
    || runtimeProfileDefaults.providerOrganization
  const logger = options.logger || console
  const publicBind = !isLoopbackBindHost(host)
  const registeredSources = sourceRegistryOption(options.registeredSources)
    ?? sourceRegistryOption(options.sources)
    ?? sourceRegistryOption(persistentSettings.sources)
    ?? []

  assertBridgeStartupPolicy({
    host,
    publicBind,
    allowPublicBind,
    allowInsecurePublicBind,
    bridgeBearerToken,
  })

  return {
    host,
    port,
    baseUrl,
    apiKey,
    model,
    hermesBaseUrl: baseUrl,
    hermesApiKey: apiKey,
    hermesModel: model,
    bridgeBearerToken,
    publicBind,
    allowPublicBind,
    allowInsecurePublicBind,
    requestTimeoutMs,
    allowedOrigins,
    allowedSourceOrigins,
    sourcePolicy,
    runtimeProfile,
    runtimeId,
    runtimeName,
    runtime,
    agentRuntime,
    providerOrganization,
    configPath,
    registeredSources,
    logger,
  }
}

function defaultBridgeConfigPath(env = process.env) {
  const appData = stringOption(env.APPDATA)
  if (process.platform === 'win32' && appData) {
    return join(appData, 'llmwiki-agent-bridge', 'settings.json')
  }
  return join(homedir(), '.config', 'llmwiki-agent-bridge', 'settings.json')
}

function assertBridgeStartupPolicy({
  host,
  publicBind,
  allowPublicBind,
  allowInsecurePublicBind,
  bridgeBearerToken,
}) {
  if (!publicBind) return

  if (!allowPublicBind) {
    throw new Error(
      `Refusing to bind LLMWiki Agent Bridge to non-loopback host ${host}. `
      + `Set ${PUBLIC_BIND_OPT_IN_ENV}=1 only when this development bridge should be reachable off-host.`,
    )
  }

  if (!bridgeBearerToken && !allowInsecurePublicBind) {
    throw new Error(
      'Refusing to start publicly bound LLMWiki Agent Bridge without '
      + 'LLMWIKI_AGENT_BRIDGE_BEARER_TOKEN. '
      + `For an intentionally unauthenticated development bind, set ${INSECURE_PUBLIC_BIND_OPT_IN_ENV}=1.`,
    )
  }
}

function numberFromEnv(value, fallback) {
  return numberFromEnvValue(value) ?? fallback
}

function numberFromEnvValue(value) {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function numberOption(value) {
  if (typeof value !== 'number') return undefined
  return Number.isFinite(value) ? value : undefined
}

function stringOption(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function booleanOption(value) {
  return typeof value === 'boolean' ? value : undefined
}

function sourcePolicyOption(value) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  const policy = sourcePolicyAliases.get(normalized)
  if (policy) return policy
  throw new Error(`Unsupported LLMWiki Agent Bridge source policy: ${value}.`)
}

function runtimeProfileOption(value) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (!normalized) return undefined
  const profile = runtimeProfileAliases.get(normalized)
  if (profile) return profile
  throw new Error(`Unsupported LLMWiki Agent Bridge runtime profile: ${value}.`)
}

function envFlagOption(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return envFlag(value)
}

function envFlag(value) {
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function arrayOption(value) {
  return Array.isArray(value) ? value.map(String).map(normalizeOriginText).filter(Boolean) : undefined
}

function sourceOriginArrayOption(value) {
  return Array.isArray(value) ? value.map(String).map(normalizeSourceOriginText).filter(Boolean) : undefined
}

function sourceRegistryOption(value) {
  if (!Array.isArray(value)) return undefined
  return value.map((source, index) => normalizeRegisteredSource(source, index))
}

function parseOriginList(value) {
  return typeof value === 'string'
    ? value.split(',').map(normalizeOriginText).filter(Boolean)
    : undefined
}

function parseSourceOriginList(value) {
  return typeof value === 'string'
    ? value.split(',').map(normalizeSourceOriginText).filter(Boolean)
    : undefined
}

async function readJsonBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.', 'body_too_large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json')
  }
}

async function postJson(url, body, label, config) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, label, config)
}

async function postKnowledgeSourceJson(url, body, label, config) {
  return fetchKnowledgeSourceJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, label, config)
}

async function fetchKnowledgeSourceJson(url, init, label, config) {
  assertAllowedKnowledgeSourceFetchUrl(url, config)
  return fetchJson(url, { ...init, redirect: 'error' }, label, config)
}

async function fetchJson(url, init, label, config) {
  const response = await fetchWithTimeout(url, init, config.requestTimeoutMs)
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Request timed out.')
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractHermesAnswer(payload) {
  const choice = readRecordArray(payload.choices)[0]
  const message = asRecord(choice?.message)
  return textFromContent(message?.content) || readString(choice || {}, 'text')
}

function textFromContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part === 'string') return part
    const record = asRecord(part)
    return record ? readString(record, 'text') : ''
  }).filter(Boolean).join('\n').trim()
}

function extractA2aContextPayload(payload) {
  const artifacts = [
    ...readRecordArray(payload.artifacts),
    ...readRecordArray(asRecord(payload.result)?.artifacts),
    ...readRecordArray(asRecord(payload.task)?.artifacts),
  ]
  for (const artifact of artifacts) {
    if (readString(artifact, 'name') !== 'llmwiki_context') continue
    return asRecord(artifact.data) || extractRecordFromParts(artifact.parts)
  }
  return null
}

function fallbackA2aContextPayload(source, payload) {
  const messageText = readableMarkdown(extractA2aMessageText(payload))
  return {
    wiki_title: source.name,
    orientation: messageText ? [{ title: 'A2A message', role: 'message', snippet: messageText }] : [],
    evidence: [],
    limitations: [
      messageText
        ? `A2A response did not include a llmwiki_context data artifact. Message: ${messageText}`
        : 'A2A response did not include a llmwiki_context data artifact.',
    ],
  }
}

function assertNoA2aError(payload) {
  if (payload.error) throw new Error('A2A source returned an error.')
  const status = asRecord(payload.status)
  const state = readString(status || {}, 'state').toLowerCase()
  if (['failed', 'canceled', 'cancelled', 'rejected'].includes(state)) {
    throw new Error('A2A source returned a failed task state.')
  }
}

function extractA2aMessageText(payload) {
  const direct = readStringValue(payload.message) || readStringValue(payload.text)
  if (direct) return direct

  const message = asRecord(payload.message)
  const status = asRecord(payload.status)
  const statusMessage = asRecord(status?.message)
  const result = asRecord(payload.result)
  return [
    extractTextFromParts(payload.parts),
    extractTextFromParts(message?.parts),
    extractTextFromParts(statusMessage?.parts),
    extractTextFromParts(result?.parts),
    readStringValue(statusMessage?.text),
    readStringValue(result?.message),
  ].find(Boolean) || ''
}

function extractRecordFromParts(value) {
  for (const part of readRecordArray(value)) {
    const data = asRecord(part.data)
    if (data) return data
    const parsed = parseRecord(readString(part, 'text'))
    if (parsed) return parsed
  }
  return null
}

function extractTextFromParts(value) {
  return readRecordArray(value)
    .map((part) => readStringValue(part.text) || readStringValue(part.data))
    .filter(Boolean)
    .join(' ')
    .trim()
}

function a2aAgentCardUrl(url) {
  const clean = url.trim().replace(/\/+$/, '')
  return pathName(clean).endsWith(AGENT_CARD_ROUTE)
    ? clean
    : joinUrl(clean, AGENT_CARD_ROUTE)
}

function resolveA2aMessageUrl(card, cardUrl) {
  const rawUrl = readString(card, 'url') || '/message:send'
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  const serviceBase = cardUrl.replace(/\/\.well-known\/agent-card\.json(?:[?#].*)?$/, '/')
  const relativeUrl = rawUrl.startsWith('/') ? rawUrl : `./${rawUrl}`
  return new URL(relativeUrl, serviceBase).toString()
}

function isAllowedA2aKnowledgeSourceMessageUrl(value, config) {
  return isAllowedKnowledgeSourceFetchUrl(value, config)
}

function assertAllowedKnowledgeSourceFetchUrl(value, config) {
  if (!isAllowedKnowledgeSourceFetchUrl(value, config)) {
    throw new Error('Knowledge Source URL is not allowed by this bridge source policy.')
  }
}

function isAllowedKnowledgeSourceFetchUrl(value, config) {
  let parsedUrl
  try {
    parsedUrl = new URL(value)
  } catch {
    return false
  }

  if (parsedUrl.username || parsedUrl.password) return false

  const protocol = parsedUrl.protocol
  if (protocol !== 'http:' && protocol !== 'https:') return false

  const origin = normalizeSourceOriginText(parsedUrl.origin)
  const allowedSourceOrigins = config?.allowedSourceOrigins || []
  const sourcePolicy = config?.sourcePolicy || DEFAULT_SOURCE_POLICY
  if (sourcePolicy === 'allowlist') return Boolean(origin && allowedSourceOrigins.includes(origin))
  if (origin && allowedSourceOrigins.includes(origin)) return true
  if (sourcePolicy === DEFAULT_SOURCE_POLICY) return true

  const host = normalizedHost(parsedUrl)
  if ((protocol === 'http:' || protocol === 'https:') && isLoopbackHost(host)) return true
  return protocol === 'https:' && isPublicReachableHost(host)
}

function normalizedHost(parsedUrl) {
  return parsedUrl.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
}

function normalizeBindHost(host) {
  return String(host || '').trim().replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
}

function isLoopbackBindHost(host) {
  return isLoopbackHost(normalizeBindHost(host))
}

function hostForUrl(host) {
  const normalized = normalizeBindHost(host)
  return normalized.includes(':') ? `[${normalized}]` : normalized
}

function isLoopbackHost(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.includes(':')) {
    const groups = parseIpv6Groups(host)
    return Boolean(groups && groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)
  }
  const ipv4Octets = parseIpv4Octets(host)
  return Boolean(ipv4Octets && ipv4Octets[0] === 127)
}

function isPublicReachableHost(host) {
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false
  }

  if (host.includes(':')) return isPublicReachableIpv6Host(host)

  const ipv4Octets = parseIpv4Octets(host)
  if (ipv4Octets) return !isUnavailableIpv4Octets(ipv4Octets)

  return host.includes('.')
}

function isPublicReachableIpv6Host(host) {
  const groups = parseIpv6Groups(host)
  if (!groups) return false

  const mappedIpv4 = ipv4MappedIpv6Octets(groups)
  if (mappedIpv4) return !isUnavailableIpv4Octets(mappedIpv4)

  if (groups.every((group) => group === 0)) return false
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false

  const firstGroup = groups[0]
  if ((firstGroup & 0xfe00) === 0xfc00) return false
  if ((firstGroup & 0xffc0) === 0xfe80) return false
  if ((firstGroup & 0xff00) === 0xff00) return false
  if (firstGroup === 0x2001 && groups[1] === 0x0db8) return false

  return true
}

function parseIpv4Octets(host) {
  const parts = host.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null

  const octets = parts.map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return null
  return octets
}

function isUnavailableIpv4Octets(octets) {
  return unavailableIpv4CidrBlocks.some((block) => ipv4CidrContains(block, octets))
}

function ipv4CidrContains(block, octets) {
  const address = ipv4ToInteger(octets)
  const base = ipv4ToInteger(block.base)
  const blockSize = 2 ** (32 - block.prefixLength)
  return address >= base && address < base + blockSize
}

function ipv4ToInteger(octets) {
  const [first, second, third, fourth] = octets
  return (((first * 256) + second) * 256 + third) * 256 + fourth
}

function parseIpv6Groups(host) {
  const [leftText, rightText, ...rest] = host.split('::')
  if (rest.length || leftText === undefined) return null

  const left = leftText ? parseIpv6GroupList(leftText) : []
  const right = rightText ? parseIpv6GroupList(rightText) : []
  if (!left || !right) return null

  if (rightText === undefined) return left.length === 8 ? left : null

  const zeroGroupCount = 8 - left.length - right.length
  if (zeroGroupCount < 1) return null
  return [...left, ...Array.from({ length: zeroGroupCount }, () => 0), ...right]
}

function parseIpv6GroupList(value) {
  const parts = value.split(':')
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null
  return parts.map((part) => parseInt(part, 16))
}

function ipv4MappedIpv6Octets(groups) {
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return null
  return [
    (groups[6] >> 8) & 0xff,
    groups[6] & 0xff,
    (groups[7] >> 8) & 0xff,
    groups[7] & 0xff,
  ]
}

function isAuthorizedBridgeRequest(request, config) {
  if (!config.bridgeBearerToken) return true

  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization
  const match = /^Bearer\s+(.+)$/i.exec(authorization || '')
  return Boolean(match && timingSafeStringEqual(match[1], config.bridgeBearerToken))
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isAllowedBridgeOrigin(originHeader, config, request) {
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader
  if (!origin) return true

  const normalized = normalizeOriginText(origin)
  if (!normalized) return false
  if (isSameRequestOrigin(normalized, request)) return true
  if (config.allowedOrigins.includes(normalized)) return true

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return isLoopbackHost(normalizedHost(parsed))
  } catch {
    return false
  }
}

function isSameRequestOrigin(origin, request) {
  const host = Array.isArray(request?.headers?.host) ? request.headers.host[0] : request?.headers?.host
  if (!host) return false
  return origin === normalizeOriginText(`http://${host}`)
}

function normalizeOriginText(value) {
  if (!value || value === 'null') return ''
  try {
    const parsed = new URL(String(value).trim())
    if (parsed.username || parsed.password) return ''
    return parsed.origin
  } catch {
    return ''
  }
}

function normalizeSourceOriginText(value) {
  const origin = normalizeOriginText(value)
  if (!origin) return ''
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : ''
  } catch {
    return ''
  }
}

function mcpEndpointUrl(url) {
  const clean = url.trim().replace(/\/+$/, '')
  return pathName(clean).endsWith('/mcp') ? clean : `${clean}/mcp`
}

function chatCompletionsUrl(baseUrl) {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  return pathName(clean).endsWith('/chat/completions') ? clean : `${clean}/chat/completions`
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`
}

function pathName(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '')
  } catch {
    return url.split(/[?#]/)[0].replace(/\/+$/, '')
  }
}

function step(input) {
  return {
    ...input,
    timestamp: input.timestamp || new Date().toISOString(),
  }
}

function replaceStep(steps, next) {
  const index = steps.findIndex((item) => item.id === next.id)
  if (index >= 0) steps[index] = next
}

function toolNameFor(source) {
  return `llmwiki_context__${safeId(source.id)}`
}

function safeId(value) {
  return String(value || 'source').replace(/[^a-zA-Z0-9]+/g, '_') || 'source'
}

function dedupeCitations(citations) {
  const seen = new Set()
  return citations.filter((citation) => {
    const key = citation.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function emptyGraph() {
  return { nodes: [], edges: [] }
}

function readableMarkdown(value) {
  return value
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function readString(record, key) {
  return readStringValue(record?.[key])
}

function readNumber(record, key) {
  return readNumberValue(record?.[key])
}

function readBoolean(record, key) {
  return readBooleanValue(record?.[key])
}

function readStringValue(value) {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}

function readNumberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readBooleanValue(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return undefined
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + value, 0)
}

function readStringArray(value) {
  return Array.isArray(value) ? value.map(String) : []
}

function readRecordArray(value) {
  return Array.isArray(value) ? value.map(asRecord).filter(Boolean) : []
}

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
}

function parseRecord(value) {
  if (!value.trim()) return null
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function redactedLogLine(prefix, error) {
  return `${prefix}: ${redactErrorMessage(error)}`
}

function redactErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|sk-proj|sk-ant|hf)_[A-Za-z0-9._~+/=-]+/g, '[redacted-key]')
    .replace(/\b(?:sk|sk-proj)-[A-Za-z0-9._~+/=-]+/g, '[redacted-key]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
    .slice(0, 240)
}

function redactedUrlSummary(value) {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '[invalid-url]'
  }
}

function corsHeadersForRequest(config, request) {
  const headers = { ...baseCorsHeaders }
  const origin = Array.isArray(request?.headers?.origin) ? request.headers.origin[0] : request?.headers?.origin
  const normalized = normalizeOriginText(origin)
  if (normalized && config && isAllowedBridgeOrigin(normalized, config, request)) {
    headers['Access-Control-Allow-Origin'] = normalized
  }
  return headers
}

function writeJson(response, status, value, config, request) {
  response.writeHead(status, {
    ...corsHeadersForRequest(config, request),
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(value === null ? '' : JSON.stringify(value))
}

function writeHtml(response, status, value, config, request) {
  response.writeHead(status, {
    ...corsHeadersForRequest(config, request),
    'Content-Type': 'text/html; charset=utf-8',
  })
  response.end(value)
}

class HttpError extends Error {
  constructor(status, message, code, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = details.requestId
    this.traceId = details.traceId
    this.steps = details.steps
    this.diagnostics = details.diagnostics
  }
}

export function runAgentBridgeCli() {
  let runningServer
  const configPath = stringOption(process.env[CONFIG_PATH_ENV])
    ?? stringOption(process.env[DEPRECATED_CONFIG_PATH_ENV])
    ?? defaultBridgeConfigPath(process.env)
  startAgentBridge({ configPath })
    .then(({ server, url, config }) => {
      runningServer = server
      process.stdout.write(JSON.stringify({
        event: 'ready',
        url,
        baseUrl: redactedUrlSummary(config.baseUrl),
        modelConfigured: Boolean(config.model),
        hermesBaseUrl: redactedUrlSummary(config.hermesBaseUrl),
        hermesModelConfigured: Boolean(config.hermesModel),
        publicBind: config.publicBind,
        bridgeAuthConfigured: Boolean(config.bridgeBearerToken),
        configuredAllowedOrigins: config.allowedOrigins.length,
        sourcePolicy: config.sourcePolicy,
        runtimeProfile: config.runtimeProfile,
        settingsPersistence: Boolean(config.configPath),
      }) + '\n')
    })
    .catch((error) => {
      console.error(redactedLogLine('failed to start llmwiki agent bridge', error))
      process.exit(1)
    })

  const shutdown = () => {
    if (!runningServer) process.exit(0)
    runningServer.close(() => {
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
