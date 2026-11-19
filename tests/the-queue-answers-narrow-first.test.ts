// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE QUEUE ANSWERS NARROW FIRST, AND THE FULL REPLY IS ASKED FOR.
 *
 * A decision took option B of point three of proposal Zv3sl3GmlFP4. The steward's measurement
 * said worker.queue answered about 27 GB in 56,802 calls since 27 August, about 475 KB each, and
 * nearly every byte was the words of messages the polling worker was NOT about to start a run on.
 * So the door answers narrow — ids and the small fields a caller decides on, and no words — and a
 * caller that is about to START something asks one message record for the words.
 *
 * WHAT IS REAL HERE. The server is real and listening; the agent, the message, the delivery row and
 * the run are real rows; the run's tool is tests/fake-runtime.mjs, a real process. Nothing here
 * spends a model call.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED (control run first, then one mutation, revert
 * byte-identical):
 *
 *   - Make the narrow list carry `body` again (put `body:` back on the push in `theQueue` without
 *     the `full` gate) and "the narrow row carries no words" goes red.
 *   - Break the worker's read of the message record and "the pass starts the run from a narrow
 *     poll" goes red: the run is then answered by nothing, and the record reads not delivered.
 */
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string, headers = AS_THE_OWNER): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return { status: reply.statusCode, body: JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown> }
}

interface QueueRow {
  messageId: string
  to: { kind: string; id: string }
  handle: string
  [key: string]: unknown
}

async function theQueue(url: string): Promise<QueueRow[]> {
  const read = await get(url)
  expect(read.status, `reading $\u0024{url}: ${JSON.stringify(read.body).slice(0, 300)}`).toBe(200)
  return read.body['queue'] as QueueRow[]
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-narrow-queue-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('GET /api/worker/queue answers narrow first', () => {
  let narrow: QueueRow[] = []

  it('carries the small fields and no words', async () => {
    // One agent nothing is answering as, so his message stays queued and the row stays on the door.
    await post('/api/records', {
      kind: 'agent',
      title: 'narrow-queue agent',
      data: { handle: 'narrow-queue-agent', state: 'active', runtime: 'claude-code' },
    })
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'A message the narrow door answers without its words',
      data: { body: 'The words of a message the queue door does not carry on a narrow row, and they are long on purpose.', to: [{ kind: 'agent', id: 'narrow-queue-agent' }] },
    })
    const record = filed['record'] as { id?: string } | undefined
    if (record?.id === undefined) throw new Error(`the message was refused: ${JSON.stringify(filed).slice(0, 300)}`)
    messageId = record.id

    narrow = await theQueue('/api/worker/queue')
    const row = one(narrow.filter((r) => r.messageId === messageId), 'the queued row for the message')
    expect(row.handle).toBe('narrow-queue-agent')
    expect(row.hops).toBe(0)
    expect(row.nobodyIsAnsweringAsIt).not.toBeNull()
    // THE NARROW DECLARATION IS THE POINT: ids and small fields, and no words and no record.
    expect('body' in row, `the narrow row ${JSON.stringify(row).slice(0, 200)} carries a body`).toBe(false)
    expect('routedLine' in row).toBe(false)
    expect(JSON.stringify(row)).not.toContain('The words of a message the queue door does not carry')
    const full = await theQueue('/api/worker/queue?full=1')
    const { body, routedLine, ...smallFields } = one(full.filter((r) => r.messageId === messageId), 'the full row for comparison')
    expect(body).toContain('The words of a message the queue door does not carry')
    expect(routedLine).toBeNull()
    expect(smallFields.urgent).toBe(false)
    const queueReader = await import('../src/server/lib/worker.ts')
    const fields = (queueReader as unknown as { QUEUE_DECISION_FIELDS: readonly string[] }).QUEUE_DECISION_FIELDS
    const selected = Object.fromEntries(fields.filter((key) => key !== 'title' && Object.hasOwn(smallFields, key)).map((key) => [key, smallFields[key]]))
    expect(row).toEqual({ ...selected, title: 'A message the narrow door answers without its words' })
  }, 60_000)

  it('refuses a query word it was not written to read, rather than guessing', async () => {
    expect((await get('/api/worker/queue?full=0')).status, '?full=0 is not how the full reply is asked').toBe(400)
    expect((await get('/api/worker/queue?full=2')).status, '?full=2 is not how the full reply is asked').toBe(400)
  })

  it('carries the words when the caller asks ?full=1, exactly as this door always answered', async () => {
    const full = await theQueue('/api/worker/queue?full=1')
    const row = one(full.filter((r) => r.messageId === messageId), 'the full row for the message')
    expect(row.body).toContain('The words of a message the queue door does not carry')
  })

  it('still starts the run from a narrow poll, reading each message record once for its words', async () => {
    // THE PRESS the chat offers (criterion M78) is pressed here in setup, so what is measured is
    // the narrow poll and the fetch the worker makes on it, not the press.
    await post(`/api/messages/${messageId}/start-an-agent`, {})
    const report = await onePass(settings, watching)
    const held = report.held.find((r) => r.messageId === messageId)
    expect(held, JSON.stringify(report.held).slice(0, 300)).toBeUndefined()
    expect(report.started.filter((r) => r.messageId === messageId), 'the narrow poll started the run').toHaveLength(1)
    // AND THE RUN WORKS ON THE REAL WORDS: without them the pass would hold the row instead of
    // starting, so the message being delivered is the proof the words were read back.
    const ok = await until(() => deliveredMark(messageId))
    expect(ok, 'the message was delivered by the run the narrow poll started').toBe(true)
    await untilRunsEnd()
  }, 60_000)
})

let messageId = ''

/** Whether this message's delivery row for the agent stands at delivered. */
async function deliveredMark(id: string): Promise<boolean> {
  const read = await get(`/api/messages/${id}`)
  const message = read.body['message'] as { deliveries?: { mark: string }[] } | undefined
  return (message?.deliveries ?? []).some((one) => one.mark === 'delivered')
}

/** Wait until the function answers true, or fail after a while. */
async function until(ask: () => Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    if (await ask()) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 50))
  }
}

async function untilRunsEnd(within = 20_000): Promise<void> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (watching.length === 0) return
    if (Date.now() >= deadline) throw new Error('a run never ended')
    await new Promise((go) => setTimeout(go, 50))
  }
}
