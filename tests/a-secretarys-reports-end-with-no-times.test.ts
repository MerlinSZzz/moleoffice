// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SECRETARY'S REPORTS END WITH AN EMPTY LIST OF TIMES (wave 13y round 82).
 *
 * One secretary's own 07:00 and 18:00 reports are to stop. Before wave 13y round 82 the times door refused
 * {"times":[]}, `null` handed a secretary back to the office's times, and a skip covered one slot only, so that
 * secretary had to skip each slot by hand. Now POST /api/participants/agent/:id/broadcast-times with {"times":[]}
 * ends one secretary's reports, and the same callers who may set its times may do it.
 *
 * WHAT THIS FILE PROVES. The office's times are 07:00 and 18:00 here, and four secretaries are registered. The owner
 * ends the first one's reports, its starter the second's, and a holder of the secretary card (the fourth) the
 * third's, each naming a made-up decision as the reason. A worker that started none of them is refused, and so are a
 * time that is not HH:MM and an empty list for an agent that has no schedule to end, each changing nothing. Through
 * the next day the three are sent no reminder, no one more reminder, no backup sentence and no pause line, while
 * the fourth is sent each of them, and the fourth's schedule is what it was. The page reading of each of the three
 * says it has no report times, a skip is refused in words, and times set again bring its reminders back.
 *
 * Every agent, record and word below is made up for this fresh test database.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { localStamp, parseStoredStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readStoredWord } from '../src/shared/i18n.ts'

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

const BACKUP = 'Made-up backup sentence: check that the made-up work has a second copy.'

/** The three secretaries whose reports end, the one left alone, the agent that started the second, and a worker. */
const ENDED = ['invented-ended-by-the-owner', 'invented-ended-by-its-starter', 'invented-ended-by-a-card-holder'] as const
const LEFT = 'invented-left-alone'
const STARTER = 'invented-starter'
const WORKER = 'invented-worker'

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
let decision = ''
let leftAloneBefore: unknown = null

function as(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf[handle]! }
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await post('/api/agents/started', { handle, name: `Made-up ${handle}`, role })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** Every office line to one agent that carries one of the broadcast marks in its `extra` bag. */
function broadcastLinesTo(handle: string): { body: string; saidInFull?: string; extra: Record<string, unknown> }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.to[0].id') = ? " +
          "AND (json_extract(data, '$.extra.broadcastSlot') IS NOT NULL OR json_extract(data, '$.extra.broadcastNoReport') IS NOT NULL " +
          "OR json_extract(data, '$.extra.broadcastPause') IS NOT NULL)",
      )
      .all(idOf[handle]) as { data: string }[]
  ).map((one) => JSON.parse(one.data) as { body: string; saidInFull?: string; extra: Record<string, unknown> })
}

/** One message from a secretary to the person whose body names `slot`, the way a broadcast is recognised. */
function aBroadcast(handle: string, slot: string): void {
  const agentId = idOf[handle]!
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'Made-up broadcast',
    data: { body: `${slot} made-up progress; a made-up decision is needed`, to: [{ kind: 'person', id: THE_PERSON }], sentBy: { kind: 'agent', id: agentId } },
    actor: { type: 'agent', id: agentId },
  })
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
  app = (await apiApp()).app
  await app.ready()
  for (const handle of [...ENDED, LEFT]) await register(handle, 'secretary')
  await register(STARTER, 'worker')
  await register(WORKER, 'worker')
  // THE SECOND SECRETARY WAS STARTED BY AN AGENT, which is then its starter and nothing more.
  t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(idOf[STARTER], idOf[ENDED[1]])
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'The made-up report template of this test',
    data: { body: 'A made-up template for this test.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const made = await post('/api/records', { kind: 'decision', title: 'Made-up: these reports stop', data: { option_taken: 'Made-up: stop them', because: 'A made-up reason.',
    ...governsTheWholeProject(), replaces: [] } })
  expect(made.code, JSON.stringify(made.said).slice(0, 300)).toBe(201)
  decision = (made.said as { record: { id: string } }).record.id
  leftAloneBefore = broadcast.theBroadcastScheduleOf(idOf[LEFT]!)
  expect(leftAloneBefore).not.toBeNull()
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER
  await app?.close()
  t?.close()
})

