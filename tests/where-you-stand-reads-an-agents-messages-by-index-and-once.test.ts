// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE-YOU-STAND READS THE MESSAGES IT NEEDS THROUGH THEIR INDEXES, ASKS ONCE WHICH MESSAGES AN AGENT COULD BE A
 * PARTY TO, AND ANSWERS WHAT THE THREE DOORS IT JOINS ANSWER WITHOUT EITHER.
 *
 * Round 65 of wave 13y. In the live call log of 22 October 2026, GET /api/where-you-stand took up to 8.7 s for agents
 * in a project, during stalls of the office. On a made-up office at the scale of 22 October, built by
 * tools/build-a-made-up-office.ts, it took a median of 470 ms for the person and 968 ms for an agent with a session.
 * Seven reads made most of the difference, and each read every message of the office through the index of every
 * record of a kind:
 *   - the count of the records a project holds read its view of the messages, about 87 ms for every caller;
 *   - the person's words read the messages of the view that name no sender, about 70 ms for every caller;
 *   - for an agent, the narrowing of a long list to the messages it could be a party to read the messages it sent,
 *     about 70 ms, and the messages to every group it was ever in, about 67 ms. The open loops and the brief each
 *     asked it, so it ran twice;
 *   - for an agent, the brief's news of its groups read the messages to its groups, about 72 ms.
 * The sender's index of migration 0199 was there and SQLite did not pick it. The group and the view had no index.
 *
 * WHAT IS HELD HERE:
 *   - The answers do not change. GET /api/where-you-stand is asked as the person, as a secretary and as an agent with
 *     a session. Its answer is compared, in each case, with the answer worked out here without the change: the three
 *     doors it is defined as (GET /api/brief, GET /api/waiting and GET /api/open-loops), each asked alone, so each
 *     narrows an agent's messages for itself, and with every read of messages that names an index read as a walk of
 *     the table instead. The case compares the parts, the brief's size, the head's lines, the messages each answer
 *     names, and then each part whole. `workedOut` is left out, because it says how long the answer took.
 *   - In the same case, where-you-stand names the indexes of messages and the doors asked alone named none, and it asks
 *     once which messages an agent could be a party to where the doors alone asked more than once.
 *   - In the same case, the reader's messages found through the narrowing by index are the messages the one rule,
 *     `thePartiesOfMany`, makes it a party to, asked of every message of the office.
 *   - An agent's where-you-stand and its brief each ask once which messages it could be a party to.
 *   - Each of the reads above goes through an index that holds its field, and none through the index of every record
 *     of a kind.
 *   - A project's count of its messages holds every message of its view and no other, for every way a message comes
 *     into the view. It is compared with the view's own rule, `messagesInTheViewOf`, asked as one read.
 *
 * NO ANSWER IS COPIED INTO THIS FILE (round 74 of wave 13y). Until then, the first three cases compared each answer's
 * SHA-256 with one taken at the code before round 65's change. The hashes had to be taken again whenever another line
 * added a part to the brief, as wave 13s round 99 did for the secretaries' duties, and that is the owner's rule: a
 * value that can change is not written into a test. Each case now works out both answers itself, in the same office.
 *
 * The clock is pinned and the message edit window is set to its built-in 120 seconds, as
 * tests/the-slowest-reads-answer-as-before.test.ts does, so the answers asked one after the other are worked out at
 * the same moment and with the same window.
 *
 * The office is tests/the-office-with-every-way-into-a-view.ts: the small office of the slowest reads with more of the
 * person's messages, a second project, a secretary, and one made-up message for each way into a project's view and
 * for each way out of it. This file adds two made-up messages, at `ONLY_BY_ITS_HANDLE`, for the reason given there.
 *
 * MUTATIONS (round 74 of wave 13y), each run once after a control run and put back:
 *   1. Where-you-stand works its brief out at the second level. The three cases go red at the brief's size.
 *   2. Where-you-stand reads the waiting list for a reader of every message as if it read only its own. The
 *      secretary's case goes red at the messages named.
 *   3. Where-you-stand hands back open loops read the same way. The person's and the secretary's cases go red.
 *   4. Where-you-stand works the open loops and the brief out without `withEachNarrowingWorkedOutOnce`. The agent's
 *      case goes red where it narrowed twice, and so does the case that asks once.
 *   5. The narrowing by index leaves out an agent's handle. The agent's case goes red at the messages found.
 *   6. The narrowing by index leaves out the agent's groups. The agent's case goes red at the messages found.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq, isNull, or } from 'drizzle-orm'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

