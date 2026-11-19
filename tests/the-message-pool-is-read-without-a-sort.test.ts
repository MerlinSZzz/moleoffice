// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE POOL IS READ WITHOUT A SORT IN SQLITE, AND IT IS THE SAME POOL, BYTE FOR BYTE.
 *
 * Round 40 of wave 13y divided GET /api/worker/queue into its parts on a made-up database of the live office's size and
 * shape (tools/build-a-made-up-office.ts). Outside the reading of each recipient, the largest part was the read of every
 * message, `everyMessageOfTheProjects`: about 377 ms of an ask of about 1.3 s, and 122 MB of the 254 MB the ask read, on
 * that made-up database. A large share of it was SQLite sorting 25,188 whole message rows by their stamp in a temporary
 * B-tree, which writes the rows out to a temporary file and reads them back. The pool now reads its rows unsorted, with
 * their rowid, and sorts them itself by `earlierPlaceFirst`: the stamp, then the order the rows were stored in. That is
 * the order every page of a conversation already reads.
 *
 * ROUND 47 OF WAVE 13Y GIVES THE QUEUE ITS OWN READ OF THE POOL, `everyMessageOfTheProjectsForTheQueue`. The queue sorts
 * the pool into conversations and counts each one's turns by sender. The only words it reads are those of a message sent
 * to a group, to find whom the message @s. So its read takes a message's stored data without the body when the message
 * names no group, and the entry says so with a body of null. On the made-up database the whole pool's rows came to
 * 76 MiB of heap and the rows without those bodies to 25 to 27 MiB (round 46). Cases 4 and 5 are about that read.
 *
 * ROUND 49 BUILDS EACH OF THE QUEUE'S ENTRIES ONLY AS FAR AS THE SORT INTO CONVERSATIONS READS IT. The whole entry also
 * reads the runs its messages name, each sender's registry row and the project's edit window, and the sort reads none
 * of them. Cases 4 and 6 are about that.
 *
 * Six cases:
 *
 * 1. THE ORDER. The pool is every live message of the message centre, by stamp and then by the order stored. Four
 *    messages that share a stamp with one the office already holds are added in the opposite order to their ids, so
 *    the second key decides something. The read before sorted by the stamp alone and left a tie in the order SQLite met
 *    the rows, which was the stored order, so it passes this case as well. MUTATION: break a tie by id, or leave the
 *    rows unsorted, and this case is red.
 * 2. THE ENTRIES. Every entry is, byte for byte, the message `readMessageWhereverItIs` builds from that one row, with
 *    the mark `entry: 'message'` the pool adds. The single read takes its deliveries and its runs by itself, so the
 *    pool's reading of them in bulk is held to the same answer. MUTATION: build the pool's entries with no run named,
 *    and this case is red.
 * 3. THE COST. The statement that reads the pool's rows has no "TEMP B-TREE" in its plan. This case was red on the
 *    code before round 40. MUTATION: put the ORDER BY back, and this case is red.
 * 4. THE QUEUE'S READ. The statement that reads the queue's rows, run again, gives back each message's stored data with
 *    the body only for a message sent to a group, and every other stored field as stored. Each entry holds the fields
 *    the sort into conversations reads and no other: the id, the sender, the typed sender, who it reached, the group,
 *    the message a notice is about, and the words. Each is what the whole pool's entry holds, with a body of null for a
 *    message sent to no group, and a routed message carries the same list beside them. Both pools sort into the same
 *    conversations, for every pair a message names and every group, and the pair of the person and the measured agent
 *    holds a group line that @s the person, which is found from its words. MUTATION: read every body, keep the body
 *    empty instead of null, read no group message's body, or build a field the sort does not read, and this case is red.
 * 5. THE REFUSAL. Sorting a pool refuses a message sent to a group whose words were not read, and names the message.
 *    MUTATION: read such a message as if it had no words, and this case is red.
 * 6. WHAT THE QUEUE'S READ RUNS. It runs the select of its rows and the reads of their delivery rows, and no other
 *    statement. The whole pool's read runs more, among them the read of the runs its messages name, so the case asks
 *    about something. Red before round 49, when the queue's entries were built whole. MUTATION: read what the whole entry
 *    reads about the project (`whatTheProjectSays`) in the queue's read, and this case is red.
 *
 * HOW THE STATEMENT IS FOUND: the database's `prepare` is replaced before the server's readers are loaded, so every
 * statement run while the pool is read is written down with what it was asked with. The pool's read is the one among
 * them, over `records` and asked for the kind `message`, that gives back as many rows as the pool has entries.
 *
 * The office is a small one of the live office's shape, made by tests/the-chat-office-of-the-live-shape.ts.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { buildTheChatOffice, type Shape } from './the-chat-office-of-the-live-shape.ts'
