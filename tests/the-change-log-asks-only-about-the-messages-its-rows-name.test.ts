// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANGE LOG ASKS THE READER ONLY ABOUT THE MESSAGES ITS ROWS NAME, and answers as it did when it asked about every
 * message in the office.
 *
 * GET /api/changes leaves out every row naming a message the reader may not read. A row names a message in three ways:
 * as the record it is about, as a logged old or new value, or quoted inside a honour reading's value. The door used to
 * ask which of every message in the office the reader may not read, and test each row against that whole list. It now
 * asks only about the messages the rows it reads could name.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own:
 *   1. Hidden rows stay hidden, for each filter: `recordId` with and without `limit`, a session with `until` (both
 *      spellings), a session with `since` and `until`, a window alone, and `field` with `value`. The rows naming a
 *      message the reader may not read, in each of the three ways, are not listed, not counted in `matched` and not in
 *      `spent`. The rows naming a message it may read are listed. The limit cuts each list, so `truncated` is read.
 *   2. A deleted message stays hidden from a reader who is no party to it.
 *   3. A hidden message asked for by id is answered as an id naming nothing is.
 *   4. The same answer as before: for each filter, the door answers as it did when the hidden list was every message
 *      the reader may not read (`everyMessageHiddenFrom`, called here), for a limited agent, the person and the
 *      message worker.
 *   5. No statement the door reads hands back the id of a message that no row of the filter names, so none lists
 *      every message's id. The office holds more than 50 such messages.
 *   6. A writer who deleted its own message, with no delivery row naming the writer, sees the rows naming it, because
 *      the exact rule keeps the sender a party to a deleted message. When a reader is asked about more than 50 messages
 *      at once, the list is first narrowed to the messages it could be a party to, and that narrowing leaves out a
 *      deleted message the reader sent. The old door asked about every message in the office, so its answer here
 *      depended on how many messages the office held. Case 4 leaves this reader out for that reason.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. The agents, messages, records and
 * change rows are made up; the change rows are written straight into the table.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'

let t: TestDb
let app: FastifyInstance
let R: typeof import('../src/server/lib/records.ts')
let M: typeof import('../src/server/lib/messages.ts')
let H: typeof import('../src/server/lib/http.ts')
let S: typeof import('../src/server/lib/sessions-in.ts')
let P: typeof import('../src/server/lib/spent-on-this.ts')
let resolveSessionRef: (typeof import('../src/server/lib/resolve-session-ref.ts'))['resolveSessionRef']

