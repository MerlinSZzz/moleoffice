// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Round 75 of wave 13y: the whole talk reads each project's messages through the ways into its view, and a caller who
 * may read only their own messages reads only the messages they sent or were handed.
 * Every project, agent, message and word below is made up for this fresh test database. This is not a load measurement.
 *
 * The talk's default form and the scene read every message a caller may see, in every project. Each project's read
 * tested every message of the office against the rule of its view, through the index of every record of a kind, and
 * built every one, also for a caller who may see few of them. A says message by message who sees what, and compares
 * the door and the scene's reader with the board's own pool. B counts the rows SQLite hands back to a caller who may
 * read only their own messages, when messages they may not read are added. C asks SQLite's plan, with each statement's
 * own values, which index each read starts from. D (round 110) counts the statements run for such a caller when projects
 * that hold none of their messages are added, since their own list was read again for every project.
 *
 * Eight mutations each turn it red. In src/server/lib/pixel-office.ts: the refused caller not narrowed (B, C); the
 * caller's own messages read again for each project (D). In src/server/lib/messages.ts: the narrowing without the messages handed to the caller (A, C), or reading only the
 * deliveries stored under the caller's own kind (A); one way into a project's view left out (A, C); each project asking
 * the rule of its view of every message again (C); a withdrawn message kept (A); a message of any origin kept (A).
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
const PROJECTS = ['default', 'invented-orchard', 'invented-harbour'] as const
const [HOME, ORCHARD, HARBOUR] = PROJECTS
const MOMENT = '2026-10-20 12:00:00'
const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
let reader: ParticipantRef
let other: ParticipantRef
let AGENT: Record<string, string>
type Communication = { id: string; project: string; at: string; from: ParticipantRef; to: ParticipantRef[] }
/** Who sees a made-up message in which projects, said by construction. */
const SEES: { id: string; person: string[]; reader: string[] }[] = []

