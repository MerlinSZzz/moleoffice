// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Round 76 of wave 13y: the talk reads no message's words, and a caller who may read only their own messages finds its
 * latest place, and reads on from it, among those.
 * Every project, agent, message and word below is made up for this fresh test database. This is not a load measurement.
 *
 * The talk hands back who sent a message to whom and when, and nothing the message says. It built every message it read
 * whole, with its words, its writer's rung and runs and its edit window, and then kept five fields. A asks every form of
 * the talk, for the person and for a caller who may read only their own, and looks for a message's words in every row
 * SQLite hands back. B compares the door and the scene's reader with the board's own pool, message by message, for the
 * stored shapes that a reader of fewer fields could read another way, and names the withdrawals each caller is told of.
 * C counts the rows SQLite hands back to a refused caller's start=latest, and to its read on from that place, when
 * messages and withdrawals it may not read are added after its newest ones.
 *
 * Mutations, each turns it red, are listed with the round's report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import type { PluginTalkView } from '../src/shared/plugin-read.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PROJECTS = ['default', 'invented-orchard'] as const
const [HOME, ORCHARD] = PROJECTS
const MOMENT = '2026-10-20 12:00:00'
/** Every made-up message's words carry these, so a row holding a message's words is found by them. */
const WORDS = 'Made-up words of'
const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
let reader: ParticipantRef
let other: ParticipantRef
let AGENT: Record<string, string>
type Communication = { id: string; project: string; at: string; from: ParticipantRef; to: ParticipantRef[] }
type Count = { runs: number; rows: number }
type Counts = Map<string, Count>
type Ran = { sql: string; rows: number; words: number }
/** Who sees a made-up message in which projects, and whose withdrawal each caller is told of, said by construction. */
const SEES: { id: string; person: string[]; reader: string[] }[] = []
const TOLD: { id: string; person: boolean; reader: boolean }[] = []