import { moleOffice, type ParticipantRef } from '../src/shared/participants.ts'

const SMALL: Shape = {
  agents: 60,
  retired: 20,
  theConversation: 200,
  otherContacts: 20,
  otherPersonMessages: 100,
  betweenAgents: 600,
  groups: 4,
  groupsWithThePerson: 2,
  membersPerGroup: 4,
  groupMessages: 100,
  officeLines: 50,
  sessions: 300,
  otherRecords: 200,
}

/** The four added messages, in the order they are stored: each id sorts before the one stored ahead of it. */
const THE_TIES = ['zz-a-tie-3', 'zz-a-tie-2', 'zz-a-tie-1', 'aa-a-tie-0'] as const

/** The fields of a message the sort into conversations reads (`theConversationsOfOnePool`), and so all the queue's read builds. */
const THE_FIELDS_THE_SORT_READS = ['id', 'sentBy', 'from', 'to', 'toGroup', 'aboutMessage', 'body'] as const

interface Ran { sql: string; params: unknown[] }

let t: TestDb
// THE SERVER'S OWN READERS, loaded after the test database is open: loading them opens a database.
let messages: typeof import('../src/server/lib/messages.ts')
/** The agent whose group lines @ the person (tests/the-chat-office-of-the-live-shape.ts). */
let theAgent = ''
/** Every statement run while `counting` is set, with what it was asked with. */
let counting = false
const ran: Ran[] = []

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE READERS ARE LOADED, so no statement they run is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'run', 'iterate', 'values'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (counting) ran.push({ sql: text, params: args })
        return run.apply(this, args)
      }
    }
    return statement
  }
  messages = await import('../src/server/lib/messages.ts')
  theAgent = buildTheChatOffice(t.client.sqlite, THE_PERSON, SMALL).theAgent
  // THE TIES: copies of a message that names its run, at the stamp of a message in the middle of the office.
  const db = t.client.sqlite
  const model = (db.prepare(`select id from records where kind = 'message' and json_extract(data, '$.fromRun') is not null order by rowid limit 1`).get() as { id: string }).id
  const stamp = (db.prepare(`select created_at as at from records where kind = 'message' order by rowid limit 1 offset 600`).get() as { at: string }).at
  const copy = db.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     select ?, workspace_id, owner_id, ?, ?, kind, title, summary, data, null, origin from records where id = ?`,
  )
  const copyDeliveries = db.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by)
     select ? || id, ?, recipient_kind, recipient_id, mark, ?, because, run, inferred_by from message_delivery where message_id = ?`,
  )
  for (const id of THE_TIES) {
    copy.run(id, stamp, stamp, model)
    copyDeliveries.run(`${id}-`, id, stamp, model)
  }
}, 120_000)

afterAll(() => {
  t.close()
})

/** The ids of the live messages of the message centre, oldest first, the second key breaking a tie. */
function storedIds(second: 'rowid' | 'id'): string[] {
  const rows = t.client.sqlite
    .prepare(`select id from records where workspace_id = 'message-centre' and kind = 'message' and deleted_at is null order by created_at, ${second}`)
    .all() as { id: string }[]
  return rows.map((one) => one.id)
}

/** The pool of every project, with every statement its read ran. */
function thePoolCounted(): { pool: ReturnType<typeof messages.everyMessageOfTheProjects>; statements: Ran[] } {
  ran.length = 0
  counting = true
  try {
    return { pool: messages.everyMessageOfTheProjects(messages.EVERY_PROJECT), statements: [...ran] }
  } finally {
    counting = false
  }
}

/** The queue's pool of every project, with every statement its read ran. */
function theQueuesPoolCounted(): { pool: ReturnType<typeof messages.everyMessageOfTheProjectsForTheQueue>; statements: Ran[] } {
  ran.length = 0
  counting = true
  try {
    return { pool: messages.everyMessageOfTheProjectsForTheQueue(messages.EVERY_PROJECT), statements: [...ran] }
  } finally {
    counting = false
  }
}

