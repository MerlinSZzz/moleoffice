// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY MAY SKIP A QUIET DAY. A decision sets it: the secretary reports only at 07:00,
 * and may file nothing on a quiet day. Wave 13p round 29, piece 0, item 5.
 *
 * WHAT THIS FILE PROVES. POST /api/participants/agent/:id/broadcast-skip {"at":"YYYY-MM-DD HH:MM"} says one
 * slot of a secretary has nothing to report. Only the secretary itself or the person may say it; another
 * agent is refused in words and nothing is written. Once it is said, the office sends no reminder before
 * that slot and no one more reminder after it, the reading shows the slot as skipped and not as reported,
 * and the line that says it does not count toward the pause. The person's own skip is not an answer that
 * starts a paused schedule again. A slot that is not one of the secretary's times is refused in words.
 *
 * MADE-UP: the secretaries "quill" and "sable", the worker "w-one", and the report template note.
 *
 * MUTATION PROOF, named, after a control run, each restored byte-identical (/tmp/r29/broadcast/proofs.md
 * holds the logs):
 *   any-agent      — the door's check that the caller is the secretary itself is taken out: "refuses
 *                    another agent" goes red.
 *   reminds-anyway — the tick's skip check before the slot is taken out: "stops the reminders" goes red.
 *   chases-anyway  — the tick's skip check on the one more reminder is taken out: the same test goes red.
 *   skip-counts    — `theBroadcastsOf` counts the line that says a slot is skipped: "does not count toward
 *                    the pause" goes red.
 *   skip-answers   — `timesThePersonAnswered` counts the person's skip as an answer: the same test goes red.
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

/** One tick of the office's reminder watcher at `now`. */
function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

const idOf: Record<string, string> = {}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf[handle]! }
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await post('/api/agents/started', { handle, name: handle, role })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** Every message that says a slot is skipped, with who sent it and to whom. */
function skipLines(): { from: string; to: string; at: string; body: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT json_extract(data, '$.sentBy.id') AS sender, json_extract(data, '$.to[0].id') AS addressee, " +
          "json_extract(data, '$.extra.broadcastSkip') AS at, json_extract(data, '$.body') AS body FROM records " +
          "WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.extra.broadcastSkip') IS NOT NULL ORDER BY created_at, rowid",
      )
      .all() as { sender: string; addressee: string; at: string; body: string }[]
  ).map((one) => ({ from: one.sender, to: one.addressee, at: one.at, body: one.body }))
}

/** One message from a secretary to the person whose body names `slot`. */
function aBroadcast(handle: string, slot: string): string {
  const agentId = idOf[handle]!
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'broadcast',
    data: { body: `${slot} progress; a decision is needed`, to: [{ kind: 'person', id: THE_PERSON }], sentBy: { kind: 'agent', id: agentId } },
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
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('quill', 'secretary')
  await register('sable', 'secretary')
  await register('w-one', 'worker')
  // A TEMPLATE IS HELD, so the one more reminder after a slot is sent, and the skip has it to stop.
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'The report template of this test',
    data: { body: 'A made-up template for this test.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}, 120_000)

afterAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  await app?.close()
  t?.close()
})

describe('the door that says a slot has nothing to report', () => {
  it('refuses another agent, a secretary or a worker, in words, and writes nothing', async () => {
    for (const other of ['sable', 'w-one']) {
      const { code, said } = await post('/api/participants/agent/quill/broadcast-skip', { at: occurrence(1, 7) }, asAgent(other))
      expect(code, JSON.stringify(said).slice(0, 400)).toBe(403)
      expect(String(said['error'])).toBe('Only this secretary itself or the person may say one of its reports has nothing in it. Nothing was written.')
    }
    expect(skipLines()).toEqual([])
    expect(broadcast.theSkipForTheSlot(idOf['quill']!, occurrence(1, 7))).toBeNull()
  })

  it('refuses a slot that is not one of the secretary’s times, a slot that is not a day and a time, and an agent with no schedule', async () => {
    const noon = await post('/api/participants/agent/quill/broadcast-skip', { at: occurrence(1, 12) }, asAgent('quill'))
    expect(noon.code).toBe(400)
    expect(String(noon.said['error'])).toBe("12:00 is not one of this secretary's broadcast times, which are 07:00, 18:00. Nothing was written.")
    const word = await post('/api/participants/agent/quill/broadcast-skip', { at: 'tomorrow morning' }, asAgent('quill'))
    expect(word.code).toBe(400)
    expect(String(word.said['error'])).toContain('is not a slot. Write it as the day and the time, YYYY-MM-DD HH:MM')
    const worker = await post('/api/participants/agent/w-one/broadcast-skip', { at: occurrence(1, 7) }, asAgent('w-one'))
    expect(worker.code).toBe(409)
    expect(skipLines()).toEqual([])
  })
})

