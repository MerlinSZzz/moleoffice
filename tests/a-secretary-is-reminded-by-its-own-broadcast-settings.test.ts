// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY IS REMINDED BY ITS OWN BROADCAST SETTINGS. What a secretary sets through POST
 * /api/participants/agent/:id/broadcast-settings is what the office's reminder watcher does.
 *
 * WHAT THIS FILE PROVES, one tick of the reminder watcher at a time, with a clock of its own:
 *   (c) a secretary that set nothing is reminded at the office's times, the office's lead before them, in the
 *       office's words;
 *   (d) a secretary that turned its broadcasts off gets no reminder and no one more reminder at a due slot, and its
 *       page reading says so and names no next slot; turned on again, it is reminded at the times it kept;
 *   (e) a secretary with a lead of 10 is reminded 10 minutes before its time and not the office's lead before;
 *   (f) its own words replace the reminder's check and tidy and nothing else: every other sentence is the one a
 *       secretary on the office's words gets, the slot, the template, how a report is recognised, the open checklist
 *       items, the backup sentence on the last slot, and the sentence saying its stored times cannot be read;
 *   (g) a slot that passes with nothing sent files no problem and no incident, logs no fault, and adds nothing to the
 *       pause count.
 *
 * MADE-UP: the secretaries, the report template note, the backup sentence and every word a secretary sets.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names each run.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { gateDefaultHere, settingNamed } from '../src/config/settings.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { localStamp } from '../src/shared/time.ts'