it('the pool is every live message by its stamp and then by the order it was stored in', () => {
  const { pool } = thePoolCounted()
  const stored = storedIds('rowid')
  // THE SECOND KEY DECIDES SOMETHING HERE: a tie broken by id gives another order.
  expect(storedIds('id')).not.toEqual(stored)
  const at = stored.indexOf(THE_TIES[0])
  expect(stored.slice(at, at + THE_TIES.length)).toEqual([...THE_TIES])
  expect(pool.map((one) => one.id)).toEqual(stored)
}, 60_000)

it('every entry of the pool is, byte for byte, the message one read of its row builds', () => {
  const { pool } = thePoolCounted()
  expect(pool.length).toBeGreaterThan(1_000)
  // THE ENTRIES CARRY WHAT THE BULK READS READ: deliveries, and the tool of the run a message names.
  expect(pool.filter((one) => one.deliveries.length > 0).length).toBeGreaterThan(1_000)
  expect(pool.some((one) => one.ranBy !== null)).toBe(true)
  const differs = pool.filter((one) => JSON.stringify(one) !== JSON.stringify({ ...messages.readMessageWhereverItIs(one.id).message, entry: 'message' }))
  expect(differs.map((one) => one.id)).toEqual([])
}, 60_000)

it("the statement that reads the pool's rows asks SQLite for no sort", () => {
  const { pool, statements } = thePoolCounted()
  const db = t.client.sqlite
  const theRead = statements.filter(
    (one) => one.sql.includes('from "records"') && one.params.includes('message') && (db.prepare(one.sql).all(...one.params) as unknown[]).length === pool.length,
  )
  expect(theRead.map((one) => one.sql)).toHaveLength(1)
  const plan = (db.prepare(`EXPLAIN QUERY PLAN ${theRead[0]!.sql}`).all(...theRead[0]!.params) as { detail: string }[]).map((one) => one.detail).join('\n')
  expect(plan, `The plan of the pool's read:\n${plan}`).not.toContain('TEMP B-TREE')
}, 60_000)

it("the queue's read takes the words only of a message sent to a group, and is otherwise the same pool", () => {
  const { pool: whole } = thePoolCounted()
  const { pool: queues, statements } = theQueuesPoolCounted()
  const db = t.client.sqlite
  const stored = new Map(
    (db.prepare(`select id, data from records where kind = 'message'`).all() as { id: string; data: string }[]).map((one) => [
      one.id,
      JSON.parse(one.data) as Record<string, unknown>,
    ]),
  )
  const sentToAGroup = (id: string): boolean => typeof stored.get(id)?.['toGroup'] === 'string'
  // THE READ ITSELF, found as case 3 finds the whole pool's and run again: the body comes back only for a message sent
  // to a group, and every other stored field comes back as stored.
  const theRead = statements.filter(
    (one) => one.sql.includes('from "records"') && one.params.includes('message') && (db.prepare(one.sql).all(...one.params) as unknown[]).length === queues.length,
  )
  expect(theRead.map((one) => one.sql)).toHaveLength(1)
  const rows = db.prepare(theRead[0]!.sql).all(...theRead[0]!.params) as { id: string; data: string }[]
  const toAGroup = rows.filter((row) => sentToAGroup(row.id))
  expect(toAGroup.length, 'messages sent to a group').toBeGreaterThanOrEqual(100)
  expect(rows.length - toAGroup.length, 'messages sent to no group').toBeGreaterThan(900)
  const notAsStored = rows.filter((row) => {
    const data = stored.get(row.id)!
    const withoutTheBody = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'body'))
    return JSON.stringify(JSON.parse(row.data)) !== JSON.stringify(sentToAGroup(row.id) ? data : withoutTheBody)
  })
  expect(notAsStored.map((row) => row.id)).toEqual([])
  expect(rows.filter((row) => 'body' in (JSON.parse(row.data) as object)).map((row) => row.id)).toEqual(toAGroup.map((row) => row.id))
  // THE ENTRIES: the whole pool's, in its order, cut to the fields the sort reads, with a body of null for a message
  // sent to no group. A routed message carries the list its writer addressed beside them, and that is compared too.
  expect(queues.map((one) => one.id)).toEqual(whole.map((one) => one.id))
  const besideTheWireShape = (one: object): string =>
    JSON.stringify(Object.getOwnPropertySymbols(one).map((key) => [String(key), (one as Record<symbol, unknown>)[key]]))
  expect(whole.filter((one) => besideTheWireShape(one) !== '[]').length, 'routed messages').toBeGreaterThan(0)
  const theFields = JSON.stringify([...THE_FIELDS_THE_SORT_READS].sort())
  const differs = queues.filter((one, at) => {
    const same = whole[at]!
    const held = one as unknown as Record<string, unknown>
    const cut: Record<string, unknown> = { ...same, body: same.toGroup === null ? null : same.body }
    return (
      JSON.stringify(Object.keys(held).sort()) !== theFields ||
      THE_FIELDS_THE_SORT_READS.some((key) => JSON.stringify(held[key]) !== JSON.stringify(cut[key])) ||
      besideTheWireShape(one) !== besideTheWireShape(same)
    )
  })
  expect(differs.map((one) => one.id)).toEqual([])
  // THE CONVERSATIONS: both pools sort into the same ones, for every pair a message names and every group.
  const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
  const agent: ParticipantRef = { kind: 'agent', id: theAgent }
  const office: ParticipantRef = moleOffice()
  const pairs = new Map<string, [ParticipantRef, ParticipantRef]>()
  const add = (a: ParticipantRef, b: ParticipantRef): void => {
    pairs.set(`${a.kind}:${a.id} ${b.kind}:${b.id}`, [a, b])
    pairs.set(`${b.kind}:${b.id} ${a.kind}:${a.id}`, [b, a])
  }
  add(person, agent)
  add(person, office)
  for (const one of whole) {
    if (one.toGroup !== null || one.sentBy === null) continue
    for (const to of one.to) add(one.sentBy, to)
  }
  const fromTheWhole = messages.theConversationsOfOnePool(whole)
  const fromTheQueues = messages.theConversationsOfOnePool(queues)
  const ids = (list: readonly { id: string }[]): string => list.map((one) => one.id).join(' ')
  // The office is named by the id its row holds, so the lines it wrote to the person are among the pairs compared.
  expect(ids(fromTheWhole.between(person, office)), 'the lines the office wrote to the person').not.toBe('')
  const pairsThatDiffer = [...pairs].filter(([, [a, b]]) => ids(fromTheQueues.between(a, b)) !== ids(fromTheWhole.between(a, b))).map(([name]) => name)
  expect(pairs.size).toBeGreaterThan(100)
  expect(pairsThatDiffer).toEqual([])
  const groups = [...new Set(whole.flatMap((one) => (one.toGroup === null ? [] : [one.toGroup])))]
  expect(groups).toHaveLength(SMALL.groups)
  expect(groups.filter((group) => ids(fromTheQueues.inGroup(group)) !== ids(fromTheWhole.inGroup(group)))).toEqual([])
  // AND THE ONE RULE THAT READS WORDS WAS ASKED: a group line that @s the person is in the person's chat with its sender.
  expect(fromTheQueues.between(person, agent).filter((one) => one.toGroup !== null).length, 'group lines naming the person').toBeGreaterThan(0)
}, 60_000)

