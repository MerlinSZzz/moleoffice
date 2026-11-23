// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPEN LOOPS COUNT A READER'S MESSAGES FROM THE READER'S OWN MESSAGES, AND THE NUMBER IS THE ONE COUNTED FROM EVERY
 * MESSAGE OF THE PROJECT'S VIEW.
 *
 * Beside the open loops, GET /api/open-loops, GET /api/where-you-stand and GET /api/brief say how many records of the
 * project the caller may read (`counts.outsideThePopulation`). For a reader limited to its own messages, that count
 * read the id of every live message in the project's view, only to keep the ones the reader's narrowing holds
 * (`theMessagesAReaderCouldBeAPartyTo`). It now starts from the narrowing, so it must give the same number.
 *
 * WHAT IS HELD HERE:
 *   1. The same number. For an agent with a session, a supervisor and the person, `readableCount` equals the count as
 *      it was defined: the records of the project that are not messages, as `aProjectCounted` counts them, and the
 *      messages of its view that `theMessagesThisReaderMayRead` keeps. Both are asked here as they are in src/, so no
 *      rule is copied into this file. It is asked for a project with more than a short list of live messages in its
 *      view, for one with fewer, and for the message centre, and again inside `withEachNarrowingWorkedOutOnce`.
 *   2. The same answer at the door. `counts.outsideThePopulation` of GET /api/open-loops, and of the open loops inside
 *      GET /api/where-you-stand, is that count less the open loops' candidates, for the same three callers.
 *   3. The work. In a second office, with at least 200 messages in the project's view, an agent that is a party to at
 *      most 20 of them and no routed message, no statement of the agent's count gives back 100 rows or more.
 *
 * For a project with no more than a short list of messages in its view, the number is the same only while the
 * narrowing keeps every message the reader could be a party to, as its own comment promises. A longer list already
 * rested on that promise.
 *
 * THE FIRST OFFICE is tests/the-office-with-every-way-into-a-view.ts, built as
 * tests/where-you-stand-reads-an-agents-messages-by-index-and-once.test.ts builds it, with the clock pinned and the
 * message edit window set as that test sets it. This file adds made-up messages that the agent and the supervisor are
 * each a party to in one way: sent by its id, sent by its handle, handed to it, told of in a sweep, and sent to a group
 * it is in. Each is written in both projects, and each has a deleted copy. Others are filed in a project itself, come
 * into the first project's view by each other way, or went to a group before the reader joined it or after it left.
 * The second project also gets records that are not messages. The second office is made here, row by row.
 * Its hook asks the two doors once, as an agent that is none of the callers, so no case pays for a door's first answer.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

type Caller = 'agent' | 'supervisor' | 'person'
type Limited = Exclude<Caller, 'person'>
const CALLERS: readonly Caller[] = ['agent', 'supervisor', 'person']
const LIMITED: readonly Limited[] = ['agent', 'supervisor']

type Sqlite = TestDb['client']['sqlite']
type Messages = typeof import('../src/server/lib/messages.ts')
type Reader = ReturnType<Messages['theMessageReader']>

const PERSON_HEADERS = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORDS = 'These words were made up for a test and say nothing.'
const NOBODY = [{ kind: 'agent', id: 'made-up-nobody' }]
const FROM_THE_PERSON = { kind: 'person', id: THE_PERSON }

/** A message row in the records table, as the made-up offices write one. A message to a group names no other addressee. */
function aMessageWriter(sqlite: Sqlite): (id: string, workspace: string, at: string, data: Record<string, unknown>, deletedAt?: string) => void {
  const add = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, ?, 'owner', ?, ?, 'message', ?, null, ?, ?, 'fixture')`,
  )
  return (id, workspace, at, data, deletedAt) => {
    add.run(id, workspace, at, at, `A made-up message, ${id}`, JSON.stringify({ body: WORDS, ...('toGroup' in data ? {} : { to: NOBODY }), ...data }), deletedAt ?? null)
  }
}

/** A delivery row handing a message to an agent. */
function aDeliveryWriter(sqlite: Sqlite): (id: string, messageId: string, agentId: string, at: string) => void {
  const add = sqlite.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by)
     values (?, ?, 'agent', ?, 'queued', ?, null, null, null)`,
  )
  return (id, messageId, agentId, at) => {
    add.run(id, messageId, agentId, at)
  }
}

