// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACT LIST READS THE ROWS OF THE MESSAGES IT CHOSE IN ONE STATEMENT THROUGH BETTER-SQLITE3, AND EVERY VALUE IS THE
 * ONE DRIZZLE GAVE.
 *
 * GET /api/messages/contact-list chooses the messages a reader is a party to, then reads their rows: the id, the project,
 * the kind, the title, the stored fields and the time written. That read went through drizzle's select, which reads each
 * row as a list and maps it to named fields. It now runs drizzle's own statement through better-sqlite3 and builds each
 * row by hand, decoding the stored fields with the column's own decoder.
 *
 * WHAT THIS FILE HOLDS, for each of three readers, the person, a supervisor and a worker:
 *   1. One statement reads the chosen rows. Every `all`, `get`, `iterate` and `raw` on the better-sqlite3 statement
 *      prototype is caught while the door answers, and the wrap is undone after. The statement is run with `all`, and
 *      `raw` is never asked of it, so its rows come back keyed by their column names. Drizzle asks `raw` of every
 *      select it maps, so drizzle did not map these rows.
 *   2. The rows it hands back are drizzle's rows, in drizzle's order and value for value. Messages written in the same
 *      second are among them, so the order after the time is the order the rows were stored.
 *   3. The messages built from those rows are the messages built from drizzle's rows.
 *   4. The door's answer is the answer written out below: for each made-up contact, its last message, when it was
 *      sent and its words.
 *   5. Stored fields that will not read stop the read with the error drizzle's decoder gives.
 *
 * THE REFERENCES, and why each is the one it is.
 *   - For 2, drizzle's `db.select(...)` of the same six columns, built as the door built it: the ids asked with `IN`,
 *     ordered by the time written and then `rowid`. It is drizzle's own mapping, so it is what the door read before.
 *   - For 3, `messagePool`, which reads every live message through drizzle's select of the same columns and builds
 *     each one with the same builder the contact list uses. So a value the hand-built rows got wrong shows as a field
 *     that differs, even where the contact row does not draw it.
 *   - For 4, the expected answer written out, because it is what a person reads, and the made-up world below decides
 *     it: which messages each reader is a party to, and which is the newest with each contact.
 *
 * DATA OF EVERY SHAPE. Every message stores nested objects and lists, whole and fractional and large numbers, true and
 * false, null, an empty object, an empty list and Unicode words. One message stores its fields as indented text with
 * escaped letters and a number written `1.0`, so the decoder, not the text, decides the value. No row stores NULL,
 * because drizzle's schema declares the column not null.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agents and messages
 * are made up. The messages are written straight into the tables, so each stored field and each time is the one
 * written here. Every module that reaches the database client is imported after `freshDb`.
 */
