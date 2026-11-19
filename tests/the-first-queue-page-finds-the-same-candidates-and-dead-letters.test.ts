// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST QUEUE PAGE FINDS THE SAME CANDIDATES, AND COUNTS THE SAME DEAD LETTERS, HOWEVER THEY ARE READ.
 *
 * A queue page starts from `theNextQueueCandidates` in lib/worker.ts: the deliveries queued for an agent, urgent ones
 * first and then in the order their messages were made, from just after a cursor. The first page also counts the dead
 * letters with `countReadableDeadLetters`: the deliveries queued for an agent whose message has
 * been deleted. Both were read by walking every message, or every delivery row, 512 at a time. This file holds both to
 * the answers that walk gives, however the code reads them. The answers are worked out here by one plain read of each,
 * which asks the walk's conditions in one statement with a plain JOIN, and not by the code under test.
 *
 * THE OFFICE. 1,400 made-up messages, more than two of the walk's slices, in three projects: the project the message
 * worker serves, a second project with urgent messages, and a third with none. The worker's project also takes a
 * message written in another project after the moment it began to take them, unless Mole Office wrote it, nobody
 * recorded its sender or it is a comment on a record. Urgent messages sit in the first slice, the middle and the last,
 * one of them deleted, and one message stores that it is not urgent. The deliveries are queued for one agent or two,
 * queued for the person, or already delivered, and some of their messages are deleted. Some messages have no delivery
 * row. Three messages share each second, and their ids sort against the order they were stored in. Two urgent
 * messages share a second, and the first of them has a second delivery row written after every other row, so its
 * delivery rows lie in the first slice of delivery rows and the last.
 *
 * 1. THE CANDIDATES, WALKED. From no cursor, and then from the last candidate of each answer, the answers put
 *    together are every candidate in the walk's order, in each project. Each answer is the next run of that list, of
 *    at least one candidate and at most a page and one.
 * 2. FROM A CURSOR INSIDE AN ANSWER, cut the way the route cuts its next link: the answer starts at the candidate
 *    after it, and after the last candidate there is none.
 * 3. THE DEAD LETTERS. The count is the number of deliveries queued for an agent whose message is deleted and in the
 *    project's view, less those the reader may not read. The whole reading (`deadLettersInTheQueue`) lists the same
 *    deliveries.
 *
 * On the bytes before the paged queue every case fails, because lib/worker.ts has neither `theNextQueueCandidates`
 * nor `countReadableDeadLetters`. On the paged queue as it was first built, the dead-letter count was named
 * `countReadableDeadLettersWithoutHoldingTheServer` and returned a promise. Called that way, every case passes on that
 * build: this file pins the answers that build gives.
 *
 * Every row here is synthetic, in this file's own temporary test database.
 */
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** Where a walk stands: the four fields the route's next link carries. */
type Cursor = { priority: number; createdAt: string; messageRow: number; deliveryRow: number }
/** A candidate as the code hands it out. Every field is compared. */
type Candidate = Cursor & { id: string; messageId: string; recipientId: string; inTheView: number | null }
/** A dead letter as the plain read here gives it. */
type Dead = { deliveryId: string; messageId: string; deliveryRow: number }
/** What this file reads of lib/worker.ts, named here so that the file loads on bytes that have none of it. */
type TheQueueCode = {
  QUEUE_PAGE_SIZE: number
  theNextQueueCandidates: (workspaceId: string, cursor: Cursor | null) => Promise<Candidate[]>
  countReadableDeadLetters: (workspaceId: string, mayRead: (ids: string[]) => ReadonlySet<string>) => number
  deadLettersInTheQueue: (workspaceId: string) => { deliveryId: string }[]
}

let t: TestDb
let built: Awaited<ReturnType<typeof apiApp>>
let W: TheQueueCode
/** The project the message worker serves, as the settings name it. */
let HOME = ''
const ELSEWHERE = 'first-page-elsewhere'
const QUIET = 'first-page-quiet'
/** When the worker began to take messages written in another project: the 241st second of the 467 the messages fill. */
const SINCE = '2026-10-23 12:00:00'
const FIRST_SECOND = Date.parse('2026-10-23T11:56:00Z')
const MESSAGES = 1_400
/** The walk's slice, which these tests cross: the office holds more than two of them. */
const SLICE = 512
/**
 * The urgent messages, by place: the first slice, the middle and the last; 6 and 7 share a second, 22 is deleted, 304
 * and 1004 are elsewhere.
 */
