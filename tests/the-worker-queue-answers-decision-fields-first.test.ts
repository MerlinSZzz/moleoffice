// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let office: TestDb
let app: FastifyInstance
let messageId: string
const person = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const agent = await app.inject({ method: 'POST', url: '/api/records', headers: person,
    payload: { kind: 'agent', title: 'Queue test agent', data: { handle: 'queue-test-agent', state: 'active', runtime: 'claude-code' } } })
  expect(agent.statusCode, agent.body).toBe(201)
  const message = await app.inject({ method: 'POST', url: '/api/records', headers: person,
    payload: { kind: 'message', title: 'A queued task', data: { body: 'Words for the selected task.', to: [{ kind: 'agent', id: 'queue-test-agent' }] } } })
  expect(message.statusCode, message.body).toBe(409)
  messageId = (message.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app.close()
  office.close()
})

it('answers only the title and decision fields, while full retains the complete row', async () => {
  const read = async (url: string) => {
    const response = await app.inject({ method: 'GET', url, headers: person })
    expect(response.statusCode).toBe(200)
    return (response.json() as { queue: Record<string, unknown>[] }).queue.find((row) => row.messageId === messageId)
  }
  const narrow = await read('/api/worker/queue')
  const full = await read('/api/worker/queue?full=1')
  expect(full).toMatchObject({ messageId, body: 'Words for the selected task.' })
  expect(full).toHaveProperty('whoSentIt')
  expect(full).toHaveProperty('sentAt')
  expect(full).toHaveProperty('urgent')
  const queueReader = await import('../src/server/lib/worker.ts')
  const fields = (queueReader as unknown as { QUEUE_DECISION_FIELDS?: readonly string[] }).QUEUE_DECISION_FIELDS
  expect(fields).toBeDefined()
  const selected = Object.fromEntries(fields!.filter((key) => key !== 'title' && Object.hasOwn(full!, key)).map((key) => [key, full![key]]))
  expect(narrow).toEqual({ ...selected, title: 'A queued task' })
})

