// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S OWN REPORT TIMES. A decision: ai-news (a secretary) reports to the owner once a day at 12:00, instead
 * of 07:00 and 18:00, and nobody else's times change. Wave 13p round 27, piece 7.
 *
 * WHAT THIS FILE PROVES. The office's setting is 07:00 and 18:00 here. One secretary is
 * given 12:00 alone through POST /api/participants/agent/:id/broadcast-times; another, "the coordinator", is left
 * on the setting. Then: a secretary is reminded at 11:30 for 12:00 and never at 06:30 or 17:30, and the coordinator
 * the other way round; the requirement sentence names each one's own times; the backup sentence goes on
 * each one's own last slot; the one more reminder after a missing report goes at 12:15 for a secretary and
 * at 07:15 for the coordinator; the pause counts only broadcasts naming the secretary's own times; the page's
 * next time is the secretary's own. A time that is not HH:MM is refused in words and changes nothing.
 * `null` hands a secretary back to the setting, and the change stamp says before and after.
 *
 * MUTATION PROOF, named, after a control run, each restored byte-identical (wave 13p round 27):
 * own-times, late-times, pause-times, reading-times, last-slot, chinese-times and door-refuses, each a
 * one-line change in src/server/lib/broadcast.ts that makes one rule read the office's times instead
 * of the secretary's, or lets a bad time through. The round's report names which test each turned red.
 * Round 27b: other-door, the guard in src/server/lib/records.ts never refusing, and door-closed, the
 * door not opening its marker, each turn "refuses any other write to the times" red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const BACKUP = 'Check that today’s new work has a second copy.'

/** The real clock, once, so every fake moment here is measured from the operator's day. */
const R0 = new Date()

/** A moment on the local day `days` after R0's, at hh:mm. */
function at(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

/** The slot occurrence the office writes on its lines: `YYYY-MM-DD HH:MM`. */
function occurrence(days: number, hours: number): string {
  return localStamp(at(days, hours, 0)).slice(0, 16)
}

/** One tick of the office's reminder watcher at `now`. */
function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

const idOf: Record<string, string> = {}

async function post(path: string, body: unknown): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_PERSON, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await post('/api/agents/started', { handle, name: handle, role })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

interface Line {
  body: string
  saidInFull?: string
}

/** The office lines to one agent that carry `mark` = `value` in their `extra` bag. */
function officeLinesTo(handle: string, mark: string, value: string): Line[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.' || ?) = ?",
      )
      .all(idOf[handle], mark, value) as { data: string }[]
  ).map((one) => JSON.parse(one.data) as Line)
}

/** One message from a secretary to the person whose body names `slot`. */
function aBroadcast(handle: string, slot: string): string {
  const agentId = idOf[handle]!
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'broadcast',
    data: { body: `${slot} 进度；需要决策；问题`, to: [{ kind: 'person', id: THE_PERSON }], sentBy: { kind: 'agent', id: agentId } },
    actor: { type: 'agent', id: agentId },
  }).id
}

