// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S TWO READS TAKE OUT OF THE DATABASE ONLY THE ROWS THEIR ANSWER NEEDS.
 *
 * Round 33 of wave 13n. The person felt the chat lag, and the live log showed GET
 * /api/messages/conversation at a median of 554 ms and GET /api/messages/contacts at 419 ms. Measured
 * on a made-up office of the live shape (tests/the-chat-office-of-the-live-shape.ts), the
 * conversation read every message of every project, every delivery row, and every run record three
 * times, to answer about one conversation. When it marked anything delivered, it did all of that a
 * second time. The contacts read every run record to name the tool of a few hundred runs.
 *
 * WHAT THIS FILE COUNTS. Every row a request takes out of the `records` table: messages, runs, and
 * anything else. It is counted at the database, by wrapping every statement prepared during the
 * request, so no reader can be missed. The office here is a small one of the same mix: 900 messages
 * between agents the person is in neither side of, and 500 runs, against about 250 messages that
 * concern the person.
 *
 * AND NO STATEMENT WALKS A WHOLE KIND. The plan SQLite makes for each statement of the request is
 * read, and no step may walk the whole `records` table, or every record of one kind or one project
 * through their indexes. A read can return few rows and still look at every message to choose them;
 * this is what catches that.
 *
 * THE BOUND. A request may read the messages that concern the person or the agent (a delivery row to
 * the person, or a stored sender that is one of the two), the runs those messages name, and the runs
 * that serve the agent. The test works that number out from the database with its own query, so it
 * does not depend on the code it checks. A read of every message, or of every run, is far above it.
 *
 * THE CONTACTS READ ALSO READS THE RUNS THE DOTS READ, since wave 13y round 91 (item 22). Its rows say which
 * contacts are online, from the dots of the page's project. Those dots read every run of the project that has
 * not ended, and every run holding a message to hand over. So the contacts bound adds those runs, counted by
 * the test's own query on the same two conditions. The count is not taken from the presence code, so the bound
 * does not follow whatever that code reads. If that code comes to read more runs than these, the case is red.
 * The office holds at least 200 runs that have ended and hold nothing, and the case checks that, so a door that
 * read every run would be far over the bound. Counted on their own before the change: the door read 161 rows
 * before round 91, which was the bound, and 361 after. The 200 more are the dots' runs, which the presence
 * code's own reader also counts as 200. On the made-up office of the live shape, the person's contacts read
 * took a median of 184 ms before round 91 and 193 ms after, in five passes of eleven takes, before and after
 * taking turns. A second measurement, of six passes on a busier machine, gave 203 ms and 214 ms.
 *
 * AND THE ANSWER IS THE ONE THE WHOLE POOL GIVES. The conversation in the reply is compared, as JSON,
 * with `conversationBetween` given every message of every project, which is what the door read
 * before. The office holds a notice about a message, routed messages, group lines of the agent
 * naming the person, and messages written in the same minute.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green. MUTATION 1:
 * `conversationBetween` reads the whole pool again by default, and the conversation case is red.
 * MUTATION 2: `whatTheProjectSays` reads every run again, and the contacts case is red. MUTATION 3:
 * the conversation door reads the whole conversation again after marking, and the marking case is
 * red. RESTORE green, checked with cmp against a saved copy. MUTATION 4, round 91 of wave 13y: the dots read
 * every run of the project, and the contacts case is red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { buildTheChatOffice, type Shape, type TheChatOffice } from './the-chat-office-of-the-live-shape.ts'

/** A small office of the live mix: most messages and most runs are none of the person's business. */
const SHAPE: Shape = {
  agents: 120,
  retired: 60,
  theConversation: 60,
  otherContacts: 12,
  otherPersonMessages: 36,
  betweenAgents: 900,
  groups: 6,
  groupsWithThePerson: 3,
  membersPerGroup: 5,
  groupMessages: 60,
  officeLines: 40,
  sessions: 500,
  otherRecords: 300,
}

/** One page, as the paged case asks for it. */
const PAGE = 10
/**
 * WHAT ONE PAGE MAY TAKE FROM `records`: three windows of rows a little larger than the page, the runs
 * those name, and the messages their notices name. A build of the whole conversation, about 165
 * rows here, is over it.
 */
const A_PAGE_MAY_READ = 100

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let office: TheChatOffice
let M: typeof import('../src/server/lib/messages.ts')
let W: typeof import('../src/shared/which-projects.ts')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  office = buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE)
  M = await import('../src/server/lib/messages.ts')
  W = await import('../src/shared/which-projects.ts')
})
afterAll(async () => {
  await app.close()
  t.close()
})

interface WhatARequestRead {
  /** Rows taken out of `records`, by every statement whose first table is `records`. */
  records: number
  /**
   * Each step of SQLite's plan, for any statement of the request, that walks the whole `records`
   * table or every record of one kind or one project. Such a step reads every message or every run.
   */
  wholeReads: string[]
  body: Record<string, unknown>
}