/** A group opened by the person, with these agents as members from `joined` until `left`. */
function aGroup(sqlite: Sqlite, id: string, members: readonly string[], joined: string, left: string | null): void {
  sqlite
    .prepare(
      `insert into groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at, about)
       values (?, 'default', ?, 'person', ?, 'made up for a test', ?, null)`,
    )
    .run(id, `A made-up group, ${id}`, THE_PERSON, joined)
  const add = sqlite.prepare(
    `insert into group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at)
     values (?, ?, 'agent', ?, ?, 'made up for a test', ?)`,
  )
  members.forEach((member, i) => add.run(`${id}-member-${String(i)}`, id, member, joined, left))
}

/** A line of a sweep's summary that told this agent about the message. */
function toldInASweep(agentId: string): Record<string, unknown>[] {
  return [
    {
      for: { kind: 'agent', id: 'made-up-nobody' },
      because: 'Made up for a test.',
      to: { kind: 'agent', id: agentId },
      passedOver: [],
      line: 'A made-up line of a summary.',
      inSummary: 'made-up-summary',
    },
  ]
}

describe('in an office with every way into a view', () => {
  let t: TestDb
  let app: FastifyInstance
  const headersOf = {} as Record<Caller, Record<string, string>>
  /** The made-up live messages each limited reader is a party to, by the project whose view holds them. */
  const partyTo = { agent: new Map<string, string[]>(), supervisor: new Map<string, string[]>() }
  /** The made-up deleted messages each limited reader is a party to. */
  const deleted: string[] = []

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
    vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    const db = t.client.sqlite
    const { office, secretary } = await buildTheOfficeWithEveryWayIntoAView(db)

    // THE THREE CALLERS. The agent with a session is the measured agent, naming the newest run of the office. The
    // supervisor is another made-up agent, given the supervisor's card.
    const agent = { id: office.theAgent, handle: (db.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle }
    const supervisor = db
      .prepare(`select id, handle from agents where retired = 0 and id not in ('mole-office', ?, ?) order by id limit 1`)
      .get(agent.id, secretary.id) as { id: string; handle: string }
    db.prepare(`update agents set role = 'supervisor' where id = ?`).run(supervisor.id)
    const session = (db.prepare(`select id from records where kind = 'session' order by id desc limit 1`).get() as { id: string }).id
    headersOf.person = PERSON_HEADERS
    headersOf.agent = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle, 'x-mole-office-session': session }
    headersOf.supervisor = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': supervisor.handle }

    const message = aMessageWriter(db)
    const deliver = aDeliveryWriter(db)
    const aRecordOfDefault = (db.prepare(`select id from records where workspace_id = 'default' and kind <> 'session' order by id limit 1`).get() as { id: string }).id
    const aMessageOfDefault = (db.prepare(`select id from records where kind = 'message' order by id limit 1`).get() as { id: string }).id
    // THE READERS' GROUPS: one they are in, and one they have left.
    aGroup(db, 'made-up-group-they-are-in', [agent.id, supervisor.id], '2026-09-10 09:00:00', null)
    aGroup(db, 'made-up-group-they-left', [agent.id, supervisor.id], '2026-09-10 09:00:00', '2026-09-11 09:00:00')

    db.transaction(() => {
      for (const [name, reader] of [['agent', agent], ['supervisor', supervisor]] as const) {
        const theirs = (project: string, id: string): void => {
          partyTo[name].set(project, [...(partyTo[name].get(project) ?? []), id])
        }
        let minute = 0
        const at = (): string => `2026-10-02 ${String(9 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute++ % 60).padStart(2, '0')}:00`
        // EACH WAY OF BEING A PARTY, written in each project, live and deleted.
        for (const project of ['default', ELSEWHERE]) {
          for (const gone of [false, true]) {
            const id = (way: string): string => `made-up-${name}-${way}-in-${project}${gone ? '-deleted' : ''}`
            const deletedAt = gone ? '2026-10-03 09:00:00' : undefined
            const keep = (one: string): void => {
              if (gone) deleted.push(one)
              else theirs(project, one)
            }
            const writtenIn = { writtenIn: { project } }
            message(id('sent-by-its-id'), MESSAGE_CENTRE, at(), { ...writtenIn, sentBy: { kind: 'agent', id: reader.id } }, deletedAt)
            keep(id('sent-by-its-id'))
            message(id('sent-by-its-handle'), MESSAGE_CENTRE, at(), { ...writtenIn, sentBy: { kind: 'agent', id: reader.handle } }, deletedAt)
            keep(id('sent-by-its-handle'))
            const handed = at()
            message(id('handed-to-it'), MESSAGE_CENTRE, handed, { ...writtenIn, sentBy: FROM_THE_PERSON }, deletedAt)
            deliver(`${id('handed-to-it')}-delivery`, id('handed-to-it'), reader.id, handed)
            keep(id('handed-to-it'))
            message(id('told-in-a-sweep'), MESSAGE_CENTRE, at(), { ...writtenIn, sentBy: FROM_THE_PERSON, routed: toldInASweep(reader.id) }, deletedAt)
            keep(id('told-in-a-sweep'))
            message(id('to-its-group'), MESSAGE_CENTRE, at(), { ...writtenIn, sentBy: FROM_THE_PERSON, toGroup: 'made-up-group-they-are-in' }, deletedAt)
            keep(id('to-its-group'))
          }
          // TO A GROUP, BUT NOT WHILE THE READER WAS IN IT: kept by the narrowing, and the reader is no party.
          message(`made-up-${name}-before-it-joined-in-${project}`, MESSAGE_CENTRE, '2026-09-09 09:00:00', { writtenIn: { project }, sentBy: FROM_THE_PERSON, toGroup: 'made-up-group-they-are-in' })
          message(`made-up-${name}-after-it-left-in-${project}`, MESSAGE_CENTRE, '2026-09-12 09:00:00', { writtenIn: { project }, sentBy: FROM_THE_PERSON, toGroup: 'made-up-group-they-left' })
          // FILED IN THE PROJECT ITSELF, and not in the message centre.
          message(`made-up-${name}-filed-in-${project}`, project, at(), { writtenIn: { project }, sentBy: { kind: 'agent', id: reader.id } })
          theirs(project, `made-up-${name}-filed-in-${project}`)
        }
        // INTO THE VIEW OF `default` EACH OTHER WAY, written in the other project, so in both views.
        const sent = { sentBy: { kind: 'agent', id: reader.id } }
        const elsewhere = { writtenIn: { project: ELSEWHERE } }
        const intoDefault: [string, Record<string, unknown>][] = [
          ['about-default', { ...sent, ...elsewhere, aboutProject: 'default' }],
          ['on-a-record-of-default', { ...sent, ...elsewhere, target: { target: { kind: 'record', recordId: aRecordOfDefault }, place: { at: 'surface' } } }],
          ['naming-default', { ...sent, ...elsewhere, target: { target: { kind: 'project', workspaceId: 'default' }, place: { at: 'surface' } } }],
        ]
        for (const [way, data] of intoDefault) {
          message(`made-up-${name}-${way}`, MESSAGE_CENTRE, at(), data)
          theirs('default', `made-up-${name}-${way}`)
          theirs(ELSEWHERE, `made-up-${name}-${way}`)
        }
        // A COMMENT ON A MESSAGE, WRITTEN IN `default`, which only that project's view holds.
        message(`made-up-${name}-on-a-message`, MESSAGE_CENTRE, at(), {
          ...sent,
          writtenIn: { project: 'default' },
          target: { target: { kind: 'record', recordId: aMessageOfDefault, workspaceId: MESSAGE_CENTRE }, place: { at: 'surface' } },
        })
        theirs('default', `made-up-${name}-on-a-message`)
      }
      // RECORDS OF THE OTHER PROJECT THAT ARE NOT MESSAGES, one of them deleted.
      const record = db.prepare(
        `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
         values (?, ?, 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
      )
      const body = JSON.stringify({ body: WORDS, state: 'open' })
      record.run('made-up-task-elsewhere', ELSEWHERE, '2026-10-02 08:00:00', '2026-10-02 08:00:00', 'task', 'A made-up task', body, null)
      record.run('made-up-note-elsewhere', ELSEWHERE, '2026-10-02 08:01:00', '2026-10-02 08:01:00', 'note', 'A made-up note', body, null)
      record.run('made-up-deleted-note-elsewhere', ELSEWHERE, '2026-10-02 08:02:00', '2026-10-02 08:02:00', 'note', 'A made-up note', body, '2026-10-03 09:00:00')
    })()
    // THE DOORS ARE ASKED ONCE HERE, by a made-up agent that is none of the three callers, so the first case below that
    // asks them does not pay for each door's first answer. That answer is slow on a busy machine, and a test in this
    // file keeps the short budget while its hooks get the long one (tests/how-long-a-test-may-take.ts). Each caller's
    // answer below is still worked out for that caller, because GET /api/where-you-stand keeps an answer for one caller
    // only.
    const warm = db
      .prepare(`select handle from agents where retired = 0 and id not in ('mole-office', ?, ?, ?) order by id limit 1`)
      .get(agent.id, secretary.id, supervisor.id) as { handle: string }
    const warmHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': warm.handle }
    for (const url of ['/api/open-loops', '/api/where-you-stand']) {
      const reply = await app.inject({ method: 'GET', url, headers: warmHeaders })
      expect(reply.statusCode, `${url}, asked once before the cases: ${reply.body.slice(0, 400)}`).toBe(200)
    }
  }, 300_000)

  afterAll(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    await app.close()
    t.close()
  })

  /** The reader each caller is, as the doors read it. */
  async function readerOf(caller: Caller): Promise<Reader> {
    const { theMessageReader } = await import('../src/server/lib/messages.ts')
    return theMessageReader({ type: headersOf[caller]['x-mole-office-actor-type'] ?? '', id: headersOf[caller]['x-mole-office-actor-id'] ?? '' })
  }

  /** The readable count as it was defined, through the live functions that define it. */
  async function asItWasDefined(project: string, reader: Reader): Promise<number> {
    const { aProjectCounted } = await import('../src/server/lib/records.ts')
    const { theMessagesThisReaderMayRead } = await import('../src/server/lib/messages.ts')
    const counted = aProjectCounted(project)
    return counted.notMessages + theMessagesThisReaderMayRead(reader, counted.messageIds).size
  }

  it('holds a long list and a short one, and the readers are a party to the made-up messages each way', async () => {
    const { aProjectCounted } = await import('../src/server/lib/records.ts')
    const { theMessagesThisReaderMayRead, A_SHORT_LIST } = await import('../src/server/lib/messages.ts')
    const long = aProjectCounted('default').messageIds
    const short = aProjectCounted(ELSEWHERE).messageIds
    expect(long.length, 'the long list').toBeGreaterThan(A_SHORT_LIST)
    expect(short.length, 'the short list').toBeLessThan(A_SHORT_LIST)
    expect(aProjectCounted(ELSEWHERE).notMessages, 'the records elsewhere that are not messages').toBeGreaterThan(0)
    for (const caller of LIMITED) {
      const reader = await readerOf(caller)
      expect(reader.readsEveryMessage, `the ${caller} reads every message`).toBe(false)
      for (const project of ['default', ELSEWHERE]) {
        const ids = aProjectCounted(project).messageIds
        const mayRead = theMessagesThisReaderMayRead(reader, ids)
        expect(partyTo[caller].get(project)?.length ?? 0, `${caller} in ${project}: made-up messages it is a party to`).toBeGreaterThan(0)
        expect((partyTo[caller].get(project) ?? []).filter((id) => !mayRead.has(id)), `${caller} in ${project}: made-up messages it may not read`).toEqual([])
        expect(mayRead.size, `${caller} in ${project}: it may read every message`).toBeLessThan(ids.length)
        expect(ids.filter((id) => deleted.includes(id)), `${project}: deleted messages counted`).toEqual([])
      }
    }
  })

  for (const caller of CALLERS) {
    it(`1. counts for the ${caller} the number counted from every message of the view`, async () => {
      const { openLoopsInProject } = await import('../src/server/lib/openloops.ts')
      const { aProjectCounted } = await import('../src/server/lib/records.ts')
      const { theMessagesThisReaderMayRead, withEachNarrowingWorkedOutOnce } = await import('../src/server/lib/messages.ts')
      const reader = await readerOf(caller)
      for (const project of ['default', ELSEWHERE, MESSAGE_CENTRE]) {
        const defined = await asItWasDefined(project, reader)
        expect(openLoopsInProject(project).readableCount(reader), project).toBe(defined)
        // INSIDE THE WORK THAT KEEPS EACH NARROWING, asked twice, so the second count reads the kept narrowing.
        const inside = withEachNarrowingWorkedOutOnce(() => {
          const population = openLoopsInProject(project)
          const counted = aProjectCounted(project)
          return [population.readableCount(reader), population.readableCount(reader), counted.notMessages + theMessagesThisReaderMayRead(reader, counted.messageIds).size]
        })
        expect(inside, `${project}, inside the work that keeps each narrowing`).toEqual([defined, defined, defined])
      }
    })
  }

  for (const caller of CALLERS) {
    it(`2. gives the ${caller} the same count outside the open loops at GET /api/open-loops and GET /api/where-you-stand`, async () => {
      const { openLoopsInProject } = await import('../src/server/lib/openloops.ts')
      const reader = await readerOf(caller)
      const outside = async (): Promise<number> => (await asItWasDefined('default', reader)) - openLoopsInProject('default').candidates.length
      const before = await outside()
      const asked = async (url: string): Promise<Record<string, unknown>> => {
        const reply = await app.inject({ method: 'GET', url, headers: headersOf[caller] })
        expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
        return JSON.parse(reply.body) as Record<string, unknown>
      }
      const loops = (await asked('/api/open-loops')) as { counts: { outsideThePopulation: number } }
      const where = (await asked('/api/where-you-stand')) as { workedOut: { kept: boolean }; openLoops: { counts: { outsideThePopulation: number } } }
      expect(await outside(), 'the office changed while the doors were asked').toBe(before)
      expect(loops.counts.outsideThePopulation, 'GET /api/open-loops').toBe(before)
      expect(where.workedOut.kept, 'this answer was kept from an earlier request').toBe(false)
      expect(where.openLoops.counts.outsideThePopulation, 'GET /api/where-you-stand').toBe(before)
    })
  }
})

describe('in an office where an agent is a party to few of many messages', () => {
  let t: TestDb
  let app: FastifyInstance
  const AGENT = { id: 'made-up-quiet-agent-id', handle: 'made-up-quiet-agent' }

  /** One statement run during `work`, and how many rows it gave back. */
  interface ACaughtStatement {
    text: string
    rows: number
  }

  /** Every statement that runs during `work`, caught on the prototype of better-sqlite3's statements and let go after. */
  function theStatementsDuring<T>(work: () => T): { answer: T; caught: ACaughtStatement[] } {
    const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
    const originals = new Map<string, (...args: unknown[]) => unknown>()
    const caught: ACaughtStatement[] = []
    for (const how of ['all', 'get', 'iterate', 'run'] as const) {
      const original = prototype[how] as (...args: unknown[]) => unknown
      originals.set(how, original)
      prototype[how] = function (this: { source: string }, ...args: unknown[]) {
        const answer = original.apply(this, args)
        const one: ACaughtStatement = { text: this.source, rows: 0 }
        caught.push(one)
        if (how === 'all') one.rows = (answer as unknown[]).length
        else if (how === 'get') one.rows = answer === undefined ? 0 : 1
        else if (how === 'iterate') {
          const rows = answer as IterableIterator<unknown>
          return (function* () {
            for (const row of rows) {
              one.rows += 1
              yield row
            }
          })()
        }
        return answer
      }
    }
    try {
      return { answer: work(), caught }
    } finally {
      for (const [how, original] of originals) prototype[how] = original
    }
  }

  beforeAll(async () => {
    t = await freshDb()
    // THE SERVER IS MADE, because it reads the role cards that the reader's rule asks.
    app = (await apiApp()).app
    await app.ready()
    const db = t.client.sqlite
    const home = db.prepare(`select avatar_asset_id, home_world, home_installation from agents where handle = 'mole-office' and retired = 0`).get() as
      | { avatar_asset_id: string | null; home_world: string | null; home_installation: string | null }
      | undefined
    db.prepare(
      `insert into agents (id, name, handle, avatar_asset_id, retired, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since)
       values (?, ?, ?, ?, 0, null, null, '2026-09-01 09:00:00', 'person', ?, 'worker', ?, ?, '2026-09-01 09:00:00')`,
    ).run(AGENT.id, AGENT.handle, AGENT.handle, home?.avatar_asset_id ?? null, THE_PERSON, home?.home_world ?? null, home?.home_installation ?? null)
    aGroup(db, 'made-up-group-of-the-quiet-agent', [AGENT.id], '2026-09-10 09:00:00', null)
    const message = aMessageWriter(db)
    const deliver = aDeliveryWriter(db)
    db.transaction(() => {
      const at = (i: number): string => `2026-10-02 ${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`
      // TWO HUNDRED AND FIFTY MESSAGES THE AGENT IS NO PARTY TO, each handed to somebody else.
      for (let i = 0; i < 250; i++) {
        message(`made-up-not-its-${String(i)}`, MESSAGE_CENTRE, at(i), { writtenIn: { project: 'default' }, sentBy: FROM_THE_PERSON })
        deliver(`made-up-not-its-${String(i)}-delivery`, `made-up-not-its-${String(i)}`, 'made-up-nobody', at(i))
      }
      // TWELVE IT IS A PARTY TO, three each way, and two of them deleted.
      for (let i = 0; i < 3; i++) {
        const written = { writtenIn: { project: 'default' } }
        message(`made-up-its-sent-by-its-id-${String(i)}`, MESSAGE_CENTRE, at(300 + i), { ...written, sentBy: { kind: 'agent', id: AGENT.id } }, i === 0 ? '2026-10-03 09:00:00' : undefined)
        message(`made-up-its-sent-by-its-handle-${String(i)}`, MESSAGE_CENTRE, at(310 + i), { ...written, sentBy: { kind: 'agent', id: AGENT.handle } })
        message(`made-up-its-handed-to-it-${String(i)}`, MESSAGE_CENTRE, at(320 + i), { ...written, sentBy: FROM_THE_PERSON }, i === 0 ? '2026-10-03 09:00:00' : undefined)
        deliver(`made-up-its-handed-to-it-${String(i)}-delivery`, `made-up-its-handed-to-it-${String(i)}`, AGENT.id, at(320 + i))
        message(`made-up-its-to-its-group-${String(i)}`, MESSAGE_CENTRE, at(330 + i), { ...written, sentBy: FROM_THE_PERSON, toGroup: 'made-up-group-of-the-quiet-agent' })
      }
    })()
  }, 300_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it("3. the agent's count gives back no statement of 100 rows or more", async () => {
    const { aProjectCounted } = await import('../src/server/lib/records.ts')
    const { theMessageReader, theMessagesThisReaderMayRead } = await import('../src/server/lib/messages.ts')
    const { openLoopsInProject } = await import('../src/server/lib/openloops.ts')
    const reader = theMessageReader({ type: 'agent', id: AGENT.handle })
    expect(reader.readsEveryMessage, 'the agent reads every message').toBe(false)
    // THE OFFICE IS AS THE CASE SAYS: many messages in the view, few of them the agent's, and none routed.
    const routed = t.client.sqlite.prepare(`select count(*) as n from records where kind = 'message' and json_type(data, '$.routed') = 'array'`).get() as { n: number }
    expect(routed.n, 'routed messages').toBe(0)
    const counted = aProjectCounted('default')
    expect(counted.messageIds.length, 'the messages of the view').toBeGreaterThanOrEqual(200)
    const mayRead = theMessagesThisReaderMayRead(reader, counted.messageIds).size
    expect(mayRead, 'the messages the agent may read').toBeGreaterThan(0)
    expect(mayRead, 'the messages the agent may read').toBeLessThanOrEqual(20)
    const population = openLoopsInProject('default')
    const { answer, caught } = theStatementsDuring(() => population.readableCount(reader))
    expect(answer, 'the count').toBe(counted.notMessages + mayRead)
    expect(caught.length, 'statements caught').toBeGreaterThan(0)
    expect(caught.filter((one) => one.rows >= 100).map((one) => `${String(one.rows)} rows: ${one.text.slice(0, 300)}`)).toEqual([])
  })
})
