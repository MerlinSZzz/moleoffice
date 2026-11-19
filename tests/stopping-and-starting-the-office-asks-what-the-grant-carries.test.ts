// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STOPPING AND STARTING THE OFFICE ASKS WHAT THE GRANT CARRIES. Wave 13s round 2b.
 *
 * Pausing and resuming the office's work were the person's, the owner's authority's in a test world, or an agent's that
 * holds a live restart grant and uses its own key. Each now asks the one check (`aRaiseCarriesIt` in lib/records.ts)
 * after those, so a secretary holding the person's grant presses it for them where this office's list of what the grant
 * carries says `may-press`. The secretary card keeps both, so an office that changed nothing behaves as before.
 *
 * A restart does not ask the check. It starts a new server on the same database file, and that server may migrate the
 * file in place, so it stays on the list of doors that do not ask yet, and the grant never presses it whatever the list
 * answers.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of them
 * raised, are made-up agents, each holding the key the office answered. The worker and the restart are the seams the
 * office's own tests use (`thisOfficePausesWith` and `thisOfficeRestartsWith`), which only count; nothing is stopped or
 * started. This office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * FOR EACH OF PAUSE AND RESUME, THROUGH ITS ROUTE:
 *   1. no grant: the unraised secretary hears the door's old refusal word for word, even with this office's row at
 *      may-press, and nothing changes;
 *   2. granted, no row: the raised secretary is refused in the check's words, naming the door, and nothing changes;
 *   3. the row at kept: the refusal says it is this office's answer, and nothing changes;
 *   4. the row at may-press: the press goes through, the worker seam is called once, and the change row and the press
 *      row name the secretary and the grant, never the person.
 * Then the restart: refused in its old words with no row and at may-press, its manager never asked, and the read door
 * says it does not ask the check while pause and resume do.
 *
 * MUTATIONS, after a control run: take `aRaiseCarriesIt` out of the pause and resume guard, and case 4 of both goes red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_DOORS_THAT_DO_NOT_ASK_YET, type AnAnswerAboutADoor, type WhatTheGrantCarriesReading } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, buildTheFirstOfficeInAHook, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

// This file's first office is built in a hook, so the setup below keeps its 60 s for what it sets up.
buildTheFirstOfficeInAHook()

const RAISED = 'restart-grant-secretary'
const UNRAISED = 'restart-plain-secretary'

/** The refusal the pause, resume and restart doors gave before any of them asked the check. */
const THE_OLD_WORDS =
  'Only the owner or an agent with a live restart grant, using its own key, may restart or pause this office. A role card or raise alone is not enough.'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
const seam = { stopped: 0, started: 0, restarts: 0, restarted: 0 }

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The last change row, so a case can say what it wrote. */
function marker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

function rowsSince(mark: number): { record_id: string; actor_type: string; actor_id: string; elevation: string | null; press_id: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, elevation, press_id FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { record_id: string; actor_type: string; actor_id: string; elevation: string | null; press_id: string | null }[]
}

function thePresses(): { id: string; agent_id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite.prepare('SELECT id, agent_id, grant_id, operation, reason FROM presses_for_the_person ORDER BY rowid').all() as {
    id: string
    agent_id: string
    grant_id: string
    operation: string
    reason: string | null
  }[]
}

/** Everything a press of these doors could change: the seams' counts, the pause rows and the press rows. */
const theState = (): string =>
  JSON.stringify(seam) +
  JSON.stringify(t.client.sqlite.prepare("SELECT * FROM changes WHERE record_id IN ('setting:office-pause', 'setting:office-restart')").all()) +
  JSON.stringify(thePresses())

interface ADoor {
  door: 'office.pause' | 'office.resume'
  url: string
  /** Which count of the worker seam a press that goes through raises. */
  seam: 'stopped' | 'started'
  paused: boolean
}

async function refusedAndNothingChanged(url: string, body: Record<string, unknown>, who: string): Promise<string> {
  const before = theState()
  const mark = marker()
  const refused = await call('POST', url, as(who), { ...body, ...FOR_THE_PERSON })
  expect(refused.status, refused.raw).toBe(403)
  expect(theState(), 'a refused press changed something').toBe(before)
  expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
  return refused.error
}