beforeAll(async () => {
  // THE SETTINGS ARE FIXED HERE, whatever the checkout's own `.env` says.
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES = '15'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER = BACKUP
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('quill', 'secretary')
  await register('lark', 'secretary')
  await register('w-one', 'worker')
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'The report template of this test',
    data: { body: 'A made-up template for this test.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER
  await app.close()
  t.close()
})

describe('the door sets one secretary’s own times, and refuses a time that is not HH:MM in words', () => {
  it('gives quill 12:00 alone, and leaves the coordinator on the office’s 07:00 and 18:00', async () => {
    const { code, said } = await post('/api/participants/agent/quill/broadcast-times', { times: ['12:00'], because: 'The owner’s decision.' })
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
    expect(said['times']).toEqual(['12:00'])
    expect(said['change']).toMatchObject({ how: 'the-owner', before: null, after: ['12:00'], because: 'The owner’s decision.' })
    expect(broadcast.theTimesOf(idOf['quill']!)).toEqual(['12:00'])
    expect(broadcast.theTimesOf(idOf['lark']!)).toEqual(['07:00', '18:00'])
    expect(broadcast.theBroadcastScheduleOf(idOf['lark']!)?.times).toBeUndefined()
  })

  it('refuses a time that is not HH:MM, says which and how to write it, and changes nothing', async () => {
    for (const bad of ['12h00', '7:00', '24:00', '12:60']) {
      const { code, said } = await post('/api/participants/agent/quill/broadcast-times', { times: ['07:00', bad], because: 'A mistake.' })
      expect(code, JSON.stringify(said).slice(0, 400)).toBe(400)
      expect(String(said['error'])).toBe(
        `"${bad}" is not a time of day. Write each time as HH:MM in 24-hour local time, for example 07:00 or 18:30. Nothing was written.`,
      )
    }
    // AN EMPTY LIST IS NOT REFUSED SINCE WAVE 13Y ROUND 82: it ends the secretary's reports, which
    // tests/a-secretarys-reports-end-with-no-times.test.ts proves.
    expect(broadcast.theTimesOf(idOf['quill']!)).toEqual(['12:00'])
  })

  it('refuses an agent the office holds no broadcast schedule for', async () => {
    const { code, said } = await post('/api/participants/agent/w-one/broadcast-times', { times: ['12:00'], because: 'A mistake.' })
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(409)
    expect(String(said['error'])).toContain('no running broadcast schedule')
    expect(broadcast.theBroadcastScheduleOf(idOf['w-one']!)).toBeNull()
  })

  it('refuses any other write to the times in words, the person\u2019s and the secretary\u2019s own, and lets a write that leaves them alone through', async () => {
    // WAVE 13P ROUND 27B: the general change door once wrote `extra.broadcastSchedule.times` past the door that
    // checks and records them, the hole problem mz5ddKDITE3j found for the card.
    const record = (t.client.sqlite
      .prepare('SELECT m.record_id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1')
      .get(idOf['quill']) as { id: string }).id
    const asHermes = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf['quill']! }
    for (const [headers, who] of [[AS_THE_PERSON, THE_PERSON], [asHermes, idOf['quill']!]] as const) {
      for (const times of [['09:00'], 'noon', null]) {
        const reply = await app.inject({ method: 'PATCH', url: `/api/records/${record}`, headers, payload: { dataPatch: { extra: { broadcastSchedule: { times } } } } })
        expect(reply.statusCode, reply.body.slice(0, 400)).toBe(403)
        const said = String((reply.json() as Record<string, unknown>)['error'])
        expect(said).toContain('are changed only by their own doors: POST /api/participants/agent/<id>/broadcast-times')
        expect(said).toContain('POST /api/participants/agent/<id>/broadcast-settings')
        expect(said).toContain(`This request was made by "${who}". Nothing was written.`)
      }
    }
    expect(broadcast.theTimesOf(idOf['quill']!)).toEqual(['12:00'])
    const alone = await app.inject({ method: 'PATCH', url: `/api/records/${record}`, headers: asHermes, payload: { dataPatch: { extra: { broadcastSchedule: { times: ['12:00'] }, reportsAt: 'noon' } } } })
    expect(alone.statusCode, alone.body.slice(0, 400)).toBe(200)
    expect(broadcast.theTimesOf(idOf['quill']!)).toEqual(['12:00'])
  })
})

