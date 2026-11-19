// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK TO TALK ABOUT IS COUNTED WITHOUT READING EVERY RECORD OF THE PROJECT, AND ANSWERS WHAT IT ANSWERED.
 *
 * Round 167 of wave 13y. `GET /api/records/work-to-talk-about` read every record of the project whole and then worked
 * out five rows and three counts with `workToTalkAbout` (src/shared/talksources.ts). On a made-up office of the live
 * shape that took 3.7 to 4.1 s, and the Agents page waits for it before it draws its first view. For a reader of every
 * message and no search, the door now counts the project's records and the messages in its view in SQLite, and reads
 * whole only the rows that may be among the five.
 *
 * WHAT HOLDS:
 *   1. For the person, a secretary and an agent who may not read every message, in two projects, with no search and
 *      with one, the door answers `workToTalkAbout` of the narrow rows `GET /api/records` lists for that same reader.
 *      The office holds every way into a project's view and out of it, a message filed in the project itself, a deleted
 *      task, a deleted message and a deleted run newer than every live row, and six pieces of work and messages changed
 *      in the same second, so the fifth row is chosen inside that second by the id.
 *
 * The office is tests/the-office-with-every-way-into-a-view.ts, with the rows added below. Every row in it is made up.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { workToTalkAbout, type WorkToTalkAbout } from '../src/shared/talksources.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

let t: TestDb
let app: FastifyInstance

type Reader = 'the person' | 'a secretary' | 'an agent'
const actorOf = {} as Record<Reader, { type: 'human' | 'agent'; id: string }>

/** The moment of the deleted rows, newer than every live row. */
const GONE_AT = '2026-10-09 12:40:00'
/** The second six pieces of work and messages were changed in, newer than every other live row. */
const TIED_AT = '2026-10-09 12:30:00'

// THE COUNTER OF THE ROWS EACH STATEMENT GIVES BACK, while `counting` is set.
let counting = false
const given: { sql: string; rows: number }[] = []

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const answer = run.apply(this, args)
        if (!counting) return answer
        if (method === 'get') given.push({ sql: text, rows: answer === undefined ? 0 : 1 })
        if (method === 'all') given.push({ sql: text, rows: (answer as unknown[]).length })
        if (method !== 'iterate') return answer
        const counted = { sql: text, rows: 0 }
        given.push(counted)
        return (function* () {
          for (const row of answer as Iterable<unknown>) {
            counted.rows += 1
            yield row
          }
        })()
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  const db = t.client.sqlite
  const { office, secretary } = await buildTheOfficeWithEveryWayIntoAView(db)
  const agentHandle = (db.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  actorOf['the person'] = { type: 'human', id: THE_PERSON }
  actorOf['a secretary'] = { type: 'agent', id: secretary.handle }
  actorOf['an agent'] = { type: 'agent', id: agentHandle }
  const newest = (db.prepare('select max(updated_at) as at from records').get() as { at: string }).at
  if (!(newest < TIED_AT)) throw new Error(`The made-up office holds a row changed at ${newest}, not before the rows this test adds.`)
  const aTaskOfDefault = (db.prepare(`select id from records where workspace_id = 'default' and kind = 'task' and deleted_at is null order by id limit 1`).get() as { id: string }).id
  const add = db.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, ?, 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
  )
  const message = (data: Record<string, unknown>) =>
    JSON.stringify({ body: 'A made-up message for a test.', sentBy: { kind: 'person', id: THE_PERSON }, to: [{ kind: 'agent', id: 'made-up-nobody' }], ...data })
  const inDefault = { writtenIn: { project: 'default' } }
  db.transaction(() => {
    add.run('made-up-gone-task', 'default', GONE_AT, GONE_AT, 'task', 'A made-up deleted task', JSON.stringify({ state: 'todo' }), GONE_AT)
    add.run('made-up-gone-message', MESSAGE_CENTRE, GONE_AT, GONE_AT, 'message', 'A made-up deleted message', message(inDefault), GONE_AT)
    add.run('made-up-gone-run', 'default', GONE_AT, GONE_AT, 'session', 'A made-up deleted run', JSON.stringify({ state: 'finished' }), GONE_AT)
    add.run('made-up-tie-a', MESSAGE_CENTRE, TIED_AT, TIED_AT, 'message', 'A made-up message written in default', message(inDefault), null)
    add.run('made-up-tie-b', 'default', TIED_AT, TIED_AT, 'task', 'A made-up task', JSON.stringify({ state: 'doing' }), null)
    add.run('made-up-tie-c', MESSAGE_CENTRE, TIED_AT, TIED_AT, 'message', 'A made-up comment on a task', message({ target: { target: { kind: 'record', recordId: aTaskOfDefault }, place: { at: 'surface' } }, writtenIn: { project: ELSEWHERE } }), null)
    add.run('made-up-tie-d', 'default', TIED_AT, TIED_AT, 'task', 'A made-up second task', JSON.stringify({ state: 'todo' }), null)
    add.run('made-up-tie-e', 'default', TIED_AT, TIED_AT, 'message', 'A made-up message filed in default', message(inDefault), null)
    add.run('made-up-tie-f', MESSAGE_CENTRE, TIED_AT, TIED_AT, 'message', 'A made-up message about default', message({ aboutProject: 'default', writtenIn: { project: ELSEWHERE } }), null)
    add.run('made-up-tie-g', ELSEWHERE, TIED_AT, TIED_AT, 'task', 'A made-up task elsewhere', JSON.stringify({ state: 'todo' }), null)
  })()
}, 300_000)

