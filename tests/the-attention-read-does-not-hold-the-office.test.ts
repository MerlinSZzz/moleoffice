// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHILE THE ATTENTION READING IS WORKED OUT, THE OFFICE STILL ANSWERS OTHER READS (problem CtH8CGBkE5Bz).
 *
 * GET /api/attention used to work its reading out on the thread that reads every request, so nothing
 * else was answered until it ended. It is now worked out on a thread of its own
 * (src/server/lib/attention-thread.ts). This file proves two things on one seeded office.
 *
 * THE READING IS THE SAME. For the owner, who reads every message, and for an agent who may not read a
 * message between two other agents, the reading from the thread is compared, as JSON, with
 * `attentionNow` on the request thread, at one fixed clock, in each of the reply's three shapes: whole,
 * `home` and `flow`. Since round 22 of wave 13w the thread cuts `home`, `flow` and a page of a list
 * itself, so each of those is compared too, cut on the thread against cut here. Nothing is cached, so
 * there is no old reading to test for. Each reader's whole reading and every shape are asked at once, as
 * a page asks, so the thread answers them from one reading while the reading here is worked out. The
 * reading here is frozen, so a cut that changed the reading it cuts from fails here instead of passing
 * on the thread's one reading.
 *
 * HEALTH IS ANSWERED BEFORE ATTENTION ENDS. The office is grown, by copying a varied set of records
 * with their links and change rows, until one reading takes at least 1,000 ms of this process's CPU
 * time. CPU time and not the clock, because a loaded machine makes every reading slower by the clock:
 * the office then stopped growing early, and on a quieter moment the server read it in 332 ms (merge
 * entry S-ZDNyRIIta5, round 10). Then
 * tools/time-the-attention-read.mjs starts this checkout's server on a copy of the database and sends
 * GET /api/health 50 ms after GET /api/attention?machine=omit&shape=home, three times. Each health
 * read has to have ended before half the attention read's time had passed. On the request thread it
 * waited for the reading: measured on this office, an attention read of 2,216 ms and a health read
 * that ended at 2,106 ms.
 *
 * THE BRIEF DOES NOT HOLD IT EITHER. GET /api/brief ranks its open work by the same reading, now asked
 * of the same thread (src/server/lib/openwork.ts). Health is sent 50 ms after a brief, in this process,
 * and has to have ended before half the brief's time had passed. The brief's own answer is compared
 * with the one worked out on the request thread in tests/the-brief-ranked-off-the-request-thread-is-
 * the-brief.test.ts, on an office small enough for its open work to fit in the brief.
 *
 * THE THREAD ENDS WITH THE SERVER. An idle attention thread is only unref'd, and it keeps its own
 * connection to the database and the module graph of the server that started it. A second office is
 * built on the same database and closed while the thread works out a whole reading: the read still
 * waiting is refused with a sentence that says the server closed, and the next read starts a new
 * thread that answers the same reading as the request thread.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line for each case red; RESTORE green, checked with cmp against a saved copy.
 */
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AttentionShape } from '../src/server/lib/attention-shapes.ts'
import { ATTENTION_PARTS } from '../src/shared/attention-first-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { HEALTH_AFTER_MS, timeTheAttentionRead } from '../tools/time-the-attention-read.mjs'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** How much of this process's CPU time one reading must take here before the timing is asked about. */
const AT_LEAST_CPU_MS = 1000

/**
 * How long a read must take for the timing to say anything. Half of it must leave room for the health
 * read, sent HEALTH_AFTER_MS after it, and as long again for that read to be answered. It is worked out
 * from when health is sent, not from how fast a machine is.
 */
const LONG_ENOUGH_MS = 4 * HEALTH_AFTER_MS

/**
 * By what share of the attention read's time each health read must have ended. Whatever the request
 * thread still does after the reading (taking it back from the thread, the shape, the JSON) grows with
 * the office, so the bound grows with the read.
 */
const HEALTH_ENDS_WITHIN = 0.5

/** One fixed clock for both readings, because the rule ranks by how long a record has been in its state. */
const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime()

let t: TestDb
let app: FastifyInstance