function theFourCases(one: ADoor): void {
  describe(one.door, () => {
    const body = { why: `A made-up reason for ${one.door}.` }

    it('1: with no grant, even with the row at may-press, refuses in its old words and changes nothing', async () => {
      answer(one.door, 'may-press')
      expect(await refusedAndNothingChanged(one.url, body, UNRAISED)).toBe(THE_OLD_WORDS)
    })

    it('2: granted, with no row, refuses in the check’s words naming the door', async () => {
      expect(await refusedAndNothingChanged(one.url, body, RAISED)).toContain(`The secretary card keeps ${one.door} for the person`)
    })

    it('3: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      const said = await refusedAndNothingChanged(one.url, body, RAISED)
      expect(said).toContain(`keeps ${one.door} for the person`)
      expect(said).toContain("This office's list of what the grant carries, since")
    })

    it('4: with the row at may-press, goes through, and what is written names the secretary and the grant', async () => {
      answer(one.door, 'may-press')
      const counted = seam[one.seam]
      const pressesBefore = thePresses().length
      const mark = marker()
      const done = await call('POST', one.url, as(RAISED), { ...body, ...FOR_THE_PERSON })
      expect(done.status, `${one.door}: ${done.raw}`).toBe(200)
      expect(done.body.state).toMatchObject({ paused: one.paused, by: RAISED, because: body.why })
      expect(seam[one.seam], 'the worker seam was not called once').toBe(counted + 1)
      const rows = rowsSince(mark)
      const pause = rows.filter((row) => row.record_id === 'setting:office-pause')
      expect(pause, JSON.stringify(rows)).toHaveLength(1)
      expect(pause[0]!.actor_type).toBe('agent')
      expect(pause[0]!.actor_id, 'the change row names the secretary by its registry id').toBe(ids.get(RAISED))
      expect(pause[0]!.elevation, 'the change row does not name the grant').not.toBeNull()
      expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
      const presses = thePresses().slice(pressesBefore)
      expect(presses, 'one press row for this press').toHaveLength(1)
      expect(presses[0]).toMatchObject({ operation: one.door, reason: A_TESTS_REASON_FOR_THE_PERSON, agent_id: ids.get(RAISED) })
      expect((JSON.parse(pause[0]!.elevation!) as { id: string }).id, 'the press row and the change row name the same grant').toBe(presses[0]!.grant_id)
      expect(pause[0]!.press_id).toBe(presses[0]!.id)
    })
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  ;(await import('../src/server/lib/office-pause.ts')).thisOfficePausesWith({
    stopWorker: async () => {
      seam.stopped += 1
      return 'Made-up worker stopped.'
    },
    startWorker: async () => {
      seam.started += 1
      return 'Made-up worker started.'
    },
  })
  ;(await import('../src/server/lib/office-restart.ts')).thisOfficeRestartsWith({
    mode: 'checkout',
    prepare: async () => {
      seam.restarts += 1
      return () => {
        seam.restarted += 1
      }
    },
  })
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of [RAISED, UNRAISED]) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: 'secretary' })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  ;(await import('../src/server/lib/office-pause.ts')).thisOfficePausesWith(null)
  ;(await import('../src/server/lib/office-restart.ts')).thisOfficeRestartsWith(null)
  await app?.close()
  t?.close()
})

describe('stopping and starting the office asks what the grant carries', () => {
  theFourCases({ door: 'office.pause', url: '/api/office/pause', seam: 'stopped', paused: true })
  theFourCases({ door: 'office.resume', url: '/api/office/resume', seam: 'started', paused: false })

  describe('office.restart', () => {
    const body = { because: 'A made-up reason to restart.' }

    it('refuses the raised secretary in its old words with no row and at may-press, and never asks the restart manager', async () => {
      expect(await refusedAndNothingChanged('/api/office/restart', body, RAISED)).toBe(THE_OLD_WORDS)
      answer('office.restart', 'may-press')
      expect(await refusedAndNothingChanged('/api/office/restart', body, RAISED)).toBe(THE_OLD_WORDS)
      expect(await refusedAndNothingChanged('/api/office/restart', body, UNRAISED)).toBe(THE_OLD_WORDS)
      expect(seam.restarts, 'the restart manager was asked').toBe(0)
      expect(seam.restarted).toBe(0)
    })

    it('is on the list of doors that do not ask yet, and pause and resume are not', async () => {
      expect(THE_DOORS_THAT_DO_NOT_ASK_YET).toContain('office.restart')
      expect(THE_DOORS_THAT_DO_NOT_ASK_YET).not.toContain('office.pause')
      expect(THE_DOORS_THAT_DO_NOT_ASK_YET).not.toContain('office.resume')
      const read = await call('GET', '/api/office/what-the-grant-carries', PERSON)
      expect(read.status, read.raw).toBe(200)
      const asks = Object.fromEntries(
        (read.body as WhatTheGrantCarriesReading).doors
          .filter((one) => ['office.restart', 'office.pause', 'office.resume'].includes(one.door))
          .map((one) => [one.door, one.asksTheCheck]),
      )
      expect(asks).toEqual({ 'office.restart': false, 'office.pause': true, 'office.resume': true })
    })
  })
})
