// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE WORKER PRESSED THE OVER DOOR 124,375 TIMES IN NINE DAYS, every press refused (problem
 * MHcSOsp_u5pY), because it reads the list and presses for every wait it names as over — and a wait
 * the door refuses for good is re-pressed every pass for ever. The worker now remembers a refused
 * press, by session and by the refusal's own words, and does not press it again on a later pass:
 * the list no longer naming the wait as over, or a new moment named by the same run, is what opens
 * the door again. This test presses the door through the worker's own pass — `onePass` riding the
 * real HTTP doors — with the door in a state that refuses for a REAL reason kept on the server
 * (the message the run was delivering has been deleted, so there is nowhere to say the wait ended).
 *
 * The press count is read from the office's own call log, `GET /api/usage/operations`, the same read
 * the flow steward used to find the defect (report jDwkhne4tDWR, finding 三-1). The stderr line is
 * counted at the wire the worker writes it on.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-trace': 'waits-over',
  'x-mole-office-purpose': 'module-work',
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: (body ?? {}) as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function waits(): Promise<Record<string, unknown>[]> {
  const read = (await get('/api/worker/waits')) as { waits?: Record<string, unknown>[] }
  return read.waits ?? []
}

/** The call the office has logged for one operation, off its own end. */
async function callsOf(operation: string): Promise<number> {
  const read = (await get('/api/usage/operations')) as {
    operations?: { operation: string; calls: number }[]
  }
  const row = (read.operations ?? []).find((one) => one['operation'] === operation)
  return row?.calls ?? 0
}

let stderrLines: string[]
let stderr: ReturnType<typeof vi.spyOn> | null = null

beforeEach(() => {
  stderrLines = []
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    const said = typeof chunk === 'string' ? chunk : String(chunk)
    if (said.includes('could not be ended')) stderrLines.push(said)
    return true
  })
})

afterEach(() => {
  stderr?.mockRestore()
  stderr = null
})

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-waits-over-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort() },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('one pass, one press, one line', () => {
  it('presses a refusing over door once on three passes and says so once', async () => {
    const agentId = await anAgent('hollow-x')

    // A message, and then the message itself deleted: the run the worker would file still names it,
    // and the door refuses for real — the conversation it would say the ending in is not there.
    const note = await post('/api/records', {
      kind: 'message',
      title: 'a note to hollow-x',
      data: { body: 'Please read record gggggggggg.', to: [{ kind: 'agent', id: 'hollow-x' }] },
    })
    const messageId = (note['record'] as { id: string }).id
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${messageId}`, headers: AS_THE_OWNER })
    expect(gone.statusCode).toBeLessThan(400)

    const run = await post('/api/records', {
      kind: 'session',
      title: 'hollow-x answering a message',
      data: {
        state: 'running',
        runtime: 'claude-code',
        servingAgent: agentId,
        deliveringMessage: messageId,
        providerSession: 'hollow-provider-1',
        waitsUntil: localStamp(new Date(Date.now() - 60_000)),
        startedByMoleOffice: true,
      },
    })
    const session = (run['record'] as { id: string }).id
    const here = one(
      (await waits()).filter((w) => w['session'] === session),
      'the run waiting for the next message whose message is gone',
    )
    expect(here['over']).toBe(true)

    const pressesBefore = await callsOf('worker.wait-over')
    for (let i = 0; i !== 3; i += 1) await onePass(settings, watching)
    const pressesAfter = await callsOf('worker.wait-over')
    expect(pressesAfter - pressesBefore).toBe(1)

    // AND THE RUN IS STILL THERE, over on every pass — the memory is what stopped the presses.
    const later = (await waits()).filter((w) => w['session'] === session)
    expect(later).toHaveLength(1)

    expect(stderrLines).toHaveLength(1)
    expect(stderrLines[0]).toContain(`The wait on run ${session}, which was serving hollow-x`)
  }, 40_000)
})
