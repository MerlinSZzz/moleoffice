// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S LISTING AND THE COUNTS OF ITS FIRST READ FIND ITS MESSAGES ONE WAY INTO ITS VIEW AT A TIME, AND A SEARCH
 * COUNTS NO PROJECT'S RECORDS. EACH ANSWERS AS IT DID.
 *
 * Round 107 of wave 13y, the third pass over the API's speed. A project's messages are its view of the message centre
 * . `listRecords` and the counts of GET /api/project/bootstrap asked for them as the view's rule,
 * and SQLite then tested every message of the office. On the made-up office at the 22 October scale, built by
 * tools/build-a-made-up-office.ts, a listing of every kind of a project took 169 ms that way and 82 ms through the index of
 * each way into the view; the bootstrap's counts took 102 ms and 23 ms. A search also counted the records of every
 * project, which nothing in its answer reads: 56 to 91 ms a search there, in 72 traced searches.
 *
 * WHAT IS HELD HERE:
 *   1. `listRecords` gives the records the read before the change gave, in the same order: for a project, a second
 *      project and the message centre; every kind, the messages alone and one other kind; live records alone and deleted
 *      ones too; and with a condition that narrows. `listRecordsWithDataAs` gives the same records as well. The read
 *      before the change is written out here as it was. The office holds one made-up message for each way into a
 *      project's view and each way out of it, a withdrawn message, and a deleted task of the project.
 *   3. GET /api/project/bootstrap gives the person and an agent the counts the count before the change gave, worked out
 *      here as it was, with the messages hidden from each left out as the door leaves them out. Its count goes through
 *      the same three indexes.
 *
 * The office is tests/the-office-with-every-way-into-a-view.ts. Every row in it is made up.
 */
