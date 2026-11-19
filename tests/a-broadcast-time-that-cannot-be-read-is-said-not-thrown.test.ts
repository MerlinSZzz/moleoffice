// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROADCAST TIME THAT CANNOT BE READ IS SAID ON THE READING, AND THE AGENT PAGE STILL OPENS. Wave 13p
 * round 29, piece 0, item 4.
 *
 * WHAT WAS WRONG. A MOLE_OFFICE_BROADCAST_TIMES line that is not a list of HH:MM, or a secretary's stored
 * times that are not, threw out of the reading of its broadcast. The one-participant door has no try
 * around that reading, so the whole agent page said the agent was not found. Round 27c had already kept
 * the reminder tick going on unreadable stored times; this file holds the reading to the same rule, on both
 * roads.
 *
 * WHAT THIS FILE PROVES. On each road the agent's page reply comes back (not a throw), its broadcast
 * reading carries `timesUnreadable` naming the road and what was wrong in words, and the reading's next
 * slot is worked out on the office's own times: the built-in times when the setting is wrong, the
 * setting's times when the stored ones are. The reminder tick does not throw on either road either.
 *
 * MUTATION PROOF, named, after a control run, each restored byte-identical (the round's report and
 * /tmp/r29/broadcast/proofs.md hold the logs):
 *   env-throws     — `theTimesReadFor` reads `broadcastTimes()`, which throws, instead of
 *                    `theOfficesBroadcastTimes()`: the first describe goes red.
 *   stored-throws  — `theTimesReadFor` throws the stored road's sentence again: the second goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BroadcastReading } from '../src/shared/broadcast.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type RecordsLib = typeof import('../src/server/lib/records.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let recordsLib: RecordsLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The real clock, once, so every made-up moment here is measured from the operator's day. */
const R0 = new Date()

/** A moment on the local day `days` after R0's, at hh:mm. */
function at(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

/** The slot occurrence the office writes: `YYYY-MM-DD HH:MM`. */
function occurrence(days: number, hours: number): string {
  return localStamp(at(days, hours, 0)).slice(0, 16)
}

let clio = ''

/** The agent page's reply for clio, and its broadcast reading. */
async function clioPage(): Promise<{ code: number; body: string; broadcast: BroadcastReading | undefined }> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants/agent/clio/profile', headers: AS_THE_PERSON })
  const said = reply.statusCode === 200 ? (reply.json() as { participant: { broadcast?: BroadcastReading } }) : null
  return { code: reply.statusCode, body: reply.body, broadcast: said?.participant.broadcast }
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES = '15'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  recordsLib = await import('../src/server/lib/records.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'clio', name: 'clio', role: 'secretary' } })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  clio = (reply.json() as { agent: { id: string } }).agent.id
}, 120_000)

afterAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  await app?.close()
  t?.close()
})

describe('a MOLE_OFFICE_BROADCAST_TIMES line that cannot be read', () => {
  it('leaves the agent page open, says the .env line is wrong on the reading, and uses the built-in times', async () => {
    const before = await clioPage()
    expect(before.code, before.body.slice(0, 400)).toBe(200)
    expect(before.broadcast?.timesUnreadable).toEqual([])
    process.env.MOLE_OFFICE_BROADCAST_TIMES = '06:00,9pm'
    try {
      const page = await clioPage()
      expect(page.code, page.body.slice(0, 400)).toBe(200)
      const reading = page.broadcast!
      expect(reading.timesUnreadable).toEqual([
        {
          road: 'env-line',
          says:
            'MOLE_OFFICE_BROADCAST_TIMES contains "9pm", which is not a time of day. Write each time as HH:MM in 24-hour ' +
            'local time, separated by commas. The built-in times 07:00, 18:00 are used until it is put right.',
        },
      ])
      // THE BUILT-IN TIMES ARE IN USE, not the line's 06:00 and not its unread 21:00.
      expect(reading.on).toBe(true)
      expect(reading.next?.slot).toMatch(/^(07|18):00$/)
      const lib = await import('../src/server/lib/broadcast.ts')
      expect(lib.theBroadcastReadingFor(clio, at(1, 13, 0)).next).toEqual({ at: occurrence(1, 18), slot: '18:00' })
      expect(lib.theBroadcastReadingFor(clio, at(1, 5, 0)).next).toEqual({ at: occurrence(1, 7), slot: '07:00' })
    } finally {
      process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
    }
  })

  it('does not stop the reminder tick, which reminds on the built-in times and says the line once', () => {
    process.env.MOLE_OFFICE_BROADCAST_TIMES = '06:00,9pm'
    try {
      const morning = reminders.sendTheRemindersThatAreDue('default', at(2, 6, 31), at(1, 6, 31))
      expect(morning.broadcastsReminded).toContain(clio)
      expect(morning.broadcastTimesUnreadable).toHaveLength(1)
      expect(morning.broadcastTimesUnreadable[0]).toContain('MOLE_OFFICE_BROADCAST_TIMES contains "9pm"')
      const early = reminders.sendTheRemindersThatAreDue('default', at(2, 5, 31), at(1, 5, 31))
      expect(early.broadcastsReminded).not.toContain(clio)
    } finally {
      process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
    }
  })
})

describe('a secretary’s stored times that cannot be read', () => {
  it('leaves the agent page open, says the stored schedule is wrong on the reading, and uses the office’s setting', async () => {
    process.env.MOLE_OFFICE_BROADCAST_TIMES = '08:00,20:00'
    try {
      const record = (t.client.sqlite
        .prepare('SELECT m.record_id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1')
        .get(clio) as { id: string }).id
      const extra = (t.api.getRecord(record)!.data as Record<string, unknown>)['extra'] as Record<string, unknown>
      const schedule = extra['broadcastSchedule'] as Record<string, unknown>
      expect(schedule, 'clio was given a schedule at the card door').toBeDefined()
      // PAST THE DOOR, AS DATA OLDER THAN THE GUARD COULD BE.
      recordsLib.throughTheBroadcastTimesDoor(() =>
        recordsLib.patchRecord(record, { dataPatch: { extra: { ...extra, broadcastSchedule: { ...schedule, times: ['noon'] } } } }, { type: 'human', id: THE_PERSON }),
      )
      const page = await clioPage()
      expect(page.code, page.body.slice(0, 400)).toBe(200)
      const reading = page.broadcast!
      expect(reading.timesUnreadable).toEqual([
        {
          road: 'stored-schedule',
          says:
            'The broadcast schedule holds times ["noon"], which is not a list of times of day as HH:MM. Set them again with ' +
            "POST /api/participants/agent/:id/broadcast-times. The office's times 08:00, 20:00 are used meanwhile.",
        },
      ])
      const lib = await import('../src/server/lib/broadcast.ts')
      expect(lib.theBroadcastReadingFor(clio, at(3, 13, 0)).next).toEqual({ at: occurrence(3, 20), slot: '20:00' })
      const tick = reminders.sendTheRemindersThatAreDue('default', at(4, 7, 31), at(3, 7, 31))
      expect(tick.broadcastsReminded).toContain(clio)
      expect(tick.broadcastTimesUnreadable.join(' ')).toContain('["noon"], which is not a list of times of day as HH:MM')
    } finally {
      process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
    }
  })
})
