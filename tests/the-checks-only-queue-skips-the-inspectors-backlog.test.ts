// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic deliveries of the live shape, in a database made only for this file. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let inspector = ''
let others: string[] = []
let next = 0
const at = localStamp(new Date())
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
type QueueRow = { messageId: string; inspection?: unknown; askOfASettledRun?: true }
type MeasuredStatement = Record<'all' | 'get' | 'run', (...args: unknown[]) => unknown>
type MeasuredSqlite = { prepare: (this: unknown, sql: string) => MeasuredStatement }
let whole: QueueRow[] = []
const checks: string[] = []

function record(id: string, kind: string, data: Record<string, unknown>, workspace = 'default'): void {
  t.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
    VALUES (?, ?, ?, ?, ?, ?, 'Synthetic queue measurement', ?, 'fixture')`).run(id, workspace, THE_PERSON, at, at, kind, JSON.stringify(data))
}

function message(data: Record<string, unknown>, to = inspector): string {
  const id = `queue-fixture-${String(next++)}`
  record(id, 'message', { body: 'Synthetic queue fixture.', sentBy: { kind: 'agent', id: theOfficesOwnId(t) }, to: [{ kind: 'agent', id: to }], writtenIn: { project: 'default' }, ...data }, 'message-centre')
  t.client.sqlite.prepare(`INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at)
    VALUES (?, ?, 'agent', ?, 'queued', ?)`).run(`delivery-${id}`, id, to, at)
  return id
}

function runFor(id: string, ask: string, extra: Record<string, unknown> = {}, workspace = 'default'): void {
  record(id, 'session', { state: 'finished', servingAgent: 'queue-builder', theCheck: { message: ask, askedOf: 'queue-inspector', askedAt: at, checkout: {}, says: 'Synthetic check request.' }, ...extra }, workspace)
}

function backlog(size: number): void {
  t.client.sqlite.transaction(() => {
    for (let i = 0; i < size; i++) {
      const part = i % 100
      const to = part < 85 ? inspector : others[i % others.length]!
      const notice = part < 70 ? undefined : part < 85 ? 'groupOpened' : part < 88 ? 'theCheckStarted' : part < 90 ? 'theCheckFailed' : 'aCheckWasQueued'
      const aboutRun = notice === 'aCheckWasQueued' ? 'replaced-run' : undefined
      message({ ...(notice === undefined ? { sentBy: { kind: 'agent', id: others[i % others.length]! } } : { notice }), ...(aboutRun === undefined ? {} : { aboutRun }) }, to)
    }
  })()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['queue-inspector', 'queue-builder', 'queue-one', 'queue-two']) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }, payload: { handle, name: `Synthetic ${handle}`, workArea: ['src'] } })
    expect(reply.statusCode, reply.body).toBe(201)
    const id = (reply.json() as { agent: { id: string } }).agent.id
    if (handle === 'queue-inspector') inspector = id
    else others.push(id)
  }
  for (const [id, notice] of [['current-run', 'aCheckWasQueued'], ['current-without-notice', undefined], ['settled-run', 'aCheckWasQueued']] as const) {
    const ask = message({ aboutRun: id, ...(notice === undefined ? {} : { notice }), urgent: id === 'current-without-notice' })
    checks.push(ask)
    runFor(id, ask, id === 'settled-run' ? { closedUnchecked: { by: { kind: 'person', id: THE_PERSON }, at, because: 'Synthetic settled run.' } } : {})
  }
  runFor('replaced-run', 'a-newer-ask')
  const started = message({ aboutRun: 'started-run', notice: 'aCheckWasQueued' })
  runFor('started-run', started, { theCheck: { message: started, askedOf: 'queue-inspector', execution: { session: 'already-started' } } })
  const wrongProject = message({ aboutRun: 'other-project-run' })
  runFor('other-project-run', wrongProject, {}, 'message-centre')
  const wrongAgent = message({ aboutRun: 'wrong-agent-run' }, others[0])
  runFor('wrong-agent-run', wrongAgent)
  const deleted = message({ aboutRun: 'deleted-run' })
  // The existing matcher reads this stored run too. SQL must keep every ask it accepts.
  checks.push(deleted)
  runFor('deleted-run', deleted)
  t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(at, 'deleted-run')
  message({ aboutRun: 'no-such-run', notice: 'aCheckWasQueued' })
  backlog(2_000)
}, 60_000)

afterAll(async () => { await app?.close(); t?.close() })

/** Count preparations like the existing queue criterion, and time each statement's execution. */
async function measured(url: string) {
  const sqlite = t.client.sqlite as unknown as MeasuredSqlite
  const original = sqlite.prepare
  const statements: string[] = []
  const costs = new Map<string, { count: number; ms: number }>()
  sqlite.prepare = function (this: unknown, sql: string) {
    statements.push(sql)
    const statement = original.call(this, sql)
    for (const name of ['all', 'get', 'run'] as const) {
      const act = statement[name].bind(statement)
      statement[name] = (...args: unknown[]) => {
        const began = performance.now()
        try { return act(...args) }
        finally {
          const cost = costs.get(sql) ?? { count: 0, ms: 0 }
          cost.count++
          cost.ms += performance.now() - began
          costs.set(sql, cost)
        }
      }
    }
    return statement
  }
  const began = performance.now()
  try {
    const reply = await app.inject({ method: 'GET', url, headers })
    const body = reply.json() as { queue: QueueRow[]; deadLetters?: { rows: unknown[] } }
    console.log(JSON.stringify({ url, status: reply.statusCode, rows: body.queue?.length, statements: statements.length, ms: Math.round(performance.now() - began), sqlMs: Math.round([...costs.values()].reduce((n, one) => n + one.ms, 0)), costs: [...costs].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10).map(([sql, cost]) => ({ ...cost, sql: sql.slice(0, 500) })) }))
    return { reply, body, statements }
  } finally { sqlite.prepare = original }
}

it('measures the whole door before narrowing, and returns the same current and settled asks', async () => {
  const all = await measured('/api/worker/queue')
  expect(all.reply.statusCode, all.reply.body).toBe(200)
  whole = all.body.queue.filter((one) => one.inspection !== undefined || one.askOfASettledRun === true)
  expect(whole.map((one) => one.messageId).sort()).toEqual([...checks].sort())
  const narrow = await measured('/api/worker/queue?only=checks')
  expect(narrow.reply.statusCode, narrow.reply.body).toBe(200)
  expect(narrow.body.queue).toEqual(whole)
  expect(narrow.statements.length).toBeLessThan(300)
}, 60_000)

it('keeps the statement count when the non-check backlog doubles', async () => {
  const first = await measured('/api/worker/queue?only=checks')
  backlog(2_000)
  const second = await measured('/api/worker/queue?only=checks')
  expect(first.reply.statusCode, first.reply.body).toBe(200)
  expect(second.reply.statusCode, second.reply.body).toBe(200)
  expect(second.body.queue).toEqual(whole)
  expect(second.statements.length).toBe(first.statements.length)
  expect(second.statements.length).toBeLessThan(300)
}, 60_000)

it('preserves full rows too, and refuses other query values', async () => {
  const all = await measured('/api/worker/queue?full=1')
  const narrow = await measured('/api/worker/queue?only=checks&full=1')
  expect(narrow.reply.statusCode, narrow.reply.body).toBe(200)
  expect(narrow.body.queue).toEqual(all.body.queue.filter((one) => one.inspection !== undefined || one.askOfASettledRun === true))
  for (const query of ['only=all', 'only=', 'only=checks&extra=1']) {
    expect((await app.inject({ method: 'GET', url: `/api/worker/queue?${query}`, headers })).statusCode).toBe(400)
  }
}, 60_000)

it('uses at most two statements with no current check ask, despite the backlog', async () => {
  const ids = checks.map((id) => `'${id}'`).join(',')
  t.client.sqlite.prepare(`UPDATE message_delivery SET mark = 'delivered' WHERE message_id IN (${ids})`).run()
  // These candidates still join a run, but none is a current unstarted ask for its recipient.
  t.client.sqlite.prepare("UPDATE message_delivery SET mark = 'delivered' WHERE message_id IN (SELECT id FROM records WHERE json_extract(data, '$.aboutRun') IN ('started-run','wrong-agent-run'))").run()
  // Count the queue's own reading separately from the door's fixed request accounting.
  const worker = await import('../src/server/lib/worker.ts')
  const sqlite = t.client.sqlite as unknown as MeasuredSqlite
  const original = sqlite.prepare
  const statements: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) { statements.push(sql); return original.call(this, sql) }
  try {
    expect(worker.theQueue('default', { only: 'checks' } as Parameters<typeof worker.theQueue>[1])).toEqual([])
    expect(statements.length).toBeLessThanOrEqual(2)
  } finally { sqlite.prepare = original }
})