describe('a skipped slot', () => {
  it('stops the reminder before it and the one more reminder after it, said by the secretary or by the person', async () => {
    const mine = await post('/api/participants/agent/quill/broadcast-skip', { at: occurrence(1, 7) }, asAgent('quill'))
    expect(mine.code, JSON.stringify(mine.said).slice(0, 400)).toBe(200)
    expect(mine.said).toMatchObject({ at: occurrence(1, 7), already: false })
    const again = await post('/api/participants/agent/quill/broadcast-skip', { at: occurrence(1, 7) }, asAgent('quill'))
    expect(again.said).toMatchObject({ at: occurrence(1, 7), already: true, message: mine.said['message'] })
    const their = await post('/api/participants/agent/quill/broadcast-skip', { at: occurrence(1, 18) })
    expect(their.code, JSON.stringify(their.said).slice(0, 400)).toBe(200)
    // EACH IS A MESSAGE IN THE NAME OF WHOEVER SAID IT, so the conversation shows it.
    expect(skipLines()).toEqual([
      { from: idOf['quill'], to: THE_PERSON, at: occurrence(1, 7), body: `There is nothing to report for the ${occurrence(1, 7)} broadcast, so no report will come for it.` },
      { from: THE_PERSON, to: idOf['quill'], at: occurrence(1, 18), body: `No report is needed for the ${occurrence(1, 18)} broadcast, because there is nothing to report.` },
    ])

    const before = tick(at(1, 6, 31))
    expect(before.broadcastsReminded).toContain(idOf['sable'])
    expect(before.broadcastsReminded).not.toContain(idOf['quill'])
    const after = tick(at(1, 7, 16))
    expect(after.broadcastsWithNoReport).toContain(idOf['sable'])
    expect(after.broadcastsWithNoReport).not.toContain(idOf['quill'])
    const evening = tick(at(1, 17, 31))
    expect(evening.broadcastsReminded).toContain(idOf['sable'])
    expect(evening.broadcastsReminded).not.toContain(idOf['quill'])
    // THE NEXT DAY IS NOT SKIPPED.
    expect(tick(at(2, 6, 31)).broadcastsReminded).toContain(idOf['quill'])
  })

  it('shows on the reading as skipped and not as reported', () => {
    const reading = broadcast.theBroadcastReadingFor(idOf['quill']!, at(1, 12, 0))
    expect(reading.skipped).toEqual({ at: occurrence(1, 18), slot: '18:00' })
    expect(reading.last).toBeNull()
    expect(reading.says).toContain(`The broadcast ${occurrence(1, 18)} is skipped, because there is nothing to report.`)
    expect(reading.says).toContain('No broadcast has been recognised yet.')
  })

  it('does not count toward the pause, and the person’s skip does not start a paused schedule again', async () => {
    aBroadcast('quill', '07:00')
    aBroadcast('quill', '18:00')
    // TWO UNANSWERED BROADCASTS AND THE SECRETARY'S OWN SKIP LINE, WHICH NAMES 07:00: two, not three.
    expect(broadcast.thePauseReadingFor(idOf['quill']!)).toMatchObject({ paused: false, broadcasts: 2 })
    aBroadcast('quill', '07:00')
    expect(broadcast.thePauseReadingFor(idOf['quill']!)).toMatchObject({ paused: true, broadcasts: 3 })
    const their = await post('/api/participants/agent/quill/broadcast-skip', { at: occurrence(3, 7) })
    expect(their.code, JSON.stringify(their.said).slice(0, 400)).toBe(200)
    expect(broadcast.thePauseReadingFor(idOf['quill']!)).toMatchObject({ paused: true, broadcasts: 3 })
  })
})
