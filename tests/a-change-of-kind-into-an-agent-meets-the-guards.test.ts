// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ROAD THAT MAKES A RECORD AN AGENT'S MEETS THE CARD GUARD AND THE BROADCAST-TIMES GUARD.
 * Problem B3-Sz7DW3wJ0, wave 13p round 27c.
 *
 * WHAT WAS OPEN. Round 27b put a guard on a secretary's broadcast times, beside the card guard of
 * problem mz5ddKDITE3j. Both ran only when the record was ALREADY an agent, and both let a write
 * that left the field as the record held it. So a note carrying a card or times in `extra` became an
 * agent with both and no check ran, and a later handle write that mapped such a record to an agent
 * changed nothing in the record, so it passed too. The check of round 27b found it.
 *
 * WHAT IS MEASURED HERE, one road each:
 *
 *   · create: an agent filing an agent record with a card or times on it is refused (this was
 *     already so, and is here so the list of roads is whole);
 *   · a change of kind into an agent: refused in words for a worker carrying a card, and for anybody
 *     carrying times, while the same change with neither goes through;
 *   · a handle write that maps an agent record nobody's row maps: refused when the record carries a
 *     card or times, because that write is the one that puts them on an agent;
 *   · a record whose kind was changed away from agent is no longer read as its agent's schedule;
 *   · restore: a deleted agent record does not bring back times or a card its agent no longer holds.
 *
 * AND A STORED SCHEDULE THAT CANNOT BE READ no longer stops a secretary's reminders. They go on the
 * office's times, the reminder says so, and the tick says it once while the server runs.
 *
 * MUTATION PROOF, named, after a control run, each restored byte-identical (wave 13p round 27c):
 *   held-before: `whatTheAgentHeldBefore` returning the old data whatever the record was, which is
 *     the old before-only check put back, turns the kind-change and handle-write cases red;
 *   old-kind: the patch block asked only when the record was already an agent turns the kind-change
 *     cases red;
 *   no-restore-check: the restore guard not called turns the restore cases red;
 *   any-kind: the agent-record reader not asking for kind agent turns the kind-away case red;
 *   throws-again: the reminder pass reading the schedule that throws turns the unreadable case red;
 *   said-every-tick and no-sentence turn it red too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RecordKind } from '../src/shared/types.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')
type RecordsLib = typeof import('../src/server/lib/records.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib
let recordsLib: RecordsLib

const THERE = 'orchard'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const idOf: Record<string, string> = {}

function asAgent(handle: string, workspace = 'default'): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf[handle]! }
}

function inThere(headers: Record<string, string>): Record<string, string> {
  return { ...headers, 'x-mole-office-workspace': THERE }
}

/** The real clock, once, so every fake moment here is measured from the operator's day. */
const R0 = new Date()

function at(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

function occurrence(days: number, hours: number): string {
  return localStamp(at(days, hours, 0)).slice(0, 16)
}

function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

async function ask(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ code: number; said: Record<string, unknown>; body: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as object }) })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown>, body: reply.body }
}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** A record filed directly in `workspaceId`, as the person or as one agent of this test. */
function file(workspaceId: string, kind: RecordKind, data: Record<string, unknown>, by?: string): string {
  const actor = by === undefined ? { type: 'human' as const, id: THE_PERSON } : { type: 'agent' as const, id: idOf[by]! }
  return t.api.createRecord({ workspaceId, kind, title: `a ${kind} of this test`, data, actor }).id
}

/** The registry row a record is mapped to, or undefined. */
function rowOf(recordId: string): { id: string; role: string | null } | undefined {
  return t.client.sqlite
    .prepare('SELECT a.id AS id, a.role AS role FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE m.record_id = ?')
    .get(recordId) as { id: string; role: string | null } | undefined
}

/** The role on one agent's registry row. */
function roleOf(handle: string): string | null {
  return (t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(idOf[handle]) as { role: string | null }).role
}

/** The first record of kind agent mapped to one agent, deleted or not: the one it registered with. */
function firstRecordOf(handle: string): string {
  return (t.client.sqlite
    .prepare("SELECT r.id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.kind = 'agent' ORDER BY r.created_at ASC, r.rowid ASC LIMIT 1")
    .get(idOf[handle]) as { id: string }).id
}

