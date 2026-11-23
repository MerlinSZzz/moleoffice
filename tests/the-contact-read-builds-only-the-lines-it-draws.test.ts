// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACT READ BUILDS EACH MESSAGE WITH ONLY THE FIELDS ITS ROWS READ, AND BUILDS ONLY EACH ROW'S LAST LINE WHOLE.
 *
 * `theContactsOfOneReader` answers GET /api/messages/contacts, GET /api/messages/contact-list, GET /api/messages/circle
 * and the Embassy's contact column. Its pool holds each message with the ten fields that the rows, their counts and the
 * reader's rule read. Only the message a row hands out as its last line is built whole. The delivery rows are read
 * through SQLite with drizzle's own statement and built by hand (`deliveryRowsOfMany`).
 *
 * WHAT IS PROVED HERE, for three readers (the person, a supervisor and a worker), on one office built through the
 * product's own doors, with some rows then rewritten by hand as old rows hold them:
 *
 *   1. THE ROWS. The contact rows equal the rows `contactsFor` makes of the reader's messages built whole. They are
 *      compared in their order and as JSON text. This holds with the reader's rule applied the same way to both, and
 *      with no reader, as the Embassy asks.
 *   2. THE LAST LINES. Each row's last line equals the whole entry `asEntry` built for that message when every message
 *      of the reader's part was read whole. The fixture makes one last line from a run whose record says its tool, one
 *      from the person with a label of the person's own, and one routed.
 *   3. THE TWO NUMBERS. GET /api/messages/contact-list and GET /api/messages/circle give the reader the same two numbers
 *      on the circle (criteria M19 and M32). They are the numbers the whole entries give.
 *   4. THE SHAPE OF THE POOL. Every pool entry holds exactly the ten fields: its set of keys is compared whole. A routed
 *      message also holds the writer's own list under its symbol, and no other message does. Each field holds the value
 *      the whole entry holds.
 *   5. THE DELIVERY ROWS. The rows built by hand equal drizzle's own read of the table, made one piece at a time as
 *      `readInPieces` makes it: every row, in the same order, with every column. The ids make two pieces, and each piece
 *      has delivery rows. Each column that may be empty is set on some row and empty on another. Some rows of the
 *      second piece are earlier than rows of the first, so a read that sorted all the rows together would differ.
 *
 * ON 9c50175a1, the commit this change starts from, cases 1 to 3 pass, because they compare answers that did not
 * change. Case 4 fails there for the reason it is written for: each pool entry was whole, so its set of keys holds every
 * field of a whole entry, not ten. Case 5 cannot run there: `deliveryRowsOfMany` did not exist, so the call fails before
 * any row is compared.
 *
 * Everybody and every record here is made up: the agents, their messages, the groups, the run and the person's label.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { inArray } from 'drizzle-orm'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Ref = { kind: 'person' | 'agent'; id: string }
type Mark = 'queued' | 'delivered' | 'seen'

let t: TestDb
let app: FastifyInstance
let M: typeof import('../src/server/lib/messages.ts')
let G: typeof import('../src/server/lib/groups.ts')
let W: typeof import('../src/shared/which-projects.ts')
let P: typeof import('../src/server/lib/message-pool-at-or-after.ts')
let C: typeof import('../src/server/db/client.ts')
let S: typeof import('../src/server/db/schema.ts')
let I: typeof import('../src/server/db/in-pieces.ts')

const SECOND = 'second-project'
const SUPERVISOR = 'nr-supervisor'
const WORKER = 'nr-worker'
const HELPER = 'nr-helper'
const PERSON_REF: Ref = { kind: 'person', id: THE_PERSON }
const MADE_UP_MODEL = 'a-made-up-model'
const THE_LABELS_INSTRUCTION = 'Answer about the seedlings first.'

const asThePerson = (workspace = 'default'): Record<string, string> => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})
const asAgent = (handle: string, workspace = 'default'): Record<string, string> => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The agents of the fixture, by handle, with the registry id each was given. */
const ids = new Map<string, string>()
const agent = (handle: string): Ref => {
  const id = ids.get(handle)
  if (id === undefined) throw new Error(`the fixture has no agent ${handle}`)
  return { kind: 'agent', id }
}

/** What the fixture built on purpose, so the cases can check it is really there. */
const built = { hello: '', about: '', notice: '', fromARun: '', run: '', flagged: '' }

async function register(handle: string, headers: Record<string, string>): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  if (row === undefined) throw new Error(`no registry row for ${handle}`)
  ids.set(handle, row.id)
}