/** The readers, as headers and as the actor the door reads from them. */
interface Reader {
  headers: Record<string, string>
  actor: { type: string; id: string }
}
function asAgent(handle: string): Reader {
  return {
    headers: { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle },
    actor: { type: 'agent', id: handle },
  }
}
const SHELF = asAgent('shelf-reader')
const GARDEN = asAgent('garden-writer')
const PERSON: Reader = {
  headers: { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
  actor: { type: 'human', id: THE_PERSON },
}
const MESSAGE_WORKER = asAgent('mole-office/the-message-worker')

/** An id that names nothing, asked at the same door as a hidden message to compare the two answers. */
const NOTHING = 'NOPEnothere99'

/** The day the made-up rows were written on, and a window over it. */
const SINCE = '2026-09-01 09:00:00'
const UNTIL = '2026-09-01 23:59:59'
/** Rows written by hand: fourteen of each of the nine kinds below. */
const ROWS = 126
/** More messages than the reader is asked about at once before its list is narrowed. */
const UNNAMED_COUNT = 60

/** The box record most rows are about, and the two runs that wrote them. */
let box = ''
let shownRun = ''
let hiddenRun = ''
/** The messages the shelf reader may not read, by the way a row names them. */
let asRecord = ''
let asValue = ''
let inHonour = ''
let deleted = ''
/** The garden writer's own message, which it deleted. The shelf reader may not read it. */
let ownDeleted = ''
/** The garden writer's registry id. */
let gardenWriter = ''
/** The message the shelf reader sent, so it may read it. */
let readable = ''
/** Messages no row names. */
let unnamed: string[] = []
/** The honour reading that quotes a hidden message, and one that quotes the readable message. */
let honourHidden = ''
let honourShown = ''
/** The ids of the rows written by hand that name a message the shelf reader may not read. */
const hiddenRows = new Set<string>()

/** What a case asks the door. */
interface Asked {
  recordId?: string
  session?: string
  sessionId?: string
  since?: string
  until?: string
  field?: string
  value?: string
  limit?: number
}

/** Each filter, made when the records exist. The limit cuts each list for the shelf reader. */
const FILTERS: [string, () => Asked][] = [
  ['recordId with a limit', () => ({ recordId: box, limit: 25 })],
  ['recordId without a limit', () => ({ recordId: box })],
  ['recordId inside a window', () => ({ recordId: box, since: SINCE, until: '2026-09-01 10:00:20', limit: 5 })],
  ['session with until', () => ({ session: shownRun, until: UNTIL, limit: 25 })],
  ['sessionId with until', () => ({ sessionId: shownRun, until: UNTIL, limit: 25 })],
  ['session with since and until', () => ({ session: shownRun, since: SINCE, until: UNTIL, limit: 25 })],
  ['a window alone', () => ({ since: SINCE, until: UNTIL, limit: 25 })],
  ['field with value', () => ({ field: 'data.state', value: 'finished', limit: 10 })],
  ['field with value, a honour reading', () => ({ field: 'data.honour', value: honourHidden })],
]

/** The readers case 4 asks for: the garden writer is left out, as case 6 says. */
const READERS: [string, Reader][] = [
  ['a limited agent', SHELF],
  ['the person', PERSON],
  ['the message worker, who reads every message', MESSAGE_WORKER],
]

function urlOf(asked: Asked): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(asked)) if (value !== undefined) query.set(key, String(value))
  return `/api/changes?${query.toString()}`
}

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}
async function ask(url: string, reader: Reader): Promise<Reply> {
  const reply = await app.inject({ method: 'GET', url, headers: reader.headers })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

/** One row of the reply's `changes`, as far as these cases read it. */
interface Listed {
  id: string
  oldValue: string | null
  newValue: string | null
}
const listedIn = (reply: Reply): Listed[] => reply.json['changes'] as Listed[]

/** The parts of the reply the hidden list decides. */
function thePartsOf(json: Record<string, unknown>): Record<string, unknown> {
  return {
    changes: json['changes'],
    sessions: json['sessions'],
    matched: json['matched'],
    truncated: json['truncated'],
    ...('spent' in json ? { spent: json['spent'] } : {}),
  }
}

const throughJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown

/**
 * THE ANSWER BEFORE: the same parts worked out with the hidden list the door used to read, every message the reader
 * may not read, through the functions the door calls.
 */
function theAnswerBefore(reader: Reader, asked: Asked): Record<string, unknown> {
  const hidden = M.everyMessageHiddenFrom(M.theMessageReader(reader.actor), HERE)
  const sessionAsked = asked.session ?? asked.sessionId
  const session = sessionAsked === undefined ? undefined : R.sessionFilterValues(resolveSessionRef(sessionAsked, HERE))
  const filter = { workspaceId: HERE, recordId: asked.recordId, since: asked.since, until: asked.until, session, field: asked.field, value: asked.value, hidden }
  const rows = R.listChanges({ ...filter, limit: asked.limit })
  const matched = R.countChangesMatching(filter)
  return throughJson({
    changes: H.toChanges(rows),
    sessions: S.sessionsIn(rows, HERE),
    matched,
    truncated: matched > rows.length,
    ...(asked.recordId === undefined ? {} : { spent: P.spentOnRecord(asked.recordId, HERE, hidden) }),
  }) as Record<string, unknown>
}

/** Every row the filter selects with nothing hidden, newest first, read without a hidden list. */
function everyRowOf(asked: Asked): ReturnType<typeof R.listChanges> {
  const sessionAsked = asked.session ?? asked.sessionId
  const session = sessionAsked === undefined ? undefined : R.sessionFilterValues(resolveSessionRef(sessionAsked, HERE))
  return R.listChanges({ workspaceId: HERE, recordId: asked.recordId, since: asked.since, until: asked.until, session, field: asked.field, value: asked.value, limit: 1000 })
}

/**
 * The ids among `watched` that any statement handed back while `work` ran. Every statement's `get`, `all` and
 * `iterate` is caught, as tests/a-sessions-change-rows-are-read-through-its-own-index.test.ts catches them.
 */
async function theIdsHandedBackDuring(watched: readonly string[], work: () => Promise<unknown>): Promise<Set<string>> {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => object }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const found = new Set<string>()
  const look = (row: unknown): void => {
    const text = JSON.stringify(row, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? ''
    for (const id of watched) if (text.includes(id)) found.add(id)
  }
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  for (const name of ['get', 'all', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args)
      if (name === 'iterate') {
        return (function* () {
          for (const row of result as Iterable<unknown>) {
            look(row)
            yield row
          }
        })()
      }
      if (name === 'all') for (const row of result as unknown[]) look(row)
      else look(result)
      return result
    }
  }
  try {
    await work()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
  return found
}

/** Register one agent as the person and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...PERSON.headers, 'content-type': 'application/json' },
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const listed = (await ask('/api/participants', PERSON)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

/** Write one message in process as this writer, and give back its id. */
function say(writer: string, title: string, to: string): string {
  return t.api.createRecord({ kind: 'message', title, workspaceId: HERE, data: { body: `Made-up words: ${title}`, to: [{ kind: 'agent', id: to }] }, actor: { type: 'agent', id: writer } as never }).id
}

/** Take away the copies the office routed to anybody else, so only the writer and the addressee are its parties. */
function onlyTheAddressee(messageId: string, addressee: string): void {
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(messageId, addressee)
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  writeDataBypassingTheGate(t, messageId, data)
}

/** Mark one message deleted, as its writer's delete does. */
function deleteIt(messageId: string): void {
  t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(localStamp(new Date()), messageId)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // Imported here, after freshDb() has named the test database: these modules open the database when they load.
  R = await import('../src/server/lib/records.ts')
  M = await import('../src/server/lib/messages.ts')
  H = await import('../src/server/lib/http.ts')
  S = await import('../src/server/lib/sessions-in.ts')
  P = await import('../src/server/lib/spent-on-this.ts')
  resolveSessionRef = (await import('../src/server/lib/resolve-session-ref.ts')).resolveSessionRef

  await anAgent('shelf-reader')
  const boxWriter = await anAgent('box-writer')
  gardenWriter = await anAgent('garden-writer')

  box = t.api.createRecord({ workspaceId: HERE, kind: 'idea', title: 'A made-up box on a shelf', data: {}, actor: t.api.HUMAN }).id
  const aRun = (title: string): string =>
    t.api.createRecord({ workspaceId: HERE, kind: 'session', title, origin: 'fixture', data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
  shownRun = aRun('A made-up run that sorted the shelf')
  hiddenRun = aRun('A made-up run that watered the garden')

  // THE BOX WRITER WRITES TO THE GARDEN WRITER, so the shelf reader is no party to any of these.
  asRecord = say('box-writer', 'A made-up note about the garden gate', gardenWriter)
  asValue = say('box-writer', 'A made-up note about the garden path', gardenWriter)
  inHonour = say('box-writer', 'A made-up note about the garden bench', gardenWriter)
  deleted = say('box-writer', 'A made-up note about the garden shed', gardenWriter)
  for (const id of [asRecord, asValue, inHonour, deleted]) onlyTheAddressee(id, gardenWriter)
  deleteIt(deleted)
  // THE GARDEN WRITER'S OWN MESSAGE, deleted, with no delivery row naming its writer.
  ownDeleted = say('garden-writer', 'A made-up note about the shelf brackets', boxWriter)
  onlyTheAddressee(ownDeleted, boxWriter)
  deleteIt(ownDeleted)
  // THE SHELF READER SENT THIS ONE, so it may read it.
  readable = say('shelf-reader', 'A made-up note about the shelf height', gardenWriter)
  onlyTheAddressee(readable, gardenWriter)
  unnamed = []
  for (let n = 0; n < UNNAMED_COUNT; n += 1) unnamed.push(say('box-writer', `A made-up note about garden bed ${String(n)}`, gardenWriter))

  honourHidden = JSON.stringify({ signals: [{ id: 'a-made-up-signal', evidence: [inHonour] }] })
  honourShown = JSON.stringify({ signals: [{ id: 'a-made-up-signal', evidence: [readable, box] }] })

  // THE NINE KINDS OF ROW, in turn. Two rows share each second, so the order within a second is the written order.
  const kinds: readonly (readonly [record: string, run: string, field: string, oldValue: string | null, newValue: string | null, hidden: boolean])[] = [
    [box, shownRun, 'title', 'An old shelf title', 'A new shelf title', false],
    [box, shownRun, 'data.state', 'running', 'finished', false],
    [box, shownRun, 'data.link', null, asValue, true],
    [box, hiddenRun, 'data.state', deleted, 'finished', true],
    [asRecord, shownRun, 'data.state', 'running', 'finished', true],
    [box, shownRun, 'data.honour', null, honourHidden, true],
    [box, shownRun, 'data.link', null, readable, false],
    [box, shownRun, 'data.honour', null, honourShown, false],
    [box, shownRun, 'data.link', ownDeleted, null, true],
  ]
  const insert = t.client.sqlite.prepare(
    `INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, at, field, old_value, new_value)
     VALUES (?, ?, ?, 'update', 'agent', 'made-up-writer', ?, ?, ?, ?, ?)`,
  )
  for (let k = 0; k < ROWS; k += 1) {
    const [record, run, field, oldValue, newValue, hidden] = kinds[k % kinds.length]!
    const id = `cl-made-up-${String(k).padStart(4, '0')}`
    insert.run(id, record, HERE, run, localStamp(new Date(2026, 8, 1, 10, 0, Math.floor(k / 2))), field, oldValue, newValue)
    if (hidden) hiddenRows.add(id)
  }
}, 180_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/changes asks only about the messages its rows name', () => {
  it.each(FILTERS)('1. hidden rows stay hidden: %s', async (_what, make) => {
    const asked = make()
    const every = everyRowOf(asked)
    expect(every.filter((row) => hiddenRows.has(row.id)).length, 'the filter selects rows naming a hidden message').toBeGreaterThan(0)
    const shown = every.filter((row) => !hiddenRows.has(row.id))
    const limit = asked.limit ?? 200

    const reply = await ask(urlOf(asked), SHELF)
    expect(reply.status, reply.body).toBe(200)
    for (const id of [asRecord, asValue, inHonour, deleted, ownDeleted]) expect(reply.body, `the reply names ${id}`).not.toContain(id)
    expect(listedIn(reply).map((row) => row.id), 'the rows listed').toEqual(shown.slice(0, limit).map((row) => row.id))
    expect(reply.json['matched'], 'the rows counted').toBe(shown.length)
    expect(reply.json['truncated']).toBe(shown.length > limit)
    if (asked.limit !== undefined && shown.length > 0) expect(reply.json['truncated'], 'the limit cuts the list').toBe(true)

    if (asked.recordId !== undefined) {
      // SPENT READS THE RECORD'S WHOLE LOG, whatever window the list was asked over.
      const wholeLog = everyRowOf({ recordId: asked.recordId }).filter((row) => !hiddenRows.has(row.id))
      const spent = reply.json['spent'] as { changesOnRecord: number; runs: { id: string }[] }
      expect(spent.changesOnRecord, 'the rows spent counts').toBe(wholeLog.length)
      expect(spent.runs.map((run) => run.id), 'the runs spent counts').toEqual([shownRun])
    }
  })

  it('1. the person is shown the rows the shelf reader is not, so the cases above can fail', async () => {
    const reply = await ask(urlOf({ recordId: box }), PERSON)
    expect(reply.status, reply.body).toBe(200)
    for (const id of [asValue, inHonour, deleted, ownDeleted]) expect(reply.body).toContain(id)
    const spent = reply.json['spent'] as { runs: { id: string }[] }
    expect(spent.runs.map((run) => run.id).sort()).toEqual([shownRun, hiddenRun].sort())
  })

  it('2. a deleted message stays hidden from a reader who is no party to it', async () => {
    expect(t.client.sqlite.prepare('SELECT deleted_at AS at FROM records WHERE id = ?').get(deleted)).toEqual({ at: expect.any(String) })
    for (const asked of [{ recordId: box }, { session: hiddenRun, until: UNTIL }, { field: 'data.state', value: 'finished' }] satisfies Asked[]) {
      const shelf = await ask(urlOf(asked), SHELF)
      expect(shelf.status, shelf.body).toBe(200)
      expect(listedIn(shelf).filter((row) => row.oldValue === deleted), urlOf(asked)).toEqual([])
      expect(shelf.body).not.toContain(deleted)
      const person = await ask(urlOf(asked), PERSON)
      expect(listedIn(person).filter((row) => row.oldValue === deleted).length, urlOf(asked)).toBeGreaterThan(0)
    }
  })

  it('3. a hidden message asked for by id is answered as an id naming nothing is', async () => {
    for (const id of [asRecord, deleted]) {
      for (const limit of ['', '&limit=5']) {
        const hidden = await ask(`/api/changes?recordId=${id}${limit}`, SHELF)
        const nothing = await ask(`/api/changes?recordId=${NOTHING}${limit}`, SHELF)
        expect(hidden.status, hidden.body).toBe(nothing.status)
        expect(hidden.body.split(id).join('<id>')).toBe(nothing.body.split(NOTHING).join('<id>'))
        expect(listedIn(hidden)).toEqual([])
        expect(hidden.json['matched']).toBe(0)
      }
    }
    // THE ROWS ARE THERE, so the answer above is the hidden list's doing.
    expect(listedIn(await ask(`/api/changes?recordId=${asRecord}`, PERSON)).length).toBeGreaterThan(0)
  })

  // THE GARDEN WRITER IS LEFT OUT HERE: the old door's answer for its own deleted message depended on how many messages
  // the office held (case 6).
  describe.each(READERS)('4. the same answer as before, for %s', (_who, reader) => {
    it.each(FILTERS)('%s', async (_what, make) => {
      const asked = make()
      const reply = await ask(urlOf(asked), reader)
      expect(reply.status, reply.body).toBe(200)
      expect(thePartsOf(reply.json)).toEqual(theAnswerBefore(reader, asked))
    })
  })

  it('4. the person and the message worker are shown the rows naming every message', async () => {
    for (const reader of [PERSON, MESSAGE_WORKER]) {
      const reply = await ask(urlOf({ session: shownRun, until: UNTIL, limit: 1000 }), reader)
      expect(reply.status, reply.body).toBe(200)
      for (const id of [asRecord, asValue, inHonour, ownDeleted, readable]) expect(reply.body).toContain(id)
    }
  })

  it('5. no statement the door reads hands back a message no row names', async () => {
    expect(unnamed.length, 'more messages than a list is asked about before it is narrowed').toBeGreaterThan(50)
    const found = await theIdsHandedBackDuring([...unnamed, asValue], async () => {
      for (const [, make] of FILTERS) {
        const reply = await ask(urlOf(make()), SHELF)
        expect(reply.status, reply.body).toBe(200)
      }
    })
    expect(found.has(asValue), 'the watch sees the messages the rows name').toBe(true)
    expect(unnamed.filter((id) => found.has(id)), 'messages no row names, handed back by a statement').toEqual([])
  })

  it('6. a writer who deleted its own message sees the rows naming it, by the exact rule', async () => {
    const delivered = t.client.sqlite.prepare('SELECT count(*) AS n FROM message_delivery WHERE message_id = ? AND recipient_id IN (?, ?)')
    expect(delivered.get(ownDeleted, 'garden-writer', gardenWriter), 'no delivery row names its writer').toEqual({ n: 0 })
    const reply = await ask(urlOf({ recordId: box }), GARDEN)
    expect(reply.status, reply.body).toBe(200)
    const naming = everyRowOf({ recordId: box }).filter((row) => row.oldValue === ownDeleted)
    expect(naming.length).toBeGreaterThan(0)
    expect(listedIn(reply).filter((row) => row.oldValue === ownDeleted).map((row) => row.id)).toEqual(naming.map((row) => row.id))
  })
})
