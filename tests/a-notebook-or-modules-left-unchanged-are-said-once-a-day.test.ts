// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTEBOOK OR A PROJECT'S MODULES LEFT UNCHANGED ARE SAID ONCE A DAY (problem UBCrM0LoMCm3; decision jlXCnK4feOuR,
 * refined by aZGg6gerakM1).
 *
 * WHAT THIS FILE PROVES, through one tick of the office's reminder watcher at moments it chooses:
 * 1. A notebook unchanged for 7 days reminds the agent it belongs to, once that day and again the next. One unchanged
 *    for an hour under 7 days reminds nobody that day. The reminder asks for a new lesson and says an unchanged notebook
 *    may be right.
 * 2. A project's modules unchanged for 14 days remind the one secretary the setting names, in one line. Active, paused
 *    and no-state modules are counted; stable and retired ones, and one changed 12 days before the first tick, are not.
 * 3. A project with nobody named gets no module line, and the tick says so once, not on every tick.
 * 4. A notebook whose agent is retired reminds nobody, and the tick says so once. (The office refuses a notebook under a
 *    handle it does not know, so a retired agent is the way a notebook comes to have nobody to remind.)
 * 5. A setting that is not project=handle stops this check only: the tick says why and still returns.
 *
 * WHERE THE RULES LIVE: src/server/lib/stale-records.ts, `MODULE_STATES_LEFT_OUT_OF_THE_AGE_CHECK` in
 * src/shared/kinds.ts, and MOLE_OFFICE_MODULE_REMINDER_SECRETARIES in src/config/settings.mjs, read in
 * src/server/lib/env.ts. Every record here is made up in this file's own empty office.
 *
 * MUTATIONS, each proved red after a control run and restored:
 *   1. the notebook age 7 → 8 turns case 1 red.
 *   2. the left-out states without 'stable' turns case 2 red.
 *   3. the once-a-day check (`said.has(about)`) for modules removed turns case 2 red.
 *   4. the "said once" set ignored turns case 3 red.
 *   5. the tick's try/catch removed turns case 5 red.
 *   6. the tick no longer calling the check turns cases 1 and 2 red.
 *   7. the tick saying a failed check on every tick (its "said once" set ignored) turns case 5 red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const DAY = 86_400_000
/** The moment of the first tick, on the operator's own clock at a fixed hour, so a day's end is not crossed by accident. */
const R0 = new Date()
const NOW = new Date(R0.getFullYear(), R0.getMonth(), R0.getDate(), 12, 0, 0, 0)

function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - DAY))
}

const idOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role },
  })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  idOf[handle] = (reply.json() as { agent: { id: string } }).agent.id
}

/** A record of `kind` last changed `ageMs` before NOW. */
function aRecordAged(kind: 'notebook' | 'module', title: string, data: Record<string, unknown>, ageMs: number): string {
  const id = t.api.createRecord({ workspaceId: 'default', kind, title, data, actor: { type: 'human', id: THE_PERSON } }).id
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(localStamp(new Date(NOW.getTime() - ageMs)), id)
  return id
}

interface Line {
  body: string
  saidInFull?: string
  extra?: { staleCheck?: { day: string; about: string; modules?: string[] } }
}

/** The office's lines of this check to one agent. */
function linesTo(handle: string): Line[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.staleCheck.day') IS NOT NULL ORDER BY rowid",
      )
      .all(idOf[handle]) as { data: string }[]
  ).map((one) => JSON.parse(one.data) as Line)
}