/**
 * A plan step that walks all of `records`, or all of one kind or one project. The project's index
 * asked for a range of deletion times reads only the records deleted in it, so that is not one.
 */
const A_WHOLE_READ = /SCAN records\b|records_kind_idx|records_live_idx \(workspace_id=\?(?: AND deleted_at=\?)?\)/

/** Runs one request and counts the rows every statement prepared during it took from `records`. */
async function rowsReadBy(url: string): Promise<WhatARequestRead> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  let records = 0
  const asked: { text: string; args: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    const table = /\bfrom\s+"?([a-z_]+)"?/i.exec(text)?.[1]
    if (table === 'records') {
      // `all` and `get` are the two reads the chat's readers use, through drizzle or by hand.
      for (const method of ['all', 'get'] as const) {
        const read = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          asked.push({ text, args })
          const out = read.apply(this, args)
          // `get` gives one row or none; in drizzle's raw mode that one row is a list of its columns.
          if (method === 'get') records += out === undefined ? 0 : 1
          else records += (out as unknown[]).length
          return out
        }
      }
    }
    return statement
  }
  let reply
  try {
    reply = await app.inject({ method: 'GET', url, headers: PERSON })
  } finally {
    sqlite.prepare = original
  }
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  const wholeReads: string[] = []
  for (const { text, args } of asked) {
    const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${text}`).all(...args) as { detail: string }[]
    for (const step of plan) if (A_WHOLE_READ.test(step.detail)) wholeReads.push(`${step.detail} in: ${text.slice(0, 120)}`)
  }
  return { records, wholeReads, body: reply.json() as Record<string, unknown> }
}

/**
 * HOW MANY RECORDS A CHAT READ ABOUT THESE SENDERS MAY TAKE, worked out here with a query of its own:
 * the live messages with a delivery row to the person or a stored sender among `senders`, the runs
 * those messages name, and, when `servedAgent` is given, the runs that serve it.
 */
function theBound(senders: readonly string[], servedAgent: string | null): number {
  const db = t.client.sqlite
  const placeholders = senders.map(() => '?').join(', ')
  const concern = `SELECT r.id, r.data FROM records r WHERE r.kind = 'message' AND r.deleted_at IS NULL AND (
      r.id IN (SELECT message_id FROM message_delivery WHERE recipient_kind = 'person' AND recipient_id = ?)
      OR json_extract(r.data, '$.sentBy.id') IN (${placeholders}))`
  const messages = (db.prepare(`SELECT count(*) AS n FROM (${concern})`).get(THE_PERSON, ...senders) as { n: number }).n
  const runsNamed = (
    db.prepare(`SELECT count(DISTINCT json_extract(data, '$.fromRun')) AS n FROM (${concern})`).get(THE_PERSON, ...senders) as { n: number }
  ).n
  const runsServing =
    servedAgent === null
      ? 0
      : (
          db
            .prepare(`SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgentId') = ?`)
            .get(servedAgent) as { n: number }
        ).n
  return messages + runsNamed + runsServing
}

/** The runs of one project that have not ended: their state is none of finished, crashed, paused and orphaned. */
const NOT_ENDED = `coalesce(json_extract(data, '$.state') NOT IN ('finished', 'crashed', 'paused', 'orphaned'), 1)`
/** The runs of one project that hold a message to hand over. */
const HOLDS_A_MESSAGE = `coalesce(json_extract(data, '$.deliveringMessage') > '', 0)`

/** How many live runs of one project the condition keeps, by the test's own query. */
function runsOf(project: string, condition: string): number {
  return (
    t.client.sqlite
      .prepare(`SELECT count(*) AS n FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL AND (${condition})`)
      .get(project) as { n: number }
  ).n
}

