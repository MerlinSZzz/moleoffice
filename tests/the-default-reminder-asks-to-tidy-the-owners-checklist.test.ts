// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S DEFAULT REMINDER ASKS A LATER SECRETARY TO TIDY THE OWNER'S CHECKLIST.
 *
 * A decision of 18 November 2026 gave the secretaries a third sentence for the reminder before a
 * report slot: tidy the owner's checklist, mark what he has finished done, mark what a later message
 * replaced superseded, add what he must see or decide, keep each title short, and send him one line
 * saying which items changed. The office's default words carry that sentence word for word from now
 * on, so a department made later starts with it.
 *
 * WHAT THIS FILE PROVES, one tick of the reminder watcher at a time, in an office of its own:
 * 1. A new secretary that set no words of its own is reminded in the office's words, and its
 *    reminder carries the sentence word for word, once.
 * 2. A secretary that set its own words is reminded in its own words, the sentence is not added to
 *    them, and every other sentence is the one a secretary on the office's words gets.
 *
 * MADE-UP: the two secretaries and every word here are made up for this test. No record id or real
 * name is written.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { gateDefaultHere, settingNamed } from '../src/config/settings.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib

/** The sentence the decision gave the secretaries, copied from it word for word. */
const THE_OWNERS_CHECKLIST_TIDY =
  '再整理一下 owner 的清单（checklist）：他已经做完的项，按他的原话标 done（onThePersonsWords）或请他勾掉；被后来的消息取代的项标 superseded 并链接那条消息；新的、要他看或要他定的东西挂上去；每项标题写短，一句话概括，不写成小作文；改完给他发一句，说明改了哪几项。'

/** A made-up secretary's own words, in place of the office's. */
const OWN_WORDS = 'A made-up check of this secretary’s own, in place of the office’s.'

/** The office's times and lead, as the settings declare them. */
const TIMES = String(settingNamed('MOLE_OFFICE_BROADCAST_TIMES').fallback).split(',')
const LEAD = Number(settingNamed('MOLE_OFFICE_BROADCAST_LEAD_MINUTES').fallback)
const FIRST = TIMES[0]!

/** The real clock, once, so every made-up moment here is measured from the operator's day. */
const R0 = new Date()

/** A moment on the local day `days` after R0's, `minutes` after the time of day `slot`; negative is before it. */
function at(days: number, slot: string, minutes = 0): Date {
  const [hours, mins] = slot.split(':').map(Number) as [number, number]
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, mins + minutes, 0, 0)
}

/** The slot occurrence the office writes on its lines: `YYYY-MM-DD HH:MM`. */
function occurrence(days: number, slot: string): string {
  return localStamp(at(days, slot)).slice(0, 16)
}

/** One tick of the office's reminder watcher at `now`. */
function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const idOf: Record<string, string> = {}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf[handle]! }
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string): Promise<void> {
  const { code, said } = await post('/api/agents/started', { handle, name: handle, role: 'secretary' })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** The secretary sets its own reminder words with its own key. */
async function itSetsItsWords(handle: string): Promise<void> {
  const { code, said } = await post(
    `/api/participants/agent/${idOf[handle]!}/broadcast-settings`,
    { reminderWords: OWN_WORDS, because: 'Set for this test.' },
    asAgent(handle),
  )
  expect(code, `${handle}: ${JSON.stringify(said).slice(0, 400)}`).toBe(200)
}

interface Line {
  body: string
  saidInFull?: string
}

/** The office's lines to one agent that carry `mark` = `value` in their `extra` bag. */
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

/** What the one reminder for one slot occurrence said in full. */
function theReminder(handle: string, days: number, slot: string): string {
  const lines = officeLinesTo(handle, 'broadcastSlot', occurrence(days, slot))
  expect(lines, `${handle} at ${occurrence(days, slot)}`).toHaveLength(1)
  return lines[0]!.saidInFull ?? ''
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_BROADCAST_TIMES', String(settingNamed('MOLE_OFFICE_BROADCAST_TIMES').fallback))
  vi.stubEnv('MOLE_OFFICE_BROADCAST_LEAD_MINUTES', String(settingNamed('MOLE_OFFICE_BROADCAST_LEAD_MINUTES').fallback))
  vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES', String(settingNamed('MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES').fallback))
  vi.stubEnv('MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', gateDefaultHere(gateNamed('broadcast-pause')) ?? '')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_BACKUP_REMINDER', '')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE', '')
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('clerk')
  await register('quill')
  await itSetsItsWords('quill')
}, 120_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('the office’s default reminder words', () => {
  it('1. a new secretary that set no words is given the sentence word for word, once', () => {
    const due = tick(at(1, FIRST, -LEAD + 1))
    expect(due.broadcastsReminded).toContain(idOf['clerk'])
    const said = theReminder('clerk', 1, FIRST)
    expect(said).toContain(THE_OWNERS_CHECKLIST_TIDY)
    expect(said.split(THE_OWNERS_CHECKLIST_TIDY)).toHaveLength(2)
  })

  it('2. a secretary that set its own words keeps them, and the sentence is not added to them', () => {
    const due = tick(at(2, FIRST, -LEAD + 1))
    expect(due.broadcastsReminded).toContain(idOf['quill'])
    expect(due.broadcastsReminded).toContain(idOf['clerk'])
    const own = theReminder('quill', 2, FIRST)
    const office = theReminder('clerk', 2, FIRST)
    expect(own).toContain(OWN_WORDS)
    expect(own).not.toContain(THE_OWNERS_CHECKLIST_TIDY)
    expect(own).not.toContain(broadcast.THE_OWNER_CHECK)
    expect(own).not.toContain(broadcast.THE_CHECKLIST_TIDY)
    expect(own).toBe(office.replace(broadcast.THE_OFFICES_REMINDER_WORDS, OWN_WORDS))
  })
})
