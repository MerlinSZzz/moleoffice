// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Round 78 of wave 13y: one answer of the talk reads the caller's own list once, and each of the map's forms reads
 * every project in one statement.
 * Every project, agent, message and word below is made up for this fresh test database. This is not a load measurement.
 *
 * Round 76 narrowed a caller who may read only their own messages to the list of what they sent or were handed. One
 * answer read that list twice, once for the messages and once for the withdrawals, and every project's statements read
 * it again: the walk to the newest place, the read from a place and the withdrawals each ran once for each project.
 * A counts the statements that read a caller's list in each form of the talk: one for that caller, none for the person.
 * B compares each form with the published answer rules applied to the whole readers, for the person and for that caller,
 * with messages and withdrawals in the view of two projects, which the talk names once for each project. The newest
 * withdrawal is of a message nobody wrote in the office, which no caller of the talk sees, so start=latest names the one
 * before it.
 * C counts the reads through the index of every message's moment and the reads of the withdrawn messages: a read from a
 * place is one statement, the withdrawals after a place are one, and no form reads more of them when four projects
 * are added. Then B's comparison is asked again.
 * The whole talk with no place still reads each project by its ways (round 75), so C does not ask it.
 *
 * Mutations, each turns it red, are listed with the round's report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { type PluginTalkView } from '../src/shared/plugin-read.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import type { WhereTheTalkIsRead } from '../src/server/lib/plugin-read.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PROJECTS = ['default', 'invented-orchard', 'invented-harbour']
const MOMENT = '2026-10-20 12:00:00'
const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
let reader: ParticipantRef
let other: ParticipantRef
let AGENT: Record<string, string>
type Communication = import('../src/server/lib/pixel-office.ts').PixelCommunication
type Withdrawal = { id: string; order: number }
type Whole = { messages: Communication[]; withdrawals: Withdrawal[]; refusal: string | null }
type Answer = PluginTalkView & { narrowedByPermission: null }

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
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE workspaces SET created_at = '2026-10-18 00:00:00' WHERE id = 'default'").run()
    for (const id of PROJECTS.slice(1)) project(id)
    // The registration's own notices belong to this invented office too, at a fixed older moment.
    sqlite.prepare("UPDATE records SET created_at = '2026-10-19 00:00:00', updated_at = '2026-10-19 00:00:00' WHERE kind = 'message'").run()
    // A record filed in the orchard, which a comment written in the harbour is about.
    sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('invented-orchard-page', PROJECTS[1], THE_TEST_OFFICES_OWNER.id, MOMENT, MOMENT, 'note', 'Made-up page', JSON.stringify({ body: 'Made-up words' }), 'fixture')
    for (let n = 0; n < 24; n++) message(`invented-line-${n}`, `2026-10-20 10:00:${String(n).padStart(2, '0')}`, PROJECTS[n % 3]!, n % 2 === 0 ? reader : other, n % 3 === 0 ? reader : person)
    message('invented-in-two', MOMENT, 'default', reader, person, { aboutProject: PROJECTS[1] })
    message('invented-comment-across', MOMENT, PROJECTS[2]!, person, reader, { target: { type: 'record', target: { recordId: 'invented-orchard-page' } } })
    message('invented-hidden', '2026-10-20 12:01:00', PROJECTS[1]!, person, other)
    message('invented-newest', '2026-10-20 12:05:00', PROJECTS[2]!, person, reader, { aboutProject: 'default' })
    for (let n = 0; n < 4; n++) {
      const id = `invented-withdrawal-${n}`
      message(id, MOMENT, PROJECTS[n % 3]!, person, n === 1 ? other : reader, n === 0 ? { aboutProject: PROJECTS[2] } : {})
      change(id, 'delete', 100_000 + n)
    }
    message('invented-withdrawn-unwritten', MOMENT, PROJECTS[0]!, person, reader, {}, 'fixture')
    change('invented-withdrawn-unwritten', 'delete', 100_004)
  })()
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

function project(id: string): void {
  t.client.sqlite.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `Made-up ${id}`, MOMENT, MOMENT)
}

/** Made-up rows, in the shape the message door stores; deliveries decide the recipients. */
function message(id: string, at: string, project: string, from: ParticipantRef, to: ParticipantRef, extra: Record<string, unknown> = {}, origin = 'authored'): void {
  const data = { body: `Made-up words of ${id}`, sentBy: from, to: [to], writtenIn: { project }, ...extra }
  t.client.sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, 'message', `Made-up ${id}`, JSON.stringify(data), origin)
  t.client.sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`${id}-delivery`, id, to.kind, to.id, 'seen', at)
}