it('sorting a pool refuses a message sent to a group whose words were not read', () => {
  const line = messages.everyMessageOfTheProjects(messages.EVERY_PROJECT).find((one) => one.toGroup !== null && one.sentBy !== null)!
  expect(() => messages.theConversationsOfOnePool([{ ...line, body: null }])).toThrow(`message ${line.id} was sent to a group, but its words were not read`)
}, 60_000)

it("the queue's read runs the select of its rows and the reads of their delivery rows, and nothing else", () => {
  const { pool: whole, statements: theWholeRan } = thePoolCounted()
  const { pool: queues, statements } = theQueuesPoolCounted()
  expect(queues.length).toBe(whole.length)
  const db = t.client.sqlite
  // THE TWO KINDS IT MAY RUN. The select of the rows is found as case 3 finds it; the delivery rows are read in pieces.
  const ofTheDeliveryRows = (one: Ran): boolean => one.sql.includes('from "message_delivery"')
  const ofTheRows = (one: Ran): boolean =>
    one.sql.includes('from "records"') && one.params.includes('message') && (db.prepare(one.sql).all(...one.params) as unknown[]).length === queues.length
  const theOthers = (list: readonly Ran[]): string[] => [...new Set(list.filter((one) => !ofTheDeliveryRows(one) && !ofTheRows(one)).map((one) => one.sql))]
  // THE WHOLE POOL'S READ RUNS MORE, among it the read of the runs its messages name, so this case asks about something.
  expect(theOthers(theWholeRan).filter((sql) => sql.includes("'session'")), "the whole pool's read of the runs its messages name").not.toEqual([])
  expect(statements.filter(ofTheRows), 'the select of the rows').toHaveLength(1)
  expect(statements.filter(ofTheDeliveryRows).length, 'reads of the delivery rows').toBeGreaterThan(0)
  expect(theOthers(statements)).toEqual([])
}, 60_000)