/** Every message and every run in the office, so a whole-table read is plainly over the bound. */
function everyMessageAndRun(): number {
  return (t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind IN ('message', 'session')`).get() as { n: number }).n
}

describe('GET /api/messages/conversation on an office where most rows are none of the person\'s business', () => {
  it('reads only the messages and runs that can concern the person and the agent, and answers what the whole pool answers', async () => {
    const bound = theBound([THE_PERSON, office.theAgent], office.theAgent)
    expect(bound, 'the office is built so that a whole-table read is far over the bound').toBeLessThan(everyMessageAndRun() / 3)
    const read = await rowsReadBy(`/api/messages/conversation?kind=agent&id=${office.theAgent}`)
    expect(read.records, `rows taken from records; the bound is ${String(bound)}`).toBeLessThanOrEqual(bound)
    expect(read.wholeReads, 'no statement walks every message, every run or every record').toEqual([])

    // THE SAME ANSWER AS THE WHOLE POOL, which is what the door read before.
    const me = { kind: 'person' as const, id: THE_PERSON }
    const them = { kind: 'agent' as const, id: office.theAgent }
    const whole = M.conversationBetween(me, them, W.EVERY_PROJECT, M.everybodyRegistered(), M.everyMessageOfTheProjects(W.EVERY_PROJECT))
    const expected = M.onlyTheMessagesThisReaderMayRead(M.theMessageReader({ type: 'human', id: THE_PERSON }), whole.messages)
    const answered = read.body['messages'] as { id: string }[]
    expect(answered.length, 'the conversation holds the measured agent\'s messages and its group lines naming the person').toBeGreaterThan(SHAPE.theConversation)
    expect(JSON.stringify(answered)).toBe(JSON.stringify(expected))
  })

  it('reads the conversation once when it marks messages delivered, and reads again only the ones it moved', async () => {
    const moved = t.client.sqlite
      .prepare(
        `UPDATE message_delivery SET mark = 'queued' WHERE id IN (
           SELECT d.id FROM message_delivery d JOIN records r ON r.id = d.message_id
            WHERE d.recipient_kind = 'person' AND d.recipient_id = ? AND json_extract(r.data, '$.sentBy.id') = ?
              AND json_extract(r.data, '$.toGroup') IS NULL
            ORDER BY r.created_at DESC LIMIT 3)`,
      )
      .run(THE_PERSON, office.theAgent).changes
    expect(moved, 'three of the agent\'s messages wait for the person again').toBe(3)
    // FOUR MORE ROWS FOR EACH MESSAGE MOVED: the message read again for the reply and the run it
    // names, and the two rows the mark itself reads to tell the pages (its project, and its parties).
    const bound = theBound([THE_PERSON, office.theAgent], office.theAgent) + moved * 4
    const read = await rowsReadBy(`/api/messages/conversation?kind=agent&id=${office.theAgent}`)
    expect((read.body['markedDelivered'] as string[]).length, 'the door moved the three').toBe(3)
    expect(read.records, `rows taken from records; the bound is ${String(bound)}`).toBeLessThanOrEqual(bound)
    expect(read.wholeReads, 'no statement walks every message, every run or every record').toEqual([])
    const marks = (read.body['messages'] as { id: string; deliveries: { to: { id: string }; mark: string }[] }[])
      .filter((one) => (read.body['markedDelivered'] as string[]).includes(one.id))
      .map((one) => one.deliveries.find((row) => row.to.id === THE_PERSON)?.mark)
    expect(marks, 'the reply shows the new marks').toEqual(['delivered', 'delivered', 'delivered'])
  })
})

describe('GET /api/messages/conversation one page at a time, on the same office', () => {
  it('builds a page from that page\'s rows alone, and gives the same messages as that piece of a whole read', async () => {
    const url = `/api/messages/conversation?kind=agent&id=${office.theAgent}`
    const whole = ((await rowsReadBy(url)).body['messages'] as { id: string }[]).map((one) => one.id)
    expect(whole.length, 'the conversation is many pages long').toBeGreaterThan(PAGE * 5)
    // WHEN A PAGE WAS LAST READ, as the chat sends it back: what changed since then is asked for too.
    const readAt = ((await rowsReadBy(`${url}&limit=${String(PAGE)}`)).body['page'] as { readAt: string }).readAt
    const pages = [
      { what: 'the newest page', query: `&limit=${String(PAGE)}`, expected: whole.slice(-PAGE) },
      { what: 'the page before', query: `&limit=${String(PAGE)}&before=${whole.at(-PAGE)!}`, expected: whole.slice(-2 * PAGE, -PAGE) },
      { what: 'what came after', query: `&limit=${String(PAGE)}&after=${whole.at(-3)!}&since=${encodeURIComponent(readAt)}`, expected: whole.slice(-2) },
    ]
    for (const { what, query, expected } of pages) {
      const read = await rowsReadBy(url + query)
      expect((read.body['messages'] as { id: string }[]).map((one) => one.id), what).toEqual(expected)
      expect(read.records, `${what}: rows taken from records; the bound is ${String(A_PAGE_MAY_READ)}`).toBeLessThanOrEqual(A_PAGE_MAY_READ)
      expect(read.wholeReads, `${what}: no statement walks every message, every run or every record`).toEqual([])
    }
  })
})

describe('GET /api/messages/contacts on the same office', () => {
  it('reads only the messages that concern the person, the runs they name, and the runs the dots read', async () => {
    expect(runsOf('default', `NOT (${NOT_ENDED} OR ${HOLDS_A_MESSAGE})`), 'runs that have ended and hold nothing').toBeGreaterThanOrEqual(200)
    const bound = theBound([THE_PERSON], null) + runsOf('default', `${NOT_ENDED} OR ${HOLDS_A_MESSAGE}`)
    const read = await rowsReadBy('/api/messages/contacts')
    expect((read.body['contacts'] as unknown[]).length, 'every registered agent is a row').toBeGreaterThan(SHAPE.agents - SHAPE.retired)
    expect(read.records, `rows taken from records; the bound is ${String(bound)}`).toBeLessThanOrEqual(bound)
    expect(read.wholeReads, 'no statement walks every message, every run or every record').toEqual([])
  })
})