import { and, asc, count, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

/** The three indexes a project's view is read through, one for each way into it. */
const THE_WAYS = ['records_message_written_in_project_idx', 'records_message_about_project_idx', 'records_message_target_idx']

let t: TestDb
let app: FastifyInstance
let R: typeof import('../src/server/lib/records.ts')
let agentHandle = ''

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: R.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const db = t.client.sqlite
  const { office } = await buildTheOfficeWithEveryWayIntoAView(db)
  // A DELETED TASK OF THE PROJECT, for the listings that ask for deleted records as well.
  db.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values ('made-up-gone-task', 'default', 'owner', '2026-10-01 09:30:00', '2026-10-01 09:30:00', 'task', 'A made-up deleted task', null, ?, '2026-10-01 09:31:00', 'fixture')`,
  ).run(JSON.stringify({ state: 'todo' }))
  agentHandle = (db.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  app = (await apiApp()).app
  await app.ready()
}, 300_000)

afterAll(async () => {
  await app.close()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  t.close()
})

/** What a listing is asked with here. */
interface Asked {
  workspaceId: string
  kind?: RecordKind
  includeDeleted?: boolean
  alsoWhere?: SQL
}

/** The condition `listRecords` read by before the change, for a listing with no ids, written out as it was. */
async function theConditionBeforeTheChange(asked: Asked): Promise<SQL | undefined> {
  const { records } = await import('../src/server/db/schema.ts')
  const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
  const { justThisProject } = await import('../src/shared/which-projects.ts')
  const where: (SQL | undefined)[] = [asked.includeDeleted ? undefined : isNull(records.deletedAt)]
  if (asked.kind) where.push(eq(records.kind, asked.kind))
  const view = messagesInTheViewOf(justThisProject(asked.workspaceId))
  if (asked.kind === 'message') where.push(view)
  else if (asked.kind === undefined) where.push(or(eq(records.workspaceId, asked.workspaceId), and(eq(records.kind, 'message'), view)))
  else where.push(eq(records.workspaceId, asked.workspaceId))
  where.push(asked.alsoWhere)
  return and(...where.filter(Boolean))
}

/** The records `listRecords` gave before the change, in its order, through drizzle's own mapping. */
async function theListingBeforeTheChange(asked: Asked) {
  const { db } = await import('../src/server/db/client.ts')
  const { records } = await import('../src/server/db/schema.ts')
  return db
    .select()
    .from(records)
    .where(await theConditionBeforeTheChange(asked))
    .orderBy(desc(records.updatedAt), asc(records.id))
    .all()
    .map(R.toRecord)
}

/** Every statement `run` runs, a request's included, with what it was asked with. */
async function theStatementsOf(run: () => unknown): Promise<{ sql: string; params: unknown[] }[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  const ran: { sql: string; params: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate', 'run'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        ran.push({ sql: text, params: args })
        return call.apply(this, args)
      }
    }
    return statement
  }
  try {
    await run()
  } finally {
    sqlite.prepare = prepare
  }
  return ran
}

/** SQLite's plan for a statement that ran, as one text. */
function thePlanOf(one: { sql: string; params: unknown[] }): string {
  const params = one.params.length === 1 && Array.isArray(one.params[0]) ? (one.params[0] as unknown[]) : one.params
  return (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...params) as { detail: string }[]).map((row) => row.detail).join('\n')
}

function headersOf(actor: { type: 'human' | 'agent'; id: string }): Record<string, string> {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': actor.type, 'x-mole-office-actor-id': actor.id }
}

describe("a project's listing", () => {
  const listings: { is: string; asked: Asked }[] = []
  for (const workspaceId of ['default', ELSEWHERE, MESSAGE_CENTRE]) {
    for (const kind of [undefined, 'message', 'task'] as const) {
      for (const includeDeleted of [false, true]) {
        listings.push({ is: `${workspaceId}, ${kind ?? 'every kind'}${includeDeleted ? ', deleted ones too' : ''}`, asked: { workspaceId, ...(kind === undefined ? {} : { kind }), includeDeleted } })
      }
    }
  }

  for (const { is, asked } of listings) {
    it(`1. gives the records it gave before the change, in the same order: ${is}`, async () => {
      const before = await theListingBeforeTheChange(asked)
      const now = R.listRecords(asked)
      expect(now.map((one) => one.id)).toEqual(before.map((one) => one.id))
      expect(now).toEqual(before)
    })
  }

  it('1. holds each way into the view of default, leaves out each way out of it, and holds the deleted records when asked', () => {
    const live = new Set(R.listRecords({ workspaceId: 'default' }).map((one) => one.id))
    const every = new Set(R.listRecords({ workspaceId: 'default', includeDeleted: true }).map((one) => one.id))
    const way = (i: number) => `made-up-way-${String(i).padStart(2, '0')}`
    // Way 8 is the withdrawn message written in default, and the task is deleted: each is listed only with deleted ones.
    expect([0, 1, 2, 3, 6, 9, 10].map((i) => live.has(way(i)))).toEqual([true, true, true, true, true, true, true])
    expect([0, 1, 2, 3, 6, 8, 9, 10].map((i) => every.has(way(i)))).toEqual([true, true, true, true, true, true, true, true])
    expect([4, 5, 7].map((i) => every.has(way(i)))).toEqual([false, false, false])
    expect([live.has(way(8)), live.has('made-up-gone-task'), every.has('made-up-gone-task')]).toEqual([false, false, true])
  })

  it('1. narrowed by a condition, and with its data worked out in SQL, gives what it gave before the change', async () => {
    const { records } = await import('../src/server/db/schema.ts')
    const alsoWhere = sql`${records.title} LIKE 'A made-up message%'`
    const before = await theListingBeforeTheChange({ workspaceId: 'default', alsoWhere })
    expect(before.length, 'the condition keeps some records').toBeGreaterThan(5)
    expect(R.listRecords({ workspaceId: 'default', alsoWhere })).toEqual(before)
    const withData = R.listRecordsWithDataAs({ workspaceId: 'default' }, sql<string>`json_object('title', ${records.title})`)
    const all = await theListingBeforeTheChange({ workspaceId: 'default' })
    expect(withData.map((one) => [one.id, one.data])).toEqual(all.map((one) => [one.id, { title: one.title }]))
  })

})

describe("the counts of a project's first read", () => {
  const readers = [
    { is: 'the person', actor: () => ({ type: 'human' as const, id: THE_PERSON }) },
    { is: 'an agent', actor: () => ({ type: 'agent' as const, id: agentHandle }) },
  ]
  for (const { is, actor } of readers) {
    it(`3. gives ${is} the counts the count before the change gave, through the index of each way into the view`, async () => {
      const { db } = await import('../src/server/db/client.ts')
      const { records } = await import('../src/server/db/schema.ts')
      const { everyMessageHiddenFrom, theMessageReader } = await import('../src/server/lib/messages.ts')
      const hidden = everyMessageHiddenFrom(theMessageReader(actor()), 'default')
      // The agent may not read every message, so its count leaves some out, and the door must leave out the same ones.
      if (actor().type === 'agent') expect(hidden.length, 'the messages hidden from the agent').toBeGreaterThan(0)
      const before = db
        .select({ kind: records.kind, n: count() })
        .from(records)
        .where(and(await theConditionBeforeTheChange({ workspaceId: 'default' }), sql`${records.id} NOT IN (SELECT value FROM json_each(${JSON.stringify(hidden)}))`))
        .groupBy(records.kind)
        .all()
      let reply: Awaited<ReturnType<FastifyInstance['inject']>> | undefined
      const ran = await theStatementsOf(async () => {
        reply = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: headersOf(actor()) })
      })
      expect(reply!.statusCode, reply!.body).toBe(200)
      const project = (reply!.json() as { project: { records: number; byKind: Record<string, number> } }).project
      expect(project.byKind).toEqual(Object.fromEntries(before.map((row) => [row.kind, row.n])))
      expect(project.records).toBe(before.reduce((sum, row) => sum + row.n, 0))
      expect(project.byKind['message'], 'the count holds messages').toBeGreaterThan(0)
      const theCount = ran.filter((one) => /count\(\*\)/i.test(one.sql) && /group by "records"\."kind"/i.test(one.sql))
      expect(theCount).toHaveLength(1)
      const plan = thePlanOf(theCount[0]!)
      for (const index of THE_WAYS) expect(plan, plan).toContain(index)
      expect(plan, plan).not.toContain('records_kind_idx')
    })
  }
})