interface Planted {
  id: string
  data: Record<string, unknown>
  deliveries: { kind: string; id: string; mark?: string }[]
  origin?: string
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
  const sqlite = t.client.sqlite
  const page = (project: string, recordId: string) => ({ type: 'record', target: { workspaceId: project, recordId } })
  const planted: Planted[] = [
    { id: 'invented-from-reader', data: { sentBy: reader, to: [other], writtenIn: { project: HOME } }, deliveries: [other], person: [HOME], reader: [HOME] },
    { id: 'invented-to-reader', data: { sentBy: person, to: [reader], writtenIn: { project: ORCHARD } }, deliveries: [reader], person: [ORCHARD], reader: [ORCHARD] },
    { id: 'invented-between-others', data: { sentBy: other, to: [person], writtenIn: { project: HARBOUR } }, deliveries: [person], person: [HARBOUR], reader: [] },
    // A person whose id is the reader's is not the reader.
    { id: 'invented-from-a-person-of-the-readers-id', data: { sentBy: { kind: 'person', id: reader.id }, to: [other], writtenIn: { project: HOME } }, deliveries: [other], person: [HOME], reader: [] },
    { id: 'invented-to-a-person-of-the-readers-id', data: { sentBy: other, to: [{ kind: 'person', id: reader.id }], writtenIn: { project: HOME } }, deliveries: [{ kind: 'person', id: reader.id }], person: [HOME], reader: [] },
    // Who it is to comes off the delivery rows, not off the stored field.
    { id: 'invented-stored-to-the-reader-only', data: { sentBy: other, to: [reader], writtenIn: { project: HOME } }, deliveries: [other], person: [HOME], reader: [] },
    // A comment whose recipient was chosen for it, as the review column's Choose a recipient stores it, is not sent
    // while nobody has been handed it. One written straight to somebody, as the comment box's Send writes it, is.
    { id: 'invented-unsent-comment', data: { sentBy: person, to: [reader], chosenRecipient: { kind: 'agent', agentId: reader.id }, writtenIn: { project: HOME }, target: page(HOME, 'invented-page') }, deliveries: [{ ...reader, mark: 'queued' }], person: [], reader: [] },
    { id: 'invented-comment-sent-when-written', data: { sentBy: person, to: [reader], writtenIn: { project: HOME }, target: page(HOME, 'invented-page') }, deliveries: [{ ...reader, mark: 'queued' }], person: [HOME], reader: [HOME] },
    { id: 'invented-fixture', data: { sentBy: person, to: [reader], writtenIn: { project: HOME } }, deliveries: [reader], origin: 'fixture', person: [], reader: [] },
    { id: 'invented-capital-origin', data: { sentBy: person, to: [reader], writtenIn: { project: HARBOUR } }, deliveries: [reader], origin: 'Authored', person: [HARBOUR], reader: [HARBOUR] },
    { id: 'invented-two-projects', data: { sentBy: other, to: [reader], writtenIn: { project: HOME }, aboutProject: ORCHARD }, deliveries: [reader], person: [HOME, ORCHARD], reader: [HOME, ORCHARD] },
    { id: 'invented-comment-on-harbour', data: { sentBy: person, to: [reader], writtenIn: { project: HOME }, target: page(HARBOUR, 'invented-harbour-page') }, deliveries: [reader], person: [HOME, HARBOUR], reader: [HOME, HARBOUR] },
    { id: 'invented-withdrawn', data: { sentBy: person, to: [reader], writtenIn: { project: HOME } }, deliveries: [reader], withdrawn: true, person: [], reader: [] },
    // A stored sender is compared exactly, so the reader's handle in place of its id is somebody else.
    { id: 'invented-sent-by-the-readers-handle', data: { sentBy: { kind: 'agent', id: 'invented-reader' }, to: [other], writtenIn: { project: HOME } }, deliveries: [other], person: [HOME], reader: [] },
    // The pool's builder reads every stored recipient kind but `person` as an agent, so this one is to the reader.
    { id: 'invented-to-the-reader-under-another-kind', data: { sentBy: person, to: [reader], writtenIn: { project: HOME } }, deliveries: [{ kind: 'invented-kind', id: reader.id }], person: [HOME], reader: [HOME] },
    { id: 'invented-no-sender', data: { to: [reader], writtenIn: { project: ORCHARD } }, deliveries: [reader], person: [], reader: [] },
    { id: 'invented-in-no-project', data: { sentBy: person, to: [reader] }, deliveries: [reader], person: [], reader: [] },
    { id: 'invented-from-reader-to-nobody', data: { sentBy: reader, to: [], writtenIn: { project: ORCHARD } }, deliveries: [], person: [ORCHARD], reader: [ORCHARD] },
    { id: 'invented-about-harbour-only', data: { sentBy: other, to: [reader], aboutProject: HARBOUR }, deliveries: [reader], person: [HARBOUR], reader: [HARBOUR] },
    { id: 'invented-to-several', data: { sentBy: person, to: [other, reader], writtenIn: { project: HARBOUR } }, deliveries: [other, reader], person: [HARBOUR], reader: [HARBOUR] },
  ]
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE workspaces SET created_at = '2026-10-18 00:00:00' WHERE id = 'default'").run()
    for (const id of PROJECTS.slice(1)) sqlite.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `Made-up ${id}`, MOMENT, MOMENT)
    // The registration's own notices belong to this invented office too, at a fixed older moment.
    sqlite.prepare("UPDATE records SET created_at = '2026-10-19 00:00:00', updated_at = '2026-10-19 00:00:00' WHERE kind = 'message'").run()
    for (const [n, one] of planted.entries()) {
      plant(one, `2026-10-20 10:00:${String(n).padStart(2, '0')}`)
      SEES.push({ id: one.id, person: one.person, reader: one.reader })
    }
  })()
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

/** A made-up message in the shape the message door stores, with its delivery rows. */
function plant(one: Planted, at: string): void {
  const sqlite = t.client.sqlite
  sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(one.id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, 'message', `Made-up ${one.id}`, JSON.stringify({ body: `Made-up words of ${one.id}`, ...one.data }), one.origin ?? 'authored', one.withdrawn === true ? MOMENT : null)
  for (const [n, to] of one.deliveries.entries()) {
    sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${one.id}-delivery-${n}`, one.id, to.kind, to.id, to.mark ?? 'seen', at)
  }
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

async function theWholeTalk(headers: Record<string, string>): Promise<PluginTalkView> {
  const reply = await app.inject({ method: 'GET', url: '/api/plugin-read/v1/talk?limit=500', headers })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json() as PluginTalkView
}



const placesOf = (list: readonly { id: string; project: string }[]) => list.filter(one => one.id.startsWith('invented-')).map(one => `${one.id} in ${one.project}`).sort()

describe('A. who sees what does not change', () => {
  for (const who of ['person', 'reader'] as const) it(`the ${who} sees each made-up message in the projects it was made for, as the board's pool says`, async () => {
    const caller = who === 'person' ? person : reader
    const expected = SEES.flatMap(one => one[who].map(project => `${one.id} in ${project}`)).sort()
    const board = await theBoardsReading(caller)
    // The made-up messages are said by construction; the board's pool says the same, notices included.
    expect(placesOf(board)).toEqual(expected)
    expect(await theScenesReading(caller)).toEqual(board)
    const talk = await theWholeTalk(who === 'person' ? PERSON : AGENT)
    expect(talk.messages).toEqual(board)
    expect(talk.more).toBe(false)
    expect(talk.refusal === null).toBe(who === 'person')
  })
})