/** The newest live record mapped to one agent, of any kind. */
function newestRecordOf(handle: string): string {
  return (t.client.sqlite
    .prepare('SELECT m.record_id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1')
    .get(idOf[handle]) as { id: string }).id
}

const A_CARD_SENTENCE = 'written by the person, or by the door that does that act, and this request is neither'
const A_TIMES_SENTENCE = 'are changed only by their own doors: POST /api/participants/agent/<id>/broadcast-times'

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES = '15'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  recordsLib = await import('../src/server/lib/records.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const made = await ask('POST', '/api/workspaces', AS_THE_PERSON, { id: THERE, title: 'Orchard' })
  expect(made.code, made.body.slice(0, 300)).toBeLessThan(300)
  await register('clerk', 'secretary')
  await register('clio', 'secretary')
  await register('w-one', 'worker')
  await register('w-two', 'worker')
  const set = await ask('POST', '/api/participants/agent/clerk/broadcast-times', AS_THE_PERSON, { times: ['12:00'], because: 'This test.' })
  expect(set.code, set.body.slice(0, 300)).toBe(200)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('create: an agent record is filed with no card or times on it by an agent', () => {
  it('refuses a worker filing an agent record carrying a card, and anybody filing one carrying times', async () => {
    const card = await ask('POST', '/api/records', asAgent('w-one'), { kind: 'agent', title: 'made up', data: { handle: 'kc-made', role: 'secretary' } })
    expect(card.code, card.body.slice(0, 400)).toBe(403)
    expect(card.body).toContain(A_CARD_SENTENCE)
    const times = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'agent',
      title: 'made up',
      data: { handle: 'kc-made', extra: { broadcastSchedule: { madeAt: '2026-10-06 00:00:00', endedAt: null, times: ['noon'] } } },
    })
    expect(times.code, times.body.slice(0, 400)).toBe(403)
    expect(times.body).toContain(A_TIMES_SENTENCE)
  })
})

describe('a change of kind into an agent meets the card guard and the times guard', () => {
  it('refuses a worker turning a note carrying a card into an agent, and writes nothing', async () => {
    const note = file('default', 'note', { body: 'A note.', extra: { handle: 'kc-card', role: 'secretary' } }, 'w-one')
    const reply = await ask('PATCH', `/api/records/${note}`, asAgent('w-one'), { kind: 'agent' })
    expect(reply.code, reply.body.slice(0, 400)).toBe(403)
    expect(reply.body).toContain(A_CARD_SENTENCE)
    expect(t.api.getRecord(note)?.kind).toBe('note')
    expect(rowOf(note)).toBeUndefined()
  })

  it('refuses the person and a worker turning a note carrying times into an agent of a live secretary', async () => {
    // THE ROAD THE CHECK FOUND: in another project a record under a live handle is that agent's record, and the
    // newest one is where its times are read.
    const note = file(THERE, 'note', {
      body: 'A note.',
      extra: { handle: 'clerk', broadcastSchedule: { madeAt: '2026-10-06 00:00:00', endedAt: null, times: ['noon'] } },
    }, 'w-one')
    for (const headers of [inThere(AS_THE_PERSON), asAgent('w-one', THERE)]) {
      const reply = await ask('PATCH', `/api/records/${note}`, headers, { kind: 'agent' })
      expect(reply.code, reply.body.slice(0, 400)).toBe(403)
      expect(reply.body).toContain(A_TIMES_SENTENCE)
    }
    expect(t.api.getRecord(note)?.kind).toBe('note')
    expect(rowOf(note)).toBeUndefined()
    expect(broadcast.theTimesOf(idOf['clerk']!)).toEqual(['12:00'])
  })

  it('lets the same change through when the note carries neither, so the refusals above are about the fields', async () => {
    const note = file('default', 'note', { body: 'A note.', extra: { handle: 'kc-plain' } }, 'w-one')
    const reply = await ask('PATCH', `/api/records/${note}`, asAgent('w-one'), { kind: 'agent' })
    expect(reply.code, reply.body.slice(0, 400)).toBe(200)
    expect(t.api.getRecord(note)?.kind).toBe('agent')
    expect(rowOf(note)).toBeDefined()
  })

  it('lets the person bring a card in by a change of kind, as the person may write a card', async () => {
    const note = file('default', 'note', { body: 'A note.', extra: { handle: 'kc-person', role: 'worker' } })
    const reply = await ask('PATCH', `/api/records/${note}`, AS_THE_PERSON, { kind: 'agent' })
    expect(reply.code, reply.body.slice(0, 400)).toBe(200)
    expect(rowOf(note)?.role).toBe('worker')
  })
})

