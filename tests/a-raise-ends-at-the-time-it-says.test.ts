// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RAISE ENDS AT THE TIME IT SAYS. Problem OpT-wLSCwlZ-: the raise door stored an end time exactly as it was typed, and
 * `elevationStillHolds` compared it with the clock as text. `2026-09-30 7:00` sorted after `2026-09-30 07:13:00`, so a
 * raise meant to end at 07:00 held until midnight; `07:00` had ended before it began; `tomorrow 7am` never ended.
 *
 * Through a real listener (the server on a port of its own, asked with fetch), with a clock this file sets.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A raise given until `2026-09-30 7:00` is stored and shown back as `2026-09-30 07:00:00`. It holds at 06:59:59
 *      and has ended at 07:00:00 and at 07:13:00.
 *   2. An end that does not read as a date and a time is refused with the code raiseUntilUnreadable, and one that has
 *      already come with raiseUntilPassed. Nothing is written either way.
 *   3. The two forms already stored in the office, `2026-09-08 7:00` and `2026-09-30 7:00`, are read as those times
 *      without being rewritten: each holds a minute before 07:00 on its own day and has ended at 07:13.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file names the logs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the raise door storing the end as typed again (theEndTheyTyped in src/server/api/roles.ts returns `typed`): case 1
 *     goes red;
 *   - the end compared with the clock as text again (aRaisesEndHasCome in src/shared/roles.ts): case 3 goes red;
 *   - readATypedTime in src/shared/time.ts reading anything as itself: case 2 goes red (and cases 1 and 3, which read
 *     through it too);
 *   - both of the first two at once, which is the door and the reader as they were before this file: cases 1 and 3 go
 *     red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aRaisesEndHasCome } from '../src/shared/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer
let base = ''
let argusId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A moment on this machine's own wall clock, which is the clock the office stores and compares. */
function at(year: number, month: number, day: number, hour: number, minute: number, second = 0): number {
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

async function ask(method: 'GET' | 'POST' | 'DELETE', path: string, headers: Record<string, string>, payload?: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await fetch(`${base}${path}`, { method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
  const text = await reply.text()
  let body: Record<string, any> = {}
  try {
    body = JSON.parse(text) as Record<string, any>
  } catch {
    body = { error: text }
  }
  return { status: reply.status, body }
}

const raise = (until: string) =>
  ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'at a time', until })

/** Whether the office says the secretary acts for the person now, read from GET /api/roles as the page reads it. */
async function argusIsRaised(): Promise<boolean> {
  const said = await ask('GET', '/api/roles', AS_THE_PERSON)
  expect(said.status, JSON.stringify(said.body)).toBe(200)
  return (said.body['elevation'].holding as { agent: string }[]).some((one) => one.agent === THE_TEST_OFFICES_SECRETARY.handle)
}

/** The grants stored on the secretary's registry row, as JSON text, which is what a raise reads. */
function theStoredGrants(): string | null {
  const row = t.client.sqlite.prepare('SELECT elevation FROM agents WHERE id = ?').get(argusId) as { elevation: string | null }
  return row.elevation
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  base = await app.app.listen({ port: 0, host: '127.0.0.1' })
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  argusId = String(started.body['agent']?.id ?? '')
  expect(argusId).not.toBe('')
})

afterEach(async () => {
  vi.useRealTimers()
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a raise given until a time', () => {
  it('1: until "2026-09-30 7:00" is stored as 07:00:00, holds at 06:59:59 and has ended at 07:00', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(2026, 9, 30, 6, 30))
    const given = await raise('2026-09-30 7:00')
    expect(given.status, JSON.stringify(given.body)).toBe(201)
    // SHOWN BACK AS READ (invariant 8): the reply and the stored grant hold the stored form, not the typed text.
    expect(given.body['elevation'].until).toBe('2026-09-30 07:00:00')
    expect(given.body['note']).toContain('2026-09-30 07:00:00')
    expect(theStoredGrants()).toContain('"until":"2026-09-30 07:00:00"')

    vi.setSystemTime(at(2026, 9, 30, 6, 59, 59))
    expect(await argusIsRaised(), 'a second before 07:00').toBe(true)
    vi.setSystemTime(at(2026, 9, 30, 7, 0, 0))
    expect(await argusIsRaised(), 'at 07:00').toBe(false)
    vi.setSystemTime(at(2026, 9, 30, 7, 13, 0))
    expect(await argusIsRaised(), 'at 07:13').toBe(false)
  })

  it('2: an end that does not read, or that has already come, is refused with its code and nothing is written', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(2026, 9, 30, 6, 30))
    const before = theStoredGrants()
    for (const typed of ['07:00', 'tomorrow 7am', '2026-02-30 07:00', '2026-09-30 24:00', '2026-09-30']) {
      const refused = await raise(typed)
      expect(refused.status, `${typed}: ${JSON.stringify(refused.body)}`).toBe(400)
      expect(refused.body, typed).toMatchObject({ code: 'raiseUntilUnreadable', values: { typed } })
      expect(String(refused.body['error'])).toContain('Nothing was written.')
    }
    const passed = await raise('2026-09-30 6:00')
    expect(passed.status, JSON.stringify(passed.body)).toBe(400)
    expect(passed.body).toMatchObject({ code: 'raiseUntilPassed', values: { until: '2026-09-30 06:00:00' } })
    expect(theStoredGrants()).toBe(before)
    expect(await argusIsRaised()).toBe(false)
  })
})

describe('the two ends already stored', () => {
  /** A grant as the office stored it before this change: the end exactly as it was typed. */
  function storeAnOldGrant(until: string): void {
    const grant = [{ id: `elevation-old-${until.replace(/[^0-9]/g, '')}`, endsWhen: 'at a time', until, grantedAt: '2026-09-01 20:00:00', grantedBy: THE_PERSON, reason: 'a test raises it' }]
    t.client.sqlite.prepare('UPDATE agents SET elevation = ? WHERE id = ?').run(JSON.stringify(grant), argusId)
  }

  it('3: "2026-09-08 7:00" and "2026-09-30 7:00" are read as those times, without being rewritten', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    for (const [until, day] of [['2026-09-08 7:00', 8], ['2026-09-30 7:00', 30]] as const) {
      storeAnOldGrant(until)
      vi.setSystemTime(at(2026, 9, day, 6, 59))
      expect(await argusIsRaised(), `${until}, at 06:59 that day`).toBe(true)
      vi.setSystemTime(at(2026, 9, day, 7, 13))
      expect(await argusIsRaised(), `${until}, at 07:13 that day`).toBe(false)
      // NOTHING REWROTE IT: reading the end is not a write.
      expect(theStoredGrants()).toContain(`"until":"${until}"`)
    }
    // AND THE ONE READER SAYS THE SAME, on the two exact strings.
    expect(aRaisesEndHasCome('2026-09-08 7:00', '2026-09-08 06:59:59')).toBe(false)
    expect(aRaisesEndHasCome('2026-09-08 7:00', '2026-09-08 07:00:00')).toBe(true)
    expect(aRaisesEndHasCome('2026-09-30 7:00', '2026-09-30 06:59:59')).toBe(false)
    expect(aRaisesEndHasCome('2026-09-30 7:00', '2026-09-30 07:13:00')).toBe(true)
    t.client.sqlite.prepare('UPDATE agents SET elevation = NULL WHERE id = ?').run(argusId)
  })
})