const ids: Record<string, string> = {}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('clerk', 'secretary')
  await register('scribe', 'secretary')
  await register('leaver', 'secretary')
  ids.orphan = aRecordAged('notebook', "Fixture leaver's notebook", { agentHandle: 'leaver', entries: [] }, 9 * DAY)
  const retired = await app.inject({
    method: 'POST',
    url: '/api/participants/agent/leaver/retire',
    headers: AS_THE_PERSON,
    payload: { because: 'a fixture: its notebook is left with nobody to remind' },
  })
  expect(retired.statusCode, retired.body.slice(0, 300)).toBe(200)
  ids.stale = aRecordAged('notebook', "Fixture clerk's notebook", { agentHandle: 'clerk', entries: [] }, 7 * DAY)
  ids.fresh = aRecordAged('notebook', "Fixture scribe's notebook", { agentHandle: 'scribe', entries: [] }, 7 * DAY - 60 * 60_000)
  ids.active = aRecordAged('module', 'Fixture active module', { state: 'active' }, 14 * DAY)
  ids.paused = aRecordAged('module', 'Fixture paused module', { state: 'paused' }, 15 * DAY)
  ids.noState = aRecordAged('module', 'Fixture module with no state', {}, 20 * DAY)
  ids.stable = aRecordAged('module', 'Fixture stable module', { state: 'stable' }, 30 * DAY)
  ids.retired = aRecordAged('module', 'Fixture retired module', { state: 'retired' }, 30 * DAY)
  ids.recent = aRecordAged('module', 'Fixture recent module', { state: 'active' }, 12 * DAY)
  // MORE THAN THE DEFAULT 10 SECONDS: building the office and registering three agents took longer than that on a
  // busy machine (wave 13p round 29), and a hook that times out skips every case.
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('with nobody named for the modules', () => {
  it('3. sends no module line and says so once, not on every tick', () => {
    const first = tick(NOW)
    expect(first.staleNotSaid.filter((one) => one.includes('nobody is named'))).toEqual([
      'default has 3 modules unchanged for 14 days or more, and nobody is named for it on the Settings page or in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES, so nobody was reminded',
    ])
    expect(first.staleNotSaid).toContain(
      `the notebook ${ids.orphan} in default has not changed for 9 days, and nobody was reminded: leaver is retired`,
    )
    expect(tick(new Date(NOW.getTime() + 60_000)).staleNotSaid).toEqual([])
    expect(linesTo('clerk').filter((one) => one.body === 'Modules have not changed')).toEqual([])
  })

  it('4. a notebook whose agent is retired reminds nobody, and the first tick said so', () => {
    // Said by the first tick of case 3, and not again since.
    expect(linesTo('leaver')).toEqual([])
    const again = tick(new Date(NOW.getTime() + 120_000))
    expect(again.staleNotSaid.some((one) => one.includes(ids.orphan!))).toBe(false)
  })
})

describe('a notebook', () => {
  it('1. unchanged for 7 days reminds the agent it belongs to, once that day and again the next; under 7 days, nobody', () => {
    const notebook = linesTo('clerk').filter((one) => one.body === 'A notebook has not changed')
    expect(notebook).toHaveLength(1)
    expect(notebook[0]!.extra?.staleCheck).toEqual({ day: localStamp(NOW).slice(0, 10), about: `notebook:${ids.stale}` })
    expect(notebook[0]!.saidInFull).toContain(`"Fixture clerk's notebook" (${ids.stale}) in default has not changed for 7 days`)
    expect(notebook[0]!.saidInFull).toContain('is there a new lesson')
    expect(notebook[0]!.saidInFull).toContain('If not, leave the notebook as it is.')
    expect(linesTo('scribe')).toEqual([])
    const tomorrow = new Date(NOW.getTime() + DAY)
    expect(tick(tomorrow).staleReminded).toContain(`clerk about ${ids.stale}`)
    expect(linesTo('clerk').filter((one) => one.body === 'A notebook has not changed')).toHaveLength(2)
    // The scribe's notebook is 8 days unchanged by tomorrow, so it is said then, to the scribe.
    expect(linesTo('scribe').map((one) => one.body)).toEqual(['A notebook has not changed'])
  })
})

describe('with a secretary named for the project', () => {
  beforeAll(() => {
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default=clerk'
  })

  it('2. modules unchanged for 14 days remind that secretary in one line, once a day, and leave out stable, retired and recent ones', () => {
    const later = new Date(NOW.getTime() + DAY + 60_000)
    // The notebooks were said earlier this same day by case 1, so this tick says the modules and nothing else.
    expect(tick(later).staleReminded).toEqual(['clerk about 3 modules in default'])
    expect(tick(new Date(later.getTime() + 60_000)).staleReminded).toEqual([])
    const lines = linesTo('clerk').filter((one) => one.body === 'Modules have not changed')
    expect(lines).toHaveLength(1)
    expect([...lines[0]!.extra!.staleCheck!.modules!].sort()).toEqual([ids.active, ids.paused, ids.noState].sort())
    expect(lines[0]!.saidInFull).toContain('3 modules in default have not changed for 14 days or more.')
    for (const left of [ids.stable, ids.retired, ids.recent]) expect(lines[0]!.saidInFull).not.toContain(left!)
    expect(linesTo('scribe').filter((one) => one.body === 'Modules have not changed')).toEqual([])
  })

  it('5. a setting that is not project=handle stops this check only, and the tick says why once while the server runs', () => {
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default:clerk'
    const pass = tick(new Date(NOW.getTime() + 2 * DAY))
    expect(pass.staleNotSaid).toEqual([
      'the check could not run (MOLE_OFFICE_MODULE_REMINDER_SECRETARIES contains "default:clerk", which is not project=handle. ' +
        'Write each part as project=handle separated by commas, for example research=clerk. Nothing was read from it.)',
    ])
    expect(pass.staleReminded).toEqual([])
    // THE NEXT TICK, and the next day's, say nothing more about the same setting (wave 13p round 27b).
    expect(tick(new Date(NOW.getTime() + 2 * DAY + 60_000)).staleNotSaid).toEqual([])
    expect(tick(new Date(NOW.getTime() + 3 * DAY)).staleNotSaid).toEqual([])
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default=clerk'
  })
})