async function post(url: string, payload: unknown, headers: Record<string, string> = OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

async function patch(url: string, payload: unknown): Promise<void> {
  const reply = await app.inject({ method: 'PATCH', url, headers: { ...OWNER, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBe(200)
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })
  const row = ((reply.json() as { agents?: { id: string; handle: string }[] }).agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

/** The columns of a table, in order, as SQLite lists them. */
function columnsOf(table: string): string[] {
  return (t.client.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((one) => one.name)
}

/**
 * Copy every fixture record, the links between fixture records and their change rows, `from` to `to`
 * times, each copy's ids ending in its number.
 */
function copyTheFixture(from: number, to: number): void {
  const db = t.client.sqlite
  const numbers = 'WITH RECURSIVE n(k) AS (SELECT ? UNION ALL SELECT k + 1 FROM n WHERE k < ?)'
  // `append_order` is unique, so each copied change row is put after every row already there.
  const renamed = (columns: string[], ids: string[]): string =>
    columns
      .map((column) =>
        ids.includes(column)
          ? `x.${column} || '-' || n.k`
          : column === 'append_order'
            ? '(SELECT MAX(append_order) FROM changes) + ROW_NUMBER() OVER ()'
            : `x.${column}`,
      )
      .join(', ')
  const records = columnsOf('records')
  db.prepare(
    `${numbers} INSERT INTO records (${records.join(', ')}) SELECT ${renamed(records, ['id'])} FROM records x, n WHERE x.id IN (SELECT id FROM fixture)`,
  ).run(from, to)
  const links = columnsOf('links')
  db.prepare(
    `${numbers} INSERT INTO links (${links.join(', ')}) SELECT ${renamed(links, ['id', 'from_id', 'to_id'])} FROM links x, n ` +
      'WHERE x.from_id IN (SELECT id FROM fixture) AND x.to_id IN (SELECT id FROM fixture)',
  ).run(from, to)
  const changes = columnsOf('changes')
  db.prepare(
    `${numbers} INSERT INTO changes (${changes.join(', ')}) SELECT ${renamed(changes, ['id', 'record_id'])} FROM changes x, n ` +
      'WHERE x.record_id IN (SELECT id FROM fixture)',
  ).run(from, to)
}

type Records = typeof import('../src/server/lib/records.ts')
type Thread = typeof import('../src/server/lib/attention-thread.ts')
type Queries = typeof import('../src/server/api/queries.ts')
type Messages = typeof import('../src/server/lib/messages.ts')
type Shapes = typeof import('../src/server/lib/attention-shapes.ts')
let R: Records
let thread: Thread
let queries: Queries
let messages: Messages
let shapes: Shapes

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  R = await import('../src/server/lib/records.ts')
  thread = await import('../src/server/lib/attention-thread.ts')
  queries = await import('../src/server/api/queries.ts')
  messages = await import('../src/server/lib/messages.ts')
  shapes = await import('../src/server/lib/attention-shapes.ts')
  const db = t.client.sqlite

  // A MESSAGE BETWEEN TWO AGENTS, about a task, which the third agent may not read.
  await anAgent('ada-writer')
  const bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  const between = R.createRecord({
    kind: 'message',
    title: 'A made-up line from ada to bo',
    workspaceId: HERE,
    data: { body: 'made-up words', to: [{ kind: 'agent', id: bo }] },
    actor: { type: 'agent', id: 'ada-writer' } as never,
  }).id
  db.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(between, bo)
  const said = JSON.parse((db.prepare('SELECT data FROM records WHERE id = ?').get(between) as { data: string }).data) as Record<string, unknown>
  delete said['routed']
  writeDataBypassingTheGate(t, between, said)

  // RECORDS THAT USE EVERY PART OF THE RULE, as tests/the-brief-reads-only-what-it-needs.test.ts writes them.
  const add = db.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, '${HERE}', 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
  )
  add.run('at-owed', 'task', 'A promise to somebody outside', JSON.stringify({ state: 'doing', owed_to: 'the printer shop', due: '2026-09-10' }))
  add.run('at-blocker', 'task', 'The thing holding the promise up', JSON.stringify({ state: 'todo' }))
  add.run('at-paused', 'task', 'Put down until a date that has passed', JSON.stringify({ state: 'blocked', paused: { since: '2026-09-01', why: 'waiting for parts', until: { date: '2026-09-05' } } }))
  add.run('at-stopped', 'problem', 'Stopped short with a consequence', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'the rig may move' } }))
  add.run('at-module', 'module', 'A module with a checklist', JSON.stringify({ state: 'active', parts: [{ id: 'p-1', name: 'Part', items: [{ id: 'i-1', text: 'An item that stopped', state: 'blocked' }] }] }))
  add.run('at-report', 'report', 'A report for the person', JSON.stringify({ for: 'the owner', date: '2026-09-01', blocks: [{ id: 'b-1', type: 'text', heading: 'Words', text: 'made-up' }] }))
  add.run('at-direction', 'direction', 'A direction taken some way', JSON.stringify({ depth: 'ran' }))
  add.run('at-done', 'task', 'A task that is done', JSON.stringify({ state: 'done', done: true }))
  db.prepare(
    `INSERT INTO links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
     VALUES ('at-link', '${HERE}', 'owner', 'at-blocker', 'at-owed', 'blocks', 0, 'made-up', 'agent', '2026-09-01 09:00:00', '2026-09-01 09:00:00')`,
  ).run()

  // TASKS MADE AND MOVED THROUGH THE OFFICE, so they have change rows that date their state.
  const moved: string[] = []
  for (const title of ['A made-up task moved twice', 'A made-up task moved once', 'A made-up task left as it was']) {
    const made = await post('/api/records', { kind: 'task', title, data: { state: 'todo' } })
    moved.push((made['record'] as { id: string }).id)
  }
  await patch(`/api/records/${moved[0] ?? ''}`, { dataPatch: { state: 'doing' } })
  await patch(`/api/records/${moved[0] ?? ''}`, { dataPatch: { state: 'blocked' } })
  await patch(`/api/records/${moved[1] ?? ''}`, { dataPatch: { state: 'doing' } })
  // One of them is about the message, so the link is in the owner's reading and not in dee's.
  await post('/api/links', { fromId: moved[0], toId: between, type: 'about' })

  db.exec('CREATE TABLE fixture (id TEXT PRIMARY KEY)')
  const fixture = db.prepare('INSERT INTO fixture (id) VALUES (?)')
  for (const id of ['at-owed', 'at-blocker', 'at-paused', 'at-stopped', 'at-module', 'at-report', 'at-direction', 'at-done', ...moved]) fixture.run(id)

  // GROWN UNTIL ONE READING TAKES LONG ENOUGH, doubling the copies up to 8,000 and then adding a quarter
  // each time. Doubling past 8,000 went from a reading of about 700 ms to one of about 2,000 ms, twice the
  // floor, and every reading in this file was that size.
  const owner = messages.theMessageReader({ type: 'human', id: THE_PERSON })
  let copies = 0
  let next = 1000
  for (;;) {
    copyTheFixture(copies + 1, next)
    copies = next
    const started = process.cpuUsage()
    R.attentionNow({ workspaceId: HERE, resources: [], now: NOW, reader: owner })
    const used = process.cpuUsage(started)
    const cpu = (used.user + used.system) / 1000
    if (cpu >= AT_LEAST_CPU_MS) {
      // The size, in the log, for the proof.
      console.log(`grown to ${String(copies)} copies of the fixture; one reading took ${String(Math.round(cpu))} ms of CPU time`)
      break
    }
    if (copies >= 64_000) throw new Error(`${String(copies)} copies of the fixture and one reading still takes under ${String(AT_LEAST_CPU_MS)} ms of CPU time`)
    next = Math.min(64_000, copies < 8000 ? copies * 2 : Math.round(copies * 1.25))
  }
  db.exec('DROP TABLE fixture')
  // UP TO DATE, BY THE PRODUCT'S OWN MIGRATION, as freshDb() makes a test database: records written
  // by SQL have no revision yet, and a server refuses a database a migration would still write to.
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(db, fileURLToPath(new URL('../drizzle', import.meta.url)))
}, 600_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The value with every object and array in it frozen, so code that changes any part of it throws. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value)) frozen(inner)
  }
  return value
}

