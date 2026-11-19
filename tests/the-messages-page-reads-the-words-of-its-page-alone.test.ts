// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGES PAGE READS THE WORDS OF THE MESSAGES IT SHOWS AND OF NO OTHER, AND ITS PAGE IS THE SAME PAGE.
 *
 * Round 89 of wave 13y, item 20 of the line's list. The Messages page asks `GET /api/messages?limit=50&offset=0`. On a
 * made-up office of the live size and shape (tools/build-a-made-up-office.ts) that read took a median of 808.7 ms of 9
 * at 2fe5fac4c. The door built every message of the office whole, with its words and its delivery rows, and then kept
 * fifty of them. A page with no narrowing now reads the ids of every message, to count them, and the reader's own
 * delivery rows, to count what the reader has not read. Only the messages on the page are read whole.
 *
 * Three cases:
 *
 * 1. THE WORDS READ. A page with no narrowing takes out of the database the stored data of the messages on the page,
 *    and of no other message. The count is of messages whose stored data came back from any statement while the door
 *    answered, found by the stored text itself, so no way of reading it can be missed. Red before round 89, when every
 *    message's data came back.
 * 2. THE PAGE, FOR THE PERSON. Each page is, entry for entry, the same part of what the door answers with no page
 *    asked, and its numbers are that answer's: `total` and `matched` are how many messages it holds, `unreadForYou` how
 *    many of them hold a delivery to the person that is not `seen`, and `left`, `truncated` and `next` follow from them.
 *    The pages asked are the first, one that starts inside a run of messages sharing one stamp, the last, one past
 *    the end, and one without the words. Four messages share the stamp of the fiftieth newest and are stored in the
 *    opposite order to their ids, so the order of a tie decides what is on each page. Three messages are deleted: the
 *    newest, one in the middle and the oldest.
 * 3. THE PAGE, FOR AN AGENT. The same, for an agent, who may read only the messages it is a party to.
 *
 * MUTATIONS, each red here:
 *   1. Build every message of the pool and cut the page from it, as before round 89: case 1 is red.
 *   2. Break a tie in the read of the page's ids by the id, not by the order stored: case 2 is red.
 *   3. Leave the deleted messages in the read of the page's ids: case 2 is red.
 *   4. Give each message the page counts no delivery rows: cases 2 and 3 are red on `unreadForYou`.
 *   5. Leave out the step that keeps only the messages this reader may read: case 3 is red.
 *   6. Hand back the page's messages in the order the database gives them, not in the order of their ids: case 2 is red.
 *
 * The office is a small one of the live office's shape, made by tests/the-chat-office-of-the-live-shape.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { buildTheChatOffice, type Shape } from './the-chat-office-of-the-live-shape.ts'

const SMALL: Shape = {
  agents: 40,
  retired: 10,
  theConversation: 150,
  otherContacts: 15,
  otherPersonMessages: 80,
  betweenAgents: 300,
  groups: 4,
  groupsWithThePerson: 2,
  membersPerGroup: 4,
  groupMessages: 80,
  officeLines: 40,
  sessions: 120,
  otherRecords: 60,
}

/** The four messages that share one stamp, in the order they are stored: each id sorts before the one stored ahead of it. */
const THE_TIES = ['zz-a-tie-3', 'zz-a-tie-2', 'zz-a-tie-1', 'aa-a-tie-0'] as const

const PAGE = 50
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

let t: TestDb
let app: FastifyInstance
/** The agent whose conversation with the person the office is built around. */
let theAgent = ''
/** Every message's stored data, as the text the database holds, and the message it belongs to. */
const theMessageOf = new Map<string, string>()
/** Set while one request is answered; the messages whose stored data came back from a statement meanwhile. */
let counting = false
const wordsRead = new Set<string>()

