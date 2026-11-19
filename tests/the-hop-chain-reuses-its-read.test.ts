// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE'S HOP COUNT KEEPS ITS ANSWER AND REUSES ITS PREPARED READ (wave 13y round 41).
 *
 * The largest own part of the queue on the made-up database was hopsBehind: a warm median of 177 ms,
 * while its statement ran in 23.9 ms on the made-up database's SQL-plan ask. Its bound plan already
 * searches the records primary key, both on that made-up database and a small fresh migrated test
 * database. The cost criterion counts preparations, not a different plan or a cached answer.
 *
 * The answer cases hold on the old code too. They cover the queue's hops field, a person's stop,
 * a missing or non-message row, unknown and malformed senders and data, blank parents, cycles,
 * the limit, deleted ancestors, and edits between reads. The cost case is red on the old code:
 * fifty walks prepare the same read at most once, while executing it for every row of each walk.
 * Mutations: prepare at each hop again; count the starting message as a hop; cache the first answer.
 *
 * All rows and messages here are synthetic fixtures in this file's own temporary test database.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AT = '2026-10-18 20:00:00'
const HOP_READ = 'select "id", "workspace_id", "kind", "title", "data", "created_at" from "records" where "records"."id" = ?'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let worker: typeof import('../src/server/lib/worker.ts')
let agent: string
let counting = false
const prepared: string[] = []
const ran: { sql: string; params: unknown[] }[] = []
const fixtures = new Map<string, Record<string, unknown>>()

function writeData(id: string, data: unknown): void {
  t.client.sqlite.prepare('update records set data = ? where id = ?').run(JSON.stringify(data), id)
}

function message(id: string, from: unknown, parent?: unknown): void {
  const data = {
    body: `Synthetic hop fixture ${id}`,
    sentBy: from,
    to: [{ kind: 'agent', id: agent }],
    writtenIn: { project: 'default' },
    ...(parent === undefined ? {} : { inReplyTo: parent }),
  }
  fixtures.set(id, data)
  t.client.sqlite.prepare(
    'insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, 'message-centre', THE_PERSON, AT, AT, 'message', id, JSON.stringify(data), 'fixture')
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, text: string) {
    if (counting) prepared.push(text)
    const statement = prepare.call(this, text)
    const get = statement.get as (...args: unknown[]) => unknown
    statement.get = function (this: unknown, ...args: unknown[]) {
      if (counting) ran.push({ sql: text, params: args })
      return get.apply(this, args)
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'hop-reader', name: 'Synthetic hop reader', runtime: 'claude-code' } })
  expect(registered.statusCode, registered.body).toBeLessThan(300)
  const participants = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  agent = participants.agents.find(one => one.handle === 'hop-reader')!.id
  worker = await import('../src/server/lib/worker.ts')
  const person = { kind: 'person', id: THE_PERSON }
  const fromAgent = { kind: 'agent', id: agent }
  message('hop-person', person, 'hop-third')
  message('hop-first', fromAgent, 'hop-person')
  message('hop-second', fromAgent, 'hop-first')
  message('hop-third', fromAgent, 'hop-second')
  message('hop-alone', fromAgent)
  message('hop-missing-parent', fromAgent, 'hop-absent')
  message('hop-other-kind', fromAgent, 'hop-not-a-message')
  message('hop-not-a-message', fromAgent, 'hop-second')
  t.client.sqlite.prepare("update records set kind = 'note' where id = ?").run('hop-not-a-message')
  message('hop-cycle-a', fromAgent, 'hop-cycle-b')
  message('hop-cycle-b', fromAgent, 'hop-cycle-a')
  message('hop-self', fromAgent, 'hop-self')
  message('hop-unknown', null, 'hop-second')
  message('hop-unknown-parent', fromAgent, 'hop-unknown')
  message('hop-odd-sender', 'agent', 'hop-second')
  message('hop-blank', fromAgent, '  ')
  message('hop-number', fromAgent, 42)
  message('hop-deleted', fromAgent, 'hop-second')
  t.client.sqlite.prepare('update records set deleted_at = ? where id = ?').run(AT, 'hop-deleted')
  message('hop-after-deleted', fromAgent, 'hop-deleted')
  for (const [id, data] of [['hop-array', []], ['hop-null', null], ['hop-string', 'text']] as const) {
    message(id, fromAgent)
    writeData(id, data)
  }
  for (const id of ['hop-third', 'hop-first', 'hop-alone', 'hop-missing-parent', 'hop-other-kind', 'hop-cycle-a', 'hop-after-deleted']) {
    t.client.sqlite.prepare('insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, ?, ?, ?, ?)')
      .run(`delivery-${id}`, id, 'agent', agent, 'queued', AT)
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('keeps the queue hops field for chains, stops, cycles, and a deleted ancestor', () => {
  const queue = worker.theQueue('default')
  const expected = {
    'hop-third': 2,
    'hop-first': 0,
    'hop-alone': 0,
    'hop-missing-parent': 0,
    'hop-other-kind': 0,
    'hop-cycle-a': 1,
    'hop-after-deleted': 3,
  }
  expect(Object.fromEntries(queue.filter(row => row.messageId in expected).map(row => [row.messageId, row.hops]))).toEqual(expected)
}, 60_000)

it('keeps every stopping branch and reads edits on the next walk', () => {
  for (const [id, hops] of [
    ['hop-person', 0], ['hop-absent', 0], ['hop-not-a-message', 0], ['hop-self', 0],
    ['hop-unknown', 2], ['hop-unknown-parent', 2], ['hop-odd-sender', 2],
    ['hop-blank', 0], ['hop-number', 0], ['hop-array', 0], ['hop-null', 0], ['hop-string', 0],
  ] as const) expect(worker.hopsBehind(id), id).toBe(hops)
  expect(worker.hopsBehind('hop-third', 0)).toBe(0)
  expect(worker.hopsBehind('hop-third', -1)).toBe(0)
  expect(worker.hopsBehind('hop-third', 1)).toBe(1)
  expect(worker.hopsBehind('hop-third', 2)).toBe(2)
  writeData('hop-first', { ...fixtures.get('hop-first'), sentBy: { kind: 'person', id: THE_PERSON } })
  expect(worker.hopsBehind('hop-third')).toBe(1)
  writeData('hop-first', fixtures.get('hop-first'))
  expect(worker.hopsBehind('hop-third')).toBe(2)
  writeData('hop-second', { ...fixtures.get('hop-second'), inReplyTo: 'hop-absent' })
  expect(worker.hopsBehind('hop-third')).toBe(1)
  writeData('hop-second', fixtures.get('hop-second'))
  expect(worker.hopsBehind('hop-third')).toBe(2)
})

it('prepares the hop read at most once for fifty walks, and executes every walk afresh', () => {
  prepared.length = 0
  ran.length = 0
  counting = true
  try {
    for (let i = 0; i < 50; i++) expect(worker.hopsBehind('hop-third')).toBe(2)
  } finally {
    counting = false
  }
  expect(ran.filter(one => one.sql === HOP_READ).map(one => one.params)).toEqual(
    Array.from({ length: 50 }, () => [['hop-third'], ['hop-second'], ['hop-first'], ['hop-person']]).flat(),
  )
  expect(prepared.filter(one => one === HOP_READ).length).toBeLessThanOrEqual(1)
})