import type { FastifyInstance } from 'fastify'
import { inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HOME = 'default'
const ORCHARD = 'made-up-orchard'
const DAY = '2090-03-02'

let t: TestDb
let app: FastifyInstance
let M: typeof import('../src/server/lib/messages.ts')
let D: typeof import('../src/server/db/client.ts')
let S: typeof import('../src/server/db/schema.ts')

function asThePerson(): Record<string, string> {
  return { 'x-mole-office-workspace': HOME, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
}

function asAgent(handle: string): Record<string, string> {
  return { ...asThePerson(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

type Who = 'person' | 'supervisor' | 'worker' | 'sloe'
const HANDLES: Record<Exclude<Who, 'person'>, string> = { supervisor: 'quince-supervisor', worker: 'medlar-worker', sloe: 'sloe-agent' }
const WHO: Partial<Record<Who, ParticipantRef>> = { person: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } }
const who = (whose: Who): ParticipantRef => WHO[whose]!

/** Every shape a stored field can take, stored with every made-up message. */
const EVERY_SHAPE = {
  nested: { branch: { leaf: ['quince', 2, { deeper: null }] } },
  whole: 1,
  fraction: -0.25,
  large: 1e21,
  yes: true,
  no: false,
  nothing: null,
  empty: {},
  emptyList: [],
  words: 'Grüße, 你好, 🌳, "quoted" and a back\\slash',
}

type Made = { id: string; from: Who; to: Who; at: string; project: string; body: string }

/** The made-up messages, in the order they are stored. Four share 09:00:00, and the one stored fourth was written first. */
const MESSAGES: Made[] = [
  { id: 'made-up-m01', from: 'person', to: 'supervisor', at: `${DAY} 09:00:00`, project: HOME, body: 'Are the quinces picked?' },
  { id: 'made-up-m02', from: 'supervisor', to: 'person', at: `${DAY} 09:00:00`, project: ORCHARD, body: 'Half of them, Grüße.' },
  { id: 'made-up-m03', from: 'person', to: 'worker', at: `${DAY} 09:00:00`, project: HOME, body: 'Pick the medlars after the frost.' },
  { id: 'made-up-m04', from: 'worker', to: 'person', at: `${DAY} 08:59:59`, project: ORCHARD, body: '霜后再摘。' },
  { id: 'made-up-m05', from: 'supervisor', to: 'worker', at: `${DAY} 09:00:00`, project: HOME, body: 'Leave the sloes.' },
  { id: 'made-up-m06', from: 'worker', to: 'supervisor', at: `${DAY} 09:00:01`, project: ORCHARD, body: 'The sloes stay on the hedge 🌳' },
  { id: 'made-up-m07', from: 'sloe', to: 'worker', at: `${DAY} 09:00:02`, project: HOME, body: 'Ça mûrit.' },
  { id: 'made-up-m08', from: 'person', to: 'sloe', at: `${DAY} 09:00:02`, project: HOME, body: 'Thank you, sloe.' },
  { id: 'made-up-m09', from: 'worker', to: 'person', at: `${DAY} 09:00:03`, project: HOME, body: 'The medlars are bletted, schön.' },
  { id: 'made-up-m10', from: 'supervisor', to: 'person', at: `${DAY} 09:00:03`, project: ORCHARD, body: 'Every quince is in.' },
]

/** The message stored as indented text, with its letters escaped and its whole number written `1.0`. */
const AS_INDENTED_TEXT = 'made-up-m09'

/**
 * THE ANSWER WRITTEN OUT, for each reader: its made-up messages oldest first, the time and then the order stored, and
 * the last message with each made-up contact.
 */
const EXPECTED: Record<'person' | 'supervisor' | 'worker', { ids: string[]; last: Partial<Record<Who, string>> }> = {
  person: {
    ids: ['made-up-m04', 'made-up-m01', 'made-up-m02', 'made-up-m03', 'made-up-m08', 'made-up-m09', 'made-up-m10'],
    last: { supervisor: 'made-up-m10', worker: 'made-up-m09', sloe: 'made-up-m08' },
  },
  supervisor: {
    ids: ['made-up-m01', 'made-up-m02', 'made-up-m05', 'made-up-m06', 'made-up-m10'],
    last: { person: 'made-up-m10', worker: 'made-up-m06' },
  },
  worker: {
    ids: ['made-up-m04', 'made-up-m03', 'made-up-m05', 'made-up-m06', 'made-up-m07', 'made-up-m09'],
    last: { person: 'made-up-m09', supervisor: 'made-up-m06', sloe: 'made-up-m07' },
  },
}

const READERS: [string, 'person' | 'supervisor' | 'worker', () => Record<string, string>][] = [
  ['the person', 'person', asThePerson],
  ['a supervisor', 'supervisor', () => asAgent(HANDLES.supervisor)],
  ['a worker', 'worker', () => asAgent(HANDLES.worker)],
]

const THE_COLUMNS_AS_STORED = ['id', 'workspace_id', 'kind', 'title', 'data', 'created_at']

/** The stored fields of one made-up message, as the text written into the row. */
function theStoredText(made: Made): string {
  const data = { body: made.body, sentBy: who(made.from), to: [who(made.to)], writtenIn: { project: made.project }, extra: EVERY_SHAPE }
  if (made.id !== AS_INDENTED_TEXT) return JSON.stringify(data)
  const text = JSON.stringify(data, null, 2)
  const indented = text.replace('"whole": 1,', '"whole": 1.0,').replace(/ö/g, '\\u00f6').replace(/ü/g, '\\u00fc')
  // THE CONTROL: the text differs from what JSON writes, and reads back to the same value.
  expect(indented).not.toBe(text)
  expect(JSON.parse(indented)).toEqual(data)
  return indented
}

/** A made-up message and its one delivery row, written straight into the tables. */
function store(id: string, dataText: string, at: string, to: ParticipantRef): void {
  t.client.sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, 'message', `Made-up ${id}`, dataText, 'authored')
  t.client.sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`${id}-delivery`, id, to.kind, to.id, 'delivered', at, 'A made-up delivery.')
}

interface Asked {
  source: string
  how: 'all' | 'get' | 'iterate'
  raw: boolean
  rows: unknown[] | null
}

/**
 * Every statement `work` ran, how it was run, whether `raw` had been asked of it, and the rows it handed back. `all`,
 * `get`, `iterate` and `raw` are caught on the statement prototype, and put back after.
 */
async function theStatementsDuring(work: () => Promise<unknown> | unknown): Promise<Asked[]> {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate' | 'raw', (...args: unknown[]) => unknown>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate, raw: proto.raw }
  const inRawMode = new WeakSet<object>()
  const asked: Asked[] = []
  proto.raw = function (this: object, ...args: unknown[]) {
    if (args[0] === false) inRawMode.delete(this)
    else inRawMode.add(this)
    return originals.raw.apply(this, args)
  }
  proto.all = function (this: { source: string }, ...args: unknown[]) {
    const rows = originals.all.apply(this, args) as unknown[]
    asked.push({ source: this.source, how: 'all', raw: inRawMode.has(this), rows })
    return rows
  }
  proto.get = function (this: { source: string }, ...args: unknown[]) {
    const row = originals.get.apply(this, args)
    asked.push({ source: this.source, how: 'get', raw: inRawMode.has(this), rows: row === undefined ? [] : [row] })
    return row
  }
  proto.iterate = function (this: { source: string }, ...args: unknown[]) {
    asked.push({ source: this.source, how: 'iterate', raw: inRawMode.has(this), rows: null })
    return originals.iterate.apply(this, args)
  }
  try {
    await work()
  } finally {
    Object.assign(proto, originals)
  }
  return asked
}

const firstOf = (row: unknown): unknown => (Array.isArray(row) ? row[0] : typeof row === 'object' && row !== null ? Object.values(row)[0] : row)
const widthOf = (row: unknown): number => (Array.isArray(row) ? row.length : typeof row === 'object' && row !== null ? Object.keys(row).length : 1)

/** The statements that read six columns of records and handed back every one of `ids` as the first of them. */
function theReadsOfTheseRows(asked: readonly Asked[], ids: readonly string[]): Asked[] {
  return asked.filter((one) => {
    const rows = one.rows
    if (rows === null || rows.length === 0 || !/from "records"/i.test(one.source)) return false
    return rows.every((row) => widthOf(row) === 6) && ids.every((id) => rows.some((row) => firstOf(row) === id))
  })
}

/** Drizzle's select of the six columns, built as the door built it, on these ids. */
function drizzlesRowsOf(ids: readonly string[]): unknown[] {
  const records = S.records
  return D.db
    .select({ id: records.id, workspaceId: records.workspaceId, kind: records.kind, title: records.title, data: records.data, createdAt: records.createdAt })
    .from(records)
    .where(inArray(records.id, [...ids]))
    .orderBy(records.createdAt, sql`rowid`)
    .all()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  M = await import('../src/server/lib/messages.ts')
  D = await import('../src/server/db/client.ts')
  S = await import('../src/server/db/schema.ts')
  const project = await app.inject({ method: 'POST', url: '/api/workspaces', headers: asThePerson(), payload: { id: ORCHARD, title: 'A made-up orchard' } })
  expect(project.statusCode, project.body.slice(0, 300)).toBe(201)
  const roles: Record<Exclude<Who, 'person'>, Record<string, unknown>> = { supervisor: { role: 'supervisor' }, worker: { role: 'worker' }, sloe: { workArea: ['src'] } }
  for (const [whose, handle] of Object.entries(HANDLES) as [Exclude<Who, 'person'>, string][]) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: `Made-up ${handle}`, ...roles[whose] } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    WHO[whose] = { kind: 'agent', id: (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id }
  }
  t.client.sqlite.transaction(() => {
    for (const made of MESSAGES) store(made.id, theStoredText(made), made.at, who(made.to))
  })()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The door's answer to one reader, with every statement it ran. */
async function theContactListOf(headers: Record<string, string>): Promise<{ status: number; body: string; asked: Asked[] }> {
  let status = 0
  let body = ''
  const asked = await theStatementsDuring(async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/messages/contact-list', headers })
    status = reply.statusCode
    body = reply.body
  })
  return { status, body, asked }
}

describe.each(READERS)('the contact list of %s', (_said, reader, headers) => {
  const mine = (): string[] => EXPECTED[reader].ids

  it('1. one statement reads the chosen rows, through better-sqlite3 and not through drizzle\'s mapping', async () => {
    const { status, body, asked } = await theContactListOf(headers())
    expect(status, body.slice(0, 600)).toBe(200)
    // RUN WITH `all` AND NEVER ASKED `raw`, so its rows are keyed by their columns and drizzle did not map them.
    const read = one(theReadsOfTheseRows(asked, mine()), 'the statement that read the chosen rows')
    expect([read.how, read.raw], read.source).toEqual(['all', false])
    for (const row of read.rows ?? []) expect(Object.keys(row as object)).toEqual(THE_COLUMNS_AS_STORED)
  }, 60_000)

  it('2. the rows it hands back are drizzle\'s rows, in drizzle\'s order and value for value', async () => {
    const { status, body, asked } = await theContactListOf(headers())
    expect(status, body.slice(0, 600)).toBe(200)
    const read = one(theReadsOfTheseRows(asked, mine()), 'the statement that read the chosen rows')
    const stored = (read.rows ?? []) as Record<string, unknown>[]
    const ids = stored.map((row) => String(firstOf(row)))
    // THE MADE-UP MESSAGES, oldest first and then in the order stored, because some were written in the same second.
    expect(ids.filter((id) => mine().includes(id))).toEqual(mine())
    // EACH COLUMN BY ITS NAME, the stored fields read as JSON text is read.
    const asDrizzleNamesThem = stored.map((row) => ({
      id: row['id'],
      workspaceId: row['workspace_id'],
      kind: row['kind'],
      title: row['title'],
      data: JSON.parse(String(row['data'])) as unknown,
      createdAt: row['created_at'],
    }))
    expect(asDrizzleNamesThem).toEqual(drizzlesRowsOf(ids))
  }, 60_000)

  it('3. the messages built from the rows are the ones built from drizzle\'s rows', async () => {
    const { status, body } = await theContactListOf(headers())
    expect(status, body.slice(0, 600)).toBe(200)
    const me = (JSON.parse(body) as { me: ParticipantRef }).me
    let pool: { id: string }[] = []
    const asked = await theStatementsDuring(() => {
      pool = M.theContactsOfOneReader(me, null, HOME).pool
    })
    // THE CONTROL: this read reads the chosen rows in one statement too, and builds one message from each, in order.
    const read = one(theReadsOfTheseRows(asked, mine()), 'the statement that read the chosen rows')
    expect(pool.map((entry) => entry.id)).toEqual((read.rows ?? []).map(firstOf))
    const built = new Map(M.messagePool(MESSAGE_CENTRE).map((entry) => [entry.id, entry]))
    // EACH POOL ENTRY HOLDS ONLY THE FIELDS THE CONTACTS READ, so after the ids it is compared with the same whole entry
    // cut to its own keys, a routed entry's symbol among them.
    expect(pool.map((entry) => entry.id)).toEqual(pool.map((entry) => built.get(entry.id)?.id))
    expect(pool).toEqual(pool.map((entry) => Object.fromEntries(Reflect.ownKeys(entry).map((key) => [key, Reflect.get(built.get(entry.id) ?? {}, key)]))))
  }, 60_000)

  it('4. the answer is the one written out: each made-up contact\'s last message, when it was sent, and its words', async () => {
    const { status, body } = await theContactListOf(headers())
    expect(status, body.slice(0, 600)).toBe(200)
    const answer = JSON.parse(body) as { contacts: { key: string; last: unknown }[]; folded: { key: string; last: unknown }[] }
    const expected = EXPECTED[reader].last
    const keys = new Map((Object.keys(expected) as Who[]).map((whose) => [participantKey(who(whose)), whose]))
    const drawn = Object.fromEntries([...answer.contacts, ...answer.folded].filter((row) => keys.has(row.key)).map((row) => [keys.get(row.key)!, row.last]))
    const written = Object.fromEntries(
      Object.entries(expected).map(([whose, id]) => {
        const made = MESSAGES.find((message) => message.id === id)!
        return [whose, { id, sentAt: made.at, body: made.body }]
      }),
    )
    expect(drawn).toEqual(written)
  }, 60_000)
})

describe('5. stored fields that will not read', () => {
  it('stop the read with the error drizzle\'s decoder gives', async () => {
    const handle = 'rowan-agent'
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: `Made-up ${handle}`, workArea: ['src'] } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    const rowan: ParticipantRef = { kind: 'agent', id: (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id }
    const unreadable = '{"body": "The rowan berries'
    const decoderSays = (() => {
      try {
        S.records.data.mapFromDriverValue(unreadable)
      } catch (error) {
        return error
      }
      return null
    })()
    // THE CONTROL: the column's own decoder will not read the text.
    expect(decoderSays).toBeInstanceOf(SyntaxError)
    store('made-up-unreadable', unreadable, `${DAY} 10:00:00`, rowan)
    try {
      expect(() => M.theContactsOfOneReader(rowan, null, HOME)).toThrow(decoderSays as SyntaxError)
    } finally {
      t.client.sqlite.prepare("DELETE FROM message_delivery WHERE message_id = 'made-up-unreadable'").run()
      t.client.sqlite.prepare("DELETE FROM records WHERE id = 'made-up-unreadable'").run()
    }
  }, 60_000)
})