afterAll(async () => {
  await app?.close()
  vi.useRealTimers()
  t?.close()
})

function headersOf(reader: Reader, project: string): Record<string, string> {
  const actor = actorOf[reader]
  return { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': actor.type, 'x-mole-office-actor-id': actor.id }
}

async function get<T>(url: string, headers: Record<string, string>): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** What the door answers, without what every reply carries. */
async function door(search: string, headers: Record<string, string>): Promise<WorkToTalkAbout<PanelRecord>> {
  const url = `/api/records/work-to-talk-about${search === '' ? '' : `?q=${encodeURIComponent(search)}`}`
  const { query, rows, matched, leftOut } = await get<WorkToTalkAbout<PanelRecord>>(url, headers)
  return { query, rows, matched, leftOut }
}

/** The working out over the narrow rows `GET /api/records` lists for the same reader in the same project. */
async function theWorkingOutOverTheList(search: string, headers: Record<string, string>): Promise<WorkToTalkAbout<PanelRecord>> {
  const listed = await get<{ records: PanelRecord[] }>('/api/records?shape=narrow', headers)
  return workToTalkAbout(listed.records, search)
}

describe('the work to talk about', () => {
  for (const reader of ['the person', 'a secretary', 'an agent'] as const) {
    for (const project of ['default', ELSEWHERE]) {
      for (const search of ['', ' A MADE-UP ']) {
        it(`1. answers ${reader} in ${project}${search === '' ? '' : ' with a search'} the working out over the rows the list holds for them`, async () => {
          const headers = headersOf(reader, project)
          const expected = await theWorkingOutOverTheList(search, headers)
          expect(await door(search, headers)).toEqual(expected)
        })
      }
    }
  }

  it('1. holds the rows it is meant to hold: no deleted row is answered, and the fifth row is chosen inside one second', async () => {
    const answer = await door('', headersOf('the person', 'default'))
    expect(answer.rows.map((one) => one.id)).toEqual(['made-up-tie-a', 'made-up-tie-b', 'made-up-tie-c', 'made-up-tie-d', 'made-up-tie-e'])
    const forTheAgent = await door('', headersOf('an agent', 'default'))
    // The agent may read none of the made-up messages, so its first rows are the two tasks of that second.
    expect(forTheAgent.rows.slice(0, 2).map((one) => one.id)).toEqual(['made-up-tie-b', 'made-up-tie-d'])
  })

})