type Caller = 'person' | 'secretary' | 'agent'

interface Ran { sql: string; params: unknown[] }

let t: TestDb
let app: FastifyInstance
const headersOf = {} as Record<Caller, Record<string, string>>
/** Every statement run while `counting` is set, with what it was asked with. */
let counting = false
const ran: Ran[] = []
/** The id of every message of the office, deleted or not. */
const theMessages = new Set<string>()

/** A read of messages that names one of their indexes. Every index of messages is named `records_message_…_idx`. */
const A_NAMED_MESSAGE_INDEX = /\bINDEXED BY\s+"?records_message_\w+_idx"?/gi
/** While this is set, each read that names an index of messages is prepared with `NOT INDEXED` in its place. */
let withoutTheMessageIndexes = false

/**
 * TWO MADE-UP MESSAGES THE AGENT IS A PARTY TO IN ONE WAY ONLY, each found by one read of its narrowing by index: one
 * whose stored sender is the agent's handle, and one to a group the agent is in, with no delivery row. In the office
 * as built, every such message also has a delivery row to the agent, so a narrowing that lost either read lost nothing.
 */
const ONLY_BY_ITS_HANDLE = 'made-up-sent-by-the-agents-handle'
const ONLY_BY_ITS_GROUP = 'made-up-to-a-group-of-the-agent'

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  // THE EDIT WINDOW AT ITS BUILT-IN VALUE, whatever the checkout's .env says. The header says why.
  vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, asked: string) {
    // THE READ AS A WALK OF THE TABLE, when the answer without the indexes is being worked out. It holds the same rows.
    const text = withoutTheMessageIndexes ? asked.replace(A_NAMED_MESSAGE_INDEX, 'NOT INDEXED') : asked
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'run', 'iterate', 'values', 'raw'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (counting && method !== 'raw') ran.push({ sql: text, params: args })
        return run.apply(this, args)
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  const db = t.client.sqlite
  const { office, secretary } = await buildTheOfficeWithEveryWayIntoAView(db)
  // THE AGENT WITH A SESSION: the measured agent, naming the newest run of the office.
  const handle = (db.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  const session = (db.prepare(`select id from records where kind = 'session' order by id desc limit 1`).get() as { id: string }).id
  headersOf.person = PERSON
  headersOf.secretary = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': secretary.handle }
  headersOf.agent = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': session }
  const group = db
    .prepare(`select group_id as id, joined_at as at from group_members where member_kind = 'agent' and member_id = ? and left_at is null order by joined_at, id limit 1`)
    .get(office.theAgent) as { id: string; at: string }
  const newest = (db.prepare(`select max(created_at) as at from records where kind = 'message'`).get() as { at: string }).at
  const add = db.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, 'message-centre', 'owner', ?, ?, 'message', ?, null, ?, null, 'fixture')`,
  )
  const words = 'These words were made up for a test and say nothing.'
  add.run(ONLY_BY_ITS_HANDLE, newest, newest, 'by the handle', JSON.stringify({ body: words, sentBy: { kind: 'agent', id: handle }, to: [{ kind: 'agent', id: 'made-up-nobody' }], writtenIn: { project: 'default' } }))
  add.run(ONLY_BY_ITS_GROUP, newest > group.at ? newest : group.at, newest > group.at ? newest : group.at, 'to the group', JSON.stringify({ body: words, sentBy: { kind: 'person', id: THE_PERSON }, toGroup: group.id, writtenIn: { project: 'default' } }))
  for (const one of db.prepare(`select id from records where kind = 'message'`).all() as { id: string }[]) theMessages.add(one.id)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await app.close()
  t.close()
})

/**
 * One request, with every statement it ran, and its answer without the line every reply of the office carries, which
 * says whether permission narrowed it (`sayWhetherPermissionNarrowedIt` in src/server/lib/http.ts).
 */
async function counted(url: string, headers: Record<string, string>) {
  ran.length = 0
  counting = true
  try {
    const reply = await app.inject({ method: 'GET', url, headers })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const answer = JSON.parse(reply.body) as Record<string, unknown>
    delete answer[NARROWED_BY_PERMISSION]
    return { statements: [...ran], answer }
  } finally {
    counting = false
  }
}


/** The narrowing read of the messages a reader sent: the one read that asks for a list of senders. */
const readsTheSendersOfAList = (one: Ran): boolean => one.sql.includes(`'$.sentBy.id') END) in (`) || one.sql.includes(`'$.sentBy.id') END) IN (`)

/** A statement that names an index of messages. */
const namesAMessageIndex = (one: Ran): boolean => new RegExp(A_NAMED_MESSAGE_INDEX.source, 'i').test(one.sql)

/** Every message the answer names anywhere in it, by id. */
function theMessagesNamedIn(answer: unknown): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (theMessages.has(value)) found.add(value)
    } else if (Array.isArray(value)) {
      for (const one of value) walk(one)
    } else if (value !== null && typeof value === 'object') {
      for (const one of Object.values(value)) walk(one)
    }
  }
  walk(answer)
  return [...found].sort()
}

/** The brief's size and the head's lines, as the brief says them. */
function theBriefsOwnWords(answer: Record<string, unknown>): { size: unknown; lines: string[] } {
  const brief = answer['brief'] as { size: unknown; head: string }
  return { size: brief.size, lines: brief.head.split('\n') }
}

describe("where-you-stand reads the messages it needs through their indexes", () => {
  for (const caller of ['person', 'secretary', 'agent'] as const) {
    it(`answers the ${caller} what the three doors answer alone, with no index of messages named`, async () => {
      // AFTER: where-you-stand as it is, worked out for this request.
      const after = await counted('/api/where-you-stand', headersOf[caller])
      const { workedOut, ...answer } = after.answer
      expect((workedOut as { kept: boolean }).kept, 'this answer was kept from an earlier request').toBe(false)
      // BEFORE: each of the three doors where-you-stand joins, asked alone, with each read of messages that names an
      // index read without it.
      const alone: Record<string, Awaited<ReturnType<typeof counted>>> = {}
      withoutTheMessageIndexes = true
      try {
        alone['brief'] = await counted('/api/brief', headersOf[caller])
        alone['waiting'] = await counted('/api/waiting', headersOf[caller])
        alone['openLoops'] = await counted('/api/open-loops', headersOf[caller])
      } finally {
        withoutTheMessageIndexes = false
      }
      const before = Object.fromEntries(Object.entries(alone).map(([part, reply]) => [part, reply.answer]))
      const statementsAlone = Object.values(alone).flatMap((reply) => reply.statements)
      // THE SAME PARTS, THE SAME SIZE AND THE SAME HEAD, as the code worked each out.
      expect(Object.keys(answer).sort(), 'the parts').toEqual(Object.keys(before).sort())
      expect(theBriefsOwnWords(answer).size, "the brief's size").toEqual(theBriefsOwnWords(before).size)
      expect(theBriefsOwnWords(answer).lines, "the head's lines").toEqual(theBriefsOwnWords(before).lines)
      // THE SAME MESSAGES, and then each part whole.
      expect(theMessagesNamedIn(answer), 'the messages named').toEqual(theMessagesNamedIn(before))
      for (const part of Object.keys(before)) expect(answer[part], part).toEqual(before[part])
      // BY INDEX: where-you-stand names the indexes of messages, and the doors asked alone named none.
      expect(after.statements.some(namesAMessageIndex), 'where-you-stand names an index of messages').toBe(true)
      expect(statementsAlone.filter(namesAMessageIndex).map((one) => one.sql.slice(0, 200))).toEqual([])
      // ONCE: where-you-stand asks once which messages an agent could be a party to, where the doors alone asked it more
      // than once; a reader of every message is narrowed by neither.
      const askedAlone = statementsAlone.filter(readsTheSendersOfAList).length
      expect(after.statements.filter(readsTheSendersOfAList).length, 'where-you-stand narrowed').toBe(Math.min(askedAlone, 1))
      if (caller === 'agent') expect(askedAlone, 'the doors alone narrowed').toBeGreaterThan(1)
      // AND THE NARROWING BY INDEX LOSES NO MESSAGE: what the reader may read of every message of the office, found
      // through it, is what the one rule makes the reader a party to.
      const { theMessageReader, theMessagesThisReaderMayRead, thePartiesOfMany } = await import('../src/server/lib/messages.ts')
      const { sameParticipant } = await import('../src/shared/messages.ts')
      const reader = theMessageReader({ type: headersOf[caller]['x-mole-office-actor-type'] ?? '', id: headersOf[caller]['x-mole-office-actor-id'] ?? '' })
      const every = [...theMessages]
      ran.length = 0
      counting = true
      let throughTheIndexes: string[]
      try {
        throughTheIndexes = [...theMessagesThisReaderMayRead(reader, every)].sort()
      } finally {
        counting = false
      }
      const who = reader.who
      const byTheRule = reader.readsEveryMessage
        ? [...every].sort()
        : [...thePartiesOfMany(every)].filter(([, parties]) => who !== null && parties.some((party) => sameParticipant(party, who))).map(([id]) => id).sort()
      expect(ran.filter(readsTheSendersOfAList).length, 'the narrowing was asked').toBe(reader.readsEveryMessage ? 0 : 1)
      expect(throughTheIndexes, 'the messages found through the narrowing').toEqual(byTheRule)
      if (caller === 'agent') expect([ONLY_BY_ITS_HANDLE, ONLY_BY_ITS_GROUP].filter((id) => !byTheRule.includes(id)), 'the agent is a party by the rule').toEqual([])
    })
  }



  it("counts a project's messages as every message of its view and no other, for every way into the view", async () => {
    const { aProjectCounted } = await import('../src/server/lib/records.ts')
    const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
    const { justThisProject } = await import('../src/shared/which-projects.ts')
    const { db } = await import('../src/server/db/client.ts')
    const { records } = await import('../src/server/db/schema.ts')
    for (const project of ['default', ELSEWHERE]) {
      const theRule = db
        .select({ id: records.id })
        .from(records)
        .where(and(eq(records.kind, 'message'), or(eq(records.workspaceId, project), messagesInTheViewOf(justThisProject(project))), isNull(records.deletedAt)))
        .all()
        .map((row) => row.id)
        .sort()
      const counted = [...aProjectCounted(project).messageIds].sort()
      expect(counted, project).toEqual(theRule)
    }
    // EACH WAY IN AND OUT IS THERE, so the comparison above covers it.
    const ofDefault = new Set(aProjectCounted('default').messageIds)
    expect([0, 1, 2, 3, 6, 9, 10].map((i) => ofDefault.has(`made-up-way-${String(i).padStart(2, '0')}`))).toEqual([true, true, true, true, true, true, true])
    expect([4, 5, 7, 8].map((i) => ofDefault.has(`made-up-way-${String(i).padStart(2, '0')}`))).toEqual([false, false, false, false])
  })
})