/** One message through the create door, giving back its record id. */
async function say(headers: Record<string, string>, to: Ref, body: string): Promise<string> {
  const payload = { kind: 'message', title: body, data: { body, to: [to] } }
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  const fromAgentToAgent = headers['x-mole-office-actor-type'] === 'agent' && to.kind === 'agent'
  expect(made.statusCode, made.body).toBe(fromAgentToAgent ? 409 : theAnswerToAWriteInATestOffice(headers, payload))
  return (made.json() as { record: { id: string } }).record.id
}

/** One message to a group through the create door, giving back its record id. */
async function sayInAGroup(headers: Record<string, string>, groupId: string, body: string): Promise<string> {
  const payload = { kind: 'message', title: body, data: { body, toGroup: groupId } }
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  expect(made.statusCode, made.body).toBe(theAnswerToAWriteInATestOffice(headers, payload))
  return (made.json() as { record: { id: string } }).record.id
}

/** A group the person opens, with these members beside the person. */
async function aGroup(name: string, members: Ref[]): Promise<string> {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: asThePerson(),
    payload: {
      name,
      because: 'to have a group in the fixture',
      members: [{ who: PERSON_REF, because: 'the person reads it' }, ...members.map((who) => ({ who, because: 'it works here' }))],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  return (opened.json() as { group: { id: string } }).group.id
}

/** The stored `data` of one record. */
function storedData(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return JSON.parse(row.data) as Record<string, unknown>
}

/**
 * A MESSAGE IN A STATE NO DOOR WRITES TODAY, made from one the door wrote. Its `data` and its delivery rows are replaced
 * with the ones given, as old messages and a database edited by hand hold them.
 */
function rewrite(id: string, data: Record<string, unknown>, deliveries: { to: Ref; mark: Mark }[]): void {
  writeDataBypassingTheGate(t, id, data)
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(id)
  for (const [n, one] of deliveries.entries()) {
    t.client.sqlite
      .prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${id}-d${String(n)}`, id, one.to.kind, one.to.id, one.mark, '2026-09-26 10:00:00')
  }
}

/**
 * TAKE BACK THE ROUTING'S COPY. The fixture's agents have no running session, so the create door copies a message
 * between two of them to somebody else. This leaves the one delivery row the writer asked for and the stored `data`
 * without the copy.
 */
function keepBetweenTheTwo(id: string, to: Ref): void {
  const data = storedData(id)
  delete data['routed']
  rewrite(id, data, [{ to, mark: 'queued' }])
}

/** Set every delivery row of one message to one mark. */
function markAll(id: string, mark: Mark): void {
  t.client.sqlite.prepare('UPDATE message_delivery SET mark = ? WHERE message_id = ?').run(mark, id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  M = await import('../src/server/lib/messages.ts')
  G = await import('../src/server/lib/groups.ts')
  W = await import('../src/shared/which-projects.ts')
  P = await import('../src/server/lib/message-pool-at-or-after.ts')
  C = await import('../src/server/db/client.ts')
  S = await import('../src/server/db/schema.ts')
  I = await import('../src/server/db/in-pieces.ts')

  const project = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: SECOND, title: 'Second project' } })
  expect(project.statusCode, project.body).toBe(201)

  await register(SUPERVISOR, asThePerson())
  await register(WORKER, asAgent(SUPERVISOR))
  // AN AGENT THE SUPERVISOR STARTED, that the person has never written to: folded under the supervisor.
  await register(HELPER, asAgent(SUPERVISOR))

  // THE PERSON'S OWN LABEL, with an instruction. A message from the person that carries it hands the instruction over,
  // read from the person's row (the sender's flags).
  const labelled = t.client.sqlite
    .prepare('UPDATE people SET chat_labels = ? WHERE id = ?')
    .run(JSON.stringify([{ text: 'Seedlings', colour: 'green', instruction: THE_LABELS_INSTRUCTION }]), THE_PERSON)
  expect(labelled.changes, "the person's row holds the label").toBe(1)

  // DIRECT CONVERSATIONS, in both projects, some seen and some not.
  built.hello = await say(asThePerson(), agent(SUPERVISOR), 'The seed list is ready')
  const reply = await say(asAgent(SUPERVISOR, SECOND), PERSON_REF, 'The supervisor answers from the second project')
  await say(asThePerson(), agent(WORKER), 'The worker is asked about the trays')
  const fromWorker = await say(asAgent(WORKER), PERSON_REF, 'The worker answers about the trays')
  // MARKED ABOUT THE SECOND PROJECT while written in the first, so the conversation's projects come from both marks.
  writeDataBypassingTheGate(t, fromWorker, { ...storedData(fromWorker), aboutProject: SECOND })
  markAll(built.hello, 'seen')
  markAll(reply, 'delivered')
  markAll(fromWorker, 'seen')

  // A ROUTED MESSAGE whose writer addressed the person, with no delivery row to the person: copied to the worker.
  // Its delivery row puts it between the supervisor and the worker, so it is written before the two lines below, and
  // the worker's report stays the last line of that conversation.
  const routed = await say(asAgent(SUPERVISOR), agent(WORKER), 'routed')
  rewrite(
    routed,
    {
      body: 'Addressed to the person, copied to the worker',
      sentBy: agent(SUPERVISOR),
      to: [PERSON_REF],
      routed: [{ for: PERSON_REF, because: 'the person was away', to: agent(WORKER), passedOver: [], line: 'copied to the worker' }],
    },
    [{ to: agent(WORKER), mark: 'delivered' }],
  )

  // BETWEEN THE SUPERVISOR AND THE WORKER: one left routed as the door wrote it, and one kept between the two.
  const toWorker = await say(asAgent(SUPERVISOR), agent(WORKER), 'The supervisor hands the worker a task')
  markAll(toWorker, 'delivered')
  built.fromARun = await say(asAgent(WORKER), agent(SUPERVISOR), 'The worker reports to the supervisor')
  keepBetweenTheTwo(built.fromARun, agent(SUPERVISOR))
  const fromHelper = await say(asAgent(HELPER), agent(SUPERVISOR), 'The helper reports to the supervisor')
  keepBetweenTheTwo(fromHelper, agent(SUPERVISOR))

  // A GROUP OF ALL THREE and a group without the worker, each opened with Mole Office's own lines, each with a line
  // unread by somebody.
  const allThree = await aGroup('all three', [agent(SUPERVISOR), agent(WORKER)])
  await sayInAGroup(asAgent(SUPERVISOR), allThree, 'Said to the whole group')
  const withoutTheWorker = await aGroup('without the worker', [agent(SUPERVISOR)])
  await sayInAGroup(asThePerson(), withoutTheWorker, 'Said without the worker')

  // A NOTICE ABOUT A MESSAGE, criterion M128. It reached the person only, and it is drawn in the conversation between
  // the supervisor and the person, so it is in the supervisor's part of the pool, and the supervisor may not read it.
  built.about = await say(asAgent(SUPERVISOR), PERSON_REF, 'The message the notice is about')
  built.notice = await say(asAgent(SUPERVISOR), PERSON_REF, 'notice')
  rewrite(built.notice, { body: 'A notice about that message', sentBy: { kind: 'agent', id: 'mole-office' }, aboutMessage: built.about, to: [PERSON_REF] }, [
    { to: PERSON_REF, mark: 'queued' },
  ])

  // A WRITER NOBODY REGISTERED.
  const ghost = await say(asAgent(WORKER), PERSON_REF, 'ghost')
  rewrite(ghost, { body: 'From a writer nobody registered', from: 'Ghost', sentBy: { kind: 'agent', id: 'nr-ghost-nobody-registered' }, to: [PERSON_REF] }, [
    { to: PERSON_REF, mark: 'queued' },
  ])

  // A LINE FROM MOLE OFFICE to the person alone, criterion M33: shown, and in no count.
  const office = await say(asAgent(WORKER), PERSON_REF, 'office')
  rewrite(office, { body: 'A line the office wrote', sentBy: { kind: 'agent', id: 'mole-office' }, to: [PERSON_REF] }, [{ to: PERSON_REF, mark: 'queued' }])

  // THE PERSON'S LAST LINE TO THE WORKER, with a shipped mark and the person's own label.
  built.flagged = await say(asThePerson(), agent(WORKER), 'The trays can wait')
  writeDataBypassingTheGate(t, built.flagged, { ...storedData(built.flagged), intent: 'just-ask', label: { text: 'Seedlings', colour: 'green' } })

  // A RUN WHOSE RECORD SAYS ITS TOOL AND MODEL, made last, so that it was not there when any message above was routed.
  // The worker's report to the supervisor came out of it.
  built.run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A made-up run of the worker',
    origin: 'fixture',
    data: { state: 'running', runtime: 'claude-code', model: MADE_UP_MODEL },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  writeDataBypassingTheGate(t, built.fromARun, { ...storedData(built.fromARun), fromRun: built.run })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const READERS: { label: string; who: () => Ref; actor: () => { type: string; id: string }; headers: () => Record<string, string> }[] = [
  { label: 'the person', who: () => PERSON_REF, actor: () => ({ type: 'human', id: THE_PERSON }), headers: () => asThePerson() },
  { label: 'the supervisor', who: () => agent(SUPERVISOR), actor: () => ({ type: 'agent', id: SUPERVISOR }), headers: () => asAgent(SUPERVISOR) },
  { label: 'the worker', who: () => agent(WORKER), actor: () => ({ type: 'agent', id: WORKER }), headers: () => asAgent(WORKER) },
]

/** The reader's part of the pool built whole, as the contact read built it before, and the part this reader may read. */
function theWholeEntries(me: Ref, reader: ReturnType<typeof M.theMessageReader> | null) {
  const whole = M.theMessagesOfOneReader(me, M.everybodyRegistered(), W.EVERY_PROJECT)
  return { whole, used: reader === null ? whole : M.onlyTheMessagesThisReaderMayRead(reader, whole) }
}

/** The contact rows `contactsFor` makes of whole entries. */
function theRowsOfWholeEntries(me: Ref, entries: ReturnType<typeof M.theMessagesOfOneReader>) {
  return M.contactsFor(me, M.everybodyRegistered(), W.EVERY_PROJECT, entries, M.everyAgentById())
}

/** The last line of the row of `other` among these rows, or null. */
function lastWith(rows: readonly { who: { kind: string; id: string } | null; last: { id: string } | null }[], other: Ref): string | null {
  return rows.find((one) => one.who !== null && one.who.kind === other.kind && one.who.id === other.id)?.last?.id ?? null
}

/** The ten fields of a pool entry, sorted. Case 4 is the one place that proves this set. */
const THE_TEN_FIELDS = ['aboutMessage', 'aboutProject', 'deliveries', 'entry', 'from', 'id', 'sentBy', 'to', 'toGroup', 'writtenIn']

describe('the made-up office', () => {
  it('holds the cases it claims to cover', () => {
    const person = M.theContactsOfOneReader(PERSON_REF).contacts
    expect(person.filter((one) => one.unregistered !== null).length, 'a writer nobody registered').toBeGreaterThan(0)
    expect(person.some((one) => one.foldedUnder !== null), 'an agent folded under its starter').toBe(true)
    expect(lastWith(person, agent(SUPERVISOR)), "the notice is the person's last line with the supervisor").toBe(built.notice)

    const supervisor = M.theMessageReader({ type: 'agent', id: SUPERVISOR })
    expect(lastWith(M.theContactsOfOneReader(agent(SUPERVISOR)).contacts, PERSON_REF), 'with no reader the notice is the last line').toBe(built.notice)
    expect(lastWith(M.theContactsOfOneReader(agent(SUPERVISOR), supervisor).contacts, PERSON_REF), 'the supervisor may not read the notice').toBe(built.about)

    for (const reader of READERS) {
      const rows = M.theContactsOfOneReader(reader.who(), M.theMessageReader(reader.actor())).contacts
      if (reader.label !== 'the person') {
        const other = reader.label === 'the worker' ? agent(SUPERVISOR) : agent(WORKER)
        const last = rows.find((one) => one.last?.id === built.fromARun)?.last
        expect(lastWith(rows, other), `${reader.label}'s last line with the other agent came out of the run`).toBe(built.fromARun)
        expect(last?.ranBy, 'the run says its tool and model').toEqual({ run: built.run, runtime: 'claude-code', model: MADE_UP_MODEL })
      }
      if (reader.label !== 'the supervisor') {
        const other = reader.label === 'the person' ? agent(WORKER) : PERSON_REF
        expect(lastWith(rows, other), `${reader.label}'s last line carries the person's label`).toBe(built.flagged)
        const last = rows.find((one) => one.last?.id === built.flagged)?.last
        expect(last?.whatTheLabelAsks, "the label's instruction comes from the person's row").toBe(THE_LABELS_INSTRUCTION)
        expect(last?.routed?.length, 'the door routed it').toBeGreaterThan(0)
      }
    }
  })
})