describe('the attention reading from its own thread', () => {
  it('is the reading the request thread worked out, for each reader, in every shape', async () => {
    const readers = {
      owner: messages.theMessageReader({ type: 'human', id: THE_PERSON }),
      dee: messages.theMessageReader({ type: 'agent', id: 'dee-bystander' }),
    }
    // EACH SHAPE CUT ON THE THREAD, as the route now asks for `home`, `flow` and a page of a list,
    // is the same shape cut here from the reading worked out here.
    const asked: AttentionShape[] = [{ shape: 'home' }, { shape: 'flow' }, ...ATTENTION_PARTS.map((part) => ({ shape: 'part' as const, part, from: 0 }))]
    const counted: Record<string, { records: number; links: number }> = {}
    let route: Promise<LightMyRequestResponse> | undefined
    for (const [name, reader] of Object.entries(readers)) {
      const input = { workspaceId: HERE, resources: [], now: NOW, reader }
      // ASKED AT ONCE, so the thread answers the whole reading and every shape from one reading, and works
      // it out while the reading here is worked out. The route's own read goes with the last reader's asks.
      const onTheThread = Promise.all([thread.attentionOnItsOwnThread(input), Promise.all(asked.map((one) => thread.attentionOnItsOwnThread(input, one)))])
      if (name === 'dee') route = app.inject({ method: 'GET', url: '/api/attention?machine=omit&shape=home', headers: OWNER })
      // FROZEN, because the thread cuts every shape from its one reading: a cut that changed the reading
      // it was given would leave the next shape cut from a changed one there, and throws here instead.
      const here = frozen(R.attentionNow(input))
      expect(here.visible.length, `${name}: the office puts rows on the list`).toBeGreaterThanOrEqual(3)
      counted[name] = { records: here.read.records, links: here.read.links }
      const [fromTheThread, cut] = await onTheThread
      for (const shape of [undefined, 'home', 'flow'] as const) {
        expect(JSON.stringify(queries.theAttentionReplyIn(shape, fromTheThread, null)), `${name}, shape ${String(shape)}`).toBe(
          JSON.stringify(queries.theAttentionReplyIn(shape, here, null)),
        )
      }
      for (const [i, one] of asked.entries()) {
        expect(JSON.stringify(cut[i]), `${name}, ${JSON.stringify(one)} cut on the thread`).toBe(JSON.stringify(shapes.attentionInTheShape(one, here)))
      }
    }
    // The two readers differ, so a thread that read for the wrong one would be seen above.
    expect(counted['owner']?.links ?? 0, 'the owner reads the link to the message dee may not read').toBeGreaterThan(counted['dee']?.links ?? 0)
    expect(counted['owner']?.records ?? 0).toBeGreaterThan(counted['dee']?.records ?? 0)

    const reply = await route
    expect(reply?.statusCode, reply?.body.slice(0, 400)).toBe(200)
  }, 120_000)
})