const URGENT = new Set([6, 7, 22, 304, 640, 1004, 1391])
/** The message whose second delivery row is written after every other row, as when it is sent on to one more agent. */
const SENT_ON_LATER = 6
const AGENTS = ['first-page-agent-0', 'first-page-agent-1', 'first-page-agent-2']
/** Mole Office's own id in this database. */
let office = ''
/** Each project's candidates and dead letters, from the plain reads below. */
const candidates = new Map<string, Candidate[]>()
const deadLetters = new Map<string, Dead[]>()

const stampOf = (second: number): string => new Date(FIRST_SECOND + second * 1000).toISOString().slice(0, 19).replace('T', ' ')
const cursorOf = ({ priority, createdAt, messageRow, deliveryRow }: Cursor): Cursor => ({ priority, createdAt, messageRow, deliveryRow })

/** Every candidate of a project in the walk's order, read in one statement that asks the walk's conditions. */
async function everyCandidate(workspaceId: string): Promise<Candidate[]> {
  const { db } = await import('../src/server/db/client.ts')
  const { records, messageDelivery } = await import('../src/server/db/schema.ts')
  const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
  const { justThisProject } = await import('../src/shared/which-projects.ts')
  const view = messagesInTheViewOf(justThisProject(workspaceId))
  // A MESSAGE WRITTEN IN ANOTHER PROJECT, which only the worker's own project takes: written after the moment, with a
  // project, by a sender other than Mole Office, and not a comment on a record.
  const fromElsewhere = workspaceId !== HOME ? undefined : sql`(${records.createdAt} > ${SINCE}
    AND json_extract(${records.data}, '$.writtenIn.project') IS NOT NULL
    AND json_extract(${records.data}, '$.sentBy.id') <> ${office}
    AND json_type(${records.data}, '$.target') IS NULL)`
  // A NESTED CASE, because SQLite may ask both sides of an AND, and json_type refuses data that is not JSON.
  const priority = sql<number>`CASE WHEN json_valid(${records.data}) THEN CASE WHEN json_type(${records.data}, '$.urgent') = 'true' THEN 0 ELSE 1 END ELSE 1 END`
  return db
    .select({
      id: messageDelivery.id, messageId: messageDelivery.messageId, recipientId: messageDelivery.recipientId,
      inTheView: fromElsewhere === undefined ? sql<number | null>`1` : sql<number | null>`(${view})`,
      priority, createdAt: records.createdAt, messageRow: sql<number>`records.rowid`, deliveryRow: sql<number>`message_delivery.rowid`,
    })
    .from(messageDelivery)
    .innerJoin(records, eq(records.id, messageDelivery.messageId))
    .where(and(
      eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent'),
      eq(records.kind, 'message'), eq(records.workspaceId, 'message-centre'), isNull(records.deletedAt),
      fromElsewhere === undefined ? view : or(view, fromElsewhere),
    ))
    .orderBy(priority, records.createdAt, sql`records.rowid`, sql`message_delivery.rowid`)
    .all()
}