describe('a handle write that maps an agent record meets the card guard and the times guard', () => {
  it('refuses a worker giving a handle to an agent record that carries a card and no row maps', async () => {
    const lone = file('default', 'agent', { role: 'secretary' })
    expect(rowOf(lone)).toBeUndefined()
    const reply = await ask('PATCH', `/api/records/${lone}`, asAgent('w-one'), { dataPatch: { handle: 'kc-lone' } })
    expect(reply.code, reply.body.slice(0, 400)).toBe(403)
    expect(reply.body).toContain(A_CARD_SENTENCE)
    expect(rowOf(lone)).toBeUndefined()
  })

  it('refuses a handle that would put stored times on a live secretary, the person’s as well', async () => {
    // Times on a record no row maps can only have come in past the door, as data older than the guard did.
    const lone = recordsLib.throughTheBroadcastTimesDoor(() =>
      file(THERE, 'agent', { extra: { broadcastSchedule: { madeAt: '2026-10-06 00:00:00', endedAt: null, times: ['noon'] } } }),
    )
    expect(rowOf(lone)).toBeUndefined()
    for (const headers of [inThere(AS_THE_PERSON), asAgent('w-one', THERE)]) {
      const reply = await ask('PATCH', `/api/records/${lone}`, headers, { dataPatch: { handle: 'clerk' } })
      expect(reply.code, reply.body.slice(0, 400)).toBe(403)
      expect(reply.body).toContain(A_TIMES_SENTENCE)
    }
    expect(rowOf(lone)).toBeUndefined()
    expect(broadcast.theTimesOf(idOf['clerk']!)).toEqual(['12:00'])
  })
})

describe('a record whose kind was changed away from agent is not read as its agent’s', () => {
  it('reads a secretary’s times off its agent record, not off a newer one of its records that is a note now', async () => {
    const other = file(THERE, 'agent', { handle: 'clerk' })
    expect(rowOf(other)?.id).toBe(idOf['clerk'])
    const away = await ask('PATCH', `/api/records/${other}`, inThere(AS_THE_PERSON), { kind: 'note' })
    expect(away.code, away.body.slice(0, 400)).toBe(200)
    // A NOTE IS WRITTEN WITH NO AGENT GUARD, so what it says is nobody's schedule.
    const written = await ask('PATCH', `/api/records/${other}`, asAgent('w-one', THERE), {
      dataPatch: { extra: { broadcastSchedule: { madeAt: '2026-10-06 00:00:00', endedAt: null, times: ['03:00'] } } },
    })
    expect(written.code, written.body.slice(0, 400)).toBe(200)
    expect(newestRecordOf('clerk')).toBe(other)
    expect(broadcast.theTimesOf(idOf['clerk']!)).toEqual(['12:00'])
    // AND BACK INTO AN AGENT IT CARRIES THEM, so that change is refused in words.
    const back = await ask('PATCH', `/api/records/${other}`, inThere(AS_THE_PERSON), { kind: 'agent' })
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain(A_TIMES_SENTENCE)
    const gone = await ask('DELETE', `/api/records/${other}`, inThere(AS_THE_PERSON))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
  })
})