/** A made-up withdrawal, placed by the append order given. */
function change(id: string, op: 'delete', order: number): void {
  t.client.sqlite.prepare('INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at, append_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(`invented-change-${order}`, id, MESSAGE_CENTRE, op, 'human', THE_PERSON, MOMENT, order)
  t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(MOMENT, id)
}

async function whole(caller: ParticipantRef): Promise<Whole> {
  const { thePermittedCommunications, thePermittedWithdrawals } = await import('../src/server/lib/pixel-office.ts')
  const { whyReadingSomebodyElsesIsRefused } = await import('../src/server/lib/messages.ts')
  const { listWorkspaces } = await import('../src/server/lib/workspaces.ts')
  const refusal = whyReadingSomebodyElsesIsRefused(caller)
  const projects = listWorkspaces()
  return { messages: thePermittedCommunications(projects, caller, refusal), withdrawals: thePermittedWithdrawals(projects, caller, refusal), refusal }
}

const place = (m: { at: string; id: string }) => `${m.at}~${m.id}`

/** The published answer rules, applied to the whole readers, as tests/the-talk-view-reads-only-what-comes-after-its-place.test.ts applies them. */
function reference(all: Whole, where: WhereTheTalkIsRead, limit: number): Answer {
  const after = where.start === 'latest' ? (all.messages.at(-1) === undefined ? undefined : place(all.messages.at(-1)!)) : where.after
  const [at, id] = after?.split('~') ?? ['', '']
  const later = after === undefined ? all.messages : all.messages.filter(m => (m.at.localeCompare(at!) || m.id.localeCompare(id!)) > 0)
  const held = later.slice(0, limit)
  const withdrawals = where.withdrawnAfter === undefined ? [] : all.withdrawals.filter(w => w.order > Number(where.withdrawnAfter))
  const kept = withdrawals.slice(0, limit)
  const counts = (n: number, carried: number) => ({ candidates: n, carried, leftOut: n - carried, shortened: 0 })
  const group = (bucket: string, ids: string[]) => [{ cause: 'budget' as const, bucket, count: ids.length, ids }]
  return {
    interface: 'office-read/1', view: 'talk',
    messages: held.map(m => ({ id: m.id, project: m.workspaceId, at: m.at, from: m.from, to: [...m.to] })),
    last: held.at(-1) === undefined ? (after ?? null) : place(held.at(-1)!), more: later.length > held.length,
    subtraction: counts(later.length, held.length), leftOutGroups: group('message_limit', later.slice(limit).map(m => m.id)) as PluginTalkView['leftOutGroups'],
    refusal: all.refusal, narrowedByPermission: null,
    withdrawn: {
      ids: kept.map(w => w.id), last: String(where.withdrawnAfter === undefined ? (all.withdrawals.at(-1)?.order ?? 0) : (kept.at(-1)?.order ?? Number(where.withdrawnAfter))),
      more: withdrawals.length > kept.length, subtraction: counts(withdrawals.length, kept.length),
      leftOutGroups: group('withdrawal_limit', withdrawals.slice(limit).map(w => w.id)) as PluginTalkView['withdrawn']['leftOutGroups'],
    },
  }
}

async function ask(headers: Record<string, string>, where: WhereTheTalkIsRead = {}, limit?: number): Promise<Answer> {
  const query = new URLSearchParams({ ...where, ...(limit === undefined ? {} : { limit: String(limit) }) })
  const reply = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/talk?${query}`, headers })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json() as Answer
}




async function everyFormEqualsTheReference(): Promise<void> {
  const everything = await whole(person)
  const places = [...new Set(everything.messages.map(place)), '1900-01-01 00:00:00~before', '2099-01-01 00:00:00~after']
  const withdrawals = ['0', ...everything.withdrawals.map(w => String(w.order))]
  const wheres: WhereTheTalkIsRead[] = [
    {}, { start: 'latest' }, ...places.map(after => ({ after })),
    ...withdrawals.flatMap(withdrawnAfter => [{ withdrawnAfter }, { after: places[5]!, withdrawnAfter }]),
  ]
  for (const [headers, caller] of [[PERSON, person], [AGENT, reader]] as const) {
    const all = await whole(caller)
    for (const limit of [1, 3, 500]) for (const where of wheres) {
      expect(await ask(headers, where, limit), JSON.stringify({ caller, where, limit })).toEqual(reference(all, where, limit))
    }
  }
}

/** The projects a message is named in, in the order the talk lists projects. */
async function inTheProjectOrder(ids: string[]): Promise<string[]> {
  const { listWorkspaces } = await import('../src/server/lib/workspaces.ts')
  return listWorkspaces().map(one => one.id).filter(id => ids.includes(id))
}


describe('B. the answers are the whole readers\' answers', () => {
  it('every form equals the reference for both callers, with a message in the view of two projects named once for each', async () => {
    const all = await whole(person)
    expect(all.messages.filter(m => m.id === 'invented-in-two').map(m => m.workspaceId)).toEqual(await inTheProjectOrder(['default', PROJECTS[1]!]))
    expect(all.messages.filter(m => m.id === 'invented-comment-across').map(m => m.workspaceId)).toEqual(await inTheProjectOrder([PROJECTS[1]!, PROJECTS[2]!]))
    expect(all.messages.filter(m => m.id === 'invented-newest').map(m => m.workspaceId)).toEqual(await inTheProjectOrder(['default', PROJECTS[2]!]))
    expect(all.withdrawals.length).toBe(4)
    expect(all.withdrawals.map(w => w.id)).not.toContain('invented-withdrawn-unwritten')
    const narrowed = await whole(reader)
    expect(narrowed.refusal).toBeTypeOf('string')
    expect(narrowed.messages.some(m => m.id === 'invented-hidden')).toBe(false)
    expect(narrowed.withdrawals.map(w => w.id)).not.toContain('invented-withdrawal-1')
    await everyFormEqualsTheReference()
  }, 120_000)
})