describe('an empty list ends one secretary’s reports, for each caller who may set its times', () => {
  it('the owner, its starter and a holder of the secretary card each end one secretary’s reports, and the reason names the decision', async () => {
    const callers = [
      { ends: ENDED[0], headers: AS_THE_PERSON, how: 'the-owner' },
      { ends: ENDED[1], headers: as(STARTER), how: 'a-starter' },
      { ends: ENDED[2], headers: as(LEFT), how: 'a-secretary' },
    ]
    for (const { ends, headers, how } of callers) {
      const because = `The owner’s decision ${decision}: these reports stop.`
      const { code, said } = await post(`/api/participants/agent/${idOf[ends]!}/broadcast-times`, { times: [], because }, headers)
      expect(code, `${how} ending ${ends}: ${JSON.stringify(said).slice(0, 400)}`).toBe(200)
      expect(said['times']).toEqual([])
      expect(said['change']).toMatchObject({ how, before: null, after: [], because })
      expect(String((said['change'] as { because: string }).because)).toContain(decision)
      expect(broadcast.theTimesOf(idOf[ends]!)).toEqual([])
      expect(broadcast.theBroadcastScheduleOf(idOf[ends]!)?.times).toEqual([])
      if (how === 'a-starter') {
        const starter = t.client.sqlite.prepare('SELECT started_by_kind, started_by_id FROM agents WHERE id = ?').get(idOf[ends])
        expect(starter).toEqual({ started_by_kind: 'agent', started_by_id: idOf[STARTER] })
      }
    }
  })

  it('refuses a worker that started none of them, and changes nothing', async () => {
    const { code, said } = await post(`/api/participants/agent/${idOf[LEFT]!}/broadcast-times`, { times: [], because: `The owner’s decision ${decision}.` }, as(WORKER))
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(403)
    expect(broadcast.theBroadcastScheduleOf(idOf[LEFT]!)).toEqual(leftAloneBefore)
  })

  it('still refuses a time that is not HH:MM, and an empty list for an agent with no schedule to end, changing nothing', async () => {
    const bad = await post(`/api/participants/agent/${idOf[LEFT]!}/broadcast-times`, { times: ['07:00', '25:00'], because: 'Made-up: a wrong time.' })
    expect(bad.code, JSON.stringify(bad.said).slice(0, 400)).toBe(400)
    expect(String(bad.said['error'])).toContain('"25:00"')
    expect(broadcast.theBroadcastScheduleOf(idOf[LEFT]!)).toEqual(leftAloneBefore)
    const none = await post(`/api/participants/agent/${idOf[WORKER]!}/broadcast-times`, { times: [], because: `The owner’s decision ${decision}.` })
    expect(none.code, JSON.stringify(none.said).slice(0, 400)).toBe(409)
    expect(broadcast.theBroadcastScheduleOf(idOf[WORKER]!)).toBeNull()
  })
})

describe('with no times, that secretary is sent no reminder, no one more reminder, no backup sentence and no pause line', () => {
  it('reminds only the secretary left alone through a day, and gives it the backup sentence on its last slot', () => {
    const passes = [tick(at(1, 6, 31)), tick(at(1, 7, 16)), tick(at(1, 17, 31)), tick(at(1, 18, 16))]
    for (const handle of ENDED) {
      for (const pass of passes) {
        expect(pass.broadcastsReminded).not.toContain(idOf[handle])
        expect(pass.broadcastsWithNoReport).not.toContain(idOf[handle])
      }
      expect(broadcastLinesTo(handle)).toEqual([])
    }
    // THE SEED CAN REMIND: the secretary left alone is reminded before each slot, and once more after the morning's.
    expect(passes[0]!.broadcastsReminded).toContain(idOf[LEFT])
    expect(passes[1]!.broadcastsWithNoReport).toContain(idOf[LEFT])
    expect(passes[2]!.broadcastsReminded).toContain(idOf[LEFT])
    const evening = broadcastLinesTo(LEFT).find((one) => one.extra['broadcastSlot'] === occurrence(1, 18))
    expect(evening?.saidInFull ?? '').toContain(BACKUP)
  })

  it('pauses only the secretary left alone after three unanswered broadcasts each', async () => {
    // A DECISION ANSWERS EVERY SECRETARY'S BROADCASTS OF ITS OWN SECOND AND EARLIER (theNewestAnswerTo in
    // lib/broadcast.ts), and the made-up decision above is often stored in the same second as these broadcasts. So
    // they are written once the clock has left the second the decision is stored in, and nobody has answered them.
    const decidedIn = parseStoredStamp((t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(decision) as { at: string }).at)
    expect(decidedIn).not.toBeNull()
    const unanswered = decidedIn! + 1000
    while (Date.now() < unanswered) await new Promise((done) => setTimeout(done, unanswered - Date.now()))
    for (const handle of [...ENDED, LEFT]) for (let n = 0; n < 3; n++) aBroadcast(handle, '07:00')
    const pass = tick(at(2, 6, 45))
    expect(pass.broadcastsPaused).toContain(idOf[LEFT])
    for (const handle of ENDED) {
      expect(pass.broadcastsPaused).not.toContain(idOf[handle])
      expect(broadcast.thePauseReadingFor(idOf[handle]!).paused).toBe(false)
      expect(broadcastLinesTo(handle)).toEqual([])
    }
  })
})

describe('what is read and said afterwards', () => {
  it('the page reading of each says it has no report times and names no next time', () => {
    for (const handle of ENDED) {
      const reading = broadcast.theBroadcastReadingFor(idOf[handle]!, at(2, 13, 0))
      expect(reading).toMatchObject({ held: true, endedAt: null, next: null, paused: false, noTimes: true })
      expect(reading.says).toEqual([readStoredWord('broadcast.says.noTimes')])
    }
    expect(broadcast.theBroadcastReadingFor(idOf[LEFT]!, at(2, 13, 0))).toMatchObject({ noTimes: false })
  })

  it('refuses a skip for a secretary with no report times, in words', async () => {
    const { code, said } = await post(`/api/participants/agent/${idOf[ENDED[0]]!}/broadcast-skip`, { at: occurrence(3, 7) })
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(409)
    expect(String(said['error'])).toContain('no report times')
  })

  it('leaves the other secretary’s schedule as it was', () => {
    expect(broadcast.theBroadcastScheduleOf(idOf[LEFT]!)).toEqual(leftAloneBefore)
    expect(broadcast.theTimesOf(idOf[LEFT]!)).toEqual(['07:00', '18:00'])
  })

  it('brings the reminders back when times are set again', async () => {
    const { code, said } = await post(`/api/participants/agent/${idOf[ENDED[0]]!}/broadcast-times`, { times: ['12:00'], because: 'Made-up: the reports start again.' })
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
    expect(said['change']).toMatchObject({ before: [], after: ['12:00'] })
    expect(tick(at(3, 11, 31)).broadcastsReminded).toContain(idOf[ENDED[0]])
  })
})