/** Every dead letter of a project, read in one statement: queued, for an agent, in the project's view, and deleted. */
async function everyDeadLetter(workspaceId: string): Promise<Dead[]> {
  const { db } = await import('../src/server/db/client.ts')
  const { records, messageDelivery } = await import('../src/server/db/schema.ts')
  const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
  const { justThisProject } = await import('../src/shared/which-projects.ts')
  return db
    .select({ deliveryId: messageDelivery.id, messageId: messageDelivery.messageId, deliveryRow: sql<number>`message_delivery.rowid` })
    .from(messageDelivery)
    .innerJoin(records, eq(records.id, messageDelivery.messageId))
    .where(and(eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent'), messagesInTheViewOf(justThisProject(workspaceId)), isNotNull(records.deletedAt)))
    .all()
}

beforeAll(async () => {
  t = await freshDb()
  built = await apiApp()
  await built.app.ready()
  W = (await import('../src/server/lib/worker.ts')) as unknown as TheQueueCode
  const { settings } = await import('../src/config/settings.mjs')
  HOME = settings().workspace
  expect([ELSEWHERE, QUIET]).not.toContain(HOME)
  const sqlite = t.client.sqlite
  office = (sqlite.prepare("SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0").get() as { id: string }).id
  expect(sqlite.prepare('UPDATE installation SET other_projects_messages_since = ? WHERE only_row = 1').run(SINCE).changes).toBe(1)
  const addRecord = sqlite.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, deleted_at, kind, title, data, origin) VALUES (?, 'message-centre', ?, ?, ?, ?, 'message', 'Made-up line', ?, 'fixture')")
  const addDelivery = sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
  sqlite.transaction(() => {
    for (let i = 0; i < MESSAGES; i++) {
      // IDS COUNT DOWN while the rows are stored in order, so an order by id would disagree with the stored one.
      const id = `first-page-line-${String(99_999 - i)}`
      const at = stampOf(Math.floor(i / 3))
      const project = i % 5 === 4 ? ELSEWHERE : i % 5 === 3 ? QUIET : HOME
      const sentBy = i % 13 === 6 ? { kind: 'agent', id: office } : i % 17 === 8 ? undefined : { kind: 'agent', id: AGENTS[i % 3]! }
      const to = i % 4 === 1
        ? [{ kind: 'person', id: THE_PERSON }]
        : [{ kind: 'agent', id: AGENTS[(i + 1) % 3]! }, ...(i % 7 === 0 || i === SENT_ON_LATER ? [{ kind: 'agent', id: AGENTS[(i + 2) % 3]! }] : [])]
      const data = {
        body: 'Made-up words.', to, writtenIn: { project },
        ...(sentBy === undefined ? {} : { sentBy }),
        ...(URGENT.has(i) ? { urgent: true } : i === 50 ? { urgent: false } : {}),
        ...(i % 19 === 5 ? { target: { type: 'record', id: 'first-page-no-such-record' } } : {}),
      }
      addRecord.run(id, THE_TEST_OFFICES_OWNER.id, at, at, i % 9 === 4 ? at : null, JSON.stringify(data))
      // ONE MESSAGE IN 23 HAS NO DELIVERY ROW, and the row sent on later is written below, after every other row.
      const rows = i % 23 === 12 ? [] : i === SENT_ON_LATER ? to.slice(0, 1) : to
      for (const [n, one] of rows.entries()) addDelivery.run(`${id}-to-${String(n)}`, id, one.kind, one.id, i % 8 === 2 ? 'delivered' : 'queued', at)
    }
    const later = `first-page-line-${String(99_999 - SENT_ON_LATER)}`
    addDelivery.run(`${later}-to-1`, later, 'agent', AGENTS[(SENT_ON_LATER + 2) % 3]!, 'queued', stampOf(Math.floor(SENT_ON_LATER / 3)))
  })()
  for (const project of [HOME, ELSEWHERE, QUIET]) {
    candidates.set(project, await everyCandidate(project))
    deadLetters.set(project, await everyDeadLetter(project))
  }

  // THE OFFICE IS AS THIS FILE SAYS. The urgent candidates of the worker's project lie in the first and the last slice
  // of the walk, and one of them was written elsewhere after the moment; the quiet project has none.
  const order = (sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND workspace_id = 'message-centre' ORDER BY created_at, rowid").all() as { id: string }[]).map((one) => one.id)
  expect(order.length).toBeGreaterThan(2 * SLICE)
  const placeOf = new Map(order.map((id, i) => [id, i]))
  const urgentPlaces = candidates.get(HOME)!.filter((one) => one.priority === 0).map((one) => placeOf.get(one.messageId)!)
  expect(Math.min(...urgentPlaces)).toBeLessThan(SLICE)
  expect(Math.max(...urgentPlaces)).toBeGreaterThanOrEqual(2 * SLICE)
  const writtenIn = sqlite.prepare("SELECT json_extract(data, '$.writtenIn.project') AS project FROM records WHERE id = ?")
  const projectOf = (id: string): string => (writtenIn.get(id) as { project: string }).project
  expect(candidates.get(HOME)!.some((one) => one.priority === 0 && projectOf(one.messageId) === ELSEWHERE)).toBe(true)
  expect(candidates.get(HOME)!.some((one) => one.priority === 1 && projectOf(one.messageId) === ELSEWHERE)).toBe(true)
  expect(candidates.get(ELSEWHERE)!.some((one) => one.priority === 0)).toBe(true)
  expect(candidates.get(QUIET)!.some((one) => one.priority === 0)).toBe(false)
  // A MESSAGE WITH SEVERAL CANDIDATES, AND MESSAGES WITH NO DELIVERY ROW. Two urgent candidates share a second, and the
  // one stored first has the later delivery row, in another slice, so the slices of delivery rows meet them out of the
  // walk's order.
  const home = candidates.get(HOME)!
  expect(new Set(home.map((one) => one.messageId)).size).toBeLessThan(home.length)
  expect((sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND id NOT IN (SELECT message_id FROM message_delivery)").get() as { n: number }).n).toBeGreaterThan(0)
  const urgentHome = home.filter((one) => one.priority === 0)
  expect(urgentHome.some((a) => urgentHome.some((b) => a.createdAt === b.createdAt && a.messageRow < b.messageRow && a.deliveryRow > b.deliveryRow + SLICE))).toBe(true)
  for (const project of [HOME, ELSEWHERE, QUIET]) {
    // THE DEAD LETTERS LIE IN MORE THAN TWO SLICES OF DELIVERY ROWS, and one message has two of them.
    const rows = deadLetters.get(project)!.map((one) => one.deliveryRow)
    expect(Math.max(...rows) - Math.min(...rows), project).toBeGreaterThan(2 * SLICE)
  }
  const all = [...deadLetters.values()].flat()
  expect(new Set(all.map((one) => one.messageId)).size).toBeLessThan(all.length)
}, 120_000)

afterAll(async () => {
  await built?.app.close()
  t?.close()
})

/** Every answer from no cursor on, each asked from the last candidate of the one before, until one is empty. */
async function theWalk(workspaceId: string): Promise<Candidate[][]> {
  const answers: Candidate[][] = []
  let cursor: Cursor | null = null
  for (;;) {
    const answer = await W.theNextQueueCandidates(workspaceId, cursor)
    if (answer.length === 0) return answers
    answers.push(answer)
    expect(answers.length, 'the walk ends').toBeLessThan(MESSAGES)
    cursor = cursorOf(answer[answer.length - 1]!)
  }
}

it('walks every candidate in order, urgent ones first, in each project', async () => {
  for (const project of [HOME, ELSEWHERE, QUIET]) {
    const expected = candidates.get(project)!
    expect(expected.length, `${project} fills more than three answers`).toBeGreaterThan(3 * (W.QUEUE_PAGE_SIZE + 1))
    let at = 0
    for (const answer of await theWalk(project)) {
      expect(answer.length).toBeLessThanOrEqual(W.QUEUE_PAGE_SIZE + 1)
      expect(answer, `${project}, the answer from candidate ${String(at)}`).toEqual(expected.slice(at, at + answer.length))
      at += answer.length
    }
    expect(at, project).toBe(expected.length)
  }
}, 60_000)

it('starts after a cursor inside an answer, and finds nothing after the last candidate', async () => {
  for (const project of [HOME, ELSEWHERE, QUIET]) {
    const expected = candidates.get(project)!
    let lastUrgent = -1
    for (const [i, one] of expected.entries()) if (one.priority === 0) lastUrgent = i
    const from = [...expected.keys()].filter((i) => i % 7 === 3 || i === lastUrgent || i === expected.length - 2)
    for (const i of from) {
      const answer = await W.theNextQueueCandidates(project, cursorOf(expected[i]!))
      expect(answer.length, `${project}, after candidate ${String(i)}`).toBeGreaterThan(0)
      expect(answer.length).toBeLessThanOrEqual(W.QUEUE_PAGE_SIZE + 1)
      expect(answer, `${project}, after candidate ${String(i)}`).toEqual(expected.slice(i + 1, i + 1 + answer.length))
    }
    expect(await W.theNextQueueCandidates(project, cursorOf(expected[expected.length - 1]!))).toEqual([])
  }
}, 60_000)

it('counts the dead letters the reader may read, and the whole reading lists the same ones', async () => {
  for (const project of [HOME, ELSEWHERE, QUIET]) {
    const dead = deadLetters.get(project)!
    const messages = [...new Set(dead.map((one) => one.messageId))]
    const refused = new Set(messages.filter((_, i) => i % 3 === 0))
    const mayRead = (ids: string[]): ReadonlySet<string> => new Set(ids.filter((id) => !refused.has(id)))
    const readable = dead.filter((one) => !refused.has(one.messageId)).length
    expect(readable, project).toBeLessThan(dead.length)
    expect(W.countReadableDeadLetters(project, mayRead), project).toBe(readable)
    expect(W.countReadableDeadLetters(project, (ids) => new Set(ids)), project).toBe(dead.length)
    expect(W.deadLettersInTheQueue(project).map((one) => one.deliveryId).sort(), project).toEqual(dead.map((one) => one.deliveryId).sort())
  }
}, 60_000)