describe('restore: a deleted agent record does not bring back times or a card its agent no longer holds', () => {
  it('refuses bringing back a secretary’s first record holding other times than the record in use now', async () => {
    // THE TIMES ARE READ OFF THE FIRST-FILED LIVE RECORD (wave 13p round 29). So the first is deleted, the times are
    // set on the one read after it, and bringing the first back would make it the one read again.
    const first = firstRecordOf('clerk')
    const newer = file(THERE, 'agent', { handle: 'clerk' })
    expect(rowOf(newer)?.id).toBe(idOf['clerk'])
    const gone = await ask('DELETE', `/api/records/${first}`, AS_THE_PERSON)
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    broadcast.syncTheBroadcastSchedules()
    const set = await ask('POST', '/api/participants/agent/clerk/broadcast-times', AS_THE_PERSON, { times: ['15:00'], because: 'This test.' })
    expect(set.code, set.body.slice(0, 300)).toBe(200)
    expect(broadcast.theTimesOf(idOf['clerk']!)).toEqual(['15:00'])
    const back = await ask('POST', `/api/records/${first}/restore`, AS_THE_PERSON)
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain('Bringing this agent record back would put what it holds back on its agent')
    expect(back.body).toContain(A_TIMES_SENTENCE)
    expect(t.api.getRecord(first)?.deletedAt).not.toBeNull()
    expect(broadcast.theTimesOf(idOf['clerk']!)).toEqual(['15:00'])
  })

  it('brings back a record whose card its agent holds now, so the refusals here are about the fields', async () => {
    const same = file(THERE, 'agent', { handle: 'w-two', role: 'worker' })
    expect(rowOf(same)?.id).toBe(idOf['w-two'])
    const gone = await ask('DELETE', `/api/records/${same}`, inThere(AS_THE_PERSON))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    const back = await ask('POST', `/api/records/${same}/restore`, asAgent('w-two', THERE))
    expect(back.code, back.body.slice(0, 400)).toBe(200)
    expect(t.api.getRecord(same)?.deletedAt).toBeNull()
  })

  it('refuses a worker bringing back a record of its own that carries a card it does not hold', async () => {
    // The person may file a record carrying a card. Mapped to w-one, it follows no row until the next write to it.
    const carded = file(THERE, 'agent', { handle: 'w-one', role: 'secretary' })
    expect(rowOf(carded)?.id).toBe(idOf['w-one'])
    expect(roleOf('w-one')).toBe('worker')
    const gone = await ask('DELETE', `/api/records/${carded}`, inThere(AS_THE_PERSON))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    const back = await ask('POST', `/api/records/${carded}/restore`, asAgent('w-one', THERE))
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain('Bringing this agent record back would put what it holds back on its agent')
    expect(back.body).toContain(A_CARD_SENTENCE)
    expect(t.api.getRecord(carded)?.deletedAt).not.toBeNull()
    expect(roleOf('w-one')).toBe('worker')
  })
})

describe('a stored schedule that cannot be read does not stop a secretary’s reminders', () => {
  it('reminds clio on the office’s times, says so in the reminder, and says it in the tick once', () => {
    const record = newestRecordOf('clio')
    const held = t.api.getRecord(record)!.data as Record<string, unknown>
    const extra = held['extra'] as Record<string, unknown>
    const schedule = extra['broadcastSchedule'] as Record<string, unknown>
    expect(schedule, 'clio was given a schedule at the card door').toBeDefined()
    // PAST THE DOOR, AS DATA OLDER THAN THE GUARD COULD BE.
    recordsLib.throughTheBroadcastTimesDoor(() =>
      recordsLib.patchRecord(record, { dataPatch: { extra: { ...extra, broadcastSchedule: { ...schedule, times: ['noon'] } } } }, { type: 'human', id: THE_PERSON }),
    )
    const morning = tick(at(1, 6, 31))
    expect(morning.broadcastsReminded).toContain(idOf['clio'])
    expect(morning.broadcastTimesUnreadable).toHaveLength(1)
    expect(morning.broadcastTimesUnreadable[0]).toContain(idOf['clio']!)
    expect(morning.broadcastTimesUnreadable[0]).toContain('["noon"], which is not a list of times of day as HH:MM')
    const lines = t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.broadcastSlot') = ?",
      )
      .all(idOf['clio'], occurrence(1, 7)) as { data: string }[]
    expect(lines).toHaveLength(1)
    expect(lines[0]!.data).toContain('办公室读不出来，所以这次按办公室的时间 07:00 和 18:00 提醒你')
    const evening = tick(at(1, 17, 31))
    expect(evening.broadcastsReminded).toContain(idOf['clio'])
    expect(evening.broadcastTimesUnreadable).toEqual([])
  })
})
