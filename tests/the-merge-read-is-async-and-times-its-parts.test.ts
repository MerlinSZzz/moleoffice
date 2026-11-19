// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import childProcess from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { MERGE_QUEUE_SNAPSHOT_CHANGING } from '../src/shared/merge-queue-snapshot.ts'

// Synthetic reader: the separate reader worker owns the real Git boundary.
const reader = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../src/server/lib/async-take-back.ts', () => ({ asyncTakeBacksForProject: reader.read }))

let t: TestDb
let app: FastifyInstance
let worker: typeof import('../src/server/lib/worker.ts')
let queue: typeof import('../src/server/lib/merge-queue.ts')
let state: typeof import('../src/server/lib/merge-state-machine.ts')
let takeBack: typeof import('../src/server/lib/take-back.ts')
let resources: typeof import('../src/server/lib/resources.ts')
const headers = { 'x-mole-office-workspace': 'default' }
const empty = { kind: 'ok' as const, due: [], forAPerson: [], cannotBeRead: [] }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  queue = await import('../src/server/lib/merge-queue.ts')
  state = await import('../src/server/lib/merge-state-machine.ts')
  takeBack = await import('../src/server/lib/take-back.ts')
  resources = await import('../src/server/lib/resources.ts')
})
afterAll(async () => { vi.restoreAllMocks(); await app?.close(); t?.close() })
beforeEach(() => { reader.read.mockReset(); reader.read.mockResolvedValue(empty) })

it('keeps the existing successful response and unrelated errors', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ workspaceId: 'default', narrowedByPermission: null, wanted: [], going: [], hourOver: [], hourCannotBeRead: [],
    takeBacksDue: [], takeBacksForAPerson: [], takeBacksCannotBeRead: [],
    note: expect.stringMatching(/\S/) })
  reader.read.mockResolvedValueOnce({ kind: 'ok', due: [{ problem: 'synthetic-due' }], forAPerson: [{ problem: 'synthetic-person', says: 'A person must look.' }], cannotBeRead: [{ problem: 'synthetic-unreadable', says: 'Cannot read.' }] })
  const nonempty = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  expect(nonempty.statusCode).toBe(200)
  expect(nonempty.json()).toMatchObject({ takeBacksDue: [{ problem: 'synthetic-due' }], takeBacksForAPerson: [{ problem: 'synthetic-person', says: 'A person must look.' }], takeBacksCannotBeRead: [{ problem: 'synthetic-unreadable', says: 'Cannot read.' }] })
  reader.read.mockRejectedValueOnce(new Error('synthetic unrelated failure'))
  const failed = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  expect(failed.statusCode).toBe(500)
  expect(failed.json().code).not.toBe(MERGE_QUEUE_SNAPSHOT_CHANGING)
})

it('uses the existing synchronous reader on simulated Windows', async () => {
  const previous = vi.spyOn(takeBack, 'takeBacksForProject').mockReturnValue({ due: [], forAPerson: [], cannotBeRead: [] })
  // worker.ts asks the installed probe which system it is on, so Windows is stood in as its probe, not as process.platform.
  resources.useOsProbe(resources.theProbeForThisPlatform('win32'))
  try {
    const response = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
    expect(response.statusCode).toBe(200)
    expect(previous).toHaveBeenCalledWith('default')
    expect(reader.read).not.toHaveBeenCalled()
  } finally { resources.useOsProbe(resources.LINUX_PROBE); previous.mockRestore() }
})

it('answers stale with 503 and does not start, stop, or write anything', async () => {
  reader.read.mockResolvedValueOnce({ kind: 'stale', reason: 'changed' })
  const workRows = () => t.client.sqlite.prepare("SELECT id, kind, data FROM records WHERE kind IN ('session', 'merge_entry') ORDER BY id").all()
  const before = workRows()
  const spawn = vi.spyOn(childProcess, 'spawn')
  const kill = vi.spyOn(process, 'kill')
  const actionable = { id: 'synthetic', tool: { session: 'synthetic', startedAt: 'synthetic', log: 'synthetic' },
    toolWanted: { since: 'synthetic' }, state: 'queued', lane: 'synthetic', changeset: { adapter: 'git' } }
  const work = vi.spyOn(queue, 'theMergeToolWork').mockReturnValue({ wanted: [actionable], going: [actionable] } as never)
  const processRow = vi.spyOn(queue, 'theToolsOwnProcessRow')
  const lastRun = vi.spyOn(queue, 'theLastToolRunStillRuns')
  try {
    const response = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
    expect(response.statusCode).toBe(503)
    const retry = response.headers['retry-after']
    expect(retry).toMatch(/^\d+$/)
    expect(Number(retry)).toBeGreaterThan(0)
    expect(response.json()).toEqual({ code: MERGE_QUEUE_SNAPSHOT_CHANGING, error: expect.stringMatching(/\S/) })
    reader.read.mockResolvedValueOnce({ kind: 'stale', reason: 'unavailable' })
    const unavailable = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
    expect(unavailable.statusCode).toBe(503)
    expect(unavailable.json().code).toBe(MERGE_QUEUE_SNAPSHOT_CHANGING)
    expect(workRows()).toEqual(before)
    expect(work).not.toHaveBeenCalled()
    expect(processRow).not.toHaveBeenCalled()
    expect(lastRun).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
  } finally { work.mockRestore(); processRow.mockRestore(); lastRun.mockRestore(); spawn.mockRestore(); kill.mockRestore() }
})

it('answers health while a synthetic asynchronous Git wait is held', async () => {
  let release!: (value: typeof empty) => void
  let entered!: () => void
  const called = new Promise<void>(resolve => { entered = resolve })
  reader.read.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve }) })
  const pending = app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  try {
    await called
    const health = await app.inject({ method: 'GET', url: '/api/health', headers })
    expect(health.statusCode).toBe(200)
  } finally { release(empty) }
  expect((await pending).statusCode).toBe(200)
})

it('reads wanted and going work after the gated asynchronous read', async () => {
  let release!: (value: typeof empty) => void
  let entered!: () => void
  const called = new Promise<void>(resolve => { entered = resolve })
  reader.read.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve }) })
  const entry = { id: 'after-wait', state: 'queued', lane: 'synthetic', changeset: { adapter: 'git' },
    toolWanted: { since: 'synthetic' }, tool: { session: 'after-wait-session', startedAt: 'synthetic', log: 'synthetic' } }
  let current = { wanted: [], going: [] } as unknown
  const work = vi.spyOn(queue, 'theMergeToolWork').mockImplementation(() => current as never)
  const row = vi.spyOn(queue, 'theToolsOwnProcessRow').mockReturnValue(undefined)
  const last = vi.spyOn(queue, 'theLastToolRunStillRuns').mockReturnValue(null)
  const stop = vi.spyOn(queue, 'whyItsMergeToolShouldStop').mockReturnValue(null)
  const pending = app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  try {
    await called
    current = { wanted: [entry], going: [entry] }
    release(empty)
    const response = await pending
    expect(response.statusCode).toBe(200)
    expect(response.json().wanted).toMatchObject([{ entry: 'after-wait' }])
    expect(response.json().going).toMatchObject([{ entry: 'after-wait', session: 'after-wait-session' }])
  } finally { work.mockRestore(); row.mockRestore(); last.mockRestore(); stop.mockRestore() }
})