import { readStoredWord } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')
type RecordsLib = typeof import('../src/server/lib/records.ts')
type ChecklistsLib = typeof import('../src/server/lib/checklists.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib
let recordsLib: RecordsLib
let checklists: ChecklistsLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The broadcast settings the office reads here, each at its declared default, whatever the checkout's `.env` says. */
const THE_SETTINGS_READ = ['MOLE_OFFICE_BROADCAST_TIMES', 'MOLE_OFFICE_BROADCAST_LEAD_MINUTES', 'MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES'] as const

const BACKUP = 'A made-up backup sentence for this test.'
const OWN_WORDS = 'A made-up check of this secretary’s own, in place of the office’s.'

/** The office's times, its lead and its late minutes, as the settings declare them. */
const TIMES = String(settingNamed('MOLE_OFFICE_BROADCAST_TIMES').fallback).split(',')
const LEAD = Number(settingNamed('MOLE_OFFICE_BROADCAST_LEAD_MINUTES').fallback)
const LATE = Number(settingNamed('MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES').fallback)
const FIRST = TIMES[0]!
const LAST = TIMES.at(-1)!

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

/** The secretary sets its own settings with its own key. */
async function itSets(handle: string, body: Record<string, unknown>): Promise<void> {
  const { code, said } = await post(`/api/participants/agent/${idOf[handle]!}/broadcast-settings`, { ...body, because: 'Set for this test.' }, asAgent(handle))
  expect(code, `${handle}: ${JSON.stringify(said).slice(0, 400)}`).toBe(200)
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

/** What the one reminder for one slot occurrence said in full. */
function theReminder(handle: string, days: number, slot: string): string {
  const lines = officeLinesTo(handle, 'broadcastSlot', occurrence(days, slot))
  expect(lines, `${handle} at ${occurrence(days, slot)}`).toHaveLength(1)
  return lines[0]!.saidInFull ?? ''
}

/** Stored times that cannot be read, written past the door as data older than the guard could be. */
function storeUnreadableTimes(handle: string): void {
  const record = (t.client.sqlite
    .prepare('SELECT m.record_id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1')
    .get(idOf[handle]) as { id: string }).id
  const extra = (t.api.getRecord(record)!.data as Record<string, unknown>)['extra'] as Record<string, unknown>
  const schedule = extra['broadcastSchedule'] as Record<string, unknown>
  recordsLib.throughTheBroadcastTimesDoor(() =>
    recordsLib.patchRecord(record, { dataPatch: { extra: { ...extra, broadcastSchedule: { ...schedule, times: ['noon'] } } } }, { type: 'human', id: THE_PERSON }),
  )
}

function howMany(kind: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE kind = ?').get(kind) as { n: number }).n
}

function thePauseCounts(): unknown[] {
  return t.client.sqlite.prepare("SELECT * FROM gate_counts WHERE gate = 'broadcast-pause' ORDER BY day").all()
}

beforeAll(async () => {
  for (const name of THE_SETTINGS_READ) vi.stubEnv(name, settingNamed(name).fallback ?? '')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', gateDefaultHere(gateNamed('broadcast-pause')) ?? '')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_BACKUP_REMINDER', BACKUP)
  vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE', '')
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  recordsLib = await import('../src/server/lib/records.ts')
  checklists = await import('../src/server/lib/checklists.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const handle of ['lark', 'quill', 'wren', 'sable', 'heron', 'kite']) await register(handle)
  // A TEMPLATE IS HELD, so each reminder carries the requirement and how a report is recognised, and the one more
  // reminder after a slot is sent.
  vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE', t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'The report template of this test',
    data: { body: 'A made-up template for this test.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id)
  await itSets('quill', { reminderWords: OWN_WORDS })
  storeUnreadableTimes('wren')
  storeUnreadableTimes('sable')
  await itSets('sable', { reminderWords: OWN_WORDS })
  const times = await post(`/api/participants/agent/${idOf['heron']!}/broadcast-times`, { times: ['12:00'], because: 'Heron reports at noon.' })
  expect(times.code, JSON.stringify(times.said).slice(0, 400)).toBe(200)
  await itSets('heron', { on: false })
  await itSets('kite', { leadMinutes: 10 })
}, 120_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('the reminders read each secretary’s own settings', () => {
  it('(c) reminds a secretary that set nothing at the office’s times, the office’s lead before, in the office’s words', () => {
    expect(tick(at(1, FIRST, -LEAD - 1)).broadcastsReminded).not.toContain(idOf['lark'])
    const due = tick(at(1, FIRST, -LEAD + 1))
    expect(due.broadcastsReminded).toContain(idOf['lark'])
    expect(theReminder('lark', 1, FIRST)).toContain(broadcast.THE_OFFICES_REMINDER_WORDS)
    expect(tick(at(1, LAST, -LEAD + 1)).broadcastsReminded).toContain(idOf['lark'])
  })

  it('(e) reminds a secretary with a lead of 10 ten minutes before its time, and not the office’s lead before', () => {
    // THE TICKS OF (c) RAN AT THE OFFICE'S LEAD BEFORE EACH TIME, and kite was not reminded at either.
    expect(officeLinesTo('kite', 'broadcastSlot', occurrence(1, FIRST))).toHaveLength(0)
    expect(tick(at(2, FIRST, -LEAD + 1)).broadcastsReminded).not.toContain(idOf['kite'])
    expect(tick(at(2, FIRST, -11)).broadcastsReminded).not.toContain(idOf['kite'])
    const due = tick(at(2, FIRST, -9))
    expect(due.broadcastsReminded).toContain(idOf['kite'])
    expect(officeLinesTo('kite', 'broadcastSlot', occurrence(2, FIRST))).toHaveLength(1)
  })

  it('(f) its own words replace the check and the tidy, and every other sentence stays', () => {
    for (const slot of [FIRST, LAST]) {
      const own = theReminder('quill', 1, slot)
      const office = theReminder('lark', 1, slot)
      expect(own).toContain(OWN_WORDS)
      expect(own).not.toContain(broadcast.THE_OWNER_CHECK)
      expect(own).not.toContain(broadcast.THE_CHECKLIST_TIDY)
      expect(own).toBe(office.replace(broadcast.THE_OFFICES_REMINDER_WORDS, OWN_WORDS))
      // WHAT THE TWO SHARE IS THERE TO BE KEPT: the open checklist item every new secretary is given.
      expect(own).toContain(checklists.theOpenItemsSentenceFor({ kind: 'agent', id: idOf['quill']! })!)
    }
    expect(theReminder('quill', 1, LAST)).toContain(BACKUP)
    expect(theReminder('quill', 1, FIRST)).not.toContain(BACKUP)
    // THE SENTENCE SAYING ITS STORED TIMES CANNOT BE READ STAYS TOO, beside its own words.
    for (const slot of [FIRST, LAST]) {
      const own = theReminder('sable', 1, slot)
      const office = theReminder('wren', 1, slot)
      expect(office).toContain(`/api/participants/agent/${idOf['wren']!}/broadcast-times`)
      expect(own).toBe(office.replace(broadcast.THE_OFFICES_REMINDER_WORDS, OWN_WORDS).replaceAll(idOf['wren']!, idOf['sable']!))
    }
  })

  it('(d) sends no reminder and no one more reminder while its broadcasts are off, and reminds it at the times it kept once they are on', async () => {
    for (const day of [1, 2]) {
      expect(tick(at(day, '12:00', -LEAD + 1)).broadcastsReminded).not.toContain(idOf['heron'])
      expect(tick(at(day, '12:00', LATE + 1)).broadcastsWithNoReport).not.toContain(idOf['heron'])
    }
    expect(officeLinesTo('heron', 'broadcastSlot', occurrence(1, '12:00'))).toHaveLength(0)
    expect(officeLinesTo('heron', 'broadcastNoReport', occurrence(1, '12:00'))).toHaveLength(0)
    const off = broadcast.theBroadcastReadingFor(idOf['heron']!, at(3, '09:00'))
    expect(off).toMatchObject({ on: true, off: true, next: null })
    expect(off.says).toEqual([readStoredWord('broadcast.says.off')])

    await itSets('heron', { on: true })
    expect(broadcast.theBroadcastReadingFor(idOf['heron']!, at(3, '09:00'))).toMatchObject({ off: false, next: { at: occurrence(3, '12:00'), slot: '12:00' } })
    expect(tick(at(3, FIRST, -LEAD + 1)).broadcastsReminded).not.toContain(idOf['heron'])
    expect(tick(at(3, '12:00', -LEAD + 1)).broadcastsReminded).toContain(idOf['heron'])
    expect(officeLinesTo('heron', 'broadcastSlot', occurrence(3, '12:00'))).toHaveLength(1)
    expect(tick(at(3, '12:00', LATE + 1)).broadcastsWithNoReport).toContain(idOf['heron'])
  })
})

describe('a slot that passes with nothing sent', () => {
  it('(g) files no problem and no incident, logs no fault, and adds nothing to the pause count', () => {
    // A PAUSE AFTER TWO, made up here, so that a slot counted as a broadcast nobody answered would pause lark within
    // the passes below.
    vi.stubEnv('MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', '2')
    const problems = howMany('problem')
    const incidents = howMany('incident')
    const counts = thePauseCounts()
    const before = broadcast.thePauseReadingFor(idOf['lark']!)
    expect(before).toMatchObject({ paused: false, broadcasts: 0 })
    // LARK IS REMINDED BEFORE ITS FIRST TIME, SENDS NOTHING, IS REMINDED ONCE MORE, AND THE DAY GOES ON.
    const passes = [tick(at(4, FIRST, -LEAD + 1)), tick(at(4, FIRST, LATE + 1)), tick(at(4, LAST, -LEAD + 1)), tick(at(4, LAST, LATE + 1)), tick(at(5, FIRST, -LEAD + 1))]
    expect(passes[0]!.broadcastsReminded).toContain(idOf['lark'])
    expect(passes[1]!.broadcastsWithNoReport).toContain(idOf['lark'])
    expect(passes[4]!.broadcastsReminded).toContain(idOf['lark'])
    for (const pass of passes) {
      expect(pass.broadcastTimesUnreadable.filter((said) => said.includes(idOf['lark']!))).toEqual([])
      expect(pass.broadcastsPaused).not.toContain(idOf['lark'])
    }
    expect(howMany('problem')).toBe(problems)
    expect(howMany('incident')).toBe(incidents)
    expect(thePauseCounts()).toEqual(counts)
    expect(broadcast.thePauseReadingFor(idOf['lark']!)).toEqual(before)
  })
})