for (const reader of READERS) {
  describe(`for ${reader.label}`, () => {
    it('1. gives the rows, in their order, that contactsFor makes of whole entries, with the reader rule and without it', () => {
      const me = reader.who()
      for (const asked of [M.theMessageReader(reader.actor()), null]) {
        const expected = theRowsOfWholeEntries(me, theWholeEntries(me, asked).used)
        const rows = M.theContactsOfOneReader(me, asked).contacts
        expect(rows.length, 'the reader has rows').toBeGreaterThan(0)
        expect(JSON.stringify(rows), 'the rows as JSON text').toBe(JSON.stringify(expected))
        expect(rows).toEqual(expected)
      }
    })

    it("2. builds each row's last line as the whole entry asEntry built for it", () => {
      const me = reader.who()
      const whole = new Map(theWholeEntries(me, null).whole.map((one) => [one.id, one]))
      for (const asked of [M.theMessageReader(reader.actor()), null]) {
        const lasts = M.theContactsOfOneReader(me, asked).contacts.flatMap((one) => (one.last === null ? [] : [one.last]))
        expect(lasts.length, 'the reader has last lines').toBeGreaterThan(0)
        for (const last of lasts) {
          const expected = whole.get(last.id)
          expect(expected, `the whole read holds ${last.id}`).toBeDefined()
          expect(JSON.stringify(last), `the last line ${last.id} as JSON text`).toBe(JSON.stringify(expected))
          // toEqual compares the symbol keys too, so a routed line's writer's list is compared as well.
          expect(last, `the last line ${last.id}`).toEqual(expected)
        }
      }
    })

    it('3. gets the same two numbers on the circle from the contact list and from the circle', async () => {
      const me = reader.who()
      const used = theWholeEntries(me, M.theMessageReader(reader.actor())).used
      const rows = theRowsOfWholeEntries(me, used)
      const groups = G.groupsFor(me, W.EVERY_PROJECT).map((one) => M.unreadInAGroup(one.id, me, W.EVERY_PROJECT, used))
      const expected = { messages: rows.reduce((sum, one) => sum + one.unread, 0), groups: groups.filter((n) => n > 0).length }
      expect(expected.messages, 'something unread in a conversation').toBeGreaterThan(0)
      expect(expected.groups, 'something unread in a group').toBeGreaterThan(0)
      const list = await app.inject({ method: 'GET', url: '/api/messages/contact-list', headers: reader.headers() })
      expect(list.statusCode, list.body).toBe(200)
      const circle = await app.inject({ method: 'GET', url: '/api/messages/circle', headers: reader.headers() })
      expect(circle.statusCode, circle.body).toBe(200)
      expect((list.json() as { unread: unknown }).unread, 'the contact list').toEqual(expected)
      expect((circle.json() as { unread: unknown }).unread, 'the circle').toEqual(expected)
    })

    it('4. holds in its pool exactly the ten fields of each message, with the values of the whole entry', () => {
      const me = reader.who()
      for (const asked of [M.theMessageReader(reader.actor()), null]) {
        const { whole, used } = theWholeEntries(me, asked)
        const byId = new Map(whole.map((one) => [one.id, one]))
        const pool = M.theContactsOfOneReader(me, asked).pool
        expect(pool.map((one) => one.id), 'the same messages in the same order').toEqual(used.map((one) => one.id))
        for (const entry of pool) {
          const wholeEntry = byId.get(entry.id)
          if (wholeEntry === undefined) throw new Error(`the whole read holds no ${entry.id}`)
          expect(Object.keys(entry).sort(), `the keys of ${entry.id}`).toEqual(THE_TEN_FIELDS)
          const symbols = Object.getOwnPropertySymbols(entry).map((one) => one.description)
          // `routed` is optional on a message; an absent list is an empty one, as routedOf reads it.
          expect(symbols, `the writer's list on ${entry.id}`).toEqual((wholeEntry.routed ?? []).length > 0 ? ['the writer addressed'] : [])
          expect(entry, `the values of ${entry.id}`).toEqual(Object.fromEntries(Reflect.ownKeys(entry).map((key) => [key, Reflect.get(wholeEntry, key)])))
        }
        expect(pool.some((one) => Object.getOwnPropertySymbols(one).length > 0), 'a routed message is in the pool').toBe(true)
      }
    })
  })
}

