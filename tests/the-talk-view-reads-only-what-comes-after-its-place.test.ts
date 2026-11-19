// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Round 63 of wave 13y: the plugin talk reads only what comes after its place.
 * Every project, agent, message and word below is made up for this fresh test database.
 * A compares the door with the scene's whole readers. B counts statements and rows where SQLite
 * runs them, not through a mock. C keeps the default reading whole. Rows handed back are counted;
 * rows SQLite visits to find them are not. This is a small invented office, not a load measurement.
 * E, round 66: what SQLite visits is asked of its plan instead, with each statement's own values.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { TALK_LIMIT, type PluginTalkView } from '../src/shared/plugin-read.ts'
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
    for (const id of PROJECTS.slice(1)) sqlite.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `Made-up ${id}`, MOMENT, MOMENT)
    // The registration's own notices belong to this invented office too, at a fixed older moment.
    sqlite.prepare("UPDATE records SET created_at = '2026-10-19 00:00:00', updated_at = '2026-10-19 00:00:00' WHERE kind = 'message'").run()
    for (let n = 0; n < 32; n++) message(`invented-line-${n}`, `2026-10-20 10:00:${String(n).padStart(2, '0')}`, PROJECTS[n % 3]!, n % 2 === 0 ? reader : other, n % 3 === 0 ? reader : person)
    for (const id of ['invented-a', 'invented-B', 'invented--', 'invented-_', 'invented-0', 'invented-A']) message(id, MOMENT, 'default', person, reader)
    message('invented-two-projects', MOMENT, 'default', reader, other, { aboutProject: PROJECTS[1] })
    message('invented-capital-origin', MOMENT, PROJECTS[2]!, person, reader, {}, 'Authored')
    message('invented-hidden-newest', '2026-10-20 12:01:00', 'default', person, other)
    message('invented-unsent', '2026-10-20 12:02:00', 'default', person, reader, { target: { type: 'record', target: { workspaceId: 'default', recordId: 'invented-page' } }, chosenRecipient: { kind: 'agent', agentId: reader.id } }, 'authored', false)
    message('invented-fixture', '2026-10-20 12:03:00', 'default', person, reader, {}, 'fixture')
    message('invented-withdrawn', MOMENT, 'default', person, reader)
    change('invented-withdrawn', 'delete', 100_000)
    message('invented-restored', MOMENT, PROJECTS[1]!, reader, person)
    change('invented-restored', 'delete', 100_001)
    change('invented-restored', 'restore', 100_002)
    message('invented-twice', MOMENT, PROJECTS[2]!, person, reader, {}, 'Authored')
    change('invented-twice', 'delete', 100_003)
    change('invented-twice', 'restore', 100_004)
    change('invented-twice', 'delete', 100_007)
    for (let n = 0; n < 3; n++) {
      message(`invented-withdrawal-${n}`, MOMENT, PROJECTS[n]!, person, n === 2 ? other : reader, n === 0 ? { aboutProject: PROJECTS[1] } : {})
      change(`invented-withdrawal-${n}`, 'delete', 100_008 + n)
    }
  })()
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

/** Made-up rows, in the shape the message door stores; deliveries decide the recipients. */
function message(id: string, at: string, project: string, from: ParticipantRef, to: ParticipantRef, extra: Record<string, unknown> = {}, origin = 'authored', sent = true): void {
  const data = { body: `Made-up words of ${id}`, sentBy: from, to: [to], writtenIn: { project }, ...extra }
  t.client.sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, 'message', `Made-up ${id}`, JSON.stringify(data), origin)
  t.client.sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`${id}-delivery`, id, to.kind, to.id, sent ? 'seen' : 'queued', at)
}

/** Made-up withdrawal history; explicit places let the later doubling add older withdrawals. */
function change(id: string, op: 'delete' | 'restore', order: number): void {
  t.client.sqlite.prepare('INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at, append_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(`invented-change-${order}`, id, MESSAGE_CENTRE, op, 'human', THE_PERSON, MOMENT, order)
  t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(op === 'delete' ? MOMENT : null, id)
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

/** The published answer rules, applied to the scene's whole readers, independently of the talk builder. */
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



describe('A. the answers do not change', () => {
  for (const who of ['person', 'agent'] as const) it(`every form for the ${who} equals the whole-read reference, field by field`, async () => {
    const all = await whole(who === 'person' ? person : reader)
    const headers = who === 'person' ? PERSON : AGENT
    expect(all.messages.length).toBeGreaterThan(10)
    expect(all.withdrawals.length).toBeGreaterThan(2)
    if (who === 'agent') expect(all.refusal).toBeTypeOf('string')
    else {
      expect(all.messages.filter(m => m.id === 'invented-two-projects').map(m => m.workspaceId)).toEqual(['default', PROJECTS[1]])
      expect(all.messages.some(m => m.id === 'invented-unsent' || m.id === 'invented-fixture')).toBe(false)
      expect(all.messages.some(m => m.id === 'invented-capital-origin')).toBe(true)
      expect(all.messages.some(m => m.id === 'invented-restored')).toBe(true)
      expect(all.withdrawals.filter(w => w.id === 'invented-twice')).toEqual([{ id: 'invented-twice', order: 100_007 }])
    }
    const places = [...new Set((await whole(person)).messages.map(place)), `${MOMENT}~invented-ab`, '1900-01-01 00:00:00~before', '2099-01-01 00:00:00~after']
    const withdrawals = ['0', ...(await whole(person)).withdrawals.map(w => String(w.order)), '999999999']
    for (const limit of [undefined, 1, 3, 20, 500]) {
      for (const where of [{}, { start: 'latest' as const }, ...places.map(after => ({ after }))]) {
        expect(await ask(headers, where, limit), JSON.stringify({ who, where, limit })).toEqual(reference(all, where, limit ?? TALK_LIMIT.unsaid))
        for (const withdrawnAfter of withdrawals) {
          if ('start' in where) {
            // start=latest is given alone. The existing door refuses a withdrawal cursor beside it.
            const reply = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/talk?start=latest&withdrawnAfter=${withdrawnAfter}&limit=${limit ?? TALK_LIMIT.unsaid}`, headers })
            expect(reply.statusCode).toBe(400)
          } else {
            const both = { ...where, withdrawnAfter }
            expect(await ask(headers, both, limit), JSON.stringify({ who, both, limit })).toEqual(reference(all, both, limit ?? TALK_LIMIT.unsaid))
          }
        }
      }
    }
  }, 120_000)
})


describe('C. the default form is not narrowed', () => {
  it('reads the whole talk after doubling too: no start and no after names every permitted message', async () => {
    for (const [headers, caller] of [[PERSON, person], [AGENT, reader]] as const) {
      const all = await whole(caller)
      const answer = await ask(headers, {}, 500)
      expect(answer).toEqual(reference(all, {}, 500))
      expect(answer.messages.length).toBe(all.messages.length)
      expect(answer.more).toBe(false)
    }
  })
})