describe('a health read sent while the attention read is worked out', () => {
  it(`ends before half the attention read it was sent ${String(HEALTH_AFTER_MS)} ms after has passed`, async () => {
    const timed = await timeTheAttentionRead({ database: t.file, checkout: CHECKOUT })
    // The numbers, in the log, for the proof.
    console.log(`alone ${timed.alone.map(Math.round).join(' ')}; attention ${timed.attention.map(Math.round).join(' ')}; health ${timed.health.map(Math.round).join(' ')} (ms)`)
    expect(Math.min(...timed.alone), `the attention read alone took ${timed.alone.map(Math.round).join(', ')} ms`).toBeGreaterThanOrEqual(LONG_ENOUGH_MS)
    for (const [i, attention] of timed.attention.entries()) {
      const health = timed.health[i] ?? Number.NaN
      const healthEnded = HEALTH_AFTER_MS + health
      expect(healthEnded, `attention ${String(Math.round(attention))} ms; health sent at ${String(HEALTH_AFTER_MS)} ms took ${String(Math.round(health))} ms`).toBeLessThanOrEqual(
        attention * HEALTH_ENDS_WITHIN,
      )
    }
  }, 600_000)
})

describe('a health read sent while a brief is worked out', () => {
  it(`ends before half the brief it was sent ${String(HEALTH_AFTER_MS)} ms after has passed`, async () => {
    const sent = performance.now()
    const brief = app.inject({ method: 'GET', url: '/api/brief', headers: OWNER }).then((reply) => {
      expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
      return performance.now() - sent
    })
    await new Promise((ok) => setTimeout(ok, HEALTH_AFTER_MS))
    const health = app.inject({ method: 'GET', url: '/api/health' }).then((reply) => {
      expect(reply.statusCode).toBe(200)
      return performance.now() - sent
    })
    const [briefTook, healthEnded] = await Promise.all([brief, health])
    // The numbers, in the log, for the proof.
    console.log(`brief ${String(Math.round(briefTook))} ms; health sent at ${String(HEALTH_AFTER_MS)} ms ended at ${String(Math.round(healthEnded))} ms`)
    expect(briefTook, 'the brief takes long enough for the timing to say anything').toBeGreaterThanOrEqual(LONG_ENOUGH_MS)
    expect(healthEnded, `the brief took ${String(Math.round(briefTook))} ms`).toBeLessThanOrEqual(briefTook * HEALTH_ENDS_WITHIN)
  }, 300_000)
})

describe('the attention thread when a server closes', () => {
  it('ends with the server: a read still waiting is refused in its own words, and the next read starts a new thread', async () => {
    const input = { workspaceId: HERE, resources: [], now: NOW, reader: messages.theMessageReader({ type: 'human', id: THE_PERSON }) }
    // A SECOND OFFICE ON THE SAME DATABASE, closed while the thread works out a whole reading, which takes at
    // least AT_LEAST_CPU_MS here. The close takes a few milliseconds, so the read is still waiting when it ends.
    const second = (await apiApp()).app
    await second.ready()
    const waiting = thread.attentionOnItsOwnThread(input).then(
      () => 'answered',
      (err: unknown) => err,
    )
    await second.close()
    const refused = await waiting
    expect(refused, 'the read was answered, so closing the server left the thread running').toBeInstanceOf(Error)
    expect((refused as Error).message).toBe('The server closed before the attention thread answered, so the reading was not worked out.')
    const asked: AttentionShape = { shape: 'home' }
    // ASKED BEFORE THE READING HERE, so the new thread starts and reads while this thread reads.
    const next = thread.attentionOnItsOwnThread(input, asked)
    const here = shapes.attentionInTheShape(asked, R.attentionNow(input))
    expect(JSON.stringify(await next), 'the next read, on a new thread').toBe(JSON.stringify(here))
  }, 120_000)
})
