import { appendFile } from 'node:fs/promises'
import { Readable, Writable } from 'node:stream'

import {
  PROTOCOL_VERSION,
  agent,
  methods,
  ndJsonStream,
} from '@agentclientprotocol/sdk'

const mode = process.argv[2] || 'happy'
const capturePath = process.argv[3] || ''

async function main() {
  if (mode === 'nonzero') {
    process.stderr.write('fatal sk-proj-secret-for-test https://runtime-secret.example.test C:\\Users\\agent\\secret.txt\n')
    await capture({ event: 'nonzero-start' })
    process.exit(42)
  }

  if (mode === 'malformed') {
    process.stderr.write('malformed sk-proj-malformed-secret https://malformed-secret.example.test C:\\Users\\agent\\malformed.txt\n')
    await capture({ event: 'malformed-start' })
    process.stdout.write('this is not json and mentions sk-proj-stdout-secret https://stdout-secret.example.test\n')
    setTimeout(() => process.exit(0), 20)
    return
  }

  const app = agent({ name: 'fake-deepagents-acp' })
    .onRequest(methods.agent.initialize, async () => {
      await capture({ event: 'initialize' })
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: false,
        },
        agentInfo: {
          name: 'fake-deepagents-acp',
        },
      }
    })
    .onRequest(methods.agent.session.new, async (ctx) => {
      await capture({ event: 'session-new', cwd: ctx.params.cwd })
      return { sessionId: `fake-session-${process.pid}` }
    })
    .onRequest(methods.agent.authenticate, () => ({}))
    .onRequest(methods.agent.session.prompt, async (ctx) => {
      const prompt = promptText(ctx.params.prompt)
      await capture({ event: 'prompt', prompt })

      if (mode === 'timeout') {
        await capture({ event: 'timeout-start', pid: process.pid })
        await new Promise(() => {})
        return { stopReason: 'cancelled' }
      }

      if (mode === 'permission') {
        const permission = await ctx.client.request(methods.client.session.requestPermission, {
          sessionId: ctx.params.sessionId,
          toolCall: {
            toolCallId: 'permission-fixture-tool',
            title: 'Permission fixture tool',
          },
          options: [
            {
              optionId: 'allow-once',
              name: 'Allow once',
              kind: 'allow_once',
            },
            {
              optionId: 'reject-once',
              name: 'Reject once',
              kind: 'reject_once',
            },
          ],
        })
        await capture({ event: 'permission', outcome: permission.outcome })
        await agentMessage(ctx, `Permission outcome: ${permission.outcome.outcome}.`)
        return { stopReason: 'end_turn' }
      }

      const sawEvidence = prompt.includes('# LLMWiki evidence bundle')
      await agentMessage(ctx, `Fake DeepAgents ACP answer. sawEvidence=${sawEvidence}`)
      return { stopReason: 'end_turn' }
    })
    .onNotification(methods.agent.session.cancel, async (ctx) => {
      await capture({ event: 'cancel', sessionId: ctx.params.sessionId })
    })

  const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
  const connection = app.connect(stream)
  await connection.closed
}

async function agentMessage(ctx, text) {
  await ctx.client.notify(methods.client.session.update, {
    sessionId: ctx.params.sessionId,
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text,
      },
    },
  })
}

function promptText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block) => block?.type === 'text' ? block.text || '' : '')
    .join('\n')
}

async function capture(event) {
  if (!capturePath) return
  await appendFile(capturePath, `${JSON.stringify({
    ...event,
    pid: process.pid,
  })}\n`, 'utf8')
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  await capture({ event: 'fixture-error' }).catch(() => {})
  process.exit(70)
})
