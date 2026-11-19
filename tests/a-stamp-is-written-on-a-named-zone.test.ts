// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAMP IS WRITTEN AND READ ON THE CLOCK OF A NAMED ZONE. By answer 5 of an owner's decision, the agent page
 * works a raise's end out on the office's clock, whose zone the profile reply names, even in a browser on another
 * zone. The two helpers are `stampInZone` and `momentOfStampInZone` in src/shared/time.ts; the
 * reply's field is `officeTimeZone`, from `theClockZone`.
 *
 * WHAT IS CLAIMED
 *   1. A moment is written on the wall clock of the zone named, whatever zone this process is in.
 *   2. A stamp read back on a zone gives the moment it names there, and writing that moment gives the stamp again.
 *   3. The autumn hour a zone has twice reads as the first of the two; the spring hour it skips reads as the hour after.
 *   4. The profile reply names the office's zone beside the raise, and it is the zone this process reads.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN (the proofs are in the round's proofs file)
 *   - `momentOfStampInZone` returning the second of its two candidates (the offset half a day after), without checking either: case 3 goes red.
 *   - `officeTimeZone` set to 'UTC' in src/server/api/participants.ts: case 4 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { momentOfStampInZone, stampInZone, theClockZone } from '../src/shared/time.ts'
import type { BuiltServer } from '../src/server/index.ts'

describe('a stamp on a named zone', () => {
  it('1: writes a moment on the wall clock of the zone named', () => {
    const moment = Date.UTC(2026, 9, 1, 12, 30, 5)
    expect(stampInZone(moment, 'UTC')).toBe('2026-10-01 12:30:05')
    expect(stampInZone(moment, 'Europe/London')).toBe('2026-10-01 13:30:05')
    expect(stampInZone(moment, 'Asia/Tokyo')).toBe('2026-10-01 21:30:05')
    expect(stampInZone(Date.UTC(2026, 9, 1, 15, 0, 0), 'Asia/Tokyo'), 'midnight is 00, never 24').toBe('2026-10-02 00:00:00')
  })

  it('2: reads a stamp back as the moment it names there, and round trips', () => {
    expect(momentOfStampInZone('2026-10-01 13:30:05', 'Europe/London')).toBe(Date.UTC(2026, 9, 1, 12, 30, 5))
    expect(momentOfStampInZone('2026-10-01 21:30', 'Asia/Tokyo')).toBe(Date.UTC(2026, 9, 1, 12, 30, 0))
    expect(momentOfStampInZone('tomorrow 7am', 'Asia/Tokyo')).toBeNull()
    for (const zone of ['Europe/London', 'America/New_York', 'Asia/Kolkata', 'UTC']) {
      const stamp = '2026-12-24 23:59:00'
      expect(stampInZone(momentOfStampInZone(stamp, zone)!, zone), zone).toBe(stamp)
    }
  })

  it('3: the doubled autumn hour reads as its first time, and the skipped spring hour as the hour after', () => {
    // London: 01:30 on 25 October 2026 happens at 00:30 UTC (summer time) and again at 01:30 UTC.
    expect(momentOfStampInZone('2026-10-25 01:30:00', 'Europe/London')).toBe(Date.UTC(2026, 9, 25, 0, 30, 0))
    // London: 01:30 on 29 March 2026 never happens; the clock goes from 01:00 to 02:00.
    expect(momentOfStampInZone('2026-03-29 01:30:00', 'Europe/London')).toBe(Date.UTC(2026, 2, 29, 1, 30, 0))
  })
})

describe('the profile reply', () => {
  let t: TestDb
  let server: BuiltServer
  const THEIR = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

  beforeAll(async () => {
    t = await freshDb()
    server = await apiApp()
    await server.app.ready()
    const started = await server.app.inject({ method: 'POST', url: '/api/agents/started', headers: THEIR, payload: { handle: 'wren', name: 'Wren', role: 'secretary' } })
    expect(started.statusCode, started.body).toBe(201)
  })

  afterAll(async () => {
    await server?.app.close()
    t?.close()
  })

  it('4: names the office’s zone beside the raise', async () => {
    const said = await server.app.inject({ method: 'GET', url: '/api/participants/agent/wren/profile', headers: THEIR })
    expect(said.statusCode, said.body).toBe(200)
    const zone = (said.json() as { theCardTheyHold: { elevation: { officeTimeZone: string } } }).theCardTheyHold.elevation.officeTimeZone
    expect(zone).toBe(theClockZone())
    expect(zone, 'a real zone name').toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})