interface Planted {
  id: string
  /** The stored data, written as it is: the words are added unless `stored` is given. */
  data: Record<string, unknown>
  /** The stored text itself, for a shape JSON.stringify does not write. */
  stored?: (data: Record<string, unknown>) => string
  deliveries: { kind: string; id: string; mark?: string }[]
  /** Its words went out before Mole Office recorded which conversation carried them. */
  marker?: boolean
  withdrawn?: boolean
  person: string[]
  reader: string[]
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['invented-reader', 'invented-other']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: `Made-up ${handle}`, workArea: ['src'] } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
    if (handle === 'invented-reader') {
      reader = { kind: 'agent', id }
      AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': String(made.json().whatToGiveIt.key) }
    } else other = { kind: 'agent', id }
  }
  const page = (project: string) => ({ type: 'record', target: { workspaceId: project, recordId: `invented-page-in-${project}` } })
  // THE READER'S ID WITH ITS FIRST LETTER WRITTEN AS A JSON ESCAPE, which JSON.stringify never writes and every JSON reader reads as the letter.
  const escaped = (data: Record<string, unknown>) => {
    const letter = reader.id.charCodeAt(0).toString(16).padStart(4, '0')
    return JSON.stringify(data).replace(`"id":"${reader.id}"`, `"id":"${String.fromCharCode(92)}u${letter}${reader.id.slice(1)}"`)
  }
  // THE AGENT CHOSEN FOR A COMMENT, as the review column's Choose a recipient stores it beside the `to` the door writes.
  const chosen = { kind: 'agent', agentId: reader.id }
  const planted: Planted[] = [
    // A comment whose recipient was chosen for it is sent once anybody has been handed its words, whichever way.
    { id: 'invented-comment-gone-out-by-a-marker', data: { sentBy: person, to: [reader], chosenRecipient: chosen, writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'queued' }], marker: true, person: [HOME], reader: [HOME] },
    { id: 'invented-comment-delivered', data: { sentBy: person, to: [reader], chosenRecipient: chosen, writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'delivered' }], person: [HOME], reader: [HOME] },
    { id: 'invented-comment-archived', data: { sentBy: person, to: [reader], chosenRecipient: chosen, writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'archived' }], person: [], reader: [] },
    { id: 'invented-comment-queued-to-one-seen-by-another', data: { sentBy: person, to: [other, reader], chosenRecipient: chosen, writtenIn: { project: ORCHARD }, target: page(ORCHARD) }, deliveries: [{ ...other, mark: 'queued' }, reader], person: [ORCHARD], reader: [ORCHARD] },
    // A comment written straight to somebody, as the comment box's Send writes it, is sent when it is written.
    { id: 'invented-comment-written-straight-to-the-reader', data: { sentBy: person, to: [reader], writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'queued' }], person: [HOME], reader: [HOME] },
    { id: 'invented-comment-handed-to-nobody', data: { sentBy: person, to: [], writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [], person: [], reader: [] },
    { id: 'invented-comment-of-a-mark-nobody-knows', data: { sentBy: person, to: [reader], chosenRecipient: chosen, writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'invented-mark' }], person: [], reader: [] },
    // Only a target that is an object makes a message a comment.
    { id: 'invented-target-a-list', data: { sentBy: person, to: [reader], writtenIn: { project: HOME }, target: [page(HOME)] }, deliveries: [{ ...reader, mark: 'queued' }], person: [HOME], reader: [HOME] },
    { id: 'invented-target-words', data: { sentBy: person, to: [reader], writtenIn: { project: ORCHARD }, target: 'a made-up page' }, deliveries: [{ ...reader, mark: 'queued' }], person: [ORCHARD], reader: [ORCHARD] },
    { id: 'invented-target-null', data: { sentBy: person, to: [reader], writtenIn: { project: HOME }, target: null }, deliveries: [{ ...reader, mark: 'queued' }], person: [HOME], reader: [HOME] },
    // A sender is a participant of a known kind with an id, and nothing else is one.
    { id: 'invented-sender-a-string', data: { sentBy: reader.id, to: [other], writtenIn: { project: HOME } }, deliveries: [other], person: [], reader: [] },
    { id: 'invented-sender-of-no-known-kind', data: { sentBy: { kind: 'invented-kind', id: reader.id }, to: [other], writtenIn: { project: HOME } }, deliveries: [other], person: [], reader: [] },
    { id: 'invented-sender-with-an-empty-id', data: { sentBy: { kind: 'agent', id: '' }, to: [reader], writtenIn: { project: HOME } }, deliveries: [reader], person: [], reader: [] },
    { id: 'invented-sender-null', data: { sentBy: null, to: [reader], writtenIn: { project: HOME } }, deliveries: [reader], person: [], reader: [] },
    { id: 'invented-sender-a-list', data: { sentBy: [reader], to: [other], writtenIn: { project: HOME } }, deliveries: [other], person: [], reader: [] },
    { id: 'invented-sender-with-a-name', data: { sentBy: { ...reader, name: 'Made-up name' }, to: [other], writtenIn: { project: ORCHARD } }, deliveries: [other], person: [ORCHARD], reader: [ORCHARD] },
    { id: 'invented-sender-written-with-an-escape', data: { sentBy: reader, to: [other], writtenIn: { project: HOME } }, stored: escaped, deliveries: [other], person: [HOME], reader: [HOME] },
    // Withdrawn messages, named to a caller who would see them were they not withdrawn.
    { id: 'invented-withdrawn-comment-gone-out', data: { sentBy: person, to: [reader], chosenRecipient: chosen, writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'queued' }], marker: true, withdrawn: true, person: [], reader: [] },
    { id: 'invented-withdrawn-comment-queued', data: { sentBy: person, to: [reader], chosenRecipient: chosen, writtenIn: { project: HOME }, target: page(HOME) }, deliveries: [{ ...reader, mark: 'queued' }], withdrawn: true, person: [], reader: [] },
    { id: 'invented-withdrawn-from-a-string', data: { sentBy: THE_PERSON, to: [reader], writtenIn: { project: ORCHARD } }, deliveries: [reader], withdrawn: true, person: [], reader: [] },
    { id: 'invented-withdrawn-between-others', data: { sentBy: other, to: [person], writtenIn: { project: ORCHARD } }, deliveries: [person], withdrawn: true, person: [], reader: [] },
  ]
  const told: Record<string, { person: boolean; reader: boolean }> = {
    'invented-withdrawn-comment-gone-out': { person: true, reader: true },
    'invented-withdrawn-comment-queued': { person: false, reader: false },
    'invented-withdrawn-from-a-string': { person: false, reader: false },
    'invented-withdrawn-between-others': { person: true, reader: false },
  }
  const sqlite = t.client.sqlite
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE workspaces SET created_at = '2026-10-18 00:00:00' WHERE id = 'default'").run()
    sqlite.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(ORCHARD, `Made-up ${ORCHARD}`, MOMENT, MOMENT)
    // The registration's own notices belong to this invented office too, at a fixed older moment.
    sqlite.prepare("UPDATE records SET created_at = '2026-10-19 00:00:00', updated_at = '2026-10-19 00:00:00' WHERE kind = 'message'").run()
    for (const [n, one] of planted.entries()) {
      plant(one, `2026-10-20 10:00:${String(n).padStart(2, '0')}`, 300_000 + n)
      if (one.withdrawn === true) TOLD.push({ id: one.id, ...told[one.id]! })
      else SEES.push({ id: one.id, person: one.person, reader: one.reader })
    }
  })()
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