describe('the reminder before a slot reads the secretary’s own times', () => {
  it('reminds quill at 11:30 for 12:00 and not at 06:30 or 17:30, and the coordinator the other way round', () => {
    const morning = tick(at(1, 6, 31))
    const noon = tick(at(1, 11, 31))
    const evening = tick(at(1, 17, 31))
    expect(noon.broadcastsReminded).toContain(idOf['quill'])
    expect(noon.broadcastsReminded).not.toContain(idOf['lark'])
    for (const pass of [morning, evening]) {
      expect(pass.broadcastsReminded).toContain(idOf['lark'])
      expect(pass.broadcastsReminded).not.toContain(idOf['quill'])
    }
    expect(officeLinesTo('quill', 'broadcastSlot', occurrence(1, 12)).map((one) => one.body)).toEqual(['12:00 秘书汇报工作'])
    expect(officeLinesTo('quill', 'broadcastSlot', occurrence(1, 7))).toHaveLength(0)
    expect(officeLinesTo('quill', 'broadcastSlot', occurrence(1, 18))).toHaveLength(0)
    expect(officeLinesTo('lark', 'broadcastSlot', occurrence(1, 7)).map((one) => one.body)).toEqual(['07:00 秘书汇报工作'])
    expect(officeLinesTo('lark', 'broadcastSlot', occurrence(1, 12))).toHaveLength(0)
  })

  it('says each one’s own times in the requirement, and the backup sentence on each one’s own last slot', () => {
    const quill = officeLinesTo('quill', 'broadcastSlot', occurrence(1, 12))[0]!.saidInFull ?? ''
    const argusMorning = officeLinesTo('lark', 'broadcastSlot', occurrence(1, 7))[0]!.saidInFull ?? ''
    const argusEvening = officeLinesTo('lark', 'broadcastSlot', occurrence(1, 18))[0]!.saidInFull ?? ''
    expect(quill).toContain('每天 12:00，按这份模板写一份报告')
    expect(argusMorning).toContain('每天 07:00 和 18:00，按这份模板写一份报告')
    expect(quill).toContain(BACKUP)
    expect(argusEvening).toContain(BACKUP)
    expect(argusMorning).not.toContain(BACKUP)
  })
})

describe('the one more reminder after a missing report reads the secretary’s own times', () => {
  it('goes to quill at 12:15 and to the coordinator at 07:15, each once and never at the other’s time', () => {
    const morning = tick(at(2, 7, 16))
    const noon = tick(at(2, 12, 16))
    expect(noon.broadcastsWithNoReport).toContain(idOf['quill'])
    expect(noon.broadcastsWithNoReport).not.toContain(idOf['lark'])
    expect(morning.broadcastsWithNoReport).toContain(idOf['lark'])
    expect(morning.broadcastsWithNoReport).not.toContain(idOf['quill'])
    expect(officeLinesTo('quill', 'broadcastNoReport', occurrence(2, 12)).map((one) => one.body)).toEqual(['12:00 的报告还没有收到'])
    expect(officeLinesTo('quill', 'broadcastNoReport', occurrence(2, 7))).toHaveLength(0)
  })
})

describe('the page’s next time and the pause read the secretary’s own times', () => {
  it('names 12:00 as quill’s next time and 18:00 as the coordinator’s, after 13:00', () => {
    const quill = broadcast.theBroadcastReadingFor(idOf['quill']!, at(3, 13, 0))
    const lark = broadcast.theBroadcastReadingFor(idOf['lark']!, at(3, 13, 0))
    expect(quill.next).toEqual({ at: occurrence(4, 12), slot: '12:00' })
    expect(lark.next).toEqual({ at: occurrence(3, 18), slot: '18:00' })
  })

  it('counts three unanswered broadcasts naming 12:00 for quill, and none of the same three for the coordinator', () => {
    for (const handle of ['quill', 'lark']) {
      aBroadcast(handle, '12:00')
      aBroadcast(handle, '12:00')
      aBroadcast(handle, '12:00')
    }
    expect(broadcast.thePauseReadingFor(idOf['quill']!)).toMatchObject({ paused: true, broadcasts: 3 })
    expect(broadcast.thePauseReadingFor(idOf['lark']!)).toMatchObject({ paused: false, broadcasts: 0 })
    const pass = tick(at(3, 11, 45))
    expect(pass.broadcastsPaused).toContain(idOf['quill'])
    expect(pass.broadcastsReminded).not.toContain(idOf['quill'])
  })
})

describe('null hands a secretary back to the office’s times', () => {
  it('reads 07:00 and 18:00 for quill again, and the stamp says what it was', async () => {
    const { code, said } = await post('/api/participants/agent/quill/broadcast-times', { times: null, because: 'Back to the office’s times.' })
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
    expect(said['times']).toBeNull()
    expect(said['change']).toMatchObject({ before: ['12:00'], after: null })
    expect(broadcast.theBroadcastScheduleOf(idOf['quill']!)?.times).toBeUndefined()
    expect(broadcast.theTimesOf(idOf['quill']!)).toEqual(['07:00', '18:00'])
  })
})
