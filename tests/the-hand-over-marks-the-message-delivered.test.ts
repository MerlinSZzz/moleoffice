// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER DELIVERS; ONLY THE RECIPIENT MARKS THE MESSAGE READ.
 *
 * A real waiter hands the message over as delivered, replacing M127.
 * The recipient's own mark then advances to seen without losing the hand-over sentence or time.
 * Mutations: make theLiveSessionTookIt write seen, or restore the waiter's automatic seen post.
 * Either makes the delivered assertion red. Remove the writer's hand-over preservation rule and
 * the recipient's mark loses the sentence and clock. Restore each change and rerun green.
 */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
let agentId = ''
let session = ''
const started: ChildProcess[] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** Start the waiter and say when it stops. */
function startTheWaiter(): { said: () => string; ended: Promise<number> } {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      'seen-hand',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
    ],
    { env: { ...process.env, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { said: () => printed, ended }
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

/** The one delivery row on a message, as the row itself reads. */
async function theDelivery(messageId: string): Promise<{ mark: string; at: string; because: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { mark: string; at: string; because: string | null }[] }
  }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await post('/api/records', {
    kind: 'agent',
    title: 'Seen Hand',
    data: { handle: 'seen-hand', runtime: 'claude-code', state: 'active' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === 'seen-hand'), 'the registry row').id
  const filed = await post('/api/records', {
    kind: 'session',
    title: 'A terminal answering as it',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as seen-hand' },
  })
  session = (filed['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is what this wanted.
    }
  }
  await app.close()
  t.close()
})

describe('the waiter delivers and the recipient marks read', () => {
  it('writes delivered, then preserves the hand-over when the recipient marks read', async () => {
    const waiter = startTheWaiter()
    // THE HOLD IS REALLY THERE BEFORE THE MESSAGE IS WRITTEN, so the delivery cannot have come
    // from a run started for it instead.
    expect(
      await until(async () => {
        const holds = (await get('/api/handles')) as { holds?: { handle: string; session: string; releasedAt: string | null }[] }
        return (holds.holds ?? []).some(
          (hold) => hold.handle === 'seen-hand' && hold.session === session && hold.releasedAt === null,
        )
      }),
      waiter.said(),
    ).toBe(true)

    const sent = await post('/api/records', {
      kind: 'message',
      title: 'does the tick double?',
      data: { body: 'does the tick double?', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (sent['record'] as { id: string }).id
    expect(await until(() => waiter.said().includes(messageId)), waiter.said()).toBe(true)
    expect(await waiter.ended, waiter.said()).toBe(0)

    const row = await theDelivery(messageId)
    expect(row.mark).toBe('delivered')
    expect(row.because).toBe(theLiveSessionTookIt(session))
    expect(waiter.said()).toContain('The message is delivered.')
    expect(waiter.said()).toContain(`POST /api/messages/${messageId}/mark {"mark":"seen"}`)
    expect(waiter.said()).toContain('through your office tool once you have read it')
    const marked = await post(`/api/messages/${messageId}/mark`, { mark: 'seen' }, {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'seen-hand',
      'x-mole-office-session': session,
    })
    expect(marked['changed']).toBe(true)
    expect(await theDelivery(messageId)).toEqual({ ...row, mark: 'seen' })
  }, 60_000)
})

describe('M34: an office line reaches a session with the whole sentence behind it', () => {
  it('hands over the few words and then the sentence, because a session cannot hover', async () => {
    const groups = await import('../src/server/lib/groups.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const { moleOffice } = await import('../src/shared/participants.ts')
    const waiter = startTheWaiter()
    expect(
      await until(async () => {
        const holds = (await get('/api/handles')) as { holds?: { handle: string; session: string; releasedAt: string | null }[] }
        return (holds.holds ?? []).some((hold) => hold.handle === 'seen-hand' && hold.session === session && hold.releasedAt === null)
      }),
      waiter.said(),
    ).toBe(true)
    // SYNTHETIC: the day's last broadcast reminder, with a made-up backup sentence behind it.
    const sentence = 'Synthetic backup sentence: check that today’s work has a second copy.'
    const written = groups.writeASystemLineToOne(
      { kind: 'agent', id: agentId },
      'default',
      SYSTEM_LINES.theBroadcastIsDue('18:00', sentence),
      { type: 'system', id: moleOffice().id },
    )
    expect(await until(() => waiter.said().includes(written.id)), waiter.said()).toBe(true)
    expect(await waiter.ended, waiter.said()).toBe(0)
    const handed = waiter.said().slice(waiter.said().indexOf(written.id))
    expect(handed).toContain('18:00 秘书汇报工作')
    expect(handed, 'the session was handed the few words without the sentence behind them').toContain(sentence)
    expect(handed.indexOf('18:00 秘书汇报工作')).toBeLessThan(handed.indexOf(sentence))
  }, 60_000)
})