/** A made-up message in the shape the message door stores, with its delivery rows, its marker and its withdrawal. */
function plant(one: Planted, at: string, order: number): void {
  const sqlite = t.client.sqlite
  const data = { body: `${WORDS} ${one.id}`, ...one.data }
  sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(one.id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, 'message', `Made-up ${one.id}`, one.stored?.(data) ?? JSON.stringify(data), 'authored', one.withdrawn === true ? MOMENT : null)
  for (const [n, to] of one.deliveries.entries()) {
    sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${one.id}-delivery-${n}`, one.id, to.kind, to.id, to.mark ?? 'seen', at)
  }
  if (one.marker === true) sqlite.prepare("INSERT INTO annotation_words_fixed (annotation_id, fixed_at, because) VALUES (?, ?, 'A made-up marker.')").run(one.id, at)
  if (one.withdrawn === true) {
    sqlite.prepare('INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at, append_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`invented-change-${order}`, one.id, MESSAGE_CENTRE, 'delete', 'human', THE_PERSON, MOMENT, order)
  }
}

/** Messages and withdrawals the reader neither sent nor was handed, newer than every one it may read, in every project. */
function plantHidden(from: number, count: number): void {
  t.client.sqlite.transaction(() => {
    for (let n = from; n < from + count; n++) {
      for (const project of PROJECTS) {
        const at = `2026-10-21 09:${String(n % 60).padStart(2, '0')}:00`
        plant({ id: `invented-hidden-${project}-${n}`, data: { sentBy: other, to: [person], writtenIn: { project } }, deliveries: [person], person: [], reader: [] }, at, 0)
        plant({ id: `invented-hidden-withdrawn-${project}-${n}`, data: { sentBy: person, to: [other], writtenIn: { project } }, deliveries: [other], withdrawn: true, person: [], reader: [] }, at, 400_000 + n * 2 + PROJECTS.indexOf(project))
      }
    }
  })()
}

/**
 * THE BOARD'S OWN POOL, unchanged by this round, kept as pixel-office.ts states who sees a message: an authored message
 * that has a sender and went out, which a caller with no refusal sees whole, and a refused caller only when they sent
 * it or a delivery row names them.
 */
async function theBoardsReading(caller: ParticipantRef): Promise<Communication[]> {
  const { messagePool, whyReadingSomebodyElsesIsRefused } = await import('../src/server/lib/messages.ts')
  const { listWorkspaces } = await import('../src/server/lib/workspaces.ts')
  const { compareCommunicationPlaces } = await import('../src/server/lib/pixel-office.ts')
  const refused = whyReadingSomebodyElsesIsRefused(caller) !== null
  const same = (a: ParticipantRef) => a.kind === caller.kind && a.id === caller.id
  const out: Communication[] = []
  for (const project of listWorkspaces()) {
    for (const one of messagePool(project.id, { origin: 'authored' })) {
      if (one.sentBy === null || one.notSentYet) continue
      if (refused && !same(one.sentBy) && !one.to.some(same)) continue
      out.push({ id: one.id, project: project.id, at: one.sentAt, from: one.sentBy, to: [...one.to] })
    }
  }
  return out.sort(compareCommunicationPlaces)
}

async function theScenesReading(caller: ParticipantRef): Promise<Communication[]> {
  const { thePermittedCommunications } = await import('../src/server/lib/pixel-office.ts')
  const { whyReadingSomebodyElsesIsRefused } = await import('../src/server/lib/messages.ts')
  const { listWorkspaces } = await import('../src/server/lib/workspaces.ts')
  return thePermittedCommunications(listWorkspaces(), caller, whyReadingSomebodyElsesIsRefused(caller))
    .map(one => ({ id: one.id, project: one.workspaceId, at: one.at, from: one.from, to: [...one.to] }))
}

async function ask(headers: Record<string, string>, query: Record<string, string>): Promise<PluginTalkView> {
  const reply = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/talk?${new URLSearchParams(query)}`, headers })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json() as PluginTalkView
}