describe('the delivery rows', () => {
  it("5. are built by hand as drizzle's own read of the table builds them, every column of every row in order", () => {
    const messageIds = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message'").all() as { id: string }[]).map((one) => one.id)
    const withRows = new Set((t.client.sqlite.prepare('SELECT DISTINCT message_id AS id FROM message_delivery').all() as { id: string }[]).map((one) => one.id))
    const delivered = messageIds.filter((id) => withRows.has(id))
    expect(delivered.length, 'three messages have delivery rows').toBeGreaterThanOrEqual(3)
    const [inTheFirst, inTheSecond, emptied] = delivered as [string, string, string]

    // TWO PIECES. The messages before `inTheSecond` come first, then the rest of the messages. The ids between them name
    // no message. They only fill the first piece to IDS_AT_ONCE ids, so no 500 messages need writing.
    const split = messageIds.indexOf(inTheSecond)
    const nothing = Array.from({ length: I.IDS_AT_ONCE - split }, (_, n) => `an-id-that-names-no-message-${n}`)
    const ids = [...messageIds.slice(0, split), ...nothing, ...messageIds.slice(split)]
    const pieces = I.piecesOf(ids)
    expect(pieces.length, 'the ids make two pieces').toBe(2)
    expect(pieces[0]).toContain(inTheFirst)
    expect(pieces[1]).toContain(inTheSecond)
    expect(pieces[1]).toContain(emptied)

    // EVERY COLUMN THAT MAY BE EMPTY IS FILLED ON THE ROWS OF ONE MESSAGE IN EACH PIECE, each with its own word, so a
    // column built from another column's value is seen. The filled rows of the second piece are given an earlier moment
    // than those of the first. It is written and read in one go, so nothing the app runs on a timer reads it.
    const fill = t.client.sqlite.prepare(
      'UPDATE message_delivery SET at = ?, because = ?, run = ?, inferred_by = ?, offer_put_off_at = ?, remind_at = ?, remind_set_by_kind = ?, ' +
        'remind_set_by_id = ?, reminded_at = ?, carried_in = ? WHERE message_id = ?',
    )
    const words = ['a made-up reason', 'a-made-up-run', 'a made-up writer', '2026-09-26 10:01:00', '2026-09-26 10:02:00', 'human', 'a-made-up-setter', '2026-09-26 10:03:00', 'a-made-up-carrier']
    expect(fill.run('2026-09-26 10:05:00', ...words, inTheFirst).changes, 'rows of the first piece are filled').toBeGreaterThan(0)
    expect(fill.run('2026-09-26 10:00:00', ...words, inTheSecond).changes, 'rows of the second piece are filled').toBeGreaterThan(0)
    // AND EVERY SUCH COLUMN IS EMPTY ON ONE ROW of a third message, whatever the fixture wrote there.
    const emptiedRow = t.client.sqlite
      .prepare(
        'UPDATE message_delivery SET because = NULL, run = NULL, inferred_by = NULL, offer_put_off_at = NULL, remind_at = NULL, remind_set_by_kind = NULL, ' +
          'remind_set_by_id = NULL, reminded_at = NULL, carried_in = NULL WHERE id = (SELECT id FROM message_delivery WHERE message_id = ? ORDER BY id LIMIT 1)',
      )
      .run(emptied)
    expect(emptiedRow.changes, 'one row is emptied').toBe(1)

    const byHand = P.deliveryRowsOfMany(ids)
    const byDrizzle = I.readInPieces(ids, (piece) =>
      C.db.select().from(S.messageDelivery).where(inArray(S.messageDelivery.messageId, piece)).orderBy(S.messageDelivery.at, S.messageDelivery.id).all(),
    )
    pieces.forEach((piece, n) => {
      const inThePiece = new Set(piece)
      expect(byDrizzle.some((row) => inThePiece.has(row.messageId)), `piece ${n + 1} has delivery rows`).toBe(true)
    })
    for (const column of ['because', 'run', 'inferredBy', 'offerPutOffAt', 'remindAt', 'remindSetByKind', 'remindSetById', 'remindedAt', 'carriedIn'] as const) {
      expect(byDrizzle.some((row) => row[column] !== null), `${column} is set on some row`).toBe(true)
      expect(byDrizzle.some((row) => row[column] === null), `${column} is empty on some row`).toBe(true)
    }
    // THE PIECES KEEP THEIR ORDER. Each piece is sorted by moment on its own, and the second piece's filled rows are
    // earlier than the first's, so the joined rows are not in the order of their moment.
    const moments = byDrizzle.map((row) => row.at)
    expect(moments, 'the joined rows are not in the order of their moment').not.toEqual([...moments].sort())
    expect(byHand).toStrictEqual(byDrizzle)
  })
})