/** Notes every message whose stored data is among the values a statement handed back. */
function look(out: unknown): void {
  const one = (value: unknown): void => {
    if (typeof value !== 'string') return
    const id = theMessageOf.get(value)
    if (id !== undefined) wordsRead.add(id)
  }
  const row = (value: unknown): void => {
    if (Array.isArray(value)) for (const cell of value) one(cell)
    else if (value !== null && typeof value === 'object') for (const cell of Object.values(value)) one(cell)
    else one(value)
  }
  if (Array.isArray(out)) for (const each of out) row(each)
  else row(out)
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE WATCH GOES IN BEFORE THE SERVER IS LOADED, so no statement it prepares is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const out = run.apply(this, args)
        if (counting) look(out)
        return out
      }
    }
    const iterate = statement['iterate'] as ((...args: unknown[]) => Iterable<unknown>) | undefined
    if (typeof iterate === 'function') {
      statement['iterate'] = function* (this: unknown, ...args: unknown[]) {
        for (const each of iterate.apply(this, args)) {
          if (counting) look(each)
          yield each
        }
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  theAgent = buildTheChatOffice(t.client.sqlite, THE_PERSON, SMALL).theAgent
  const db = t.client.sqlite
  // THE TIES: copies of a message to the person, each with words of its own, at the stamp of the fiftieth newest message.
  const model = (
    db
      .prepare(
        `select id from records where kind = 'message' and id in (select message_id from message_delivery where recipient_kind = 'person' and recipient_id = ?) order by rowid limit 1`,
      )
      .get(THE_PERSON) as { id: string }
  ).id
  const stamp = (
    db
      .prepare(`select created_at as at from records where kind = 'message' and workspace_id = 'message-centre' and deleted_at is null order by created_at desc, rowid limit 1 offset ?`)
      .get(PAGE - 1) as { at: string }
  ).at
  const copy = db.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     select ?, workspace_id, owner_id, ?, ?, kind, title, summary, json_set(data, '$.body', ?), null, origin from records where id = ?`,
  )
  const copyDeliveries = db.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by)
     select ? || id, ?, recipient_kind, recipient_id, 'queued', ?, because, run, inferred_by from message_delivery where message_id = ?`,
  )
  for (const id of THE_TIES) {
    copy.run(id, stamp, stamp, `The words of ${id}.`, model)
    copyDeliveries.run(`${id}-`, id, stamp, model)
  }
  // THREE DELETED MESSAGES: the newest, one in the middle and the oldest.
  const live = db
    .prepare(`select id from records where kind = 'message' and workspace_id = 'message-centre' and deleted_at is null order by created_at desc, rowid`)
    .all() as { id: string }[]
  const remove = db.prepare(`update records set deleted_at = updated_at where id = ?`)
  for (const at of [0, Math.floor(live.length / 2), live.length - 1]) remove.run(live[at]!.id)
  // SOME MADE-UP MESSAGES STORE THE SAME DATA, and the count finds a message by its stored data, so each repeat gets its id
  // after its words.
  const seen = new Set<string>()
  const reword = db.prepare(`update records set data = json_set(data, '$.body', json_extract(data, '$.body') || ?) where id = ?`)
  for (const row of db.prepare(`select id, data from records where kind = 'message' order by rowid`).all() as { id: string; data: string }[]) {
    if (seen.has(row.data)) reword.run(` (${row.id})`, row.id)
    seen.add(row.data)
  }
  for (const row of db.prepare(`select id, data from records where kind = 'message'`).all() as { id: string; data: string }[]) {
    theMessageOf.set(row.data, row.id)
  }
  expect(theMessageOf.size, 'two messages store the same data, so the words read cannot be told apart').toBe(
    (db.prepare(`select count(*) as n from records where kind = 'message'`).get() as { n: number }).n,
  )
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

interface Answer {
  messages: { id: string; deliveries: { to: { kind: string; id: string }; mark: string }[] }[]
  total?: number
  matched?: number
  returned?: number
  left?: number
  truncated?: boolean
  next?: string | null
  unreadForYou?: number
  workspaceId: string
}

async function ask(url: string, headers: Record<string, string>): Promise<Answer> {
  const reply = await app.inject({ method: 'GET', url, headers })
  expect(reply.statusCode, `${url}: ${reply.body.slice(0, 400)}`).toBe(200)
  return reply.json() as Answer
}

/**
 * Every page asked of the door, held to the same part of what the door answers with no page asked. `who` is the
 * reader the unread count is about.
 */
async function everyPageAgrees(headers: Record<string, string>, who: { kind: string; id: string }): Promise<void> {
  const whole = await ask('/api/messages?full=1', headers)
  const unread = whole.messages.filter((one) => one.deliveries.some((d) => d.to.kind === who.kind && d.to.id === who.id && d.mark !== 'seen')).length
  expect(whole.messages.length, 'the office is too small to need a second page').toBeGreaterThan(2 * PAGE)
  const tieAt = whole.messages.findIndex((one) => (THE_TIES as readonly string[]).includes(one.id))
  const offsets = [0, tieAt === -1 ? PAGE - 2 : tieAt + 1, Math.floor(whole.messages.length / PAGE) * PAGE, whole.messages.length + 5]
  for (const offset of offsets) {
    const page = await ask(`/api/messages?limit=${String(PAGE)}&offset=${String(offset)}&full=1`, headers)
    const expected = whole.messages.slice(offset, offset + PAGE)
    const left = Math.max(0, whole.messages.length - offset - expected.length)
    expect(page.messages, `the page at ${String(offset)} is not that part of the whole pool`).toEqual(expected)
    expect(
      { total: page.total, matched: page.matched, returned: page.returned, left: page.left, truncated: page.truncated, unreadForYou: page.unreadForYou },
      `the numbers of the page at ${String(offset)}`,
    ).toEqual({ total: whole.messages.length, matched: whole.messages.length, returned: expected.length, left, truncated: left > 0, unreadForYou: unread })
    expect(page.workspaceId).toBe(whole.workspaceId)
    if (left === 0) expect(page.next).toBeNull()
    else {
      const next = await ask(String(page.next).replace(/^GET /, ''), headers)
      expect(next.messages, `the page after ${String(offset)}`).toEqual(whole.messages.slice(offset + PAGE, offset + 2 * PAGE))
    }
  }
  // AND NARROW, which answers each entry's id, title and wordsMayChangeUntil, and the same numbers.
  const narrow = await ask(`/api/messages?narrow=1`, headers)
  const narrowPage = await ask(`/api/messages?narrow=1&limit=${String(PAGE)}&offset=${String(PAGE)}`, headers)
  expect(narrowPage.messages).toEqual(narrow.messages.slice(PAGE, 2 * PAGE))
  expect(narrowPage.unreadForYou).toBe(unread)
}

describe('the Messages page reads the words of its page alone', () => {
  it('takes out of the database the stored data of the messages on the page, and of no other message', async () => {
    wordsRead.clear()
    counting = true
    let page: Answer
    try {
      page = await ask(`/api/messages?limit=${String(PAGE)}&offset=${String(PAGE)}`, PERSON)
    } finally {
      counting = false
    }
    expect(page.messages.length).toBe(PAGE)
    expect([...wordsRead].sort(), 'the messages whose stored data was read').toEqual(page.messages.map((one) => one.id).sort())
  })

  it('answers the person each page as that part of the whole pool, with the whole pool\'s numbers', async () => {
    const unreadSomewhere = await ask('/api/messages?only=waiting-for-me', PERSON)
    expect(unreadSomewhere.messages.length, 'the person has nothing unread, so the unread count proves nothing').toBeGreaterThan(0)
    await everyPageAgrees(PERSON, { kind: 'person', id: THE_PERSON })
  })

  it('answers an agent each page as that part of the messages it may read', async () => {
    const whole = await ask('/api/messages', asAgent(theAgent))
    const everything = await ask('/api/messages', PERSON)
    expect(whole.messages.length, 'the agent reads every message, so the step that leaves some out is not asked').toBeLessThan(everything.messages.length)
    await everyPageAgrees(asAgent(theAgent), { kind: 'agent', id: theAgent })
  })
})