/** Each execution, each row handed back and each row holding a message's words, including prepared statements and lazy iterators. */
async function statementsRunDuring(act: () => Promise<unknown>): Promise<Ran[]> {
  type Run = (this: { source: string }, ...args: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', Run>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const seen: Ran[] = []
  const holdsWords = (row: unknown) => (JSON.stringify(row) ?? '').includes(WORDS) ? 1 : 0
  proto.all = function (...args) {
    const rows = originals.all.apply(this, args) as unknown[]
    seen.push({ sql: this.source, rows: rows.length, words: rows.reduce<number>((n, row) => n + holdsWords(row), 0) }); return rows
  }
  proto.get = function (...args) {
    const row = originals.get.apply(this, args)
    seen.push({ sql: this.source, rows: row === undefined ? 0 : 1, words: holdsWords(row) }); return row
  }
  proto.iterate = function* (this: { source: string }, ...args: unknown[]) {
    const one: Ran = { sql: this.source, rows: 0, words: 0 }; seen.push(one)
    for (const row of originals.iterate.apply(this, args) as Iterable<unknown>) { one.rows++; one.words += holdsWords(row); yield row }
  } as Run
  try { await act() } finally { Object.assign(proto, originals) }
  return seen
}

function howOften(statements: readonly Ran[]): Counts {
  const out: Counts = new Map()
  for (const one of statements) {
    const sql = one.sql.replace(/\?(\s*,\s*\?)+/g, '?…').replace(/\s+/g, ' ').trim()
    const held = out.get(sql) ?? { runs: 0, rows: 0 }
    out.set(sql, { runs: held.runs + 1, rows: held.rows + one.rows })
  }
  return out
}

const placesOf = (list: readonly { id: string; project: string }[]) => list.filter(one => one.id.startsWith('invented-')).map(one => `${one.id} in ${one.project}`).sort()

describe('A. the talk reads no message\'s words', () => {
  it('no statement of any form of the talk, for either caller, hands back a row holding a message\'s words', async () => {
    const wrong: string[] = []
    let asked = 0
    for (const [who, headers] of [['person', PERSON], ['reader', AGENT]] as const) {
      const latest = await ask(headers, { start: 'latest' })
      expect(latest.last, who).not.toBeNull()
      const first = (await ask(headers, { limit: '1' })).last!
      const forms: Record<string, string>[] = [
        {}, { limit: '1' }, { start: 'latest' },
        { after: first, limit: '1' }, { after: first, withdrawnAfter: '0', limit: '1' },
        { after: latest.last!, withdrawnAfter: latest.withdrawn.last },
      ]
      for (const form of forms) {
        const ran = await statementsRunDuring(() => ask(headers, form))
        asked++
        for (const one of ran) if (one.words > 0) wrong.push(`${who} ${JSON.stringify(form)}: ${one.words} rows with words: ${one.sql.slice(0, 200)}`)
      }
    }
    expect(asked).toBe(12)
    expect(wrong).toEqual([])
    // The planted words are in the database, where a read of a message whole finds them.
    const board = await statementsRunDuring(() => theBoardsReading(person))
    expect(board.some(one => one.words > 0)).toBe(true)
  })
})

describe('B. who sees what does not change', () => {
  for (const who of ['person', 'reader'] as const) it(`the ${who} sees each made-up message in the projects it was made for, as the board's pool says, and is told of the withdrawals it would see`, async () => {
    const caller = who === 'person' ? person : reader
    const headers = who === 'person' ? PERSON : AGENT
    const expected = SEES.flatMap(one => one[who].map(project => `${one.id} in ${project}`)).sort()
    const board = await theBoardsReading(caller)
    expect(placesOf(board)).toEqual(expected)
    expect(await theScenesReading(caller)).toEqual(board)
    const talk = await ask(headers, { limit: '500' })
    expect(talk.messages).toEqual(board)
    expect(talk.more).toBe(false)
    const withdrawn = await ask(headers, { after: talk.last!, withdrawnAfter: '0', limit: '500' })
    expect(withdrawn.withdrawn.ids.filter(id => id.startsWith('invented-')).sort()).toEqual(TOLD.filter(one => one[who]).map(one => one.id).sort())
  })
})

describe('C. a caller who may read only their own finds its latest place among its own', () => {
  it('start=latest, and the read on from that place with its withdrawals, hand back no more rows when newer messages and withdrawals it may not read are added', async () => {
    const latest = await ask(AGENT, { start: 'latest' })
    expect(latest.refusal).toBeTypeOf('string')
    const steady = { after: latest.last!, withdrawnAfter: latest.withdrawn.last }
    const asks = [{ name: 'latest', query: { start: 'latest' } }, { name: 'after the latest place', query: steady }]
    const smaller = new Map<string, Counts>()
    const answers = new Map<string, PluginTalkView>()
    for (const one of asks) {
      await ask(AGENT, one.query)
      smaller.set(one.name, howOften(await statementsRunDuring(async () => { answers.set(one.name, await ask(AGENT, one.query)) })))
    }
    plantHidden(0, 20)
    const growth: string[] = []
    for (const one of asks) {
      const larger = howOften(await statementsRunDuring(async () => { expect(await ask(AGENT, one.query), one.name).toEqual(answers.get(one.name)) }))
      for (const [sql, count] of larger) for (const key of ['runs', 'rows'] as const) {
        const before = smaller.get(one.name)!.get(sql)?.[key] ?? 0
        if (count[key] > before) growth.push(`${one.name}: ${key} ${before} -> ${count[key]}: ${sql.slice(0, 300)}`)
      }
    }
    expect(growth).toEqual([])
    // The person is told of the added messages and withdrawals, so they were added where a project's view holds them.
    const personAfter = await ask(PERSON, { after: latest.last!, withdrawnAfter: latest.withdrawn.last, limit: '500' })
    expect(new Set(personAfter.messages.map(one => one.id).filter(id => id.startsWith('invented-hidden-'))).size).toBe(20 * PROJECTS.length)
    expect(personAfter.withdrawn.ids.filter(id => id.startsWith('invented-hidden-withdrawn-')).length).toBe(20 * PROJECTS.length)
  })
})