async function runThePass(fullSnapshot: boolean, race?: 'mark' | 'delete' | 'refuse') {
  const originalFetch = globalThis.fetch
  {
    const db = await freshDb()
    const server = (await apiApp()).app
    supplyRuntimeSubmissions(db, server)
    await server.ready()
    await server.listen({ host: '127.0.0.1', port: 0 })
    const outputs = mkdtempSync(join(tmpdir(), 'queue-comparison-'))
    const settings: WorkerSettings = {
      api: `http://127.0.0.1:${String((server.server.address() as AddressInfo).port)}`,
      workspace: 'default', session: null, stopWithPid: null,
      checkout: aCheckoutForATestRun(), runs: 2, hops: 3, outputRoot: outputs,
      env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
    }
    const watching: Parameters<typeof onePass>[1] = []
    try {
      const post = async (url: string, payload: object) => {
        const response = await server.inject({ method: 'POST', url, headers: person, payload })
        if (url === '/api/records' && 'kind' in payload && payload.kind === 'message') expect(response.statusCode, response.body).toBe(409)
        else expect(response.statusCode, response.body).toBeLessThan(300)
        return response.json() as { record?: { id: string } }
      }
      await post('/api/records', { kind: 'agent', title: 'Ready agent', data: { handle: 'ready-agent', state: 'active', runtime: 'claude-code' } })
      await post('/api/records', { kind: 'agent', title: 'Waiting agent', data: { handle: 'waiting-agent', state: 'active', runtime: 'claude-code' } })
      const ready = (await post('/api/records', { kind: 'message', title: 'Ready task', data: { body: 'Carry out this task.', to: [{ kind: 'agent', id: 'ready-agent' }] } })).record!.id
      const waiting = (await post('/api/records', { kind: 'message', title: 'Waiting task', data: { body: 'Wait for a start.', to: [{ kind: 'agent', id: 'waiting-agent' }] } })).record!.id
      await post(`/api/messages/${ready}/start-an-agent`, {})
      if (!fullSnapshot) {
        const reply = await server.inject({ method: 'GET', url: '/api/worker/queue', headers: person })
        const row = (reply.json() as { queue: { messageId: string; title?: string }[] }).queue.find((one) => one.messageId === ready)
        expect(row?.title).toBe('Ready task')
      }
      let changed = false
      let heldWasSaid = false
      let refusedOnce = false
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url === `${settings.api}/api/worker/messages/${ready}/held`) heldWasSaid = true
        if (race === 'refuse' && !refusedOnce && url.startsWith(`${settings.api}/api/worker/queue?full=1&messageId=`)) {
          refusedOnce = true
          return new Response('Unavailable', { status: 503 })
        }
        const firstPage = url === `${settings.api}/api/worker/queue?page=1`
        if (fullSnapshot && firstPage) {
          const all = await originalFetch(`${settings.api}/api/worker/queue?full=1`, init)
          return Response.json({ ...(await all.json() as object), next: null })
        }
        const response = await originalFetch(input, init)
        if (!changed && (race === 'delete' || race === 'mark') && firstPage) {
          changed = true
          if (race === 'delete') db.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(ready)
          else db.client.sqlite.prepare("UPDATE message_delivery SET mark = 'delivered' WHERE message_id = ?").run(ready)
        }
        return response
      }) as typeof fetch
      const report = await onePass(settings, watching)
      const result = {
        started: report.started.map((one) => one.messageId === ready ? 'ready' : one.messageId === waiting ? 'waiting' : 'other'),
        held: report.held.filter((one) => one.messageId === ready || one.messageId === waiting)
          .map((one) => ({ task: one.messageId === ready ? 'ready' : 'waiting', because: one.because })),
      }
      if (race !== 'delete' && race !== 'refuse') expect(result.started).toEqual(['ready'])
      expect(result.held.map((one) => one.task)).toContain('waiting')
      let retry: { mark: string; started: boolean } | undefined
      if (race === 'refuse') {
        const delivery = db.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ?').get(ready) as { mark: string }
        const next = await onePass(settings, watching)
        retry = { mark: delivery.mark, started: next.started.some((one) => one.messageId === ready) }
      }
      const deadline = Date.now() + 20_000
      while (watching.length > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        await onePass(settings, watching)
      }
      expect(watching).toHaveLength(0)
      return { ...result, heldWasSaid, ...(retry === undefined ? {} : { retry }) }
    } finally {
      globalThis.fetch = originalFetch
      await server.close()
      db.close()
      rmSync(outputs, { recursive: true, force: true })
    }
  }
}

it('starts the same delivery from the full snapshot and narrow decision rows', async () => {
  expect(await runThePass(false)).toEqual(await runThePass(true))
}, 60_000)

it('starts a chosen delivery after its mark changes', async () => {
  const result = await runThePass(false, 'mark')
  expect(result.started).toEqual(['ready'])
  expect(result.held.map((one) => one.task)).not.toContain('ready')
}, 60_000)

it('says a deleted chosen delivery is held', async () => {
  const result = await runThePass(false, 'delete')
  expect(result.started).not.toContain('ready')
  expect(result.held.map((one) => one.task)).toContain('ready')
  expect(result.held.find((one) => one.task === 'ready')?.because).toBe('This delivery is no longer there to read whole, so no run was started.')
  expect(result.heldWasSaid).toBe(true)
}, 60_000)

it('says when the office refuses the chosen delivery read', async () => {
  const result = await runThePass(false, 'refuse')
  expect(result.started).not.toContain('ready')
  expect(result.held.find((one) => one.task === 'ready')?.because).toBe('The office refused the read of this delivery’s whole entry (503), so no run was started.')
  expect(result.heldWasSaid).toBe(true)
  expect(result.retry).toEqual({ mark: 'queued', started: true })
}, 60_000)
