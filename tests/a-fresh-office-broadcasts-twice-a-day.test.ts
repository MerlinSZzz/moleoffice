// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readSetting } from '../src/config/settings.mjs'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')
type EnvLib = typeof import('../src/server/lib/env.ts')

const THE_DEFAULT = readSetting('MOLE_OFFICE_BROADCAST_TIMES', {}).value as string

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib
let env: EnvLib
let secretaryId = ''

const R0 = new Date()

/** A moment of today, at hours:minutes local time. */
function today(hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate(), hours, minutes, 0, 0)
}

/** The reminder lines the office wrote for one occurrence, such as "2026-10-02 07:00". */
function remindersFor(occurrence: string): number {
  return (
    t.client.sqlite
      .prepare(
        "SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.extra.broadcastSlot') = ?",
      )
      .get(occurrence) as { n: number }
  ).n
}

beforeAll(async () => {
  // THE DEFAULT, AS DECLARED, whatever the checkout's .env says: this file is about what a fresh office
  // gets. The lead and the limit are set to their declared defaults for the same reason.
  process.env.MOLE_OFFICE_BROADCAST_TIMES = THE_DEFAULT
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = readSetting('MOLE_OFFICE_BROADCAST_LEAD_MINUTES', {}).value as string
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = readSetting('MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', {}).value as string
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  env = await import('../src/server/lib/env.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    payload: { handle: 'wren-the-scribe', name: 'Wren the scribe', role: 'secretary' },
  })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  secretaryId = (reply.json() as { agent: { id: string } }).agent.id
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a fresh office broadcasts twice a day', () => {
  it('declares 07:00 and 18:00 as the default slots, and reads exactly those', () => {
    expect(THE_DEFAULT).toBe('07:00,18:00')
    expect(env.broadcastTimes()).toEqual(['07:00', '18:00'])
    expect(broadcast.theLastSlotOfTheDay()).toBe('18:00')
  })

  it('opens a reminder window for 07:00 and 18:00 over a whole day, and for nothing else', () => {
    const slots = new Set<string>()
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const due = broadcast.theReminderDueAt(today(Math.floor(minute / 60), minute % 60))
      if (due !== null) slots.add(due.slot)
    }
    expect([...slots].sort()).toEqual(['07:00', '18:00'])
  })

  it('reminds its secretary twice in a day, of 07:00 and of 18:00, and not at noon', () => {
    expect(broadcast.theBroadcastScheduleOf(secretaryId), 'the secretary card made a schedule').not.toBeNull()
    const watchingSince = new Date(R0.getTime() - 86_400_000)
    let reminded = 0
    for (const [hours, minutes] of [[6, 31], [12, 31], [17, 31]] as const) {
      const sent = reminders.sendTheRemindersThatAreDue('default', today(hours, minutes), watchingSince)
      if (sent.broadcastsReminded.includes(secretaryId)) reminded += 1
    }
    const day = localStamp(today(0, 0)).slice(0, 10)
    expect(reminded).toBe(2)
    expect(remindersFor(`${day} 07:00`)).toBe(1)
    expect(remindersFor(`${day} 13:00`)).toBe(0)
    expect(remindersFor(`${day} 18:00`)).toBe(1)
  })
})
